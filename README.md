# A股疆域图

一张会动的A股地图：每个行业是一个国家，每家公司是一座城，城的面积就是公司的市值。拖动时间轴，看2000年到2026年沪深两市的行业版图怎么扩张、收缩。

**在线体验：** https://wanglu2016.github.io/agu-jiangyu/
**使用讲解视频（4分38秒）：** https://wanglu2016.github.io/agu-jiangyu/video.html

![A股疆域图截图](assets/preview.jpg)

## 能做什么

- **看版图：** 30个行业各有固定颜色，国名下面是该行业占全图的份额；大公司单独成城，标着名字和市值，浅色小块是其余较小的公司。滚轮或双指可以放大。
- **拖动时间轴：** 2000年1月到2026年10月，每月一帧，共322个月。时间轴本身是一张按行业分层的年表，小三角标着大事；可以播放、调速。
- **此时：** 10段时代解说随年月切换，并列出当月市值前十的公司。
- **查一家公司：** 悬停看市值、全图排名和占比；点开看历年市值曲线和它先后属于哪个行业（例如中际旭创：机械 → 通信 → AI算力）。
- **搜索：** 名称、曾用名、代码都能搜，已退市的公司也在。
- **幸存者偏差：** 打开“标出日后退市的公司”，后来退市或被合并的公司会圈上红色虚线，并算出它们当时占全图多少。
- **诸国：** 30个行业各自的份额曲线。
- **资料与边界：** 数据来源、算法和不准的地方。

## 下载

- **离线版网页（4.8 MB）：** [agu-jiangyu-site.zip](https://github.com/wanglu2016/agu-jiangyu/raw/main/download/agu-jiangyu-site.zip)。解压后双击 `index.html` 即可使用，不需要联网或安装任何软件。
- **讲解视频（46 MB）：** [agu-jiangyu-guide.mp4](https://github.com/wanglu2016/agu-jiangyu/raw/main/video/agu-jiangyu-guide.mp4)，也可以在[视频页](https://wanglu2016.github.io/agu-jiangyu/video.html)点“下载视频”。
- **全部源代码：** 页面右上角绿色的 **Code → Download ZIP**。

需要较新的 Chrome、Edge、Safari 或 Firefox。手机也可以使用。

## 读图须知

- **口径：** 市值 = 月末收盘价 × 总股本。总股本按行情软件的通行口径，包含H股等境外股份并按A股价格折算，所以工商银行、中国石油这类A+H公司的版图偏大，“本图合计”通常比交易所公布的A股市值高一成左右。
- **估算：** 332家公司部分月份缺总股本，2010年以后用流通股本代替，2010年以前由成交额推算，图上画斜线。估算部分在2000年约占全图13%，2020年后不到1.5%。
- **行业：** 以证监会行业分类（2012年版）为基础合并成30个“国”；白酒、家电、半导体、AI算力（2023年1月起）是本项目按公司名单划出的。
- **名称：** 多数公司用现名或退市前的最后名称，约三十家知名公司按改名时间显示旧名。
- **没有收录：** 1990–1999年（只有文字序章）、北京证券交易所、B股、2026年9月18日之后上市的6家新股。
- 单家公司个别月份的数值可能有误。本项目适合看行业大势，不宜当作个股数据来源，**不构成投资建议**。时代解说由 AI（Claude）编写，可能有错漏，欢迎在 Issues 中指出。

## 数据来源与许可

| 内容 | 来源 | 许可 |
|---|---|---|
| 每日价格（含已退市公司） | [chenditc/investment_data](https://github.com/chenditc/investment_data)（整合 Wind、Tushare 等来源的 qlib 数据包） | Apache-2.0 |
| 总市值、总股本 | [L2Wscorpio/ashare-market-data](https://github.com/L2Wscorpio/ashare-market-data) | 仓库未注明许可 |
| 流通股本、逐月证监会行业、公司名称 | [noblechang/a-share-data](https://github.com/noblechang/a-share-data)（BaoStock 数据快照） | 仓库未注明许可，声明仅用于学习与研究 |
| 绘图库 | [d3](https://github.com/d3/d3)、[d3-weighted-voronoi](https://github.com/Kcnarf/d3-weighted-voronoi)、[d3-voronoi-map](https://github.com/Kcnarf/d3-voronoi-map) | ISC、BSD-3-Clause（见 `assets/lib/`） |
| 字体 | Noto Serif SC / Noto Sans SC，按本项目用字裁剪 | SIL OFL 1.1（见 `assets/fonts/OFL.txt`） |

本项目自己的代码与文字可自由使用；所用数据请遵守各来源的条款。

## 项目结构

```
index.html          地图页面
video.html          讲解视频页
assets/             数据（data.js）、绘图库、字体、图标与截图
download/           离线版压缩包
video/              讲解视频
tools/              数据处理脚本，见 tools/README.md
```

本地运行：直接双击 `index.html`；或在项目目录运行 `python3 -m http.server`，再打开 http://localhost:8000 。
