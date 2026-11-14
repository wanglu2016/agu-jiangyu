"""打包离线版 → ../download/agu-jiangyu-site.zip
包内是能双击打开的地图、“观潮”和“发现好公司”三页；讲解视频太大不放进包，页面里的视频链接改指向在线地址。
"""
import os, re, zipfile
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(H, '..'))
TOP = 'agu-jiangyu/'
ONLINE = 'https://wanglu2016.github.io/agu-jiangyu/'
NOTE = """A股疆域图 · 离线版

双击 index.html 打开地图，双击 guanchao.html 打开“观潮”，双击 faxian.html 打开“发现好公司”，
不需要联网或安装任何软件。
需要较新的 Chrome、Edge、Safari 或 Firefox。

地图：拖动底部时间轴或点播放，看各行业的市值版图怎么变化；
点地图上的一块看公司或行业的详情；右上角搜索框可以找公司（含已退市的）；
时间轴左下角可以切换到“看海平面”；虚线国界是创新药、机器人、储能三个候选国。

观潮：从这张图里算出来的六条规律（水位、造陆、峰值、巨头、少数、国界），
每张图都可以拖动、切换。

发现好公司：从学科、产业、公司、价格筛四遍（源头、沃土、城基、地价），
再到“寻城”里自己改条件筛选，点一家公司看它2010–2025年的财报小传。

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
    z.write(os.path.join(R, 'README.md'), TOP + 'README.md')
    for d, _, fs in sorted(os.walk(os.path.join(R, 'assets'))):
        for f in sorted(fs):
            if f.startswith('.'): continue
            full = os.path.join(d, f)
            z.write(full, TOP + os.path.relpath(full, R).replace(os.sep, '/'))
print(out, round(os.path.getsize(out) / 1e6, 1), 'MB')
