# Fit Tool

Keep 校园跑生成工具 | Garmin FIT 文件生成器

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![Express](https://img.shields.io/badge/Express-4.18-orange.svg)
![Hono](https://img.shields.io/badge/Hono-4.12-yellow.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-blue.svg)
![Wrangler](https://img.shields.io/badge/Wrangler-%3E%3D4-blueviolet.svg)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-green.svg)
![Garmin FIT SDK](https://img.shields.io/badge/Garmin-FIT%20SDK-red.svg)

## 在线示例

[![在线体验](https://img.shields.io/badge/demo-online-blue?style=flat-square)](https://如何呢.又能怎.de5.net/)

Demo：<https://如何呢.又能怎.de5.net/>

## 项目简介

FitTool 是一款基于 Web 的校园跑路线生成工具，支持在地图上自由绘制跑步路线或生成标准跑道，自动计算运动数据（心率、步频、功率等），并导出符合 Garmin 设备标准的 FIT 文件。

## 功能特性

- **多地图源支持**：高德地图、腾讯地图、百度地图、OSM、ArcGIS、天地图等
- **FIT 文件查看器**：内置 `/viewer/` 子页面，本地解码 FIT（官方 SDK）、概览/表格/图表/地图、导出 CSV/GPX/TCX/JSON、修复损坏文件
- **自由绘制模式**：在地图上点击添加轨迹点
- **形状生成模式**：一键生成 400m / 300m / 200m 标准跑道，支持旋转和位置偏移
- **轨迹编辑**：支持拖拽编辑、撤销，回退，平滑处理
- **路线保存**：支持保存和加载常用路线
- **运动参数配置**：静息心率、最大心率、平均步频，体重、功率系数、GPS 偏移
- **多圈数支持**：自定义跑步圈数，支持小数圈数，自动计算总距离
- **按距离计算圈数**：输入目标距离自动计算所需圈数
- **运动类型**：跑步 / 健走（FIT `sport` 分别写入 running=1 / walking=11，健走默认配速 12'/km、步频 100）
- **训练模式**：匀速跑、负配速跑（前慢后快）、间歇跑（快慢交替，可设组数/快跑距离）、LSD 长距离慢跑（低心率低配速）
- **设备品牌**：FIT `manufacturer_id` 硬编码映射（Garmin / Coros / Polar / Suunto / Wahoo 为官方值；Huawei / Xiaomi / Amazfit 为社区保留值），可选 Developer(255)，支持自定义 0-65535 数值，内置官方品牌对应表悬浮窗
- **运动名称 / 子运动**：运动名称自定义（跑步、户外跑步、室内跑…），FIT `sub_sport` 选项（跑步机/公路/越野/操场/室内跑/障碍跑/虚拟跑…）或自定义 0-255
- **导出格式**：FIT / TCX / GPX / CSV 四种格式，多份可打包 ZIP
- **数据预览**：实时预览配速、心率、海拔曲线，统计训练时长（可加时长）、TRIMP 运动负荷、最高/最低海拔等
- **真实海拔**：Open-Elevation / OpenTopoData（SRTM90 / SRTM30 / ASTER30 / EUDEM25）/ Open-Meteo 六种真实海拔源，失败自动回退模拟海拔；可"不写入海拔"（FIT 海拔字段留空）
- **传感器开关**：生成 FIT 时可按需开启/关闭心率、功率、步频、步态数据（前端在健走模式下会自动关闭心率）
- **批量导出**：支持一次导出多份 FIT 文件
- **坐标系统转换**：自动处理 GCJ-02、BD-09、WGS-84 坐标系统
- **URL 路线分享**：路线编码到 URL hash，支持一键分享（Polyline 算法压缩）
- **GPX 导入/导出**：支持 GPX 文件格式的路线导入和导出
- **路线自动闭合**：一键闭合首尾点形成环线

## 版本选择

| 版本                              | 介绍                                    | 部署方式              | 适用场景                                       |
| -------------------------------- | ------------------------------------- | ----------------- | ------------------------------------------ |
| **JS-Express-\@garmin/fitsdk**  | 传统服务器部署                               | Node.js 服务器       | 适用于本地开发和测试环境                          |
| **TS-Hono**                      | 兼容传统服务器部署，支持 Cloudflare Workers/Pages 双部署 | Workers 或 Pages   | 适用于免服务器、全球加速、快速部署、无限制访问使用       |

***

## JS-Express-\@garmin/fitsdk

### 技术栈

- **前端**：HTML5 + CSS3 + JavaScript (ES6+)
- **地图库**：Leaflet
- **图表库**：Chart.js
- **后端**：Node.js + Express
- **FIT 文件**：[@garmin/fitsdk](https://www.npmjs.com/package/@garmin/fitsdk) 官方 SDK

### 快速开始

```bash
cd JS-Express-@garmin_fitsdk
npm install
npm start
```

访问 <http://localhost:3000>

### 目录结构

```
JS-Express-@garmin_fitsdk/
├── public/
│   ├── index.html    # 主页面
│   ├── main.js       # 前端逻辑
│   ├── style.css     # 样式文件
│   └── HOG_S_64.png  # 图标
├── server.js         # Express 服务器 + FIT 文件生成
├── package.json      # 项目配置
├── run.sh            # Termux 一键启动脚本
└── run.cmd           # Windows 一键启动脚本
```

***

## TS-Hono

### 技术栈

- **前端**：HTML5 + CSS3 + JavaScript (ES6+)
- **后端**：Cloudflare Workers/Pages + Hono
- **地图库**：Leaflet
- **图表库**：Chart.js
- **FIT 文件**：自研编码器 ([src/fit.ts](TS-Hono/src/fit.ts))
- **本地开发**：Wrangler >= 4（用于 Workers/Pages 本地模拟）

### 本地开发

#### 1. Node.js 本地服务器

```bash
cd TS-Hono
npm install
npm run dev
```

访问 <http://localhost:3000>

#### 2. Wrangler 本地开发

| 模式 | 命令 | 端口 |
| ---- | ---- | ---- |
| Workers | `npm run dev:workers` | 8787 |
| Pages | `npm run dev:pages` | 8788 |

```bash
cd TS-Hono
npm install
npm run dev:workers  # 或 npm run dev:pages
```

### 部署位置

TS-Hono 支持两种 Cloudflare 部署：**Workers** 和 **Pages**。

| 部署位置 | 命令 | 配置文件 | 特点 |
| ------- | ---- | ------- | ---- |
| Workers | `npm run deploy:workers` | `wrangler.workers.toml` | 必须 Wrangler CLI 部署 |
| Pages   | `npm run deploy:pages` | `wrangler.toml` | 支持 Dashboard 可视化部署 |

### FIT 查看器（`/viewer/`）

内置独立的浏览器端 FIT 文件查看器（源自 FitFileViewer，位于 `public/viewer/`），可从主页顶栏「FIT 查看器」入口打开：

- **打开**：拖放或点击加载 `.fit` 文件，纯浏览器本地解码（基于官方 `@garmin/fitsdk`），不上传任何数据
- **概览**：摘要卡片、文件头、设备信息、圈数、会话、解码错误列表
- **表格**：每种消息类型可排序、可折叠，支持导出 CSV（单表或全部）
- **图表**：心率/功率/踏频/速度/海拔等指标，支持悬停、框选缩放、Shift 拖拽平移
- **地图**：GPS 轨迹 + 圈速标记 + 起终点（Leaflet，大文件自动降采样）；地图源与主项目统一（高德/腾讯/百度/OSM/ArcGIS/天地图等），自动做 WGS84→GCJ02/BD09 坐标转换，避免国内瓦片源错位
- **导出**：CSV / GPX / TCX / JSON
- **修复**：从部分损坏的 FIT 文件中恢复消息并重新编码，下载可上传的修复副本

开发说明：`public/viewer/` 自带 `package.json` 与 `scripts/`（`bundle:sdk` 重新打包官方 SDK、`make:sample` 生成演示文件、`serve` 独立静态服务），修改后需在 `public/viewer/` 下 `npm install`。该目录为纯静态资源，Express / Workers / Pages 三种部署均自动托管，无需额外配置。

> 注意：Cloudflare Pages 部署下，非 `/api/*` 的请求由 `functions/api/[[catchall]].ts` 直接透传到静态资源（`context.next()`），`/viewer/` 与根路径因此正常返回页面。

---

## 部署方式

| 部署方式 | 说明 |
| ------- | ---- |
| **Wrangler CLI** | 命令行部署 |
| **Cloudflare Dashboard** | 网页可视化部署（GitHub 集成可选开启） |

---

## 一、Wrangler CLI 部署

### 1. 安装并登录

```bash
npm install -g wrangler
wrangler login
```

### 2. Workers 版本部署

```bash
cd TS-Hono
npm run deploy:workers
```

配置文件：`wrangler.workers.toml`（命令已指定）

### 3. Pages 版本部署

```bash
cd TS-Hono
npm run deploy:pages
```

> 注意：`deploy:pages` 命令会先构建再部署。如需仅构建，使用 `npm run build:pages`。

配置文件：`wrangler.toml`（wrangler 自动使用）

### 4. 配置 CORS

编辑对应的配置文件：

```toml
[vars]
# 生产环境请设置为实际域名，不要使用 "*"
ALLOWED_ORIGINS = "https://your-domain.com"
```

> **安全提示**：`ALLOWED_ORIGINS = "*"` 仅用于开发环境。生产环境必须指定具体域名。

### 5. 海拔源配置

海拔请求由**浏览器端**直接发起（`public/main.js` 中的 `fetchAltitudesClient`），服务端不请求任何第三方海拔 API。海拔数据随 `/api/preview`、`/api/generate-fit` 的 `altitudes` 字段一并提交。

用户可在前端"海拔来源"下拉框按请求切换（`elevationSource`）：

| 值 | 说明 |
| -- | ---- |
| `none` | 不查询、不写入海拔（FIT 海拔字段留空） |
| `off` | 模拟海拔（正弦随机曲线） |
| `open-elevation` | Open-Elevation 真实海拔（浏览器直连） |
| `opentopodata` | OpenTopoData `srtm90m` 数据集（需 CORS 代理） |
| `opentopodata-srtm30m` | OpenTopoData `srtm30m` 数据集（需 CORS 代理） |
| `opentopodata-aster30m` | OpenTopoData `aster30m` 数据集（需 CORS 代理） |
| `opentopodata-eudem25m` | OpenTopoData `eudem25m` 数据集（需 CORS 代理） |
| `open-meteo` | Open-Meteo 海拔服务（浏览器直连） |

- 浏览器端按坐标去重、受限并发（默认 8）分批请求；成功结果会按「坐标 + 数据源 + CORS 代理」缓存，重复预览/生成不重复消耗额度。
- 单个批次/采样点失败会重试一次，仍失败则仅这些点回退本地模拟海拔（其余成功点保留）。
- 选择任意 OpenTopoData 源时会显示「CORS 代理服务」输入框：可填 `https://corsproxy.io/?url=` 或带 `{url}` 占位符的前缀式代理；留空则直连。

---

## 二、Dashboard 部署

### 1. 创建项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **创建应用程序**
3. 选择 **Workers** 或 **Pages**

### 2. Pages 项目

| 配置项 | 值 |
| ------ | -- |
| **构建命令** | `npm run build:pages` |
| **根目录** | `TS-Hono` |
| **输出目录** | `dist-pages` |
| **Framework preset** | **None** |

### 3. 环境变量

在 Settings → Environment variables 中添加：

| 变量名 | 值 |
| ------ | -- |
| `ALLOWED_ORIGINS` | `https://your-domain.com` |

### 4. GitHub 集成（可选）

在 Deployments 页面点击 **Connect to Git** 连接仓库，之后每次 push 会自动触发部署。

---

## 四、常见部署问题

### Q: 部署后访问根路径 404

检查 `functions/api/[[catchall]].ts`：非 `/api/` 请求必须走 `context.next()` 透传到静态资源（`public/` 内容），构建产物确认 `dist-pages/index.html` 与 `dist-pages/functions/api/[[catchall]].js` 均存在。

### Q: API 返回 405 Method Not Allowed

检查 `dist-pages/functions/api/[[catchall]].js` 是否存在。

### Q: CORS 错误

配置 `ALLOWED_ORIGINS` 环境变量，确保包含前端域名。

### 目录结构

```
TS-Hono/
├── src/
│   ├── fit.ts          # FIT 文件编码器
│   ├── lib.ts          # 业务逻辑和数据生成
│   ├── handlers.ts     # /api/preview、/api/generate-* 共享处理器（Node / Workers / Pages 通用）
│   ├── device.ts       # 设备品牌映射（官方 4 + 社区 3 + Developer 255，前端自定义数值直通）
│   ├── exporters.ts    # TCX / GPX / CSV 导出与文件分发
│   ├── workers.ts      # Workers 入口
├── functions/
│   └── api/
│       └── [[catchall]].ts  # Pages Functions 入口
├── public/
│   ├── index.html      # 前端页面
│   ├── main.js         # 前端逻辑（含浏览器端海拔获取与 CORS 代理）
│   ├── sponsor.png     # 赞赏码
│   ├── style.css       # 样式
│   └── HOG_S_64.png   # 图标
├── build.pages.ts      # Pages 构建脚本
├── wrangler.toml      # Pages 配置文件
├── wrangler.workers.toml # Workers 配置文件
├── server.ts          # 本地开发服务器
├── package.json       # 依赖管理
├── tsconfig.json     # TypeScript 配置
├── run.sh            # Termux 一键启动脚本
└── run.cmd           # Windows 一键启动脚本
```

### 配置文件说明

| 配置项 | Workers (wrangler.workers.toml) | Pages (wrangler.toml) |
| ------ | ------------------------------- | --------------------- |
| `main` | `src/workers.ts` | - |
| `[assets]` | 需要，静态资源托管 | - |
| `pages_build_output_dir` | - | `dist-pages`（仅构建时使用） |
| `[vars]` | `ALLOWED_ORIGINS` | `ALLOWED_ORIGINS` |

> 注意：Workers 使用 `wrangler.workers.toml`，Pages 使用 `wrangler.toml`。

### 可用命令

| 命令 | 模式 | 说明 |
| ---- | ---- | ---- |
| `npm start` / `npm run dev` | Node | 启动本地 Node.js 服务器（端口 3000） |
| `npm run dev:workers` | Workers | Wrangler 本地开发（端口 8787） |
| `npm run dev:pages` | Pages | Wrangler Pages 本地开发（端口 8788） |
| `npm run build` | 通用 | 构建 Workers 和 Pages 部署产物 |
| `npm run build:workers` | Workers | 仅构建 Workers 部署产物 |
| `npm run build:pages` | Pages | 仅构建 Pages 部署产物 |
| `npm run deploy:workers` | Workers | 部署到 Cloudflare Workers |
| `npm run deploy:pages` | Pages | 构建并部署到 Cloudflare Pages |
| `npm run type-check` | 通用 | TypeScript 类型检查 |
| `npm run clean` | 通用 | 清理构建产物（跨平台） |
| `npm run clean:win` | 通用 | Windows 专用清理命令（PowerShell） |

***

## API 接口

### POST /api/preview

生成运动数据预览（不生成文件）。

**请求体：**

```json
{
  "startTime": "2026-08-06T06:00:00Z",
  "points": [{ "lat": 39.9042, "lng": 116.4074 }, { "lat": 39.905, "lng": 116.408 }],
  "paceSecondsPerKm": 310,
  "hrRest": 60,
  "hrMax": 180,
  "lapCount": 1,
  "variantIndex": 1,
  "weightKg": 65,
  "powerFactor": 1.3,
  "gpsDrift": 0.1,
  "avgCadence": 170,
  "elevationSource": "open-elevation",
  "altitudes": [40.2, 41.0],
  "includeHeartRate": true,
  "includePower": true,
  "includeCadence": true,
  "includeGaitData": true,
  "sportType": "running",
  "sportName": "跑步",
  "fitSubSport": "street",
  "customSubSport": 0,
  "deviceType": "garmin",
  "heightCm": 175,
  "workoutMode": "steady",
  "intervalReps": 6,
  "intervalFastKm": 0.4,
  "elapsedExtraSeconds": 10,
  "format": "fit"
}
```

| 字段 | 必填 | 说明 |
| ---- | ---- | ---- |
| `startTime` | 是 | ISO 时间戳，运动开始时间 |
| `points` | 是 | 轨迹点（2~10000 个），纬度 -90~90，经度 -180~180 |
| `paceSecondsPerKm` | 否 | 目标配速（秒/公里），默认 360；健走默认 720。有效值 1~1999，超出回退默认 |
| `hrRest` / `hrMax` | 否 | 静息/最大心率，默认 60 / 180；`hrRest` clamp 到 30~120，`hrMax` clamp 到 100~220 |
| `lapCount` | 否 | 圈数（支持小数），默认 1，路线自动闭合；展开后的轨迹点上限 50000，超限返回 400 |
| `variantIndex` | 否 | 变体序号，默认 1 |
| `weightKg` | 否 | 体重（30~150kg，含边界），默认 65 |
| `powerFactor` | 否 | 功率因数，默认 1.3，上限 10（超出 clamp） |
| `gpsDrift` | 否 | GPS 漂移幅度，后端默认 0（前端界面默认 0.1） |
| `avgCadence` | 否 | 目标平均步频，默认 170 |
| `elevationSource` | 否 | 海拔来源：`none` / `off` / `open-elevation` / `opentopodata` / `opentopodata-srtm30m` / `opentopodata-aster30m` / `opentopodata-eudem25m` / `open-meteo` |
| `altitudes` | 否 | 浏览器端获取的真实海拔数组，长度与 `points` 相同（路线未闭合时也接受 `points.length + 1`）；数组元素可为 `null` 表示该点回退模拟海拔。服务端不再请求任何第三方海拔 API |
| `includeHeartRate` / `includePower` / `includeCadence` / `includeGaitData` | 否 | 传感器开关 |
| `sportType` | 否 | 运动类型：`running`（默认）/ `walking` |
| `sportName` | 否 | 运动名称（如"跑步"、"户外跑步"），用于预览回显与前端文件名前缀 |
| `fitSubSport` | 否 | FIT 子运动：`generic` / `treadmill` / `street` / `trail` / `track` / `indoorRunning` / `obstacle` / `virtualActivity` / `casualWalking` / `indoorWalking` |
| `customSubSport` | 否 | 自定义子运动数值 0-255，优先级高于 `fitSubSport`（默认 0 表示按 `fitSubSport` 映射） |
| `deviceType` | 否 | 设备品牌：`garmin` / `coros` / `polar` / `suunto` / `wahoo`（官方值）、`huawei` / `xiaomi` / `amazfit`（社区保留值，可能无法识别）、`development`（255），或直接填数字 manufacturer_id（0-65535，优先级最高） |
| `heightCm` | 否 | 身高（预留字段，当前未参与计算）；前端默认 170 |
| `workoutMode` | 否 | 训练模式：`steady`（默认）/ `negative_split` / `interval` / `lsd` |
| `intervalReps` | 否 | 间歇跑组数（`workoutMode=interval` 时生效），默认 4 |
| `intervalFastKm` | 否 | 间歇跑快跑段距离（公里），默认 0.4 |
| `elapsedExtraSeconds` | 否 | 训练时长额外增加秒数（FIT `total_elapsed_time`），默认 0 |
| `format` | 否 | 仅 `/api/generate-fit` 使用：`fit`（默认）/ `tcx` / `gpx` / `csv` |

**响应：**

```json
{
  "totalDistanceMeters": 1234.5,
  "totalDurationSec": 382.7,
  "trainingDurationSec": 392.7,
  "samples": [{ "timeSec": 0, "distance": 0, "speed": 2.3, "heartRate": 60, "cadence": 150, "power": 130, "lat": 39.9042, "lng": 116.4074, "altitude": 40 }],
  "calories": 82,
  "stats": {
    "avgSpeed": 3.2, "avgHeartRate": 156, "avgCadence": 170, "avgPower": 224,
    "totalAscent": 45.2, "totalDescent": 30.1,
    "maxElevation": 60, "minElevation": 20,
    "trainingLoad": 25.4
  },
  "elevation": { "source": "open-elevation", "status": "live", "message": "已获取真实海拔（Open-Elevation，100 个采样点）" }
}
```

> `elevation.status`：`live`（真实海拔）、`partial`（部分真实海拔，其余回退模拟）、`fallback`（请求失败已回退模拟）、`off`（模拟海拔）、`none`（不写入海拔）。
> `stats.trainingLoad` 为 TRIMP 训练负荷（训练时长加权）；`trainingDurationSec` = 运动时长 + `elapsedExtraSeconds`。

### POST /api/generate-fit

生成运动文件（FIT / TCX / GPX / CSV）并下载。

**请求体：** 与 `/api/preview` 相同，`format` 指定导出格式。

**响应：**

| `format` | `Content-Type` | 文件名 |
| -------- | -------------- | ------ |
| `fit` | `application/vnd.ant.fit` | `run_{variantIndex}.fit` / `walk_{variantIndex}.fit` |
| `tcx` | `application/gpx+xml` | `run_{variantIndex}.tcx` |
| `gpx` | `application/gpx+xml` | `run_{variantIndex}.gpx` |
| `csv` | `text/csv; charset=utf-8` | `run_{variantIndex}.csv` |

响应头 `X-Elevation-Source` / `X-Elevation-Status` 标注本次海拔来源与状态。

> FIT 文件写入 `sport` / `sub_sport` / `manufacturer_id` / `total_elapsed_time`（含 `elapsedExtraSeconds`）；`elevationSource=none` 时海拔字段留空。

### GET /api/status

服务状态端点，返回当前服务状态、版本、运行时间等信息。

**响应：**

```json
{
  "status": "available",
  "service": "HOG-StarWatch/FitTool",
  "version": "2.0.0",
  "timestamp": 1715074500000,
  "uptime": 3600
}
```

> `uptime` 为服务运行时间（秒）。Node.js 环境返回 `process.uptime()`，Workers / Pages 环境固定为 `0`。

***

## 天地图 Key

天地图瓦片需要 API Key。用户可在前端界面"地图设置"中输入自己的 Key。

申请地址：<https://console.tianditu.gov.cn/>

***

## 可行性说明

技术上，利用 Cloudflare Pages Functions（或 Workers）请求地图瓦片或搜索是可行的：在 `functions/` 下新增代理路由（如 `/api/proxy/{source}/{z}/{x}/{y}`），由云端边缘节点代替浏览器请求各瓦片源，从而绕开本地网络对部分国际瓦片源（OSM、CartoDB、ArcGIS 等）的访问限制，还能配合请求白名单校验、边缘缓存（`cf.cacheTtl`）并将 API Key 收敛到服务端。

但本项目保持瓦片由浏览器**直接请求各瓦片源**，不引入服务端请求。

***

## 开发者

| 项目                                | 贡献者                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| JS-Express-\@garmin/fitsdk         | [HOG-StarWatch](https://github.com/HOG-StarWatch)（前端重构、后端维护、新增地图源支持） |
| TS-Hono (Workers/Pages 双部署)      | [HOG-StarWatch](https://github.com/HOG-StarWatch)（Workers/Pages 双部署支持）  |

## 特别鸣谢

| 项目                                      | 来源                                             |
| ---------------------------------------- | ---------------------------------------------- |
| JS-Express-\@garmin/fitsdk 原始版本开源者 | [黑心商家瑶瑶](https://space.bilibili.com/439315192) |
| Cloudflare Workers 免费额度                 | [Cloudflare](https://www.cloudflare.com/)      |
| Hono 框架                                 | [Hono](https://hono.dev/)                      |

## 免责声明

本项目仅供学习交流使用，请勿用于任何作弊行为。使用本项目产生的一切后果由使用者自行承担。
