import sys, os, json, pickle, base64, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import sectors as S
H=os.path.dirname(os.path.abspath(__file__)); IN=os.path.join(H,'input')+'/'; OUTD=os.path.join(H,'out')+'/'
os.makedirs(OUTD,exist_ok=True)
D=pickle.load(open(OUTD+'final2.pkl','rb'))
months=D['months']; caps=D['caps']/1e8; est=D['est']; sec=D['sec']; NM=len(months)
cos=D['companies']; K=len(S.SECTORS)
mi={m:i for i,m in enumerate(months)}
# 公司表
co=[]; enc=[]; off=0
for j,c in enumerate(cos):
    i=c['i']; a,b=c['a'],c['b']
    v=caps[i,a:b+1]
    if np.isnan(v).any():  # 中间缺失：前值填补
        for t in range(1,len(v)):
            if np.isnan(v[t]): v[t]=v[t-1]
    q=np.clip(np.round((np.log10(np.maximum(v,0.01))+2)*9000),0,65535).astype('<u2')
    enc.append(q)
    sc=[]; prev=None
    for t in range(a,b+1):
        if sec[i,t]!=prev: sc.append([t,int(sec[i,t])]); prev=sec[i,t]
    er=[]; t=a
    while t<=b:
        if est[i,t]:
            u=t
            while u+1<=b and est[i,u+1]: u+=1
            er.append([t,u]); t=u+1
        else: t+=1
    ren=[[mi[u] if u in mi else (NM-1 if u>months[-1] else -1),n] for u,n in c['ren']]
    ren=[r for r in ren if r[0]>=a]
    co.append([c['sym'][2:], c['name'], ren, sc, a, b, er, 1 if c['sym'].startswith('SH') else 0])
blob=np.concatenate(enc).tobytes()
# 板块合计、家数
secTot=np.zeros((K,NM)); cnt=np.zeros(NM,int)
for t in range(NM):
    al=~np.isnan(caps[:,t]); cnt[t]=al.sum()
    for k in range(K): secTot[k,t]=np.nansum(np.where(sec[:,t]==k,caps[:,t],0))
tot=secTot.sum(0)
page=dict(months=months, sectors=[[k,n,f] for k,n,f in S.SECTORS], tot=[round(x,1) for x in tot], cnt=cnt.tolist(),
          sec=[[round(x,1) for x in row] for row in secTot], co=co, caps=base64.b64encode(blob).decode())
json.dump(page,open(OUTD+'page_data.json','w'),ensure_ascii=False,separators=(',',':'))
# 版图选择：每月每国的城市
idx_of={c['i']:j for j,c in enumerate(cos)}
frames=[]
for t in range(NM):
    T=tot[t]; fr=[]
    for k in range(K):
        if secTot[k,t]<=0: continue
        ids=np.where(sec[:,t]==k)[0]; ids=ids[~np.isnan(caps[ids,t])]
        o=ids[np.argsort(-caps[ids,t])]
        sel=[]
        for n_,i in enumerate(o):
            if n_>=18: break
            if n_>=3 and caps[i,t]<0.0005*T: break
            sel.append([idx_of[i], round(float(caps[i,t]),2)])
        rest=secTot[k,t]-sum(x[1] for x in sel); nrest=len(o)-len(sel)
        if nrest>0 and rest>0:
            med=float(np.median([x[1] for x in sel])) if sel else rest
            kk=int(max(1,min(10,nrest,round(rest/max(med*1.6,1e-9)))))
            wts=np.array([0.7+0.6*(((p*2654435761+k*97)%1000)/1000) for p in range(1,kk+1)])
            wts=wts/wts.sum()
            for p in range(kk): sel.append([-(p+1), round(float(rest*wts[p]),3)])
        fr.append([k, round(float(secTot[k,t]),2), sel])
    frames.append(fr)
json.dump(frames,open(OUTD+'frames_sel.json','w'),separators=(',',':'))
print('companies',len(co),'blob',len(blob),'page json',os.path.getsize(OUTD+'page_data.json'),'frames',os.path.getsize(OUTD+'frames_sel.json'))
print('cells per frame', np.mean([sum(len(s[2]) for s in fr) for fr in frames]), max(sum(len(s[2]) for s in fr) for fr in frames))
