"""用 chiyou-page.html 模板生成三个游戏页面：chiyou.html（持有一月）、sanyue.html（持有三月）、yinian.html（持有一年）。

三个页面共用 ../assets/chiyou.js，只在文案和 window.AGU_CY_GAME 配置上不同：
  id     持有的月数，也是排行榜里的游戏编号（1、3、12）
  store  浏览器里存战绩用的键，三个游戏各存各的
  luck   “口径与边界”里关于运气的一句话
改了模板或这里的文案后，重跑本脚本即可。
"""
import os, json
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(H, '..')
GAMES = [
  dict(file='chiyou.html', title='持有一月', id=1, store='agu-chiyou-v2', luck='一个月的结果多半是运气', img='assets/preview-chiyou.jpg', ext=False,
       desc='用真实历史练眼力的小游戏：100万元的账户，几只股票各自来自2013–2026年里随机的一天，隐去名字和日期。每只最多翻开五项指标，决定加仓、减仓还是不动，一个月后揭晓，和各自同期的大盘比，再往后看一年、三年；进入前100名可以晒战绩。',
       ogdesc='看不到名字，只能翻五张牌。一个月后揭晓：你的判断，和运气各占多少。',
       years='2013–2026', when='<b>一个月后</b>揭晓，每只和它自己同期的大盘比，再往后看一年、三年。',
       luck_h2='一个月的输赢，多半是运气',
       luck_foot='一个月后，两类公司几乎分不出高下。<b>别用一局的输赢给自己的判断打分</b>，多玩几局，到“战绩”里看你的操作一年、三年后还站不站得住。',
       kaiju='每只股票各自来自随机的一天，这样输赢不取决于某一个月大盘的涨跌。',
       rule4='<b>揭晓。</b>每只股票各自持有一个月（到它下个月最后一个交易日），盈亏拆成“原来的持仓”和“你的操作”两部分，每只和它自己同期的大盘比；再告诉你它们是谁、是哪一天，以及一年、三年后走到了哪里。',
       record='一个月后的输赢看个热闹；一年、三年后的结果，才更接近你的判断本身。'),
  dict(file='sanyue.html', title='持有三月', id=3, store='agu-chiyou3-v1', luck='三个月的结果，运气仍占很大一部分', img='assets/preview-sanyue.jpg', ext=True,
       desc='用真实历史练眼力的小游戏：100万元的账户，几只股票各自来自2013–2026年里随机的一天，隐去名字和日期。每只最多翻开五项指标，决定加仓、减仓还是不动，三个月后揭晓，和各自同期的大盘比，再往后看一年、三年；进入前100名可以晒战绩。',
       ogdesc='看不到名字，只能翻五张牌。三个月后揭晓：一个季度，够不够让判断压过运气？',
       years='2013–2026', when='<b>三个月后</b>揭晓，每只和它自己同期的大盘比，再往后看一年、三年。',
       luck_h2='三个月，运气仍然占大头',
       luck_foot='三个月里通常会出一份新的财报，但价格的起伏仍然盖过了生意的差别：两类公司照样难分高下。<b>别用一局的输赢给自己的判断打分</b>，到“战绩”里看你的操作一年、三年后还站不站得住。',
       kaiju='每只股票各自来自随机的一天，持有三个月，这样输赢不取决于某一个季度大盘的涨跌。',
       rule4='<b>揭晓。</b>每只股票各自持有三个月（到三个月后那个月的最后一个交易日），盈亏拆成“原来的持仓”和“你的操作”两部分，每只和它自己同期的大盘比；再告诉你它们是谁、是哪一天，以及一年、三年后走到了哪里。',
       record='三个月后的输赢仍有很多运气；一年、三年后的结果，才更接近你的判断本身。'),
  dict(file='yinian.html', title='持有一年', id=12, store='agu-chiyou12-v1', luck='一年的结果也还掺着不少运气', img='assets/preview-yinian.jpg', ext=True,
       desc='用真实历史练眼力的小游戏：100万元的账户，几只股票各自来自2013–2025年里随机的一天，隐去名字和日期。每只最多翻开五项指标，决定加仓、减仓还是不动，一年后揭晓，和各自同期的大盘比，再往后看三年；进入前100名可以晒战绩。',
       ogdesc='看不到名字，只能翻五张牌。一年后揭晓：拉长到一年，判断能不能赢过运气？',
       years='2013–2025', when='<b>一年后</b>揭晓，每只和它自己同期的大盘比，再往后看三年。',
       luck_h2='一年，还不够让好公司显出来',
       luck_foot='一年后，两类公司跑赢大盘的比例仍然相近；拉到三年，差别才开始出现。所以一局的输赢仍然说明不了判断的对错，<b>多看几局的“三年后”</b>。',
       kaiju='每只股票各自来自随机的一天，持有一年，这样输赢不取决于某一年大盘的涨跌。',
       rule4='<b>揭晓。</b>每只股票各自持有一年（到一年后同一个月的最后一个交易日），盈亏拆成“原来的持仓”和“你的操作”两部分，每只和它自己同期的大盘比；再告诉你它们是谁、是哪一天，以及三年后走到了哪里。',
       record='一年后的输赢也还掺着运气；三年后的结果，更接近你的判断本身。'),
]
LEDE = ('你有一个 <b>100 万元</b>的账户：大约一半是现金，另一半差不多平均地买成了几只股票。每只股票来自 <b>{years} 年</b>里随机的一天，'
        '你看不到名字和日期，只能<b>翻开最多五项指标</b>，然后决定加仓、减仓还是不动；手里的现金<b>全部</b>可以拿来加仓。{when}')
KAIJU_TAIL = '指标都是那一天能看到的数字：年报按当时已经披露的最近一期，价格到那天收盘为止。'
tpl = open(os.path.join(H, 'chiyou-page.html'), encoding='utf-8').read()
for g in GAMES:
    switch = ''.join(f'<a href="{x["file"]}" class="on" aria-current="page">{x["title"]}</a>' if x is g else f'<a href="{x["file"]}">{x["title"]}</a>' for x in GAMES)
    pager = ''.join(f'  <a href="{x["file"]}"><div class="k">练眼力</div><b>{x["title"]}</b><span>{"一个月后揭晓" if x["id"] == 1 else "三个月后揭晓" if x["id"] == 3 else "一年后揭晓"}</span></a>\n' for x in GAMES if x is not g)
    cfg = json.dumps({'id': g['id'], 'store': g['store'], 'luck': g['luck']}, ensure_ascii=False)
    out = tpl
    for k, v in {'TITLE': g['title'], 'DESC': g['desc'], 'OGDESC': g['ogdesc'], 'OGIMG': g['img'], 'SWITCH': switch,
                 'LEDE': LEDE.format(years=g['years'], when=g['when']), 'LUCK_H2': g['luck_h2'], 'LUCK_FOOT': g['luck_foot'],
                 'KAIJU_SUB': g['kaiju'] + KAIJU_TAIL, 'RULE4': g['rule4'], 'RECORD_SUB': g['record'], 'PAGER_GAMES': pager, 'GAMECFG': cfg,
                 'EXTSCRIPT': '<script src="assets/chiyou-ext.js"></script>\n' if g['ext'] else ''}.items():
        out = out.replace('{{' + k + '}}', v)
    assert '{{' not in out, g['file']
    open(os.path.join(R, g['file']), 'w', encoding='utf-8').write(out)
    print(g['file'], len(out))
