"""把 Noto Serif SC / Noto Sans SC 可变字体切成本项目用到的字重，并按用字裁剪成 woff2。
输入：tools/input/fonts/NotoSerifSC[wght].ttf、NotoSansSC[wght].ttf（google/fonts 仓库 ofl/ 目录）
用字：tools/chars_all.txt（页面 + 全部公司名）、tools/chars_ui.txt（只含页面文字）
输出：assets/fonts/*.woff2
"""
import os, subprocess, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
H = os.path.dirname(os.path.abspath(__file__))
IN = os.path.join(H, 'input', 'fonts')
OUT = os.path.join(H, '..', 'assets', 'fonts')
TMP = os.path.join(H, 'out')
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
JOBS = [  # (源文件, 字重, 输出名, 用字)
    ('NotoSerifSC[wght].ttf', 600, 'NotoSerifSC-SemiBold', 'chars_ui.txt'),
    ('NotoSerifSC[wght].ttf', 900, 'NotoSerifSC-Black', 'chars_all.txt'),
    ('NotoSansSC[wght].ttf', 400, 'NotoSansSC-Regular', 'chars_all.txt'),
    ('NotoSansSC[wght].ttf', 500, 'NotoSansSC-Medium', 'chars_all.txt'),
    ('NotoSansSC[wght].ttf', 700, 'NotoSansSC-Bold', 'chars_all.txt'),
]
for src, w, name, chars in JOBS:
    f = TTFont(os.path.join(IN, src))
    st = instancer.instantiateVariableFont(f, {'wght': w})
    tmp = os.path.join(TMP, name + '.ttf'); st.save(tmp)
    subprocess.run([sys.executable, '-m', 'fontTools.subset', tmp, f'--text-file={os.path.join(H, chars)}', '--flavor=woff2',
                    "--layout-features=*", f'--output-file={os.path.join(OUT, name + ".woff2")}'], check=True)
    print(name, os.path.getsize(os.path.join(OUT, name + '.woff2')) // 1024, 'KB')
