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
- **自由绘制模式**：在地图上点击添加轨迹点
- **形状生成模式**：一键生成 400m / 300m / 200m 标准跑道，支持旋转和位置偏移
- **轨迹编辑**：支持拖拽编辑、撤销，回退，平滑处理
- **路线保存**：支持保存和加载常用路线
- **运动参数配置**：静息心率、最大心率、平均步频，体重、功率系数、GPS 偏移
- **多圈数支持**：自定义跑步圈数，支持小数圈数，自动计算总距离
- **按距离计算圈数**：输入目标距离自动计算所需圈数
- **数据预览**：实时预览配速、心率、海拔曲线
- **真实海拔**：Open-Elevation / OpenTopoData 真实海拔查询，失败自动回退模拟海拔
- **传感器开关**：生成 FIT 时可按需开启/关闭心率、功率、步频、步态数据
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

海拔服务配置硬编码在 `src/elevation.ts` 的 `DEFAULT_ELEVATION_CONFIG` 中。

用户可在前端"海拔来源"下拉框按请求切换（`elevationSource`：`open-elevation` / `opentopodata` / `off`），后端在代码内解析；任一服务请求失败时自动回退本地模拟海拔。

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

## 三、请求限流配置

三种运行方式（Node 服务器 / Workers / Pages）均内置请求限流：**每小时 100 次 / IP**，由 `src/middleware/rate-limit.ts` 统一注入。

如需调整，编辑 `src/middleware/rate-limit.ts`：

```typescript
const RATE_LIMIT = 100;        // 每个窗口内最大请求数
const WINDOW_SECONDS = 3600;   // 窗口时长（秒）
```

> 限流按窗口期划分（`Math.floor(now / WINDOW_SECONDS / 1000)`），每个 IP + 窗口维度计数，超限返回 `429` 并附带 `retryAfter` 秒数。

---

## 四、常见部署问题

### Q: 部署后访问根路径 404

检查构建产物是否正确生成，确认 `dist/index.html` 存在。

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
│   ├── workers.ts      # Workers 入口
│   ├── elevation.ts    # 海拔查询（Open-Elevation / OpenTopoData / 模拟）
│   └── middleware/
│       └── rate-limit.ts  # 请求限流中间件（Node / Workers / Pages 通用）
├── functions/
│   └── api/
│       └── [[catchall]].ts  # Pages Functions 入口
├── public/
│   ├── index.html      # 前端页面
│   ├── main.js         # 前端逻辑
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
  "includeHeartRate": true,
  "includePower": true,
  "includeCadence": true,
  "includeGaitData": true
}
```

| 字段 | 必填 | 说明 |
| ---- | ---- | ---- |
| `startTime` | 是 | ISO 时间戳，运动开始时间 |
| `points` | 是 | 轨迹点（2~10000 个），纬度 -90~90，经度 -180~180 |
| `paceSecondsPerKm` | 否 | 目标配速（秒/公里），默认 360 |
| `hrRest` / `hrMax` | 否 | 静息/最大心率，默认 60 / 180 |
| `lapCount` | 否 | 圈数（支持小数），默认 1，路线自动闭合 |
| `variantIndex` | 否 | 变体序号，默认 1 |
| `weightKg` | 否 | 体重，默认 65 |
| `powerFactor` | 否 | 功率因数，默认 1.3 |
| `gpsDrift` | 否 | GPS 漂移幅度，默认 0 |
| `avgCadence` | 否 | 目标平均步频，默认 170 |
| `elevationSource` | 否 | 海拔来源：`open-elevation` / `opentopodata` / `off` |
| `includeHeartRate` / `includePower` / `includeCadence` / `includeGaitData` | 否 | 传感器开关 |

**响应：**

```json
{
  "totalDistanceMeters": 1234.5,
  "totalDurationSec": 382.7,
  "samples": [{ "timeSec": 0, "distance": 0, "speed": 2.3, "heartRate": 60, "cadence": 150, "power": 130, "lat": 39.9042, "lng": 116.4074, "altitude": 40 }],
  "calories": 82,
  "elevation": { "source": "open-elevation", "status": "live", "message": "已获取真实海拔（Open-Elevation，100 个采样点）" }
}
```

> `elevation.status`：`live`（真实海拔）、`fallback`（请求失败已回退模拟）、`off`（海拔关闭）。

### POST /api/generate-fit

生成 FIT 二进制文件并下载。

**请求体：** 与 `/api/preview` 相同。

**响应：** `application/vnd.ant.fit` 二进制文件，文件名 `run_{variantIndex}.fit`；响应头 `X-Elevation-Source` / `X-Elevation-Status` 标注本次海拔来源与状态。

### GET /api/health

健康检查端点。

**响应：**

```json
{
  "status": "ok",
  "timestamp": 1715074500000,
  "uptime": 3600
}
```

### GET /api/status

服务状态端点，返回当前服务状态。

**响应：**

```json
{
  "status": "available",
  "service": "fit-tool",
  "version": "<取自 package.json>"
}
```

### 请求限制

三种部署方式（Node / Workers / Pages）均有限流保护：
- **限制**：每小时 100 次请求（按 IP 地址）
- **实现**：Node 为单进程内存计数，真实可靠；Workers / Pages 基于 isolate 内存 `Map`，计数为近似值（跨 isolate 不共享，冷启动会重置）
- **触发限流**：返回 `429` 状态码，包含 `retryAfter` 字段
- **响应头**：
  - `X-RateLimit-Limit`: 最大请求数
  - `X-RateLimit-Remaining`: 剩余请求数
  - `X-RateLimit-Reset`: 重置时间戳

***

## 天地图 Key

天地图瓦片需要 API Key。用户可在前端界面"地图设置"中输入自己的 Key。

申请地址：<https://console.tianditu.gov.cn/>

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
