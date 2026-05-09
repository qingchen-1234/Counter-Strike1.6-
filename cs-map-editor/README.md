# CS 1.6 地图灰模编辑器 — 多人联机版 v2.2

基于 Web 技术的 Counter-Strike 1.6 地图协作编辑工具，专注于**白盒/灰模**阶段的多人在线协同。

支持立方体、斜坡、楼梯、楔形、圆柱、平面等 6 种方块类型，四视图编辑模式，以及 .map / .csmap 双格式导出。

## 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 前端 3D 渲染 | Three.js | ^0.162 |
| 前端 UI | Vue 3 (Composition API) + Vite | ^3.4 / ^5.2 |
| 后端 | Node.js + Express + cors | ^4.18 |
| 实时通信 | Socket.io | ^4.7 |
| ID 生成 | uuid | ^9.0 |

## 项目结构

```
cs-map-editor/
├── package.json                # 根配置 (concurrently 启动前后端)
├── server/
│   ├── package.json
│   ├── index.js                # Express + Socket.io 服务器 + REST API
│   └── socketHandler.js        # 房间管理v2、方块CRUD同步、互斥锁、光标同步
├── client/
│   ├── package.json
│   ├── vite.config.js          # Vite 配置 (代理 /api、/socket.io 到后端)
│   ├── index.html
│   └── src/
│       ├── main.js
│       ├── App.vue             # 主布局 + 保存/加载对话框 + 方块操作逻辑
│       ├── components/
│       │   ├── Toolbar.vue         # 工具栏：新建/删除/保存/打开/导出/网格切换
│       │   ├── RoomPanel.vue       # 房间面板：连接/创建/加入/成员列表/在线状态
│       │   └── PropertiesPanel.vue # 属性面板：位置/尺寸/旋转/颜色 + 旋转/镜像按钮
│       ├── engine/
│       │   ├── SceneManager.js     # Three.js 场景、多视图相机、TransformControls、交互
│       │   ├── BlockManager.js     # 方块 CRUD、网格吸附、6 种类型定义
│       │   ├── SaveManager.js      # .csmap 序列化/反序列化、本地下载、服务端存储
│       │   └── ViewportManager.js  # 四视图布局、正交相机、视口命中检测、NDC 坐标转换
│       ├── network/
│       │   └── SocketClient.js     # Socket.io 客户端 v2 (自动检测URL、限流、连接错误处理)
│       └── exporter/
│           └── MapExporter.js      # GoldSrc .map 导出 (J.A.C.K 兼容格式)
└── data/                        # 服务器 .csmap 存档目录
```

## 快速启动

```bash
# 1. 安装所有依赖
cd cs-map-editor
npm run install:all

# 2. 同时启动前后端
npm run dev

# 或分别启动:
# 后端: cd server && npm run dev    (http://localhost:3001, 绑定 0.0.0.0 允许局域网)
# 前端: cd client && npm run dev    (http://localhost:5173, --host 允许局域网)
```

### 局域网/外网访问

- 前端和后端均绑定 `0.0.0.0`，启动时自动打印局域网 IP
- 需确保 Windows 防火墙开放 5173 和 3001 端口
- 公司网络若有 AP 隔离，可使用 Ngrok 隧道：`ngrok http 5173`

## 核心功能

### 第一阶段 ✅ 底层架构
- ✅ Three.js 3D 场景初始化 (含环境光 + 方向光)
- ✅ WASD 飞行视角 + 右键/中键旋转 + 滚轮缩放 + Shift 加速
- ✅ 网格吸附 (默认 16 单位，支持 1~256)
- ✅ TransformControls (移动/缩放/旋转 Gizmo，吸附到网格)
- ✅ 三轴辅助线 (红X/绿Y/蓝Z) + 三层网格平面

### 第二阶段 ✅ 数据流
- ✅ 方块数据结构 (id, type, position, scale, rotation, color, texture, tags)
- ✅ BlockManager 统一管理方块状态 + 6 种方块类型
- ✅ 属性面板实时编辑（位置/尺寸/旋转/颜色）+ 90° 旋转 + 镜像按钮
- ✅ 随机灰色调方块配色

### 第三阶段 ✅ .map 导出
- ✅ 坐标系转换 (Three.js Y-up → GoldSrc Z-up)
- ✅ L 型边缘取点法：严格复刻 J.A.C.K 编辑器格式
- ✅ 一键下载 .map 文件，兼容 CS 1.6 / Sven Co-op 等 GoldSrc 游戏
- ✅ 6 种方块类型全部支持导出

### 第四阶段 ✅ 多人协同
- ✅ 房间系统 v2 — 4 位数字房间号，最大 16 人
- ✅ 房间密码保护 + 房主标识 (⭐)
- ✅ 方块操作广播 (创建/更新/删除)
- ✅ 互斥锁 (编辑时锁定方块，他人不可操作)
- ✅ 队友光标显示 (3D 彩色小球)
- ✅ 在线用户列表 (颜色标识 + 编辑状态显示)
- ✅ 更新限流 (20 次/秒)

### 第五阶段 ✅ 多视图编辑
- ✅ 四视图模式 (透视 + 顶视 + 前视 + 侧视)
- ✅ 单视图模式 (自由视角/顶视/前视/侧视 可切换)
- ✅ 正交相机 (顶/前/侧视图) + 滚轮缩放
- ✅ 点击激活视口 + Tab 键循环切换活动视口
- ✅ 视口感知射线拾取 (精确 NDC 坐标转换，无偏移)
- ✅ 视口锁定拖拽 (TransformControls 拖拽中锁定起始视口)

### 第六阶段 ✅ 持久化存储
- ✅ .csmap 文件格式 (JSON，version 2.2)
- ✅ 服务端 REST API (`/api/save`、`/api/files`、`/api/files/:name`)
- ✅ 在线模式：保存到服务器 `data/` 目录
- ✅ 离线模式：下载 .csmap 到本地 或 从本地选择文件读取
- ✅ 文件列表 + 文件删除
- ✅ 首次保存命名，后续点击保存自动覆盖

## 方块类型 (6 种)

| 类型 | 名称 | 图标 | 几何体 |
|------|------|------|--------|
| `cube` | 立方体 | 🟫 | BoxGeometry |
| `ramp` | 斜坡 | 📐 | ExtrudeGeometry (三角形截面) |
| `stairs` | 楼梯 | 🪜 | 4 阶 BoxGeometry 组合 |
| `wedge` | 楔形 | 🔺 | ExtrudeGeometry (直角三角形) |
| `cylinder` | 圆柱 | 🫙 | CylinderGeometry (16 边) |
| `plane` | 平面 | ⬜ | BoxGeometry (高度 2) |

## 网格吸附单位

默认 16 单位，可通过工具栏下拉菜单切换。支持: `1, 2, 4, 8, 16, 32, 64, 128, 256`。
CS 1.6 常用: 8, 16, 32, 64。旋转吸附 15°。

## 坐标系说明

| | Three.js (网页) | GoldSrc (CS 1.6) |
|---|---|---|
| 朝上轴 | Y | Z |
| X 轴 | 不变 | 不变 |

导出 .map 时自动完成 Y↔Z 互换。内部存储时 `SceneManager` 通过 `(x, z, y)` 完成坐标映射。

## .map 格式参考

导出的 .map 文件严格遵循 J.A.C.K 编辑器的 L 型边缘取点法，确保所有 6 个面的法线朝外。

每行一个面的定义:
```
( x1 y1 z1 ) ( x2 y2 z2 ) ( x3 y3 z3 ) TEXTURE [ U-axis ] [ V-axis ] rotation scaleX scaleY
```
一个 solid = `{` + 6 个面定义 + `}`，包裹在 worldspawn entity 中。

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 (返回房间数) |
| GET | `/api/rooms` | 获取所有房间列表 |
| GET | `/api/rooms/:roomId` | 检查房间是否存在 |
| POST | `/api/save` | 保存 .csmap 到服务器 |
| GET | `/api/files` | 获取存档文件列表 |
| GET | `/api/files/:filename` | 下载指定存档 |
| DELETE | `/api/files/:filename` | 删除指定存档 |

## Socket.io 事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `room:create` | C→S | 创建房间 |
| `room:join` / `room:leave` | C→S | 加入/离开房间 |
| `room:list` | C→S | 请求房间列表 |
| `room:state` | S→C | 完整房间状态同步 |
| `room:user-joined` / `room:user-left` | S→C | 用户进出广播 |
| `block:create` / `block:update` / `block:delete` | C→S / S→C | 方块 CRUD |
| `block:refresh` / `block:refresh-all` | C→S / S→C | 刷新方块 |
| `lock:acquire` / `lock:release` | C→S / S→C | 互斥锁 |
| `cursor:move` | C→S / S→C | 光标位置同步 |

## 待开发

- [ ] 撤销/重做 (Undo/Redo)
- [ ] 多选方块
- [ ] 复制/粘贴方块
- [ ] 地图模板预设
- [ ] 用户认证
- [ ] 方块纹理贴图选择
- [ ] 地图设置面板 (光照、天空盒等)
- [ ] 操作日志/历史记录
