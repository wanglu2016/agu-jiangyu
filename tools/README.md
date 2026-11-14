# 数据处理脚本

把三份公开数据整理成网页用的 `assets/data.js`，以及“发现好公司”页用的 `assets/quality.js`。所有路径都相对于本目录：原始数据放 `input/`，中间结果写到 `out/`（两者都不进仓库）。

## 准备输入

| 放到 | 内容 | 来源 |
|---|---|---|
| `input/qlib_bin/` | 每日价格（含已退市公司），解压 `qlib_bin.tar.gz` | [chenditc/investment_data](https://github.com/chenditc/investment_data) 的 Release |
| `input/l2w/stock_valuation.parquet`、`input/l2w/stock_industry.parquet`、`input/l2w/financial_line_items.parquet` | 总市值、证监会行业（现值）、三大报表 | [L2Wscorpio/ashare-market-data](https://github.com/L2Wscorpio/ashare-market-data) 的 Release |
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
python3 make_extra.py        # 8. 名义GDP、候选国名单、观察名单 → ../assets/extra.js
node candidates.js           # 9. 2023年1月起带候选国的版图（从原版图接续）→ ../assets/candidates.js
python3 make_quality.py      # 10. 2010–2025年报摘要、历年年末复权价 → ../assets/quality.js
python3 make_chars.py        # 11. 统计页面和数据用字
python3 make_fonts.py        # 12. 裁剪字体 → ../assets/fonts/*.woff2
python3 make_zip.py          # 13. 打包离线版 → ../download/agu-jiangyu-site.zip
```

第8步以后只依赖已经生成的 `../assets/data.js`，不需要重算市值：改候选国名单、改页面文字，从第8步或第11步重新运行即可。第10步另外需要 `input/l2w/financial_line_items.parquet` 和 `input/qlib_bin/`（只用 `close.day.bin`）。

## 文件

- `qlibload.py`：读取 qlib 二进制行情。
- `sectors.py`：证监会行业大类到30个“国”的对应，旧版分类的关键词规则，白酒、家电、半导体、AI算力的公司名单。
- `build_final.py` 里还有两张手工表：借壳上市前的壳公司（名称、行业）和约三十家知名公司的曾用名。
- `make_extra.py`：年度名义GDP（来源和接续方法写在注释里），创新药、机器人、储能三个候选国的公司名单，低空观察名单，科技环节分组。名单按公司名称填写，脚本会从 `data.js` 查代码，查不到的会打印出来。
- `candidates.js`：把候选国的公司从原来的国里划出，按 `export.py` 的规则重新选城，再用 `layout.js` 的算法从2022年12月的版图接续算到最后一个月，所以其余国家的位置基本不动。
- `make_quality.py`：从三大报表里取每家公司每年的营收、归母净利润、归母净资产、经营现金流、资产负债率、商誉和研发费用，从 qlib 的复权收盘价里取每年12月末、上市首月和最后一个月的数值，量化后写成 base64（格式写在脚本开头的注释里）。旧格式的“净利润”就是归母净利润，新格式另有“归属于母公司所有者的净利润”一项，脚本优先取后者。数据集里的 `free_cash_flow`、`capital_expenditure` 两个字段其实是经营现金流和投资现金流净额，没有使用。
- “发现好公司”页里的前沿卡片（学科、节点、判断）和高校专业数字写在 `../assets/faxian.js` 里，不由脚本生成。
- 处理方法和已知问题见网页里的“资料与边界”和“发现好公司”页末的“口径与边界”。
