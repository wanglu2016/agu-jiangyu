"""统计页面和数据里用到的字，供 make_fonts.py 裁剪字体"""
import os, json
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(H, '..')
# 直接读发布用的 assets/data.js（第一段是 window.AGU_DATA = {...};），不依赖中间文件
js = open(os.path.join(R, 'assets', 'data.js'), encoding='utf-8').read()
js = js[js.index('{'):js.index('window.AGU_LAYOUT')].rstrip().rstrip(';')
data = json.loads(js)
names = set()
for c in data['co']:
    names.add(c[1]); names.update(r[1] for r in c[2])
base = ''.join(chr(i) for i in range(0x20, 0x7f)) + '·—–…“”‘’（）《》，。、；：？！%％×→←↑↓▶▼○●■□◆◇★☆年月日万亿元家个'
ui = ''.join(open(os.path.join(R, f), encoding='utf-8').read() for f in ('index.html', 'guanchao.html', 'faxian.html', 'zhencha.html', 'ganggu.html', 'video.html', 'assets/extra.js', 'assets/faxian.js', 'assets/zhencha.js', 'assets/ganggu.js', 'assets/hk.js')) + ''.join(s[1] for s in data['sectors'])
open(os.path.join(H, 'chars_ui.txt'), 'w', encoding='utf-8').write(''.join(sorted(set(base + ui))))
open(os.path.join(H, 'chars_all.txt'), 'w', encoding='utf-8').write(''.join(sorted(set(base + ui + ''.join(names)))))
print(len(set(base + ui)), len(set(base + ui + ''.join(names))))
