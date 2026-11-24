"""给“看数”的数据补两样东西：异常换手、同行业分位。只读写 ../assets/ks/，不需要原始行情，也不影响三个小游戏的题库。

make_kanshu.py 生成 ../assets/ks/ 之后运行（make_kanshu.py 最后会自动调用本脚本）；可以重复运行，结果相同。

异常换手（abn）
  x = 月末“近 20 个交易日日均成交额 ÷ 总市值”（就是看数里的换手率，这里用成交额和市值的原值重算，精度更高）。
  异常换手 = 本月的 x ÷ 最近 12 个月末（含本月）x 的平均；这 12 个月里至少要有 9 个月有数。
  学术上的口径是“近 20 日 ÷ 近 250 日”，12 个月末的 20 日均值大约覆盖 240 个交易日。分子分母是同一家公司、几乎同样的股本，
  所以按总股本、流通股还是自由流通股算，结果几乎一样。看数的数据从 2013年5月开始，所以 2014年1月起才有。
  全市场分位和其他指标一样：在当天“上市满一年、当天有交易”的公司里排，参照不足 20 家不给。

同行业分位（ext.ipf 里的字段）
  用指标的数值（不是全市场分位：分位只有 0–100 的整数，银行的市净率、市值大多挤在 0 或 100，会排不开），
  在同一个“国”（30 个行业之一）当天的参照公司里排，算法同全市场分位；同行业有数的参照公司不足 IMIN 家不给。
  不在参照里的公司（上市不满一年、当天停牌）也给出它在同行业参照公司里的位置。行业未知的公司没有同行业分位。
  换手率用成交额 ÷ 总市值的原值；上市时间用月数（全市场分位用的是交易日数，同一个月上市的会并列）。

写回的格式（index.js 里的 ext 说明这些附加部分；分位都是 Uint8，0–100，255 为没有）
  s/<代码>.js：原有内容之后依次追加  ext.vf 的数值（Int16，先低字节后高字节两段，编码同 vf） + ext.pf 的全市场分位 + ext.ipf 的同行业分位，各 n 个
  m/<年-月>.js：原有内容之后依次追加  ext.pf 的全市场分位（每项 n 个，按公司顺序） + 同行业分位（按公司依次排列每家 len(ext.ipf) 个）；
               行业未知的公司，原有的行业字节改成 255（make_kanshu.py 原来把它记成 0，也就是“银行”）
  index.js：加 ext = { v, vf, pf, ipf, imin, nsec（每个月每个国的参照公司数） }
"""
import os, re, json, base64, zlib, time
import numpy as np

H = os.path.dirname(os.path.abspath(__file__))
KS = os.path.join(H, '..', 'assets', 'ks')
IMIN = 5           # 同行业参照公司少于这个数，不算同行业分位（保险业只有 3–7 家）
WIN, NEED = 12, 9  # 异常换手：最近 12 个月末，至少 9 个月有数
EXT_VF = [['abn', 'g', 0]]
EXT_PF = ['abn']
IPF = ['cap', 'px', 'chg', 'm1', 'm3', 'm12', 'm36', 'hi52', 'vol', 'amt', 'turn', 'pe', 'pb', 'ps', 'roe', 'roe5', 'revg', 'nig',
       'cash', 'lev', 'list', 'flag', 'ni', 'abn']   # 海平面、行业近12个月、市盈率在自己五年里的位置不在其列：放在同行业里比没有意义
HEAD = '/* 看数页的索引：由 tools/make_kanshu.py 生成、tools/make_kanshu_ext.py 补充，勿手改 */\n'


def read_js(path, fn):
    s = open(path, encoding='utf-8').read()
    m = re.fullmatch(r"AGU_KS\.%s\('([^']*)','([^']*)'\);\n?" % fn, s)
    assert m, path
    return m.group(1), zlib.decompress(base64.b64decode(m.group(2)))


def write_js(path, fn, key, raw):
    z = base64.b64encode(zlib.compress(raw, 9)).decode()
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f"AGU_KS.{fn}('{key}','{z}');\n")


def planes_in(u, off, n):
    lo = u[off:off + n].astype(np.int32); hi = u[off + n:off + 2 * n].astype(np.int32)
    q = lo | (hi << 8)
    return np.where(q > 32767, q - 65536, q)


def planes_out(q):
    b = np.asarray(q, '<i2').view(np.uint8).reshape(-1, 2)
    return b[:, 0].tobytes() + b[:, 1].tobytes()


def dec(q, kind, sc):
    """和网页 kanshu.js 的 V() 相同的解码"""
    q = np.asarray(q, float); out = np.full(q.shape, np.nan); m = q != -32768
    if kind == 'g': out[m] = 10 ** (q[m] / 2000)
    elif kind == 'l': out[m] = q[m] / (sc or 1)
    else:   # 'q'：quality.js 的利润编码
        a = np.abs(q[m]); out[m] = np.where(a == 0, 0.0, np.sign(q[m]) * 10 ** ((a - 1) / 3200 - 4))
    return out


def pct_rank(vals, pool, nmin):
    """和 make_kanshu.py 相同：vals 在 pool 里的百分位（0–100，相同值取中间，numpy.round）；pool 不足 nmin 个给 255"""
    pool = np.sort(pool[np.isfinite(pool)])
    if len(pool) < nmin: return np.full(len(vals), 255)
    lo = np.searchsorted(pool, vals, 'left'); hi = np.searchsorted(pool, vals, 'right')
    p = np.round((lo + hi) / 2 / len(pool) * 100)
    return np.where(np.isfinite(vals), p, 255).astype(int)


def main():
    t0 = time.time()
    src = open(os.path.join(KS, 'index.js'), encoding='utf-8').read()
    X = json.loads(src[src.index('{'):src.rindex(';')])
    old = X.pop('ext', None)
    old_cols = (len(old['pf']) + len(old['ipf'])) if old else 0      # 上一次追加到月度文件里的每家字节数
    VF, PF, NY, NW, CO = X['vf'], X['pf'], X['ny'], len(X['months']), X['co']
    NCO, K, KI = len(CO), len(PF), len(IPF)
    VFD = {f[0]: (i, f[1], f[2]) for i, f in enumerate(VF)}

    # ---------------------------------------------------------------- 个股文件：取出原有部分和要用的数值
    need = sorted(set(IPF) - {'abn', 'turn'}) + ['amt', 'cap', 'sec']
    VAL = {k: np.full((NCO, NW), np.nan) for k in need}
    base_s = {}
    for ci, c in enumerate(CO):
        code, a, b = c[0], c[3], c[4]; n = b - a + 1
        key, raw = read_js(os.path.join(KS, 's', code + '.js'), 's'); assert key == code
        blen = 2 * n * len(VF) + n * K + 2 * NY + 4 * n
        assert len(raw) >= blen, code
        u = np.frombuffer(raw[:blen], np.uint8); base_s[ci] = raw[:blen]
        for k in need:
            i, kind, sc = VFD[k]; VAL[k][ci, a:b + 1] = dec(planes_in(u, 2 * n * i, n), kind, sc)
    with np.errstate(invalid='ignore', divide='ignore'):
        TURN = np.where((VAL['amt'] > 0) & (VAL['cap'] > 0), VAL['amt'] / VAL['cap'] * 100, np.nan)
    SEC = np.where(np.isfinite(VAL['sec']), VAL['sec'], -1).astype(np.int64)

    # 异常换手
    ABN = np.full((NCO, NW), np.nan)
    for t in range(NW):
        w = TURN[:, max(0, t - WIN + 1):t + 1]; ok = np.isfinite(w); cnt = ok.sum(1)
        with np.errstate(invalid='ignore', divide='ignore'):
            mean = np.where(cnt > 0, np.where(ok, w, 0).sum(1) / np.maximum(cnt, 1), np.nan)
            ABN[:, t] = np.where((cnt >= NEED) & (TURN[:, t] > 0) & (mean > 0), TURN[:, t] / mean, np.nan)
    VAL['turn'] = TURN; VAL['abn'] = ABN
    print('个股文件', NCO, '家', f'{time.time() - t0:.0f}s', flush=True)

    # ---------------------------------------------------------------- 逐月：全市场分位（abn）、同行业分位
    ABN_P = np.full((NCO, NW), 255, np.uint8)
    IP = np.full((KI, NCO, NW), 255, np.uint8)
    nsec = []
    for t, mon in enumerate(X['months']):
        path = os.path.join(KS, 'm', mon + '.js')
        key, raw = read_js(path, 'm'); assert key == mon
        n = len(raw) // (4 + K + old_cols); assert n * (4 + K + old_cols) == len(raw), mon
        u = np.frombuffer(raw[:n * (4 + K)], np.uint8).copy()
        ids = planes_in(u, 0, n); ref = u[2 * n:3 * n] == 1
        sec = SEC[ids, t]
        u[3 * n:4 * n] = np.where(sec >= 0, sec, 255).astype(np.uint8)
        abn = ABN[ids, t]
        pa = pct_rank(abn, abn[ref], 20); ABN_P[ids, t] = pa
        ipm = np.full((n, KI), 255, np.uint8)
        for g in np.unique(sec[sec >= 0]):
            mem = sec == g; idx = np.where(mem)[0]
            for j, k in enumerate(IPF):
                x = VAL[k][ids, t]
                ipm[idx, j] = pct_rank(x[idx], x[mem & ref], IMIN)
        IP[:, ids, t] = ipm.T
        nsec.append([int(np.sum(ref & (sec == g))) for g in range(len(X['sec']))])
        write_js(path, 'm', mon, u.tobytes() + pa.astype(np.uint8).tobytes() + ipm.tobytes())
    print('月度文件', NW, '个', f'{time.time() - t0:.0f}s', flush=True)

    # ---------------------------------------------------------------- 写回个股文件和索引
    for ci, c in enumerate(CO):
        code, a, b = c[0], c[3], c[4]
        v = ABN[ci, a:b + 1]; q = np.full(len(v), -32768, np.int64); m = np.isfinite(v) & (v > 0)
        q[m] = np.clip(np.round(np.log10(v[m]) * 2000), -32767, 32767)
        extra = planes_out(q) + ABN_P[ci, a:b + 1].tobytes() + b''.join(IP[j, ci, a:b + 1].tobytes() for j in range(KI))
        write_js(os.path.join(KS, 's', code + '.js'), 's', code, base_s[ci] + extra)
    X['ext'] = dict(v=1, vf=EXT_VF, pf=EXT_PF, ipf=IPF, imin=IMIN, nsec=nsec)
    with open(os.path.join(KS, 'index.js'), 'w', encoding='utf-8') as f:
        f.write(HEAD + 'window.AGU_KS_IDX=' + json.dumps(X, ensure_ascii=False, separators=(',', ':')) + ';\n')
    ok = np.isfinite(ABN)
    print('异常换手：有数的“公司×月”', int(ok.sum()), '，最早', X['months'][int(np.argmax(ok.any(0)))],
          '；中位数', round(float(np.nanmedian(ABN)), 3), f'；用时 {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
