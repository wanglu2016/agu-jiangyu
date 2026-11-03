import numpy as np, pandas as pd, os
Q=os.path.join(os.path.dirname(os.path.abspath(__file__)),'input','qlib_bin')+'/'
CAL=pd.to_datetime(open(Q+'calendars/day.txt').read().split())
def load(sym, field):
    p=f'{Q}features/{sym.lower()}/{field}.day.bin'
    if not os.path.exists(p): return None
    a=np.fromfile(p,dtype='<f4')
    if len(a)<2: return None
    start=int(a[0]); vals=a[1:]
    return pd.Series(vals, index=CAL[start:start+len(vals)])
def instruments():
    df=pd.read_csv(Q+'instruments/all.txt',sep='\t',header=None,names=['sym','start','end'])
    return df
