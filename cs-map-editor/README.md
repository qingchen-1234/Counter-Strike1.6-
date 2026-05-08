# CS 1.6 地图灰模编辑器 — 多人联机版

基于 Web 技术的 Counter-Strike 1.6 地图协作编辑工具，目前专注于**白盒/灰模**阶段的多人在线协同。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 3D 渲染 | Three.js |
| 前端 UI | Vue 3 (Composition API) + Vite |
| 后端 | Node.js + Express |
| 实时通信 | Socket.io |

## 项目结构

```
cs-map-editor/
├── package.json              # 根配置 (concurrently 启动前后端)
├── server/
│   ├── package.json
│   ├── index.js              # Express + Socket.io 服务器入口
│   └── socketHandler.js      # 房间管理、方块同步、互斥锁逻辑
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js           # Vue 入口
        ├── App.vue           # 主布局组件
        ├── components/
        │   ├── Toolbar.vue       # 顶部工具栏
        │   ├── RoomPanel.vue     # 房间加入/成员列表
        │   └── PropertiesPanel.vue # 方块属性面板
        ├── engine/
        │   ├── SceneManager.js   # Three.js 场景、摄像机、交互
        │   └── BlockManager.js   # 方块数据 CRUD、网格吸附
        ├── network/
        │   └── SocketClient.js   # Socket.io 客户端封装
        └── exporter/
            └── MapExporter.js    # .map 文件导出器
```

## 快速启动

```bash
# 1. 安装所有依赖
cd cs-map-editor
npm run install:all

# 2. 同时启动前后端
npm run dev

# 或分别启动:
# 后端: cd server && npm run dev    (http://localhost:3001)
# 前端: cd client && npm run dev    (http://localhost:5173)
```

## 核心功能

### 第一阶段 ✅ 底层架构
- ✅ Three.js 3D 场景初始化
- ✅ WASD 飞行视角 + 右键旋转
- ✅ 网格吸附 (16 单位)
- ✅ TransformControls (移动/缩放 Gizmo)
- ✅ 方块 CRUD (创建、选中、移动、缩放、删除)

### 第二阶段 ✅ 数据流
- ✅ 方块数据结构 (id, position, scale, color)
- ✅ BlockManager 统一管理方块状态
- ✅ 属性面板实时编辑

### 第三阶段 ✅ .map 导出
- ✅ 坐标系转换 (Three.js Y-up → GoldSrc Z-up)
- ✅ 立方体顶点 → 平面方程生成
- ✅ 一键下载 .map 文件

### 第四阶段 ✅ 多人协同
- ✅ 房间系统 (加入/离开)
- ✅ 方块操作广播 (创建/更新/删除)
- ✅ 互斥锁 (编辑时锁定方块)
- ✅ 队友光标显示 (3D 红点)
- ✅ 更新限流 (20次/秒)

## 坐标系说明

| | Three.js (网页) | GoldSrc (CS 1.6) |
|---|---|---|
| 朝上轴 | Y | Z |
| X 轴 | 不变 | 不变 |

导出 .map 时自动完成 Y↔Z 互换。

## 网格吸附单位

默认 16 单位，可在 `BlockManager.js` 中修改 `GRID_SNAP` 常量。
CS 1.6 常用网格: 8, 16, 32, 64。

## .map 格式参考

每行一个面的定义:
```
( x1 y1 z1 ) ( x2 y2 z2 ) ( x3 y3 z3 ) TEXTURE [ U-axis ] [ V-axis ] rotation scaleX scaleY
```
一个立方体 = 6 行 = 6 个面，包裹在 `{ }` 中。

## 待开发

- [ ] 撤销/重做 (Undo/Redo)
- [ ] 多选方块
- [ ] 复制/粘贴方块
- [ ] 地图模板预设
- [ ] 服务器持久化存储 (当前为内存存储)
- [ ] 用户认证
