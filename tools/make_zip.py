"""打包离线版 → ../download/agu-jiangyu-site.zip
包内是能双击打开的地图、“观潮”“发现好公司”“财报侦探”“港股通”和“持有一月”“持有三月”“持有一年”八页；讲解视频太大不放进包，页面里的视频链接改指向在线地址。
"""
import os, re, zipfile
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(H, '..'))
TOP = 'agu-jiangyu/'
ONLINE = 'https://wanglu2016.github.io/agu-jiangyu/'
NOTE = """A股疆域图 · 离线版

双击 index.html 打开地图；guanchao.html 是“观潮”，faxian.html 是“发现好公司”，
zhencha.html 是“财报侦探”，ganggu.html 是“港股通”，
chiyou.html、sanyue.html、yinian.html 是“持有一月”“持有三月”“持有一年”三个小游戏。
不需要安装任何软件；除了小游戏的排行榜，都不需要联网。
需要较新的 Chrome、Edge、Safari 或 Firefox。

地图：拖动底部时间轴或点播放，看各行业的市值版图怎么变化；
点地图上的一块看公司或行业的详情；右上角搜索框可以找公司（含已退市的）；
时间轴左下角可以切换到“看海平面”；虚线国界是创新药、机器人、储能三个候选国。

观潮：从这张图里算出来的六条规律（水位、造陆、峰值、巨头、少数、国界），
每张图都可以拖动、切换。

发现好公司：从学科、产业、公司、价格筛四遍（源头、沃土、城基、地价），
再到“寻城”里自己改条件筛选，点一家公司看它2010–2025年的财报小传。

财报侦探：把净资产收益率（杜邦拆解）、利润含金量、融资与分红、商誉一项项拆开，
看这些线索后来应验了多少；六份造假卷宗、十六条附注线索，最后在“侦查”里查任何一家公司。

港股通：港股通能买什么、A股和H股的价差、股息扣税后还剩多少、港股的暗礁，
以及给两地上市的公司做体检。港股数字是2026年11月13日的快照。

持有一月：用真实历史练眼力的小游戏。系统从2013–2026年随机抽出一天和几只股票，
隐去名字和日期；每只最多翻开五项指标，决定加仓、减仓还是不动，一个月后揭晓，
再往后看一年、三年。持有三月、持有一年玩法相同，只是等三个月、一年才揭晓。
联网时每局会匿名记到排行榜，三个游戏各有各的排行榜；自己的战绩保存在这台电脑的浏览器里。

在线版与讲解视频：https://wanglu2016.github.io/agu-jiangyu/
源代码：https://github.com/wanglu2016/agu-jiangyu

本项目不构成投资建议。
"""
def page(name):
    s = open(os.path.join(R, name), encoding='utf-8').read()
    return re.sub(r'href="video\.html"', f'href="{ONLINE}video.html" target="_blank" rel="noopener"', s)
out = os.path.join(R, 'download', 'agu-jiangyu-site.zip')
os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr(TOP + '使用说明.txt', NOTE)
    z.writestr(TOP + 'index.html', page('index.html'))
    z.writestr(TOP + 'guanchao.html', page('guanchao.html'))
    z.writestr(TOP + 'faxian.html', page('faxian.html'))
    z.writestr(TOP + 'zhencha.html', page('zhencha.html'))
    z.writestr(TOP + 'ganggu.html', page('ganggu.html'))
    z.writestr(TOP + 'chiyou.html', page('chiyou.html'))
    z.writestr(TOP + 'sanyue.html', page('sanyue.html'))
    z.writestr(TOP + 'yinian.html', page('yinian.html'))
    z.write(os.path.join(R, 'README.md'), TOP + 'README.md')
    for d, _, fs in sorted(os.walk(os.path.join(R, 'assets'))):
        for f in sorted(fs):
            if f.startswith('.'): continue
            full = os.path.join(d, f)
            z.write(full, TOP + os.path.relpath(full, R).replace(os.sep, '/'))
print(out, round(os.path.getsize(out) / 1e6, 1), 'MB')
