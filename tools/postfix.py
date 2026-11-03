# 修正股本序列的短期跳变、停牌期借壳、相对现值异常偏大
import pickle, numpy as np, pandas as pd
import os
H=os.path.dirname(os.path.abspath(__file__)); IN=os.path.join(H,'input')+'/'; OUTD=os.path.join(H,'out')+'/'
os.makedirs(OUTD,exist_ok=True)
D=pickle.load(open(OUTD+'final.pkl','rb'))
months,ME,rows,meta=pickle.load(open(OUTD+'stage1.pkl','rb'))
PI=pd.PeriodIndex(months,freq='M'); NM=len(months)
caps=D['caps']; est=D['est']; C={c['i']:c for c in D['companies']}
ANC=months.index('2026-06')
SPECIAL={'SH600606':('2014-12','2015-07'),'SZ000594':('2012-05','2015-05')}
ANCHORFILL={'SZ001289':('2022-01','2025-01'),'SZ000670':('2000-01','2013-05')}   # 用之后的股本回填   # 借壳完成前沿用壳公司股本
fixed={}
for i,(sym,mclose,mfac,mamt,sh) in enumerate(rows):
    if i not in C: continue
    close=mclose.reindex(PI).ffill().values; fac=mfac.reindex(PI).ffill().bfill().values
    amt=mamt.reindex(PI).values
    alive=np.isfinite(caps[i])
    if alive.sum()<3: continue
    n=caps[i]/close/fac          # 复权归一后的股本
    ln=np.log(n)
    idx=np.where(alive)[0]
    changed=np.zeros(NM,bool)
    # (3) 特例
    if sym in SPECIAL:
        a,b=months.index(SPECIAL[sym][0]),months.index(SPECIAL[sym][1])
        ln[a:b+1]=ln[a-1]; changed[a:b+1]=True
    if sym in ANCHORFILL:
        a,b=months.index(ANCHORFILL[sym][0]),months.index(ANCHORFILL[sym][1])
        ln[a:b+1]=ln[b+1]; changed[a:b+1]=True
    # (4) 停牌月份的股本跳变：沿用停牌前
    for t in idx[1:]:
        if not (amt[t]>0) and np.isfinite(ln[t-1]) and abs(ln[t]-ln[t-1])>np.log(2):
            ln[t]=ln[t-1]; changed[t]=True
    # (2) 相对 2026 年中现值异常偏大
    if alive[ANC] and not est[i,ANC]:
        # 只计送转的因子（月度因子跳升 >8% 视为送转/拆细）
        fr=np.ones(NM); 
        for t in range(1,NM):
            if np.isfinite(fac[t]) and np.isfinite(fac[t-1]) and fac[t]/fac[t-1]>1.08: fr[t]=fac[t]/fac[t-1]
        sf=np.cumprod(fr)
        ln2=np.log(caps[i]/close/sf)
        ref=ln2[ANC]
        bad=alive&(ln2-ref>np.log(1.6))
        bad[ANC:]=False
        if bad.any():
            good=np.where(alive&~bad)[0]
            for t in np.where(bad)[0]:
                lo=good[good<t]; hi=good[good>t]
                if len(lo) and len(hi):
                    w=(t-lo[-1])/(hi[0]-lo[-1]); ln[t]=ln[lo[-1]]*(1-w)+ln[hi[0]]*w
                elif len(hi): ln[t]=ln[hi[0]]
                elif len(lo): ln[t]=ln[lo[-1]]
                changed[t]=True
    # (1) 1–3 个月的来回跳变
    for L in (1,2,3,4,5,6,7,8):
        for t in idx:
            if t-1<0 or t+L>=NM: continue
            if not (alive[t-1] and alive[t+L]): continue
            if abs(ln[t+L]-ln[t-1])>np.log(1.15): continue
            seg=ln[t:t+L]
            if np.all(np.abs(seg-ln[t-1])>np.log(1.6)):
                for j in range(L):
                    w=(j+1)/(L+1); ln[t+j]=ln[t-1]*(1-w)+ln[t+L]*w; changed[t+j]=True
    if changed.any():
        new=np.exp(ln)*close*fac
        caps[i,changed]=new[changed]
        fixed[sym]=int(changed.sum())
D['caps']=caps
pickle.dump(D,open(OUTD+'final2.pkl','wb'))
print('fixed stocks',len(fixed), sorted(fixed.items(),key=lambda x:-x[1])[:30])
tot=np.nansum(caps,0)
for t in [0,71,95,131,185,251,299,321]: print(months[t], round(tot[t]/1e12,2))
