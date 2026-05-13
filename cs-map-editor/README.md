# CS 1.6 地图灰模编辑器 — CSMapCollab v2.8

基于 Web 技术的 Counter-Strike 1.6 地图协作编辑工具，专注于**白盒/灰模**阶段的多人在线协同。

采用 **Stateless 实时协同架构**：服务端不保存物理文件，仅通过 Socket.io 广播方块的 CRUD 状态。支持立方体、斜坡、楔形 3 种基础方块 + 任意自定义凸多边形（从 .map 导入），四视图编辑模式，**纯 .map 220 标准格式**导入/导出，与 J.A.C.K / Hammer 生态无缝兼容。

## 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 前端 3D 渲染 | Three.js (含 ConvexGeometry) | ^0.162 |
| 前端 UI | Vue 3 (Composition API) + Vite | ^3.4 / ^5.2 |
| 后端 | Node.js + Express + cors | ^4.18 |
| 实时通信 | Socket.io | ^4.7 |

## 项目结构

```
cs-map-editor/
├── package.json                # 根配置 (concurrently 启动前后端)
├── server/
│   ├── package.json
│   ├── index.js                # Express + Socket.io 服务器 + REST API
│   └── socketHandler.js        # 房间管理v2、方块CRUD广播、互斥锁、光标同步
├── client/
│   ├── package.json
│   ├── vite.config.js          # Vite 配置 (代理 /api、/socket.io 到后端)
│   ├── index.html
│   └── src/
│       ├── main.js
│       ├── App.vue             # 主布局 + 全部业务逻辑 (CRUD/同步/导入导出)
│       ├── components/
│       │   ├── Toolbar.vue         # 工具栏：新建/删除/打开.map/保存导出/网格切换
│       │   ├── RoomPanel.vue       # 房间面板：自动连接/创建/加入/成员列表/在线状态
│       │   └── PropertiesPanel.vue # 属性面板：位置/尺寸/旋转/颜色 + 90°旋转 + 镜像
│       ├── engine/
│       │   ├── SceneManager.js     # Three.js 场景、TransformControls、ConvexGeometry渲染
│       │   ├── BlockManager.js     # 方块 CRUD、网格吸附、类型定义、vertices保留
│       │   ├── MapImporter.js      # .map 220 导入解析 + 本地下载导出
│       │   └── ViewportManager.js  # 四视图布局、正交相机、视口命中、NDC坐标转换
│       ├── network/
│       │   └── SocketClient.js     # Socket.io 客户端 v2 (自动检测URL、限流、错误处理)
│       └── exporter/
│           └── MapExporter.js      # GoldSrc .map 220 导出 (J.A.C.K / Hammer 兼容)
```

## 快速启动

```bash
# 1. 安装所有依赖
cd cs-map-editor
npm run install:all

# 2. 同时启动前后端
npm run dev

# 或分别启动:
# 后端: cd server && npm run dev    (http://localhost:3001, 绑定 0.0.0.0)
# 前端: cd client && npm run dev    (http://localhost:5173, --host 允许局域网)
```

### 局域网/外网访问

- 前端和后端均绑定 `0.0.0.0`，启动时自动打印局域网 IP
- 需确保 Windows 防火墙开放 5173 和 3001 端口
- 公司网络若有 AP 隔离，可使用 Ngrok 隧道：`ngrok http 5173`

## 核心功能

### ✅ 第一阶段 — 底层架构
- Three.js 3D 场景初始化 (环境光 + 方向光 + 阴影)
- WASD 飞行视角 + 右键/中键旋转 + 滚轮向鼠标指针精准缩放 + Shift 加速
- 三轴辅助线 (红X/绿Y/蓝Z, 8192 长度) + 三层半透明网格平面
- 网格吸附 (默认 16 单位, 支持 1~256)，旋转吸附 15°
- TransformControls (移动/缩放/旋转 Gizmo，吸附到网格)

### ✅ 第二阶段 — 数据流与几何体系统
- 方块数据结构: `id, type, position, scale, rotation, color, texture, vertices`
- **放弃死板类型绑定，引入 ConvexGeometry** — 支持任意不规则凸多边形
- BlockManager 统一管理方块状态 + `cube / ramp / wedge` 3 种预设 + `custom` 自定义类型
- `vertices` 字段完整保留在 `mesh.userData` 中，杜绝刷新后变回正方体的 Bug
- 属性面板实时编辑 (位置/尺寸/旋转/颜色) + 90° 旋转 + 三轴镜像按钮
- 随机灰色调方块配色

### ✅ 第三阶段 — .map 220 导入/导出 (J.A.C.K / Hammer 标准)
- **导入**: 解析 .map 文件的 worldspawn brush，提取顶点反推出 ConvexGeometry 几何体
- **导出**: 严格遵循逆时针、五面/六面规则的 220 格式输出
- 坐标系自动转换 (Three.js Y-up ↔ GoldSrc Z-up)
- 导出时 `custom` 类型按原始面定义逐面写出，确保法线正确
- 一键下载 .map 文件，兼容 CS 1.6 / Sven Co-op 等 GoldSrc 游戏

### ✅ 第四阶段 — Stateless 多人协同
- 房间系统 v2 — 4 位数字房间号，最大 16 人
- 房间密码保护 + 房主标识 (⭐)
- 方块操作广播 (创建/更新/删除)，完整保留 `type` 和 `vertices`
- 互斥锁 (编辑时锁定方块，他人不可操作)
- 队友光标显示 (3D 彩色小球) + 在线用户列表 (颜色标识)
- 刷新方块：从服务器拉取完整状态重建本地场景
- 更新限流 (20 次/秒)

### ✅ 第五阶段 — 多视图编辑
- **四视图模式**: 自由视角 + 顶视图 + 前视图 + 侧视图，2×2 网格布局
- **单视图模式**: 自由视角 / 顶视 / 前视 / 侧视 可切换
- 正交相机 (顶/前/侧) + 向鼠标指针精准缩放
- 点击激活视口 + Tab 键循环切换活动视口
- **视口感知射线拾取**: 精确 NDC 坐标转换，跨视口点击无偏移
- **视口锁定拖拽**: TransformControls 拖拽中锁定起始视口，防止跨视图拖拽断裂

### ✅ 第六阶段 — 本地化 I/O
- **纯 .map 文件格式** (J.A.C.K / Hammer 220 标准)
- 本地导入: 点击 "打开 .map" 选择文件，解析并渲染到场景
- 本地导出: 点击 "保存/导出" 生成 .map 文件并触发浏览器下载
- 加载后如在线协作中，自动将导入方块同步给房间内其他成员

## 方块类型 (4 种)

| 类型 | 名称 | 图标 | 几何体 | 说明 |
|------|------|------|--------|------|
| `cube` | 立方体 | 🟫 | BoxGeometry | 标准六面体 |
| `ramp` | 斜坡 | 📐 | ExtrudeGeometry | XY 三角形截面, Z 轴挤压 |
| `wedge` | 楔形 | 🔺 | ExtrudeGeometry | 直角三角形, 尖端居中 |
| `custom` | 自定义 | 🔷 | ConvexGeometry | 从 .map 导入的任意凸多边形 |

> 注: `stairs`、`cylinder`、`plane` 类型已从当前版本移除，代码保留在 `BlockManager.js` 中供后续按需启用。

## 网格吸附单位

默认 16 单位，可通过工具栏下拉菜单切换。支持: `1, 2, 4, 8, 16, 32, 64, 128, 256`。
CS 1.6 常用: 8, 16, 32, 64。旋转吸附 15°。

## 坐标系说明

| | Three.js (网页) | GoldSrc (CS 1.6) |
|---|---|---|
| 朝上轴 | Y | Z |
| X 轴 | 不变 | 不变 |

**内部存储**: `SceneManager` 使用 `(x, z, y)` 完成坐标映射 (position.z 存高度, position.y 存深度)。
**导入/导出**: `MapImporter` / `MapExporter` 自动完成 Y↔Z 互换。

## .map 220 格式参考

导出的 .map 文件严格遵循 J.A.C.K 编辑器的面定义格式，确保所有面的法线朝外。

每行一个面的定义:
```
( x1 y1 z1 ) ( x2 y2 z2 ) ( x3 y3 z3 ) TEXTURE [ U-axis ] [ V-axis ] rotation scaleX scaleY
```

- **cube**: 标准 6 面定义
- **ramp / wedge**: 5 面定义 (斜面使用 `i→j→k` 取点法)
- **custom**: 按原始顶点每 3 个一组还原面定义

一个 solid = `{` + 6 个面定义 + `}`，包裹在 `worldspawn` entity 中。

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 (返回房间数) |
| GET | `/api/rooms` | 获取所有房间列表 |
| GET | `/api/rooms/:roomId` | 检查房间是否存在 |

## Socket.io 事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `room:create` | C→S | 创建房间 |
| `room:join` / `room:leave` | C→S | 加入/离开房间 |
| `room:list` | C→S | 请求房间列表 |
| `room:state` | S→C | 完整房间状态同步 (含全部方块 + 锁) |
| `room:user-joined` / `room:user-left` | S→C | 用户进出广播 |
| `block:create` / `block:update` / `block:delete` | C→S / S→C | 方块 CRUD (完整保留 type/vertices) |
| `block:refresh` / `block:refresh-all` | C→S / S→C | 刷新方块 (拉取完整状态) |
| `lock:acquire` / `lock:release` | C→S / S→C | 互斥锁 |
| `cursor:move` | C→S / S→C | 光标位置同步 |

## 待开发

- [ ] 撤销/重做 (Undo/Redo)
- [ ] 顶点编辑工具 (Vertex Tool) — 拖拽单个顶点重塑几何体
- [ ] 平面切割工具 (Clipping Tool) — 两点/三点平面切割
- [ ] 多选方块 + 复制/粘贴
- [ ] 实体系统 (Entity System) — point entities / brush entities
- [ ] 网格吸附开关 (Grid Snapping Toggle)
- [ ] 地图模板预设
- [ ] 用户认证
- [ ] 方块纹理贴图选择 / UV 编辑
- [ ] 全量读取第三方 .map (保留未知实体/纹理属性，无损导出)
