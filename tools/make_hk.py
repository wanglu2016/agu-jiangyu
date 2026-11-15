"""生成 ../assets/hk.js：“港股通”页用的港股快照（A+H 两地股价、只在港股上市的大公司）。

输入（都在 tools/hk/ 下，手工从行情网站抄录，见 tools/README.md）：
  ah_YYYYMMDD.csv   A+H 公司：名称、H股代码、H股价（港元）、A股代码、A股价（元）、网站给出的溢价（只用来校验）
  hk_YYYYMMDD.csv   港股大公司：代码、名称、股价、市值（亿港元）、周息率（%）、市盈率
本文件里的 META 是手工标注：公司类型、对应地图上的哪个国、股权结构、是否在港股通、分类。

输出的 window.AGU_HK：
  date, time, fx      快照日期、时间、港元兑人民币
  ah                  [A股代码, H股代码, H股价, A股价, H股周息率或null, 红利税率]
  hk                  [代码, 名称, 股价, 市值(亿港元), 周息率或null, 市盈率或null, 类型, 国或null, 结构标记, 港股通(1/0/null), 分类]
"""
import os, csv, json, sys

H = os.path.dirname(os.path.abspath(__file__))
DATE, TIME, FX = '2026-11-13', '16:40', 0.8502
AH_CSV = os.path.join(H, 'hk', 'ah_20261113.csv')
HK_CSV = os.path.join(H, 'hk', 'hk_20261113.csv')

# 红筹（境外注册、内地经营且被认定为中国居民企业）：派息时公司先预扣10%，中国结算再代扣20%，合计约28%
TAX28 = {'00941', '00883'}

# 类型：H = 内地注册的H股；红筹 = 境外注册、国资控股；民企 = 境外注册的内地民营公司；外资；香港 = 香港本地公司
# 结构标记：W 同股不同权，V 协议控制（VIE），S 在港第二上市（不在港股通）
# 港股通：1 在名单内，0 不在，None 未核实（以沪深交易所公布的名单为准）
META = {
    '00700': ('民企', 'media', 'V', 1, '平台'),
    '09988': ('民企', 'trade', 'WV', 1, '平台'),
    '03690': ('民企', 'trade', 'WV', 1, '平台'),
    '09999': ('民企', 'media', 'V', 1, '平台'),
    '01024': ('民企', 'media', 'WV', 1, '平台'),
    '09618': ('民企', 'trade', 'SWV', 0, '平台'),
    '09888': ('民企', 'media', 'WV', None, '平台'),
    '09626': ('民企', 'media', 'WV', 1, '平台'),
    '06618': ('民企', 'trade', 'V', 1, '平台'),
    '02618': ('民企', 'transp', '', 1, '平台'),
    '01810': ('民企', 'elec', 'W', 1, '科技'),
    '00100': ('民企', 'soft', 'W', None, '科技'),
    '02513': ('H', 'soft', '', None, '科技'),
    '00020': ('民企', 'soft', 'W', 1, '科技'),
    '00522': ('外资', 'semi', '', 1, '科技'),
    '09973': ('H', 'auto', '', None, '科技'),
    '09633': ('H', 'food', '', 1, '消费'),
    '02020': ('民企', 'light', '', 1, '消费'),
    '09992': ('民企', 'light', '', 1, '消费'),
    '02319': ('红筹', 'food', '', 1, '消费'),
    '00291': ('红筹', 'food', '', 1, '消费'),
    '01876': ('外资', 'food', '', 1, '消费'),
    '00322': ('外资', 'food', '', 1, '消费'),
    '02313': ('民企', 'light', '', 1, '消费'),
    '02331': ('民企', 'light', '', 1, '消费'),
    '06862': ('民企', 'trade', '', 1, '消费'),
    '09987': ('外资', 'trade', '', None, '消费'),
    '00005': ('外资', 'bank', '', 1, '金融'),
    '01299': ('外资', 'insur', '', 1, '金融'),
    '00388': ('香港', 'broker', '', 1, '金融'),
    '02888': ('外资', 'bank', '', 1, '金融'),
    '02388': ('红筹', 'bank', '', 1, '金融'),
    '00023': ('香港', 'bank', '', 1, '金融'),
    '00001': ('香港', None, '', 1, '香港'),
    '00016': ('香港', 'estate', '', 1, '香港'),
    '00012': ('香港', 'estate', '', 1, '香港'),
    '00002': ('香港', 'util', '', 1, '香港'),
    '00003': ('香港', 'util', '', 1, '香港'),
    '00006': ('香港', 'util', '', 1, '香港'),
    '00066': ('香港', 'transp', '', 1, '香港'),
    '00027': ('香港', 'trade', '', 1, '香港'),
    '00019': ('香港', None, '', 1, '香港'),
    '00267': ('红筹', None, '', 1, '红筹'),
    '00762': ('红筹', 'telecom', '', 1, '红筹'),
    '02259': ('红筹', 'metal', '', None, '红筹'),
    '01818': ('H', 'metal', '', 1, '红筹'),
}

def num(s):
    s = (s or '').strip()
    return float(s) if s else None

ah = list(csv.DictReader(open(AH_CSV, encoding='utf-8')))
hk = list(csv.DictReader(open(HK_CSV, encoding='utf-8')))
dy_h = {r['code']: num(r['dy_pct']) for r in hk}

bad = 0
AH = []
for r in ah:
    hp, ap = float(r['h_price_hkd']), float(r['a_price_cny'])
    p = (ap / (hp * FX) - 1) * 100
    if abs(p - float(r['premium_pct'])) > 0.6:
        print('溢价对不上：', r['name'], round(p, 2), r['premium_pct']); bad += 1
    AH.append([r['a_code'], r['h_code'], hp, ap, dy_h.get(r['h_code']), 28 if r['h_code'] in TAX28 else 20])
ah_h = {r[1] for r in AH}

HKL = []
for r in hk:
    c = r['code']
    if c in ah_h: continue                      # A+H 公司在 ah 里
    if c not in META: print('没有标注：', c, r['name']); continue
    t, sec, fl, con, cat = META[c]
    HKL.append([c, r['name'], num(r['price_hkd']), num(r['mcap_hkd_yi']), num(r['dy_pct']), num(r['pe']), t, sec, fl, con, cat])
missing = set(META) - {r[0] for r in HKL}
if missing: print('标注了但快照里没有：', sorted(missing))

out = {'date': DATE, 'time': TIME, 'fx': FX, 'src': '经济通（etnet.com.hk）AH股表现、热炒概念股、电商平台、港股通名单页，延迟至少15分钟的报价', 'ah': AH, 'hk': HKL}
dst = os.path.join(H, '..', 'assets', 'hk.js')
with open(dst, 'w', encoding='utf-8') as f:
    f.write('/* A股疆域图港股快照：A+H 两地股价、港股大公司。由 tools/make_hk.py 生成，勿手改 */\n')
    f.write('window.AGU_HK=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('A+H', len(AH), '对；港股大公司', len(HKL), '家；校验不符', bad, '→', os.path.relpath(dst, H))
