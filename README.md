# Open My Map

基于 React、Vite、Express 和 SQLite 的自定义地图应用。首页提供地图卡片、项目空间、收藏、回收站及协作管理；编辑器采用熟悉的 Google My Maps 交互布局，地图数据和地图 SDK 使用高德地图。

## 本地运行

使用 **Node.js 24 LTS**（服务端使用内置 `node:sqlite`，Vite 8 也要求较新的 Node.js）。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

编辑 `.env.local`，填写高德控制台申请的 **Web 端（JS API）** Key 和对应的安全密钥：

```dotenv
VITE_AMAP_KEY=你的高德_Web_JS_API_Key
VITE_AMAP_SECURITY_JS_CODE=你的高德_securityJsCode
```

在 [高德开放平台](https://console.amap.com/dev/key/app) 为 Key 配置允许访问的域名，包含本地开发地址和最终部署域名。较新的 Key 通常需要匹配的 `securityJsCode`。修改环境变量后重启 Vite；构建部署时也必须在 `npm run build` 前提供这些变量。`VITE_` 变量会进入浏览器代码，应使用高德提供的域名限制保护客户端 Key。

打开 `http://localhost:5173`，API 服务运行于 `http://localhost:4173`。Vite 已代理 `/api`、`/uploads` 和 `/ws`。首次启动会初始化数据库及演示数据，本地演示管理员为 `admin@openmymap.local`，密码为 `admin123`；也可以在登录页注册自己的账号。

如果尚未配置高德 Key，编辑器会显示配置提示；如果 SDK 加载失败，会显示实际错误。地图、搜索及路线服务需要正确配置的 Key 和可用网络，未配置时不能验证真实地图交互。

## 主要功能

- 首页按项目浏览地图，支持搜索、排序、底图筛选、网格和列表视图；`Ctrl+K` / `⌘K` 聚焦搜索。
- 收藏按用户保存，刷新和重新登录后仍保留。回收站支持恢复或永久删除；移入回收站不会立即移除图层、地点和附件。
- 项目支持所有者、编辑者和查看者权限，并可邀请成员共同编辑。创建新地图需要目标项目的编辑权限；项目所有者或管理员可管理回收站。
- 高德标准、卫星和浅色底图，提供路况、定位、缩放和全屏控件；编辑器支持地点标记、线条、区域、测距、图层管理及附件。选中地点后可拖动，选中线条或区域后可调整顶点并保存。
- 地点搜索使用高德输入联想和地点搜索，支持键盘选择；路线规划使用高德驾车、步行和骑行服务。搜索或规划失败时显示提示，不创建虚构结果。
- 支持 CSV、TSV、GeoJSON、KML 和 GPX 导入，以及 GeoJSON、KML、CSV 导出；提供地图分享链接和实时协作。

数据库中的地图坐标按 WGS84 保存，在高德地图上显示时转换为 GCJ02。首页卡片封面为界面插画，不是当前地图的实时截图。

## 检查与部署

```bash
npm run check
npm test
npm run build
npm start
```

构建后 `npm start` 在同一服务上提供前端和 API，默认地址为 `http://localhost:4173`。

服务端配置通过进程环境变量传入：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `4173` | HTTP 和 WebSocket 服务端口 |
| `DB_PATH` | `data/open-my-map.sqlite` | SQLite 数据库文件 |
| `UPLOAD_DIR` | `data/uploads` | 地点附件保存目录 |
| `UPLOAD_TEMP_DIR` | `data/.upload-tmp` | 上传临时目录 |
| `SESSION_TTL_DAYS` | `30` | 登录会话有效天数 |
| `OPEN_MY_MAP_ADMIN_KEY` | 本地开发默认值 | 管理 API 密钥 |

部署时使用持久化存储保存数据库和附件，使用正式账号替换演示账号及默认管理密钥，并设置 HTTPS 以支持浏览器定位等能力。`.env.local`、数据库文件和上传目录均已列入 `.gitignore`。
