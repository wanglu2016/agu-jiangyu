"""out/page_data.json + out/layout.json → assets/data.js（用 <script> 加载，双击 index.html 也能离线运行）"""
import os, json
H = os.path.dirname(os.path.abspath(__file__))
data = open(os.path.join(H, 'out', 'page_data.json'), encoding='utf-8').read()
lay = json.dumps(json.load(open(os.path.join(H, 'out', 'layout.json'))), separators=(',', ':'))
out = os.path.join(H, '..', 'assets', 'data.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('/* A股疆域图数据：由 tools/ 生成，勿手改 */\n')
    f.write('window.AGU_DATA=' + data + ';\n')
    f.write('window.AGU_LAYOUT=' + lay + ';\n')
print(out, os.path.getsize(out) // 1024, 'KB')
