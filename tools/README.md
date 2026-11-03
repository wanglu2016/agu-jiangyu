# 数据处理脚本

把三份公开数据整理成网页用的 `assets/data.js`。所有路径都相对于本目录：原始数据放 `input/`，中间结果写到 `out/`（两者都不进仓库）。

## 准备输入

| 放到 | 内容 | 来源 |
|---|---|---|
| `input/qlib_bin/` | 每日价格（含已退市公司），解压 `qlib_bin.tar.gz` | [chenditc/investment_data](https://github.com/chenditc/investment_data) 的 Release |
| `input/l2w/stock_valuation.parquet`、`input/l2w/stock_industry.parquet` | 总市值、证监会行业（现值） | [L2Wscorpio/ashare-market-data](https://github.com/L2Wscorpio/ashare-market-data) 的 Release |
| `input/a-share-raw/raw/` | BaoStock 日K（含换手率，用来算流通股本）、逐月证监会行业快照，解压 `a-share-raw-v0.tar` | [noblechang/a-share-data](https://github.com/noblechang/a-share-data) 的 Release `FREE_DATA_v0` |
| `input/fonts/NotoSerifSC[wght].ttf`、`input/fonts/NotoSansSC[wght].ttf` | 可变字体 | [google/fonts](https://github.com/google/fonts) 的 `ofl/notoserifsc/`、`ofl/notosanssc/` |

Python 需要 `numpy pandas pyarrow fonttools brotli`；Node 需要 `npm install`（d3、d3-voronoi-map、d3-weighted-voronoi）。

## 运行顺序

```bash
python3 build_caps.py        # 1. 每只股票的月末收盘价、复权因子、成交额，以及由总市值反推的总股本 → out/stage1.pkl
python3 names_ind.py         # 2. 逐月名称与证监会行业 → out/names_csrc.pkl
python3 build_final.py       # 3. 总股本校验与估算、月末总市值、行业归属（sectors.py 定义30个“国”和主题名单）→ out/final.pkl
python3 postfix.py           # 4. 修正股本序列的短期跳变、停牌期借壳等 → out/final2.pkl
python3 export.py            # 5. 网页数据与每月版图的城市选择 → out/page_data.json、out/frames_sel.json
node layout.js               # 6. 预计算每月版图（幂图站点与权重，前后月份接续）→ out/layout.json
python3 make_web_assets.py   # 7. 合成 ../assets/data.js
python3 make_chars.py        # 8. 统计页面和数据用字
python3 make_fonts.py        # 9. 裁剪字体 → ../assets/fonts/*.woff2
```

## 文件

- `qlibload.py`：读取 qlib 二进制行情。
- `sectors.py`：证监会行业大类到30个“国”的对应，旧版分类的关键词规则，白酒、家电、半导体、AI算力的公司名单。
- `build_final.py` 里还有两张手工表：借壳上市前的壳公司（名称、行业）和约三十家知名公司的曾用名。
- 处理方法和已知问题见网页里的“资料与边界”。
