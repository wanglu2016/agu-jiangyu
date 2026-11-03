# 每家公司的逐月名称与证监会行业（2010-01 起的月度快照）
import os, re, pickle, numpy as np, pandas as pd
H=os.path.dirname(os.path.abspath(__file__)); IN=os.path.join(H,'input')+'/'; OUTD=os.path.join(H,'out')+'/'
os.makedirs(OUTD,exist_ok=True)
O=OUTD
ind=pd.read_parquet(IN+'a-share-raw/raw/industry_snapshots/industry_monthly.parquet')
ind['sym']=ind.code.str[:2].str.upper()+ind.code.str[3:]
ind['m']=pd.PeriodIndex(pd.to_datetime(ind.snapshot_date),freq='M')
PRE=re.compile(r'^(S\*ST|\*ST|SST|ST|S|PT|XD|XR|DR|N|C)(?=[一-鿿A-Za-z])')
def clean(n):
    n=str(n).strip()
    for _ in range(2): n=PRE.sub('',n).strip()
    return n.replace(' ','')
ind['nm']=ind.code_name.map(clean)
ind['csrc']=ind.industry.fillna('').str.strip()
ind=ind.sort_values(['sym','m'])
NAMES={}; CSRC={}
for s,g in ind.groupby('sym'):
    # 名称变化点
    ch=[]; prev=None
    for m,n in zip(g.m,g.nm):
        if n and n!=prev: ch.append((str(m),n)); prev=n
    NAMES[s]=ch
    ci=[]; prev=None
    for m,c in zip(g.m,g.csrc):
        if c and c!=prev: ci.append((str(m),c)); prev=c
    CSRC[s]=ci
pickle.dump((NAMES,CSRC),open(O+'names_csrc.pkl','wb'))
print(len(NAMES))
for s in ['SH600519','SZ300308','SH601012','SH601766','SZ000681','SZ002352','SH600002','SH601360','SZ000063','SH601138']:
    print(s, NAMES.get(s), CSRC.get(s))
