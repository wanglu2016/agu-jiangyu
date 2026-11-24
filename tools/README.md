# 数据处理脚本

把三份公开数据整理成网页用的 `assets/data.js`，以及“发现好公司”“财报侦探”页用的 `assets/quality.js`；“港股通”页用的 `assets/hk.js` 来自手工抄录的港股快照；“持有一月”“持有三月”“持有一年”三页用的 `assets/chiyou-data.js`、`assets/chiyou-ext.js`，以及“看数”页用的 `assets/ks/`，由日线行情和前面生成的数据合成。所有路径都相对于本目录：原始数据放 `input/`，中间结果写到 `out/`（两者都不进仓库）。

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
python3 make_hk.py           # 10b. 港股快照（hk/*.csv）→ ../assets/hk.js
python3 make_chiyou.py       # 10c. 小游戏题库：逐月抽题、算指标和此后的回报 → ../assets/chiyou-data.js、../assets/chiyou-ext.js
python3 make_chiyou_pages.py # 10c'. 用 chiyou-page.html 模板生成三个游戏页 → ../chiyou.html、../sanyue.html、../yinian.html
python3 make_chiyou_sql.py   # 10d. 排行榜后端：chiyou-schema.sql + 题库答案表 → chiyou-supabase.sql（在 Supabase 的 SQL Editor 里运行）
python3 make_kanshu.py       # 10e. 看数：全部公司每个月末的 28 项指标与分位，并与题库逐项核对 → ../assets/ks/（要先 pip install pypinyin）
python3 make_kanshu_ext.py   # 10e'. 看数：补上异常换手、同行业分位，只读写 ../assets/ks/（make_kanshu.py 最后会自动调用；单独重跑也可以）
python3 make_chars.py        # 11. 统计页面和数据用字
python3 make_fonts.py        # 12. 裁剪字体 → ../assets/fonts/*.woff2
python3 make_zip.py          # 13. 打包离线版 → ../download/agu-jiangyu-site.zip
```

第8步以后只依赖已经生成的 `../assets/data.js`，不需要重算市值：改候选国名单、改页面文字，从第8步或第11步重新运行即可。第10步另外需要 `input/l2w/financial_line_items.parquet` 和 `input/qlib_bin/`（只用 `close.day.bin`）。第10c步需要 `input/qlib_bin/` 的 `close`、`factor`、`high`、`low`、`amount`、`change` 六个字段，以及已经生成的 `../assets/data.js`、`quality.js`、`extra.js`；它会自己检查月末交易日，换了新数据包直接重跑即可（约1分钟），随机种子固定，同样的输入得到同样的题库。

## 文件

- `qlibload.py`：读取 qlib 二进制行情。
- `sectors.py`：证监会行业大类到30个“国”的对应，旧版分类的关键词规则，白酒、家电、半导体、AI算力的公司名单。
- `build_final.py` 里还有两张手工表：借壳上市前的壳公司（名称、行业）和约三十家知名公司的曾用名。
- `make_extra.py`：年度名义GDP（来源和接续方法写在注释里），创新药、机器人、储能三个候选国的公司名单，低空观察名单，科技环节分组。名单按公司名称填写，脚本会从 `data.js` 查代码，查不到的会打印出来。
- `candidates.js`：把候选国的公司从原来的国里划出，按 `export.py` 的规则重新选城，再用 `layout.js` 的算法从2022年12月的版图接续算到最后一个月，所以其余国家的位置基本不动。
- `make_quality.py`：从三大报表里取每家公司每年的营收、归母净利润、归母净资产、经营现金流、资产负债率、商誉和研发费用，从 qlib 的复权收盘价里取每年12月末、上市首月和最后一个月的数值，量化后写成 base64（格式写在脚本开头的注释里）。旧格式的“净利润”就是归母净利润，新格式另有“归属于母公司所有者的净利润”一项，脚本优先取后者。数据集里的 `free_cash_flow`、`capital_expenditure` 两个字段其实是经营现金流和投资现金流净额，没有使用。
- `make_chiyou.py`：决策日是每个月最后一个交易日，从2013年5月到 `data.js` 最后一个月的前一个月。每个决策日从“上市满一年、当天有交易”的公司里随机抽30家，再从市值前300名里抽15家；算28项指标（只用当天能看到的数据，年报按4月30日的披露期限取）、它们在当天全部合格公司里的百分位，以及此后一个月、一年、三年的含分红回报、当月每日走势和此后37个月的走势。格式写在脚本开头的注释里；指标的文字说明在 `../assets/chiyou.js` 里。
- `make_chiyou.py` 另外写 `chiyou-ext.js`：同一份题库的三个月回报、三个月里的走势、三个月和一年回报的分布与中位数。`chiyou-data.js` 的内容不变，所以三个游戏共用一份题库，持有一月的旧答案也不受影响。
- `chiyou-page.html`、`make_chiyou_pages.py`：三个游戏页的模板和生成脚本。三页共用 `../assets/chiyou.js`，页面里的 `window.AGU_CY_GAME` 告诉脚本持有几个月、战绩存在浏览器的哪个位置；改页面文字就改模板或脚本里的 GAMES，再运行一次。
- `chiyou-schema.sql`、`make_chiyou_sql.py`、`chiyou-supabase.sql`：三个游戏排行榜的后端。`chiyou-schema.sql` 是手写的建表和函数（cy_submit 按题库答案重算盈亏并排名、cy_share 晒战绩、cy_top 读前100名），`make_chiyou_sql.py` 把它和题库答案表（题号、股价、一个月/三个月/一年后的回报、涨跌停，取自 `chiyou-data.js` 和 `chiyou-ext.js`）合成 `chiyou-supabase.sql`。对局表的 `game` 列（1、3、12）区分是哪个游戏，`cy_top(p_game)` 只排这个游戏的局。重新生成题库后，要把 `make_chiyou.py` 里的题库版本号加一，重跑 10c、10d，并在 Supabase 里再运行一次 `chiyou-supabase.sql`；旧版本的答案保留，旧对局不受影响。
- `make_kanshu.py`：和 `make_chiyou.py` 用同样的输入、同样的公式，只是每个月对图上的全部公司算（题库每月只抽 45 家），分位仍以“上市满一年、当天有交易”的公司为参照。运行到最后会拿 `chiyou-data.js` 的 7,225 道题逐项核对数值和分位，不一致就停下。输出 `../assets/ks/index.js`（月份、海平面、同期大盘、全部公司的代码/名称/拼音首字母/曾用名、A+H 对照、港股快照）、`s/<代码>.js`（一只股票逐月的数值和分位，zlib 压缩后 base64）和 `m/<年-月>.js`（一个月里全部公司的分位，供“在全部A股里找”）。格式写在脚本里的 `pack_stock()`、`pack_month()` 注释中；网页用 `<script>` 加载，所以离线双击也能用。
- `make_kanshu_ext.py`：在 `make_kanshu.py` 生成的看数数据后面补两样东西，不需要原始行情。异常换手 = 月末换手率（成交额 ÷ 总市值）÷ 最近 12 个月末的平均（至少 9 个月有数），以及它的全市场分位；同行业分位 = 用指标的数值在同一个国当天的参照公司里排（不足 5 家不算），覆盖 `ipf` 里的 24 项。追加的格式写在脚本开头；`index.js` 里的 `ext` 说明追加了什么，网页按它读。脚本可以重复运行，结果逐字节相同。它还把月度文件里行业未知的公司的行业字节改成 255（原来记成 0，即“银行”）。
- `make_hk.py`：读 `hk/ah_YYYYMMDD.csv`（A+H公司的两地股价，从经济通“AH股表现”页抄录，脚本用页面给出的溢价逐行校验）和 `hk/hk_YYYYMMDD.csv`（港股大公司的股价、市值、周息率、市盈率），加上脚本里手工标注的公司类型、所属的国、股权结构（W/V/S）、是否在港股通、分类，生成 `../assets/hk.js`。更新快照时换掉两个 CSV、改脚本开头的日期和汇率即可。
- “财报侦探”的卷宗、附注线索，“港股通”的规则、暗礁和分类说明写在 `../assets/zhencha.js`、`../assets/ganggu.js` 和对应的 html 里，不由脚本生成。
- “发现好公司”页里的前沿卡片（学科、节点、判断）和高校专业数字写在 `../assets/faxian.js` 里，不由脚本生成。
- 处理方法和已知问题见网页里的“资料与边界”和“发现好公司”页末的“口径与边界”。
