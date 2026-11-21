"""生成 chiyou-supabase.sql：排行榜后端的建表与函数（chiyou-schema.sql）+ 题库答案表。

在 Supabase 项目的 SQL Editor 里把生成的文件全部粘贴进去，点 Run 即可；可以重复运行。
答案表直接取自 ../assets/chiyou-data.js 里的编码值（股价、一个月后的回报、涨跌停），和网页用的是同一份数字。
题库重新生成（make_chiyou.py）后，要重跑本脚本，并在 Supabase 里再运行一次。
"""
import os, json, base64
import numpy as np

H = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(H, '..', 'assets', 'chiyou-data.js'), encoding='utf-8').read()
C = json.loads(s[s.index('{'):].rstrip().rstrip(';'))
K = [f[0] for f in C['F']]; R = C['R']
rows = np.frombuffer(base64.b64decode(C['rows']), '<i2').reshape(R, len(K))
px, f1, lim = rows[:, K.index('px')], rows[:, K.index('f1')], rows[:, K.index('lim')]
assert (px != -32768).all() and (f1 != -32768).all()
lim = np.where(lim == -32768, 0, lim)
V = C['v']
out = [open(os.path.join(H, 'chiyou-schema.sql'), encoding='utf-8').read().rstrip(), '',
       f'-- 题库答案（版本 {V}，{R} 道题），由 make_chiyou_sql.py 从 assets/chiyou-data.js 生成']
for a in range(0, R, 1000):
    vals = ','.join(f'({V},{r},{int(px[r])},{int(f1[r])},{int(lim[r])})' for r in range(a, min(R, a + 1000)))
    out.append(f'insert into cy_q (v, r, px, f1, lim) values {vals}\n  on conflict (v, r) do update set px = excluded.px, f1 = excluded.f1, lim = excluded.lim;')
out.append("\nnotify pgrst, 'reload schema';\n")
path = os.path.join(H, 'chiyou-supabase.sql')
open(path, 'w', encoding='utf-8').write('\n'.join(out))
print(path, os.path.getsize(path) // 1024, 'KB', R, '道题')
