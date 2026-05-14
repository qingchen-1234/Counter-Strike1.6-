为了让你更好的熟悉项目，我把当前的代码发给你看看：

readme.md

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


readme是当前阶段项目的总结。
下面是各个代码文件：

server/index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { handleSocket } = require('./socketHandler');

// ============================================================
// 服务器入口 — CS 地图灰模编辑器后端
// 技术栈: Node.js + Express + Socket.io
// ============================================================

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 中间件
app.use(cors());
app.use(express.json());

// 房间存储 (生产环境应替换为 Redis)
// 结构: Map<roomId, { roomId, roomName, password, hostSocketId, users, blocks, locks, createdAt, settings }>
const rooms = new Map();

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);
  handleSocket(io, socket, rooms);
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// 获取房间列表
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [roomId, room] of rooms) {
    roomList.push({
      roomId,
      roomName: room.roomName,
      hasPassword: !!room.password,
      userCount: room.users.size,
      blockCount: room.blocks.size,
      createdAt: room.createdAt
    });
  }
  res.json(roomList);
});

// 检查房间是否存在
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  res.json({
    roomId: room.roomId,
    roomName: room.roomName,
    hasPassword: !!room.password,
    userCount: room.users.size,
    blockCount: room.blocks.size
  });
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';  // 监听所有网络接口，允许局域网访问

server.listen(PORT, HOST, () => {
  console.log(`✅ 服务器已启动 → http://localhost:${PORT}`);
  console.log(`   📡 局域网访问 → http://<你的IP>:${PORT}`);
  console.log(`   ⚠️  确保防火墙允许 ${PORT} 端口的入站连接`);

  // 自动检测并显示局域网 IP
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   🌐 ${name}: http://${net.address}:${PORT}`);
      }
    }
  }
});

server/socketHandler.js

// ============================================================
// Socket.io 事件处理器 v2
// 处理: 房间创建/加入/列表 / 方块CRUD同步 / 互斥锁 / 光标同步
// 房间使用 4 位数字 ID，通过 roomId 标识（不再用 roomName）
// ============================================================

function handleSocket(io, socket, rooms) {

  // ==================== 房间系统 (v2) ====================

  // 生成唯一 4 位房间号
  function generateRoomId() {
    let id;
    do {
      id = String(Math.floor(1000 + Math.random() * 9000));
    } while (rooms.has(id));
    return id;
  }

  // 创建房间
  socket.on('room:create', ({ roomName, password }) => {
    const roomId = generateRoomId();
    const room = {
      roomId,
      roomName: roomName || '未命名地图',
      password: password || null,
      hostSocketId: socket.id,
      users: new Map(),
      blocks: new Map(),
      locks: new Map(),
      createdAt: Date.now(),
      settings: { defaultGridSize: 16, mapScale: 1 }
    };
    rooms.set(roomId, room);

    console.log(`[房间] ${socket.data.userName || socket.id} 创建了房间 #${roomId} "${room.roomName}"`);

    socket.emit('room:created', {
      roomId,
      roomName: room.roomName,
      hasPassword: !!password
    });
  });

  // 获取房间列表
  socket.on('room:list', () => {
    const list = [];
    for (const [roomId, room] of rooms) {
      list.push({
        roomId,
        roomName: room.roomName,
        hasPassword: !!room.password,
        userCount: room.users.size,
        blockCount: room.blocks.size,
        createdAt: room.createdAt
      });
    }
    socket.emit('room:list-update', list);
  });

  // 加入房间
  socket.on('room:join', ({ roomId, password, userName }) => {
    // 检查房间是否存在
    if (!rooms.has(roomId)) {
      socket.emit('room:error', { message: '房间不存在' });
      return;
    }
    const room = rooms.get(roomId);

    // 密码校验
    if (room.password && room.password !== password) {
      socket.emit('room:error', { message: '密码错误' });
      return;
    }

    // 人数限制
    if (room.users.size >= 16) {
      socket.emit('room:error', { message: '房间已满 (最多16人)' });
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName || 'Anonymous';

    // 用户颜色分配
    const userColors = ['#e94560', '#4a9eff', '#51cf66', '#ffcc00', '#ff6b6b', '#a855f7',
                        '#f97316', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
                        '#3b82f6', '#ef4444', '#22c55e', '#e11d48'];
    const colorIdx = room.users.size % userColors.length;

    const userInfo = {
      id: socket.id,
      name: socket.data.userName,
      color: userColors[colorIdx],
      gridSize: room.settings.defaultGridSize,
      cursor: { x: 0, y: 0, z: 0 },
      isEditing: false,
      editingBlockId: null
    };
    room.users.set(socket.id, userInfo);

    console.log(`[房间] ${userInfo.name} 加入了 #${roomId} (${room.users.size}人在线)`);

    // 发送房间完整状态给新玩家
    socket.emit('room:state', {
      roomId,
      roomName: room.roomName,
      hostSocketId: room.hostSocketId,
      settings: room.settings,
      users: Array.from(room.users.values()),
      blocks: Array.from(room.blocks.values()),
      locks: Array.from(room.locks.entries()).map(([blockId, userId]) => ({ blockId, userId }))
    });

    // 广播给其他人
    socket.to(roomId).emit('room:user-joined', userInfo);
  });

  // 离开房间
  socket.on('room:leave', () => {
    leaveRoom(io, socket, rooms);
  });

  socket.on('disconnect', () => {
    console.log(`[断开] ${socket.id}`);
    leaveRoom(io, socket, rooms);
  });

  // ==================== 方块 CRUD 同步 ====================

  // 1. 创建方块
  socket.on('block:create', (blockData) => {
    // 【修复1】获取当前所在的房间
    const room = getRoom(socket, rooms);
    if (!room) return;

    // 【修复2】使用 Map.set 保存完整的方块数据 (包括 type, vertices 等全部基因)
    room.blocks.set(blockData.id, blockData);

    // 广播给房间里的其他玩家 (如果有这个需求的话)
    socket.to(socket.data.roomId).emit('block:created', blockData);
  });

  // 2. 更新方块
  socket.on('block:update', (id, data) => {
    // 兼容防错：某些情况下前端可能把 id 和 data 封装在一个对象里传过来
    if (typeof id === 'object') {
      data = id;
      id = data.id;
    }

    // 【修复1】获取当前所在的房间
    const room = getRoom(socket, rooms);
    if (!room) return;

    // 【修复2】使用 Map.get 查找方块
    let block = room.blocks.get(id);
    if (block) {
        // 【修复3】使用 Object.assign 将前端发来的所有数据无损合并覆盖！
        Object.assign(block, data);

        // 广播给房间里的其他玩家
        socket.to(socket.data.roomId).emit('block:updated', data);
    }
  });

  // 删除方块
  socket.on('block:delete', (blockId) => {
    const room = getRoom(socket, rooms);
    if (!room) return;

    room.blocks.delete(blockId);
    room.locks.delete(blockId);
    io.in(socket.data.roomId).emit('block:deleted', blockId);
  });

  // 刷新方块 (重新发送所有方块给请求者)
  socket.on('block:refresh', () => {
    const room = getRoom(socket, rooms);
    if (!room) return;
    const blocks = Array.from(room.blocks.values());
    socket.emit('block:refresh-all', blocks);
  });

  // ==================== 互斥锁系统 ====================

  socket.on('lock:acquire', (blockId) => {
    const room = getRoom(socket, rooms);
    if (!room) return;

    if (room.locks.has(blockId) && room.locks.get(blockId) !== socket.id) {
      socket.emit('lock:denied', { id: blockId, lockedBy: room.locks.get(blockId) });
      return;
    }

    room.locks.set(blockId, socket.id);
    // 更新用户状态
    const user = room.users.get(socket.id);
    if (user) {
      user.isEditing = true;
      user.editingBlockId = blockId;
    }
    io.in(socket.data.roomId).emit('lock:acquired', { blockId, userId: socket.id });
  });

  socket.on('lock:release', (blockId) => {
    const room = getRoom(socket, rooms);
    if (!room) return;

    if (room.locks.get(blockId) === socket.id) {
      room.locks.delete(blockId);
      const user = room.users.get(socket.id);
      if (user) {
        user.isEditing = false;
        user.editingBlockId = null;
      }
      io.in(socket.data.roomId).emit('lock:released', { blockId, userId: socket.id });
    }
  });

  // ==================== 光标同步 ====================

  socket.on('cursor:move', (data) => {
    const room = getRoom(socket, rooms);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (user) {
      if (data.position) user.cursor = data.position;
      if (data.lookAt) user.lookAt = data.lookAt;
    }

    socket.to(socket.data.roomId).emit('cursor:moved', {
      userId: socket.id,
      position: data.position,
      lookAt: data.lookAt
    });
  });
}

// ---- 辅助函数 ----

function getRoom(socket, rooms) {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms.has(roomId)) return null;
  return rooms.get(roomId);
}

function leaveRoom(io, socket, rooms) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    // 释放该用户持有的所有锁
    for (const [blockId, userId] of room.locks) {
      if (userId === socket.id) {
        room.locks.delete(blockId);
        io.in(roomId).emit('lock:released', { blockId, userId: socket.id });
      }
    }
    room.users.delete(socket.id);

    io.in(roomId).emit('room:user-left', {
      id: socket.id,
      name: socket.data.userName
    });

    // 清理空房间
    if (room.users.size === 0) {
      rooms.delete(roomId);
      console.log(`[房间] 房间 #${roomId} 已被清理`);
    }
  }
}

module.exports = { handleSocket };


App.vue
<template>
  <div class="app-layout">
    <!-- 顶部工具栏 -->
    <Toolbar
      :is-in-room="isInRoom"
      :grid-size="currentGridSize"
      @add-block="onAddBlock"
      @delete-block="onDeleteBlock"
      @export-map="onExportMap"
      @load-map="onLoadMap"
      @update-grid-size="onUpdateGridSize"
    />

    <!-- 主区域: 3D场景 + 侧边栏 -->
    <div class="main-area">
      <!-- 房间面板 (左侧) -->
      <RoomPanel
        ref="roomPanelRef"
        @connect="initSocketConnection"
        @create-room="onCreateRoom"
        @join-room="onJoinRoom"
        @leave-room="onLeaveRoom"
        @refresh-rooms="onRefreshRooms"
        @refresh-blocks="onRefreshBlocks"
        @room-state-updated="onRoomStateUpdated"
      />

      <!-- 3D 视口 -->
      <div class="viewport" ref="viewportRef">
        <canvas id="three-canvas" @click="onCanvasClick" @mousemove="onCanvasHover"></canvas>

        <!-- 视图模式切换 -->
        <div class="view-mode-bar">
          <select class="view-mode-select" :value="viewMode" @change="onViewModeChange">
            <option v-for="vm in viewModes" :key="vm.key" :value="vm.key">{{ vm.icon }} {{ vm.name }}</option>
          </select>
          <span v-if="viewMode === 'quad'" class="active-quad-label">
            激活: {{ activeQuadLabel }}
          </span>
        </div>

        <!-- 方块类型选择器 (浮动) -->
        <div v-if="showBlockTypeSelector" class="block-type-selector">
          <div class="selector-title">选择方块类型</div>
          <div class="type-grid">
            <div
              v-for="bt in blockTypes"
              :key="bt.key"
              class="type-card"
              :class="{ active: selectedBlockType === bt.key }"
              @click="selectBlockType(bt.key)"
            >
              <span class="type-icon">{{ bt.icon }}</span>
              <span class="type-name">{{ bt.name }}</span>
            </div>
          </div>
          <div class="selector-footer">
            <button class="sel-btn cancel" @click="showBlockTypeSelector = false">取消</button>
            <button class="sel-btn confirm" @click="confirmAddBlock">创建 {{ currentTypeName }}</button>
          </div>
        </div>

        <div class="viewport-hint">
          WASD | 右键/中键旋转 | 滚轮缩放 | Shift加速 | 左键选中 | Tab切换
          <span v-if="!isInRoom" class="offline-badge">离线模式</span>
        </div>
      </div>

      <!-- 属性面板 (右侧) -->
      <PropertiesPanel
        :selected-block="selectedBlock"
        :is-in-room="isInRoom"
        @update-block="onUpdateBlock"
        @rotate-block="onRotateBlock"
        @mirror-block="onMirrorBlock"
      />
    </div>

    <!-- 保存命名对话框 (已合并保存与导出) -->
    <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog = false">
      <div class="modal-box">
        <h4>💾 保存 / 导出地图</h4>
        <label>地图名称</label>
        <input v-model="saveForm.mapName" placeholder="如 my_kz_map" maxlength="30" />
        <label class="hint-label">格式: .map (J.A.C.K / Hammer 标准格式)</label>
        <div class="save-info">房间: {{ saveForm.roomId || '离线' }} · 方块: {{ blockManager.getAllBlocks().length }}</div>
        <div class="modal-btns">
          <button class="modal-btn cancel" @click="showSaveDialog = false">取消</button>
          <button class="modal-btn confirm" @click="doSaveMap" :disabled="!saveForm.mapName">生成文件</button>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 (严格限制只读取 .map) -->
    <input ref="fileInputRef" type="file" accept=".map" style="display:none" @change="onFileSelected" />
  </div>
</template>

<script setup>
import { ref, onMounted, provide, computed } from 'vue'
import Toolbar from './components/Toolbar.vue'
import RoomPanel from './components/RoomPanel.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import { SceneManager } from './engine/SceneManager.js'
import { BlockManager, BLOCK_TYPES } from './engine/BlockManager.js'
import { SocketClient } from './network/SocketClient.js'
import { MapImporter } from './engine/MapImporter.js'
import { ViewportManager, VIEW_MODES } from './engine/ViewportManager.js'

// ---- 核心实例 ----
const sceneManager = new SceneManager()
const blockManager = new BlockManager()
const socketClient = ref(null)
let viewportManager = null

// ---- 方块类型 ----
const blockTypes = Object.entries(BLOCK_TYPES).map(([key, val]) => ({ key, ...val }))
const selectedBlockType = ref('cube')
const showBlockTypeSelector = ref(false)
const currentTypeName = computed(() => BLOCK_TYPES[selectedBlockType.value]?.name || '立方体')

// ---- 视图模式 ----
const viewMode = ref('quad')
const viewModes = VIEW_MODES

// ---- 保存/读取 ----
const showSaveDialog = ref(false)
const showLoadDialog = ref(false)
const saveForm = ref({ mapName: '', roomId: '' })
const loadFiles = ref([])
const fileInputRef = ref(null)
let lastSavedFilename = ''

// ---- 响应式状态 ----
const viewportRef = ref(null)
const roomPanelRef = ref(null)
const selectedBlock = ref(null)
const isInRoom = ref(false)
const currentGridSize = ref(16)

const activeQuadLabel = computed(() => {
  const names = { perspective: '自由视角', top: '顶视图', front: '前视图', side: '侧视图' }
  return names[viewportManager?.activeQuadView] || ''
})

let editingBlockId = null

function onViewModeChange(e) {
  const mode = e.target.value
  viewMode.value = mode
  if (viewportManager) viewportManager.setViewMode(mode)
}

function onCanvasClick(e) {
  if (!viewportManager || viewportManager.viewMode !== 'quad') return
  const rect = e.target.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const hit = viewportManager.hitTest(cx, cy)
  if (hit) {
    viewportManager.activateView(hit)
  }
}

provide('sceneManager', sceneManager)
provide('blockManager', blockManager)
provide('socketClient', socketClient)

onMounted(() => {
  const canvas = document.getElementById('three-canvas')
  const viewport = viewportRef.value
  sceneManager.init(canvas, viewport)

  viewportManager = new ViewportManager(sceneManager)
  viewportManager.init(canvas.clientWidth, canvas.clientHeight)
  sceneManager.setActiveCameraFn(() => viewportManager.getActiveCamera())
  sceneManager.setViewportManager(viewportManager)
  sceneManager.setRenderCallback(() => {
    if (viewportManager) viewportManager.render()
  })

  sceneManager.onSelectBlock = (blockId) => {
    selectedBlock.value = blockManager.getBlock(blockId)
  }

  sceneManager.onBlockMoved = (blockId, data) => {
    editingBlockId = blockId
    blockManager.updateBlock(blockId, data)
    if (selectedBlock.value?.id === blockId) {
      selectedBlock.value = blockManager.getBlock(blockId)
    }
    const sc = socketClient.value
    if (sc && sc.isConnected() && sc.isInRoom()) {
      sc.sendBlockUpdate(blockId, data)
      sc.sendLockAcquire(blockId)
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && viewportManager && viewportManager.viewMode === 'quad') {
      e.preventDefault()
      viewportManager.cycleActiveQuad()
    }
  })
})

function initSocketConnection() {
  if (socketClient.value?.isConnected()) {
    if (roomPanelRef.value) roomPanelRef.value.setConnected(true)
    return
  }

  const sc = new SocketClient()
  sc.onConnected = () => {
    if (roomPanelRef.value) roomPanelRef.value.setConnected(true)
    sc.requestRoomList()
  }
  sc.onDisconnected = () => {
    if (roomPanelRef.value) roomPanelRef.value.setConnected(false)
    isInRoom.value = false
  }
  sc.onConnectError = (errMsg) => {
    if (roomPanelRef.value) roomPanelRef.value.setError(errMsg)
  }

  sc.connect()
  setupSocketCallbacks(sc)
  socketClient.value = sc
}

function setupSocketCallbacks(sc) {
  sc.onBlockCreated = (blockData) => {
    if (blockManager.getBlock(blockData.id)) return
    blockManager.createBlock(blockData)
    sceneManager.renderBlock(blockData)
  }
  sc.onBlockUpdated = (data) => {
    const block = blockManager.updateBlock(data.id, data)
    if (block) sceneManager.updateBlockMesh(data.id, data.position, data.scale, data.rotation)
  }
  sc.onBlockDeleted = (blockId) => {
    blockManager.deleteBlock(blockId)
    sceneManager.removeBlockMesh(blockId)
    if (selectedBlock.value?.id === blockId) selectedBlock.value = null
  }
  sc.onLockAcquired = ({ blockId }) => { sceneManager.setBlockLocked(blockId, true) }
  sc.onLockReleased = ({ blockId }) => { sceneManager.setBlockLocked(blockId, false) }
  sc.onLockDenied = ({ id, lockedBy }) => { console.warn(`方块 ${id} 正被 ${lockedBy} 编辑`) }
  sc.onCursorMoved = ({ userId, position }) => { sceneManager.updateCursor(userId, '', position) }

  sc.onBlockRefreshAll = (blocks) => {
    for (const blockId of blockManager.getAllBlocks().map(b => b.id)) {
      sceneManager.removeBlockMesh(blockId)
    }
    blockManager.blocks.clear()
    for (const block of blocks) {
      blockManager.createBlock(block)
      sceneManager.renderBlock(block)
    }
  }
}

function onCreateRoom({ roomName, password }) {
  const sc = socketClient.value
  if (!sc?.isConnected()) {
    ensureConnectedThen(() => { socketClient.value.createRoom(roomName, password) })
    return
  }
  sc.createRoom(roomName, password)
}

function onJoinRoom({ roomId, password, userName }) {
  const sc = socketClient.value
  if (!sc?.isConnected()) {
    ensureConnectedThen(() => { socketClient.value.joinRoom(roomId, password, userName) })
    return
  }
  sc.joinRoom(roomId, password, userName)
}

function ensureConnectedThen(callback) {
  if (socketClient.value?.isConnected()) {
    callback()
    return
  }
  initSocketConnection()
  const check = setInterval(() => {
    if (socketClient.value?.isConnected()) {
      clearInterval(check)
      callback()
    }
  }, 100)
  setTimeout(() => clearInterval(check), 10000)
}

function onLeaveRoom() {
  const sc = socketClient.value
  if (sc) sc.leaveRoom()
  isInRoom.value = false
}

function onRefreshRooms() {
  const sc = socketClient.value
  if (sc?.isConnected()) sc.requestRoomList()
}

function onRoomStateUpdated() {
  isInRoom.value = true
}

function onSelectBlockType() { showBlockTypeSelector.value = true }
function selectBlockType(type) { selectedBlockType.value = type }
function confirmAddBlock() {
  showBlockTypeSelector.value = false
  doAddBlock(selectedBlockType.value)
}

function doAddBlock(blockType) {
  const sc = socketClient.value
  const inRoom = sc?.isInRoom() || false
  if (!inRoom) {
    alert('离线模式下不能创建方块。请先加入房间。')
    return
  }
  const block = blockManager.createDefaultBlock(blockType)
  sceneManager.renderBlock(block)
  sc?.sendBlockCreate(block)
}

function onAddBlock() { showBlockTypeSelector.value = true }

function onDeleteBlock() {
  if (!selectedBlock.value) return
  const sc = socketClient.value
  const inRoom = sc?.isInRoom() || false
  if (!inRoom) {
    alert('离线模式下不能删除方块。')
    return
  }
  const id = selectedBlock.value.id
  blockManager.deleteBlock(id)
  sceneManager.removeBlockMesh(id)
  sc?.sendBlockDelete(id)
  selectedBlock.value = null
}

function onUpdateBlock(data) {
  if (!selectedBlock.value) return
  const id = selectedBlock.value.id

  // 先更新本地
  blockManager.updateBlock(id, data)
  sceneManager.updateBlockMesh(id, data.position, data.scale, data.rotation)

  // 同步给服务器
  const sc = socketClient.value
  if (sc?.isInRoom()) {
    // ★ 关键：不要只发局部 data，从 SceneManager 提取方块的“完整最新基因”发送
    const fullData = sceneManager.syncBlockFromMesh(id)
    if (fullData) {
      sc.sendBlockUpdate(id, fullData)
    }
  }
}

function onRefreshBlocks() {
  const sc = socketClient.value
  if (sc?.isInRoom()) sc.requestBlockRefresh()
}

// ==========================================================
// ★ 核心变更：保存/导出逻辑合并，全面拥抱 .map
// ==========================================================
// ==========================================================
// ★ 纯本地化保存/导出逻辑
// ==========================================================
function onExportMap() {
  const blocks = blockManager.getAllBlocks()
  if (blocks.length === 0) {
    alert('场景中没有方块，无法生成地图！')
    return
  }

  // 提取之前的文件名，如果没有则生成默认名称
  let defaultName = lastSavedFilename.replace('.map', '')
  if (!defaultName) defaultName = 'my_map'

  saveForm.value.mapName = defaultName
  showSaveDialog.value = true
}

function doSaveMap() {
  const mapName = saveForm.value.mapName
  if (!mapName) {
    showSaveDialog.value = false
    return
  }

  const blocks = blockManager.getAllBlocks()

  try {
    // 无论在线还是离线，只执行本地下载，不再向服务器发送存储请求！
    MapImporter.downloadLocalMap(blocks, mapName)
    lastSavedFilename = mapName + '.map'

    showSaveDialog.value = false
  } catch (err) {
    alert('导出出错: ' + err.message)
  }
}

// ==========================================================
// ★ 纯本地化读取逻辑 (一步到位，拒绝多余弹窗)
// ==========================================================
function onLoadMap() {
  // 点击“打开”按钮时，直接触发隐藏的文件选择器
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 核心：处理本地上传的 .map 文件
async function onFileSelected(event) {
  const file = event.target.files[0]
  if (!file) return

  try {
    // 强制使用我们新写的解析器读取 .map
    const data = await MapImporter.readLocalMap(file)
    loadDataIntoScene(data)
    lastSavedFilename = file.name
  } catch (err) {
    console.error(err)
    alert('读取 .map 文件失败，可能文件损坏或包含了不支持的异形几何体。')
  }
  // 重置 input，允许重复选中同一个文件
  event.target.value = ''
}

function loadDataIntoScene(data) {
  if (!data.blocks || data.blocks.length === 0) {
    alert('文件中未提取到任何方块数据')
    return
  }

  // 清空现有场景
  sceneManager.clearAllBlocks()
  blockManager.blocks.clear()
  selectedBlock.value = null

  if (data.gridSize) {
    currentGridSize.value = data.gridSize
    blockManager.setGridSize(data.gridSize)
    sceneManager.updateGridSize(data.gridSize)
  }

  // 逐块渲染
  for (const blockData of data.blocks) {
    blockManager.createBlock(blockData)
    sceneManager.renderBlock(blockData)

    // 【附赠优化】：如果你当前正在联机协作房间中，把读取到的方块同步给室友！
    const sc = socketClient.value
    if (sc && sc.isInRoom()) {
      sc.sendBlockCreate(blockData)
    }
  }
  console.log(`[加载成功] 已从 .map 中恢复了 ${data.blocks.length} 个方块`)
}

// ---- 辅助函数 ----
function onUpdateGridSize(newSize) {
  currentGridSize.value = newSize
  blockManager.setGridSize(newSize)
  sceneManager.updateGridSize(newSize)
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
}

function onRotateBlock(axis) {
  if (!selectedBlock.value) return
  const block = selectedBlock.value
  const rot = { ...(block.rotation || { x: 0, y: 0, z: 0 }) }
  rot[axis] = ((rot[axis] || 0) + 90) % 360
  onUpdateBlock({ rotation: rot })
}

function onMirrorBlock(axis) {
  if (!selectedBlock.value) return
  const block = selectedBlock.value
  const pos = { ...block.position }
  pos[axis] = -pos[axis]
  onUpdateBlock({ position: pos })
}
</script>

<style scoped>
/* 保持你的原有样式完全不变 */
.app-layout { display: flex; flex-direction: column; height: 100vh; background: #1a1a2e; min-width: 720px; }
.main-area { display: flex; flex: 1; overflow: hidden; }
.viewport { flex: 1 1 400px; position: relative; background: #0f0f23; min-width: 400px; }
#three-canvas { display: block; width: 100%; height: 100%; }
.viewport-hint { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); padding: 6px 16px; background: rgba(0,0,0,0.6); border-radius: 4px; font-size: 11px; color: #888; pointer-events: none; display: flex; gap: 8px; align-items: center; white-space: nowrap; overflow: hidden; max-width: 95%; }
.offline-badge { background: #e94560; color: white; padding: 2px 8px; border-radius: 3px; font-size: 10px; }
.view-mode-bar { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.7); border: 1px solid #0f3460; border-radius: 6px; padding: 4px 10px; z-index: 50; }
.view-mode-select { background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px; color: #ccc; padding: 4px 8px; font-size: 12px; outline: none; cursor: pointer; }
.view-mode-select:focus { border-color: #e94560; }
.active-quad-label { font-size: 11px; color: #ffcc00; white-space: nowrap; }
.block-type-selector { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #16213e; border: 1px solid #0f3460; border-radius: 10px; padding: 20px; width: 320px; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
.selector-title { font-size: 14px; color: #e94560; margin-bottom: 14px; text-align: center; }
.type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
.type-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 8px; background: #1a1a2e; border: 1px solid #0f3460; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.type-card:hover { border-color: #4a9eff; }
.type-card.active { border-color: #e94560; background: #2a1a2e; }
.type-icon { font-size: 24px; }
.type-name { font-size: 11px; color: #ccc; }
.selector-footer { display: flex; gap: 8px; }
.sel-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 999; }
.modal-box { background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 20px; width: 320px; max-height: 80vh; overflow-y: auto; }
.modal-box h4 { color: #e94560; margin-bottom: 14px; }
.modal-box label { display: block; color: #888; font-size: 11px; margin-bottom: 4px; }
.modal-box input { width: 100%; padding: 8px; margin-bottom: 12px; background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px; color: #eee; font-size: 13px; outline: none; }
.modal-box input:focus { border-color: #e94560; }
.hint-label { font-size: 10px; color: #555; margin-top: -8px; }
.save-info { font-size: 11px; color: #888; margin-bottom: 12px; }
.modal-btns { display: flex; gap: 8px; margin-top: 8px; }
.modal-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.modal-btn.cancel { background: #333; color: #999; }
.modal-btn.confirm { background: #e94560; color: white; }
.modal-btn.confirm:disabled { background: #333; cursor: not-allowed; }
.modal-btn.secondary { background: #1a1a2e; color: #a855f7; border: 1px solid #333; }
.file-list { max-height: 200px; overflow-y: auto; margin-bottom: 10px; }
.file-card { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px; margin-bottom: 4px; cursor: pointer; font-size: 12px; }
.file-card:hover { border-color: #e94560; }
.file-info { color: #666; font-size: 10px; }
.empty-list { padding: 16px; text-align: center; color: #555; font-size: 12px; }
</style>










client/src/components下的3个.vue文件

//PropertiesPanel.vue

<template>
  <div class="props-panel">
    <div v-if="!selectedBlock" class="empty-state">
      <p>选择一个方块查看属性</p>
      <p class="sub">左键点击 3D 场景中的方块</p>
    </div>

    <div v-else class="props-form">
      <h4>方块属性</h4>

      <div class="prop-row">
        <label>类型</label>
        <span class="prop-value">{{ blockTypeName }}</span>
      </div>

      <div class="prop-row">
        <label>ID</label>
        <span class="prop-value mono">{{ shortId }}</span>
      </div>

      <div class="prop-section">
        <h5>位置 (Position)</h5>
        <div class="input-row">
          <label>X</label>
          <input type="number" step="16" :value="selectedBlock.position.x"
            @change="onPosChange('x', $event)" />
        </div>
        <div class="input-row">
          <label>Y</label>
          <input type="number" step="16" :value="selectedBlock.position.y"
            @change="onPosChange('y', $event)" />
        </div>
        <div class="input-row">
          <label>Z</label>
          <input type="number" step="16" :value="selectedBlock.position.z"
            @change="onPosChange('z', $event)" />
        </div>
      </div>

      <div class="prop-section">
        <h5>尺寸 (Scale)</h5>
        <div class="input-row">
          <label>宽(X)</label>
          <input type="number" step="16" min="16" :value="selectedBlock.scale.x"
            @change="onScaleChange('x', $event)" />
        </div>
        <div class="input-row">
          <label>高(Y)</label> <!-- 修正：Y 轴是高度 -->
          <input type="number" step="16" min="16" :value="selectedBlock.scale.y"
            @change="onScaleChange('y', $event)" />
        </div>
        <div class="input-row">
          <label>长(Z)</label> <!-- 修正：Z 轴是长度/深度 -->
          <input type="number" step="16" min="16" :value="selectedBlock.scale.z"
            @change="onScaleChange('z', $event)" />
        </div>
      </div>

      <div class="prop-section">
        <h5>旋转 (Rotation °)</h5>
        <div class="input-row">
          <label>X</label>
          <input type="number" step="15" :value="selectedBlock.rotation?.x || 0"
            @change="onRotChange('x', $event)" />
        </div>
        <div class="input-row">
          <label>Y</label>
          <input type="number" step="15" :value="selectedBlock.rotation?.y || 0"
            @change="onRotChange('y', $event)" />
        </div>
        <div class="input-row">
          <label>Z</label>
          <input type="number" step="15" :value="selectedBlock.rotation?.z || 0"
            @change="onRotChange('z', $event)" />
        </div>
      </div>

      <div class="prop-section">
        <h5>颜色</h5>
        <input type="color" :value="selectedBlock.color"
          @change="onColorChange($event)" />
      </div>

      <div class="prop-section">
        <h5>操作</h5>
        <div class="op-grid">
          <button class="op-btn" @click="rotateBlock('x')" title="绕X轴旋转90°">↻ X90°</button>
          <button class="op-btn" @click="rotateBlock('y')" title="绕Y轴旋转90°">↻ Y90°</button>
          <button class="op-btn" @click="rotateBlock('z')" title="绕Z轴旋转90°">↻ Z90°</button>
          <button class="op-btn mirror" @click="mirrorBlock('x')" title="X轴镜像翻转">↔ X镜像</button>
          <button class="op-btn mirror" @click="mirrorBlock('y')" title="Y轴镜像翻转">↔ Y镜像</button>
          <button class="op-btn mirror" @click="mirrorBlock('z')" title="Z轴镜像翻转">↔ Z镜像</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { BLOCK_TYPES } from '../engine/BlockManager.js'

const props = defineProps({
  selectedBlock: { type: Object, default: null },
  isInRoom: { type: Boolean, default: false }
})
const emit = defineEmits(['update-block', 'rotate-block', 'mirror-block'])

const blockTypeName = computed(() => {
  if (!props.selectedBlock) return ''
  const type = props.selectedBlock.type || 'cube'
  return BLOCK_TYPES[type]?.name || type
})

const shortId = computed(() => {
  const id = props.selectedBlock?.id || ''
  return id.length > 16 ? id.substring(0, 14) + '...' : id
})

function onPosChange(axis, event) {
  const pos = { ...props.selectedBlock.position, [axis]: Number(event.target.value) }
  emit('update-block', { position: pos })
}

function onScaleChange(axis, event) {
  const scale = { ...props.selectedBlock.scale, [axis]: Number(event.target.value) }
  emit('update-block', { scale })
}

function onRotChange(axis, event) {
  const rot = { ...(props.selectedBlock.rotation || { x: 0, y: 0, z: 0 }), [axis]: Number(event.target.value) }
  emit('update-block', { rotation: rot })
}

function onColorChange(event) {
  emit('update-block', { color: event.target.value })
}

function rotateBlock(axis) {
  emit('rotate-block', axis)
}

function mirrorBlock(axis) {
  emit('mirror-block', axis)
}
</script>

<style scoped>
.props-panel {
  width: 220px; min-width: 220px; max-width: 220px; flex-shrink: 0;
  background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px; overflow-y: auto;
}
@media (max-width: 1100px) {
  .props-panel { display: none; }
}
@media (max-width: 900px) {
  .room-panel { width: 40px; min-width: 40px; max-width: 40px; padding: 8px; }
  .viewport-hint { font-size: 9px; padding: 4px 8px; gap: 4px; }
}

.empty-state {
  text-align: center;
  color: #666;
  margin-top: 40px;
}
.empty-state p { font-size: 13px; }
.empty-state .sub { font-size: 11px; margin-top: 6px; }

.props-form h4 {
  font-size: 14px;
  color: #e94560;
  margin-bottom: 12px;
}

.prop-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}
.prop-row label { color: #888; }
.prop-value.mono {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
  color: #aaa;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prop-section {
  margin-bottom: 14px;
}
.prop-section h5 {
  font-size: 11px;
  color: #4a9eff;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.input-row {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}
.input-row label {
  width: 24px;
  font-size: 12px;
  color: #888;
}
.input-row input {
  flex: 1;
  padding: 4px 6px;
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  color: #eee;
  font-size: 12px;
  outline: none;
}
.input-row input:focus {
  border-color: #e94560;
}

input[type="color"] {
  width: 40px;
  height: 28px;
  border: 1px solid #0f3460;
  border-radius: 3px;
  background: none;
  cursor: pointer;
}

.op-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.op-btn {
  padding: 5px 4px;
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  color: #aaa;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.op-btn:hover {
  border-color: #4a9eff;
  color: #4a9eff;
}
.op-btn.mirror:hover {
  border-color: #ffcc00;
  color: #ffcc00;
}
</style>


//RoomPanel.vue

<template>
  <div class="room-panel" :class="{ collapsed: minimized }">
    <div v-if="minimized" class="expand-btn" @click="minimized = false">👥</div>

    <template v-if="!minimized">
      <div class="panel-header">
        <span class="panel-title">🏠 房间</span>
        <span class="minimize-btn" @click="minimized = true">◀</span>
      </div>

      <!-- 状态一：未连接 (包含：正在连接 / 连接失败) -->
      <div v-if="!socketConnected" class="offline-hint">
        <!-- 1.1 正在自动连接中 -->
        <template v-if="isConnecting">
          <div class="loading-spinner"></div>
          <p>正在连接服务器...</p>
        </template>

        <!-- 1.2 无网络 / 连接失败 -->
        <template v-else>
          <p>⚠️ 无法连接到服务器</p>
          <p v-if="connectError" class="error-msg">{{ connectError }}</p>
          <button class="action-btn primary" @click="retryConnect">🔄 重新连接</button>
          <p class="sub-hint">离线模式: 可移动已有方块</p>
        </template>
      </div>

      <!-- 状态二：已连接，浏览房间列表 -->
      <template v-if="socketConnected && !inRoom">
        <div class="btn-group">
          <button class="action-btn primary" @click="showCreateModal = true">➕ 创建</button>
          <button class="action-btn secondary" @click="showJoinModal = true">🔗 加入</button>
          <button class="action-btn refresh" @click="refreshRoomList" title="刷新房间列表">🔄</button>
        </div>
        <div class="room-list-section">
          <div class="section-title">可加入的房间</div>
          <div v-if="roomList.length === 0" class="empty-list">暂无房间，快去创建一个吧！</div>
          <div v-for="room in roomList" :key="room.roomId" class="room-card" @click="tryJoinRoom(room)">
            <div class="room-card-header">
              <span class="room-id">#{{ room.roomId }}</span>
              <span v-if="room.hasPassword" title="需要密码">🔒</span>
            </div>
            <div class="room-card-name">{{ room.roomName }}</div>
            <div class="room-card-info">👤{{ room.userCount }} 📦{{ room.blockCount }}</div>
          </div>
        </div>
      </template>

      <!-- 状态三：已加入房间，协作中 -->
      <template v-if="inRoom && roomState">
        <div class="room-info-header">
          <div class="room-badge">#{{ roomState.roomId }}</div>
          <div class="room-name-display">{{ roomState.roomName }}</div>
        </div>
        <div class="section-title">在线 ({{ users.length }})</div>
        <div class="user-list">
          <div v-for="user in users" :key="user.id" class="user-card">
            <span class="user-dot" :style="{ background: user.color }"></span>
            <span class="user-name">{{ user.name }}</span>
            <span v-if="user.id === myId" class="me-tag">我</span>
            <span v-if="user.id === roomState.hostSocketId">⭐</span>
            <div v-if="user.isEditing" class="user-editing">编辑中...</div>
          </div>
        </div>
        <div class="room-stats">📦{{ blockCount }} 方块</div>
        <div class="btn-group">
          <button class="action-btn refresh" @click="refreshBlocks">🔄 刷新方块</button>
          <button class="action-btn danger" @click="leaveRoom">🚪 离开房间</button>
        </div>
      </template>

      <!-- 创建房间弹窗 -->
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal-box">
          <h4>创建房间</h4>
          <label>房间名称</label>
          <input v-model="createForm.roomName" placeholder="如 KZ_longjump_v2" maxlength="30" />
          <label>密码 (可选)</label>
          <input v-model="createForm.password" placeholder="留空则无密码" maxlength="6" type="password" />
          <div class="modal-btns">
            <button class="modal-btn cancel" @click="showCreateModal = false">取消</button>
            <button class="modal-btn confirm" @click="createRoom" :disabled="!createForm.roomName">创建</button>
          </div>
        </div>
      </div>

      <!-- 加入房间弹窗 -->
      <div v-if="showJoinModal" class="modal-overlay" @click.self="showJoinModal = false">
        <div class="modal-box">
          <h4>加入房间</h4>
          <label>房间号</label>
          <input v-model="joinForm.roomId" placeholder="4位房间号" maxlength="4" />
          <label>密码 (如需要)</label>
          <input v-model="joinForm.password" placeholder="无密码则留空" maxlength="6" type="password" />
          <label>昵称</label>
          <input v-model="joinForm.userName" placeholder="输入昵称" maxlength="12" />
          <div v-if="joinError" class="error-msg">{{ joinError }}</div>
          <div class="modal-btns">
            <button class="modal-btn cancel" @click="showJoinModal = false">取消</button>
            <button class="modal-btn confirm" @click="joinRoom" :disabled="!joinForm.roomId || !joinForm.userName">加入</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, inject, watch, onMounted } from 'vue'

const emit = defineEmits(['connect', 'create-room', 'join-room', 'leave-room', 'refresh-rooms', 'refresh-blocks', 'room-state-updated'])
const sceneManager = inject('sceneManager')
const socketClient = inject('socketClient')
const blockManager = inject('blockManager')

// UI 状态
const minimized = ref(false)
const isConnecting = ref(true) // 新增：控制加载中动画，默认 true
const socketConnected = ref(false)
const inRoom = ref(false)
const showCreateModal = ref(false)
const showJoinModal = ref(false)

// 数据状态
const roomState = ref(null)
const users = ref([])
const myId = ref('')
const blockCount = ref(0)
const roomList = ref([])
const joinError = ref('')
const connectError = ref('')

const createForm = ref({ roomName: '未命名地图', password: '' })
const joinForm = ref({ roomId: '', password: '', userName: 'Player_' + Math.floor(Math.random() * 1000) })

// 🚀 组件挂载完毕后，立即触发自动连接
onMounted(() => {
  connectServer()
})

watch(socketClient, (sc) => {
  if (!sc) return
  setupSocketListeners(sc)
}, { immediate: true })

// 进入房间后自动关闭弹窗
watch(inRoom, (val) => {
  if (val) {
    showCreateModal.value = false
    showJoinModal.value = false
    joinError.value = ''
  }
})

function setupSocketListeners(sc) {
  sc.onRoomCreated = (data) => {
    showCreateModal.value = false
    joinForm.value.roomId = data.roomId
    joinForm.value.password = createForm.value.password
    if (!joinForm.value.userName) joinForm.value.userName = 'Player_' + Math.floor(Math.random() * 1000)
    sc.joinRoom(data.roomId, createForm.value.password, joinForm.value.userName)
  }

  sc.onRoomListUpdate = (list) => {
    roomList.value = list.sort((a, b) => b.userCount - a.userCount)
  }

  sc.onRoomState = (data) => {
    roomState.value = data
    users.value = data.users || []
    blockCount.value = data.blocks ? data.blocks.length : 0
    if (sc.socket) myId.value = sc.socket.id
    inRoom.value = true
    joinError.value = ''

    if (data.blocks && data.blocks.length > 0) {
      for (const block of data.blocks) {
        if (!blockManager.getBlock(block.id)) {
          blockManager.createBlock(block)
          if (sceneManager) sceneManager.renderBlock(block)
        }
      }
    }
    if (data.locks) {
      for (const lock of data.locks) {
        if (sceneManager) sceneManager.setBlockLocked(lock.blockId, true)
      }
    }
    emit('room-state-updated', data)
  }

  sc.onRoomError = (data) => { joinError.value = data.message }

  sc.onUserJoined = (user) => {
    if (!users.value.find(u => u.id === user.id)) users.value.push(user)
  }

  sc.onUserLeft = (user) => {
    users.value = users.value.filter(u => u.id !== user.id)
    if (sceneManager) sceneManager.removeCursor(user.id)
  }

  sc.onBlockCreated = () => { blockCount.value++ }
  sc.onBlockDeleted = () => { blockCount.value = Math.max(0, blockCount.value - 1) }

  sc.onCursorMoved = ({ userId, position }) => {
    const user = users.value.find(u => u.id === userId)
    if (user && sceneManager) sceneManager.updateCursor(userId, user.name, position)
  }

  sc.onLockAcquired = ({ blockId, userId }) => {
    const user = users.value.find(u => u.id === userId)
    if (user) { user.isEditing = true; user.editingBlockId = blockId }
  }

  sc.onLockReleased = ({ blockId, userId }) => {
    const user = users.value.find(u => u.id === userId)
    if (user) { user.isEditing = false; user.editingBlockId = null }
  }
}

// 触发连接动作
function connectServer() {
  isConnecting.value = true
  connectError.value = ''
  emit('connect')
}

// 重新连接动作
function retryConnect() {
  connectServer()
}

function refreshRoomList() { emit('refresh-rooms') }

function createRoom() {
  emit('create-room', { roomName: createForm.value.roomName, password: createForm.value.password || null })
}

function joinRoom() {
  joinError.value = ''
  emit('join-room', { roomId: joinForm.value.roomId, password: joinForm.value.password || null, userName: joinForm.value.userName })
}

function tryJoinRoom(room) {
  joinForm.value.roomId = room.roomId
  joinForm.value.password = ''
  showJoinModal.value = true
}

function refreshBlocks() {
  emit('refresh-blocks')
}

function leaveRoom() {
  emit('leave-room')
  inRoom.value = false; users.value = []; roomState.value = null; blockCount.value = 0
}

// 供父组件 (App.vue) 回调更改状态
defineExpose({
  setConnected(s) {
    socketConnected.value = s
    if (s) isConnecting.value = false // 如果连接成功，关闭 loading 动画
  },
  setInRoom(s) { inRoom.value = s },
  setError(msg) {
    connectError.value = msg
    socketConnected.value = false
    isConnecting.value = false // 如果连接出错，关闭 loading 动画，显示重试按钮
  }
})
</script>

<style scoped>
/* 保持你原本的所有样式，并添加以下针对 Loading 动画的 CSS */
.room-panel {
  width: 230px; min-width: 230px; max-width: 230px; flex-shrink: 0;
  background: #16213e; border-right: 1px solid #0f3460;
  display: flex; flex-direction: column; overflow-y: auto; font-size: 12px;
}
.room-panel.collapsed { width: 40px; min-width: 40px; max-width: 40px; padding: 8px; }
.expand-btn {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: #1a1a2e; border-radius: 4px; cursor: pointer; font-size: 16px;
}
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px 8px; border-bottom: 1px solid #0f3460;
}
.panel-title { font-weight: bold; font-size: 13px; color: #e94560; }
.minimize-btn { cursor: pointer; color: #666; font-size: 11px; }

.offline-hint { padding: 30px 12px; text-align: center; color: #888; }
.offline-hint p { margin-bottom: 12px; }
.sub-hint { font-size: 10px; color: #555; margin-top: 12px; }

/* 🌟 新增的纯 CSS Loading 旋转动画 */
.loading-spinner {
  width: 26px; height: 26px;
  border: 3px solid #0f3460;
  border-top: 3px solid #e94560;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.btn-group { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; }
.action-btn {
  padding: 7px 12px; border: none; border-radius: 4px; cursor: pointer;
  font-size: 12px; flex: 1; min-width: 50px;
}
.action-btn.primary { background: #e94560; color: white; }
.action-btn.secondary { background: #1a1a2e; color: #ccc; border: 1px solid #333; }
.action-btn.refresh { background: #1a1a2e; color: #888; border: 1px solid #333; font-size: 14px; flex: 0; }
.action-btn.danger { background: #333; color: #ff6b6b; width: 100%; margin-top: 8px; }
.action-btn:hover { opacity: 0.85; }

.room-list-section { flex: 1; overflow-y: auto; padding: 0 10px; }
.section-title { font-size: 11px; color: #4a9eff; padding: 8px 2px 6px; text-transform: uppercase; }
.empty-list { padding: 20px 0; text-align: center; color: #666; }

.room-card {
  background: #1a1a2e; border: 1px solid #0f3460; border-radius: 6px;
  padding: 10px; margin-bottom: 6px; cursor: pointer; transition: all 0.2s;
}
.room-card:hover { border-color: #e94560; background: #1f2b47; }
.room-card-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
.room-id { font-weight: bold; color: #e94560; font-size: 14px; }
.room-card-name { color: #ccc; margin-bottom: 4px; }
.room-card-info { color: #666; font-size: 10px; }
.room-info-header { padding: 10px 12px; border-bottom: 1px solid #0f3460; }
.room-badge { font-size: 16px; font-weight: bold; color: #e94560; }
.room-name-display { color: #ccc; font-size: 12px; margin-top: 2px; }
.user-list { padding: 4px 12px; }
.user-card {
  display: flex; align-items: center; gap: 6px; padding: 4px 0;
  font-size: 12px; color: #aaa; flex-wrap: wrap;
}
.user-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.user-name { flex: 1; }
.me-tag { font-size: 10px; color: #4a9eff; }
.user-editing { width: 100%; font-size: 9px; color: #ffcc00; padding-left: 14px; }
.room-stats { padding: 8px 12px; color: #666; font-size: 11px; border-top: 1px solid #0f3460; }

.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 999;
}
.modal-box { background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 20px; width: 300px; }
.modal-box h4 { color: #e94560; margin-bottom: 14px; }
.modal-box label { display: block; color: #888; font-size: 11px; margin-bottom: 4px; }
.modal-box input {
  width: 100%; padding: 8px; margin-bottom: 12px;
  background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px;
  color: #eee; font-size: 13px; outline: none;
}
.modal-box input:focus { border-color: #e94560; }
.modal-btns { display: flex; gap: 8px; margin-top: 8px; }
.modal-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.modal-btn.cancel { background: #333; color: #999; }
.modal-btn.confirm { background: #e94560; color: white; }
.modal-btn.confirm:disabled { background: #333; cursor: not-allowed; }
.error-msg { color: #ff6b6b; font-size: 11px; margin-bottom: 8px; }
</style>

//Toolbar.vue

<template>
  <div class="toolbar">
    <span class="logo">🧱 CSMapCollab</span>

    <div class="tool-group">
      <button class="tool-btn primary" @click="$emit('add-block')" title="选择方块类型后创建">
        ➕ 新建
      </button>
      <button class="tool-btn danger" @click="$emit('delete-block')" title="删除选中的方块">
        🗑 删除
      </button>
    </div>

    <!-- ★ 修改：合并保存与导出，重命名打开 -->
    <div class="tool-group">
      <button class="tool-btn load" @click="$emit('load-map')" title="导入本地的 .map 文件">
        📂 打开 .map
      </button>
      <button class="tool-btn success" @click="$emit('export-map')" title="生成并下载 .map 文件">
        💾 保存 / 导出
      </button>
    </div>

    <div class="tool-group">
      <label class="grid-label">网格</label>
      <select class="grid-select" :value="gridSize" @change="onGridChange">
        <option v-for="opt in gridOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <div class="tool-group">
      <span v-if="isInRoom" class="status-badge online">🟢 协作中</span>
      <span v-else class="status-badge offline">⚫ 离线</span>
    </div>

    <div class="tool-group hint-group">
      <span class="hint">WASD | 右键旋转 | 左键选中 | Shift加速</span>
    </div>
  </div>
</template>

<script setup>
import { BlockManager } from '../engine/BlockManager.js'

const props = defineProps({
  isInRoom: { type: Boolean, default: false },
  gridSize: { type: Number, default: 16 }
})

// 移除原先的 save-map，保留 export-map 和 load-map
const emit = defineEmits(['add-block', 'delete-block', 'export-map', 'load-map', 'update-grid-size'])

const gridOptions = BlockManager.getGridOptions()

function onGridChange(e) {
  emit('update-grid-size', Number(e.target.value))
}
</script>

<style scoped>
/* 原有样式保持完全不变 */
.toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: #16213e; border-bottom: 1px solid #0f3460; min-height: 38px; flex-wrap: nowrap; overflow-x: auto; }
.toolbar::-webkit-scrollbar { height: 3px; }
.toolbar::-webkit-scrollbar-thumb { background: #333; }
.logo { font-weight: bold; font-size: 14px; color: #e94560; white-space: nowrap; }
.tool-group { display: flex; gap: 6px; align-items: center; }
.tool-btn { padding: 5px 12px; border: 1px solid #333; border-radius: 4px; background: #1a1a2e; color: #ccc; cursor: pointer; font-size: 12px; transition: all 0.2s; white-space: nowrap; }
.tool-btn:hover { background: #0f3460; border-color: #e94560; }
.tool-btn.primary { border-color: #4a9eff; color: #4a9eff; }
.tool-btn.danger  { border-color: #ff6b6b; color: #ff6b6b; }
.tool-btn.success { border-color: #51cf66; color: #51cf66; }
.tool-btn.load    { border-color: #ffcc00; color: #ffcc00; } /* 将打开按钮改成显眼的黄色 */
.grid-label { color: #888; font-size: 11px; }
.grid-select { background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px; color: #ccc; padding: 4px 6px; font-size: 12px; outline: none; cursor: pointer; }
.grid-select:focus { border-color: #e94560; }
.status-badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: bold; }
.status-badge.online { background: #1a3a1a; color: #51cf66; }
.status-badge.offline { background: #1a1a2e; color: #666; }
.hint-group { margin-left: auto; }
.hint { font-size: 10px; color: #555; }
</style>



client/src/engine下的四个.js文件：

// ============================================================
// BlockManager — 方块数据管理 (纯逻辑，不涉及渲染)
// 职责: 方块的 CRUD、ID生成、网格吸附、多类型支持
// ============================================================

// ID 生成 — 兼容非 HTTPS / 非 localhost 环境
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 降级方案 (非 HTTPS 且非 localhost 时 crypto.randomUUID 不可用)
  return 'b_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).substring(2, 10) + '_' +
    performance.now().toString(36).replace('.', '')
}

// 方块类型定义
export const BLOCK_TYPES = {
  cube:      { name: '立方体', icon: '🟫', geom: 'box' },
  ramp:      { name: '斜坡',   icon: '📐', geom: 'ramp' },
  // stairs:    { name: '楼梯',   icon: '🪜', geom: 'stairs' },
  wedge:     { name: '楔形',   icon: '🔺', geom: 'wedge' },
  // cylinder:  { name: '圆柱',   icon: '🫙', geom: 'cylinder' },
  // plane:     { name: '平面',   icon: '⬜', geom: 'plane' },
}

let GRID_SNAP = 16          // 网格吸附单位（可变）
const GRID_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256]
const DEFAULT_SCALE = { x: 64, y: 64, z: 64 }

export class BlockManager {
  constructor() {
    this.blocks = new Map()
    this.gridSize = GRID_SNAP
  }

  // ---- 网格大小管理 ----
  setGridSize(size) {
    this.gridSize = Math.max(1, Math.min(256, Math.round(size)))
    GRID_SNAP = this.gridSize
    return this.gridSize
  }

  getGridSize() {
    return this.gridSize
  }

  static getGridOptions() {
    return GRID_OPTIONS
  }

  // ---- 创建方块 (支持类型) ----
  createDefaultBlock(blockType = 'cube') {
    const block = {
      id: generateId(),
      type: blockType,
      position: { x: 0, y: 0, z: 0 },
      scale: { ...DEFAULT_SCALE },
      rotation: { x: 0, y: 0, z: 0 },
      color: this._randomGrayColor(),
      texture: 'AAATRIGGER',
      createdAt: Date.now(),
      creator: '',
      lockedBy: null,
      tags: []
    }
    this.blocks.set(block.id, block)
    return block
  }

  createBlock(data) {
    const block = {
      // ★ 核心修复 1：利用 ...data 展开语法，保留服务器发来的所有未知属性
      ...data,
      id: data.id,
      position: data.position || { x: 0, y: 0, z: 0 },
      scale: data.scale || { x: 64, y: 64, z: 64 },
      rotation: data.rotation || { x: 0, y: 0, z: 0 },
      type: data.type || 'cube',

      // ★ 核心修复 2：显式声明接收自定义顶点和贴图
      vertices: data.vertices || null,
      texture: data.texture || 'AAATRIGGER'
    }
    this.blocks.set(block.id, block)
    return block
  }

  updateBlock(id, data) {
    const block = this.blocks.get(id)
    if (block) {
      // ★ 核心修复 3：绝对不要手动 block.position = data.position 这样赋值
      // 使用 Object.assign 强行把发来的所有新字段覆盖上去！
      Object.assign(block, data)
    }
    return block
  }

  // ---- 删除方块 ----
  deleteBlock(id) {
    this.blocks.delete(id)
  }

  // ---- 查询 ----
  getBlock(id) {
    return this.blocks.get(id) || null
  }

  getAllBlocks() {
    return Array.from(this.blocks.values())
  }

  // ---- 网格吸附 ----
  _snap(value) {
    const gs = this.gridSize || GRID_SNAP
    return Math.round(value / gs) * gs
  }

  _snapRotation(value) {
    return Math.round(value / 15) * 15
  }

  // ---- 随机灰色调 ----
  _randomGrayColor() {
    const v = 100 + Math.floor(Math.random() * 100)
    return `rgb(${v},${v},${v})`
  }
}


// ============================================================
// MapImporter — .map 文件导入/导出
// 职责: 本地 .map (J.A.C.K / Hammer 220) 导入解析 + 下载导出
// ============================================================

import { MapExporter } from '../exporter/MapExporter.js'

export class MapImporter {

  // ==========================================================
  // ★ .map 导出: 生成并触发浏览器下载
  // ==========================================================

  /**
   * 本地下载 .map 文件
   * @param {Array} blocks - 方块数据数组
   * @param {string} mapName - 地图名称
   */
  static downloadLocalMap(blocks, mapName = 'map') {
    const mapText = MapExporter.export(blocks)

    const filename = mapName.endsWith('.map') ? mapName : mapName + '.map'
    const blob = new Blob([mapText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ==========================================================
  // ★ .map 导入: 读取文件 → 解析 → 返回 Blocks 数据
  // ==========================================================

  /**
   * 从本地读取并解析 .map 文件
   * @param {File} file
   * @returns {Promise<object>} 返回 { mapName, blocks, gridSize }
   */
  static readLocalMap(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const mapText = e.target.result
          const blocks = MapImporter.parseMapText(mapText)

          let mapName = file.name
          if (mapName.endsWith('.map')) mapName = mapName.slice(0, -4)

          resolve({
            mapName: mapName,
            roomId: '',
            gridSize: 16,
            blocks: blocks
          })
        } catch (err) {
          reject(new Error('解析 .map 文件失败: ' + err.message))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }

  /**
   * 核心逆向算法：将 .map 文本反算为网页的 Blocks 数据 (支持任意凸多边形)
   * @param {string} mapText - .map 文件原始文本
   * @returns {Array} blocks 数组
   */
  static parseMapText(mapText) {
    const blocks = []
    const brushRegex = /\{([^{}]*\(\s*-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s*\)[^{}]*)\}/g
    let match

    while ((match = brushRegex.exec(mapText)) !== null) {
      const brushContent = match[1]
      const rawPoints = []

      // 提取所有坐标点 (J.A.C.K 坐标: X=左右, Y=深度, Z=高度)
      const pointRegex = /\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/g
      let ptMatch
      while ((ptMatch = pointRegex.exec(brushContent)) !== null) {
        rawPoints.push({
          x: parseFloat(ptMatch[1]), // JACK X → Three X
          y: parseFloat(ptMatch[3]), // JACK Z → Three Y (高度)
          z: parseFloat(ptMatch[2])  // JACK Y → Three Z (深度)
        })
      }

      if (rawPoints.length === 0) continue

      // 计算包围盒 (Bounding Box)
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

      for (const p of rawPoints) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
      }

      const width = maxX - minX
      const height = maxY - minY
      const depth = maxZ - minZ

      // 世界中心点
      const cx = minX + width / 2
      const cy = minY + height / 2
      const cz = minZ + depth / 2

      // 转换为相对于中心点的局部坐标 (Local Vertices)
      const localVertices = rawPoints.map(p => ({
        x: p.x - cx,
        y: p.y - cy,
        z: p.z - cz
      }))

      blocks.push({
        id: 'block_' + Math.random().toString(36).substr(2, 9),
        type: 'custom',
        vertices: localVertices,
        position: { x: cx, y: cz, z: cy },
        scale: { x: width, y: depth, z: height },
        rotation: { x: 0, y: 0, z: 0 },
        color: '#607d8b',
        texture: 'AAATRIGGER'
      })
    }
    return blocks
  }
}




// ============================================================
// SceneManager — Three.js 场景管理器
// 职责: 初始化3D场景、摄像机、光照、网格吸附、鼠标交互
// ============================================================

import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
// ★ 新增：引入凸包几何体生成器
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

const GRID_SIZE = 16

function mergeGeometries(geometries) {
  const merged = new THREE.BufferGeometry()
  return geometries[0] || new THREE.BoxGeometry(64, 64, 64)
}

export class SceneManager {
  constructor() {
    this.scene = null
    this.camera = null
    this.renderer = null
    this.transformControls = null
    this.transformControlsDummy = null
    this.gridHelpers = []
    this.onSelectBlock = null
    this.onBlockMoved = null
    this.blockMeshes = new Map()
    this.cursors = new Map()
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    this.keys = {}
    this.moveSpeed = 300
    this.lookSpeed = 0.002
    this.isRightDragging = false
    this.isLeftDragging = false
    this.isMiddleDragging = false
    this.prevMouse = { x: 0, y: 0 }
    this.currentGridSize = GRID_SIZE
    this._getActiveCamera = null
    this._viewportManager = null

    // ★ 新增：用于记录拖拽起始所在的视口，防止跨视图拖拽断裂
    this._activeDragView = null
  }

  setActiveCameraFn(fn) { this._getActiveCamera = fn }
  setViewportManager(vm) { this._viewportManager = vm }

  updateGridSize(newSize) {
    this.currentGridSize = Math.max(1, Math.min(256, newSize))
    if (this.transformControls) {
      this.transformControls.setTranslationSnap(this.currentGridSize)
    }
    this._rebuildGrids()
  }

// ---- 优化：创建不遮挡模型、覆盖全图的网格 ----
  _createGridHelper(color1 = '#333355', color2 = '#222244') {
    // 1. 设置巨大的固定范围。CS 1.6 的最大地图边界为 8192，所以 16384 可以完美覆盖整个世界
    const range = 16384
    const divisions = Math.floor(range / this.currentGridSize)
    const grid = new THREE.GridHelper(range, divisions, color1, color2)

    // 2. 材质优化：解决网格遮挡方块的问题
    grid.material.transparent = true
    grid.material.opacity = 0.35     // 调低透明度，让它变成较暗的辅助线
    grid.material.depthWrite = false // ★ 核心：关闭深度写入，这意味着网格永远不会在物理上“挡住”后面的方块

    return grid
  }

  _rebuildGrids() {
    for (const g of this.gridHelpers) {
      this.scene.remove(g)
      g.geometry.dispose()
      g.material.dispose()
    }
    this.gridHelpers = []

    const gXZ = this._createGridHelper('#553333', '#442222')
    this.scene.add(gXZ)
    this.gridHelpers.push(gXZ)

    const gXY = this._createGridHelper('#333366', '#222244')
    gXY.rotation.x = -Math.PI / 2
    this.scene.add(gXY)
    this.gridHelpers.push(gXY)

    const gYZ = this._createGridHelper('#336633', '#224422')
    gYZ.rotation.z = Math.PI / 2
    this.scene.add(gYZ)
    this.gridHelpers.push(gYZ)
  }

  clearAllBlocks() {
    for (const [id, mesh] of this.blockMeshes) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    this.blockMeshes.clear()
    this.transformControls.detach()
  }

  init(canvas, viewportEl) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight)
    this.renderer.shadowMap.enabled = true

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#1a1a2e')

    this.camera = new THREE.PerspectiveCamera(
      70, viewportEl.clientWidth / viewportEl.clientHeight, 1, 10000
    )
    this.camera.position.set(256, 256, 256)
    this.camera.lookAt(0, 0, 0)

    this._setupLights()
    this._setupGrid()

    // ==========================================================
    // ★ 核心改进：极其健壮的虚拟 DOM 事件代理
    // ==========================================================
    this.transformControlsDummy = {
      addEventListener: function(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = []
        this.listeners[type].push(listener)
      },
      removeEventListener: function(type, listener) {
        if (!this.listeners[type]) return
        this.listeners[type] = this.listeners[type].filter(l => l !== listener)
      },
      getBoundingClientRect: () => viewportEl.getBoundingClientRect(),
      style: viewportEl.style,
      listeners: {}
    }

    // 【魔法代码】将自身伪装成 ownerDocument，这样就能截获 TransformControls 绑定的全局拖拽事件
    this.transformControlsDummy.ownerDocument = this.transformControlsDummy
    // 兼容高版本 Three.js 的指针捕获 API
    this.transformControlsDummy.setPointerCapture = () => {}
    this.transformControlsDummy.releasePointerCapture = () => {}

    this.transformControls = new TransformControls(this.camera, this.transformControlsDummy)
    this.transformControls.setSize(0.8)
    this.transformControls.setTranslationSnap(GRID_SIZE)

// 在 init() 中找到这里，替换掉原有的 dragging-changed 和 objectChange
    this.transformControls.addEventListener('dragging-changed', (e) => {
      // 当 e.value 为 false 时，代表鼠标松开，拖拽完成
      if (!e.value) {
        const obj = this.transformControls.object
        if (obj && obj.userData.blockId && this.onBlockMoved) {
          // 此时同步，不仅同步位移，还会把你拉伸后的绝对尺寸同步给核心数据
          const data = this.syncBlockFromMesh(obj.userData.blockId)
          if (data) this.onBlockMoved(obj.userData.blockId, data)
        }
      }
    })
    this.scene.add(this.transformControls)

    this._bindEvents(viewportEl)
    this._animate()
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight('#ffffff', 0.6)
    this.scene.add(ambient)

    const dirLight = new THREE.DirectionalLight('#ffffff', 0.8)
    dirLight.position.set(200, 400, 300)
    dirLight.castShadow = true
    this.scene.add(dirLight)
  }

  // ---- 参考网格与坐标轴 ----
  _setupGrid() {
    this._rebuildGrids()

    // 让红绿蓝三根中心坐标轴也贯穿整个世界
    const axisLen = 8192

    // 给坐标轴也加上 depthWrite: false，防止遮挡中心点的细小方块
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: '#ff4444', opacity: 0.4, transparent: true, depthWrite: false })
    )
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -axisLen, 0), new THREE.Vector3(0, axisLen, 0)
      ]),
      new THREE.LineBasicMaterial({ color: '#44ff44', opacity: 0.4, transparent: true, depthWrite: false })
    )
    const zAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen)
      ]),
      new THREE.LineBasicMaterial({ color: '#4444ff', opacity: 0.4, transparent: true, depthWrite: false })
    )
    this.scene.add(xAxis, yAxis, zAxis)

    // 注意：xAxis, yAxis, zAxis 没有被加入 this.gridHelpers 数组
    // 这恰好帮助我们实现了“自由视角隐藏网格，但保留坐标轴”的需求！
  }

  // ==========================================================
  // ★ 终极分发机制：带“视口锁定”的精确坐标推算
  // ==========================================================
  _dispatchToTransformControls(type, event, viewportEl) {
    if (!this.transformControls || !this._viewportManager) return

    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top

    let viewName = null

    // 1. 【视口锁定】如果正在拖拽，强制使用开始拖拽时的视口，无视鼠标当前滑动到了哪里
    if (this.transformControls.dragging && this._activeDragView) {
      viewName = this._activeDragView
    } else {
      viewName = this._viewportManager.hitTest(canvasX, canvasY)
    }

    if (!viewName) return

    // 2. 维护拖拽状态标志
    if (type === 'pointerdown') this._activeDragView = viewName
    if (type === 'pointerup') this._activeDragView = null

    const vp = this._viewportManager.viewports[viewName]
    const camera = this._viewportManager.getCameraForView(viewName)

    // 3. 非拖拽时实时更新内部相机
    if (!this.transformControls.dragging) {
      this.transformControls.camera = camera
      this._viewportManager.activateView(viewName)
    }

    // 4. 根据当前锁定的视口，计算完美的局部 NDC 坐标
    const localX = canvasX - vp.x
    const localY = canvasY - vp.y
    const ndcX = (localX / vp.w) * 2 - 1
    const ndcY = -(localY / vp.h) * 2 + 1

    // 5. 逆向推算：欺骗 TransformControls 的全局长宽比计算
    const fakeClientX = ((ndcX + 1) / 2) * rect.width + rect.left
    const fakeClientY = ((-ndcY + 1) / 2) * rect.height + rect.top

    const fakeEvent = {
      type: type, // 将真实类型传递过去
      clientX: fakeClientX,
      clientY: fakeClientY,
      button: event.button !== undefined ? event.button : 0,
      pointerId: event.pointerId || 1,
      pointerType: event.pointerType || 'mouse',
      preventDefault: () => { if (event.preventDefault) event.preventDefault() },
      stopPropagation: () => { if (event.stopPropagation) event.stopPropagation() }
    }

    const listeners = this.transformControlsDummy.listeners[type]
    if (listeners) {
      // 使用副本遍历，防止拖拽结束时自身解绑引发的数组越界
      const listenersCopy = [...listeners]
      for (const listener of listenersCopy) {
        listener(fakeEvent)
      }
    }
  }

  // ---- 事件绑定 ----
  _bindEvents(viewportEl) {
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true })
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false })

    viewportEl.addEventListener('pointerdown', (e) => {
      this._dispatchToTransformControls('pointerdown', e, viewportEl)

      if (e.button === 0) this.isLeftDragging = true
      if (e.button === 1) this.isMiddleDragging = true
      if (e.button === 2) this.isRightDragging = true
      this.prevMouse.x = e.clientX
      this.prevMouse.y = e.clientY
    })

    window.addEventListener('pointerup', (e) => {
      this._dispatchToTransformControls('pointerup', e, viewportEl)

      if (e.button === 0) this.isLeftDragging = false
      if (e.button === 1) this.isMiddleDragging = false
      if (e.button === 2) this.isRightDragging = false
    })

    window.addEventListener('pointermove', (e) => {
      this._dispatchToTransformControls('pointermove', e, viewportEl)

      const isDraggingTransform = this.transformControls && this.transformControls.dragging
      const shouldOrbit = this.isRightDragging || (this.isLeftDragging && this.isMiddleDragging) || this.isMiddleDragging

      if (shouldOrbit && !isDraggingTransform) {
        const dx = e.clientX - this.prevMouse.x
        const dy = e.clientY - this.prevMouse.y
        this._orbitCamera(dx, dy)
        this.prevMouse.x = e.clientX
        this.prevMouse.y = e.clientY
      }
    })

// 滚轮缩放 (支持向鼠标中心精准缩放)
    viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault()

      const rect = viewportEl.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top

      let targetCamera = this.camera
      let ndcX = 0, ndcY = 0

      if (this._viewportManager) {
        const rayData = this._viewportManager.getRaycasterData(canvasX, canvasY)
        if (rayData) {
          // ★ 核心修复：永远缩放鼠标【当前悬停】的那个视图！
          targetCamera = rayData.camera
          ndcX = rayData.mouseCoords.x
          ndcY = rayData.mouseCoords.y

          // 顺手将其设为激活视图，这样滚轮缩放后直接按 WASD 就能无缝平移了
          this._viewportManager.activateView(rayData.viewName)
        } else if (this._getActiveCamera) {
          targetCamera = this._getActiveCamera()
        }
      }

      // 如果目标是三视图的正交相机
      if (targetCamera && targetCamera.isOrthographicCamera && this._viewportManager) {
        this._viewportManager.zoomOrthoCamera(targetCamera, e.deltaY, ndcX, ndcY)
      }
      // 如果目标是自由视角的透视相机
      else if (targetCamera) {
        const forward = new THREE.Vector3()
        targetCamera.getWorldDirection(forward)
        targetCamera.position.addScaledVector(forward, -e.deltaY * 50 * 0.01)
      }
    }, { passive: false })

    let clickStart = { x: 0, y: 0 }
    viewportEl.addEventListener('mousedown', (e) => {
      if (e.button === 0) clickStart = { x: e.clientX, y: e.clientY }
    })
    viewportEl.addEventListener('click', (e) => {
      if (e.button !== 0) return
      const dx = e.clientX - clickStart.x
      const dy = e.clientY - clickStart.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return
      this._pickBlock(e, viewportEl)
    })

    window.addEventListener('resize', () => {
      if (!this.renderer || !this.camera) return
      this.camera.aspect = viewportEl.clientWidth / viewportEl.clientHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight)
    })

    viewportEl.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // ---- 下面都是原有逻辑保持不变 ----
  _pickBlock(event, viewportEl) {
    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top

    let camera = this.camera
    this.mouse.x = (canvasX / rect.width) * 2 - 1
    this.mouse.y = -(canvasY / rect.height) * 2 + 1

    if (this._viewportManager) {
      const rayData = this._viewportManager.getRaycasterData(canvasX, canvasY)
      if (rayData) {
        camera = rayData.camera
        this.mouse.copy(rayData.mouseCoords)
      }
    }

    this.raycaster.setFromCamera(this.mouse, camera)
    const meshes = Array.from(this.blockMeshes.values())
    const intersects = this.raycaster.intersectObjects(meshes)

    if (intersects.length > 0) {
      const obj = intersects[0].object
      const blockId = obj.userData.blockId
      this._highlightBlock(blockId)

      this.transformControls.camera = camera
      this.transformControls.attach(obj)
      if (this.onSelectBlock) this.onSelectBlock(blockId)
    } else {
      this._highlightBlock(null)
      this.transformControls.detach()
      if (this.onSelectBlock) this.onSelectBlock(null)
    }
  }

  _highlightBlock(blockId) {
    for (const [id, mesh] of this.blockMeshes) {
      if (id === blockId) {
        mesh.material.emissive?.set('#333333')
      } else {
        mesh.material.emissive?.set('#000000')
      }
    }
  }

// ---- 方块可视化 (支持多种几何体) ----
  _createGeometry(block) {
    // 👇 修复：在这里加上 vertices
    const { type, scale, vertices } = block

    // ★ 核心：如果是导入的任意切割图形，直接利用保存的顶点生成凸包
    if (type === 'custom' && vertices && vertices.length > 0) {
      // 将普通对象点转为 Three.js 的 Vector3 向量
      const points = vertices.map(v => new THREE.Vector3(v.x, v.y, v.z))
      // 生成凸包几何体
      return new ConvexGeometry(points)
    }

    // 明确映射关系：X=宽, Y=深(长), Z=高
    const width = scale.x
    const depth = scale.y
    const height = scale.z

    const hx = width / 2
    const hy = height / 2
    const hz = depth / 2

    switch (type) {
      case 'cube':
        return new THREE.BoxGeometry(width, height, depth)

      case 'ramp': {
        // 斜坡: 绘制在 XY 平面 (此时 Y 为高度), 向 Z轴 挤压 (深度)
        const shape = new THREE.Shape()
        shape.moveTo(-hx, -hy) // 左下
        shape.lineTo( hx, -hy) // 右下
        shape.lineTo( hx,  hy) // 右上 (直角在这里)
        shape.lineTo(-hx, -hy) // 闭合
        const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false })
        geo.translate(0, 0, -hz) // 将挤压后的几何体居中
        return geo
      }

      case 'stairs': {
        const group = []
        const stepH = height / 4
        const stepD = depth / 4
        for (let i = 0; i < 4; i++) {
          const stepGeo = new THREE.BoxGeometry(width, stepH, stepD)
          stepGeo.translate(0, -height / 2 + stepH * i + stepH / 2, -depth / 2 + stepD * i + stepD / 2)
          group.push(stepGeo)
        }
        return mergeGeometries(group)
      }

      case 'wedge': {
        // 楔形: 尖端居中
        const shape = new THREE.Shape()
        shape.moveTo(-hx, -hy) // 左下
        shape.lineTo( hx, -hy) // 右下
        shape.lineTo( 0,   hy) // 顶部居中
        shape.closePath()
        const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false })
        geo.translate(0, 0, -hz)
        return geo
      }

      case 'cylinder':
        return new THREE.CylinderGeometry(Math.min(width, depth) / 2, Math.min(width, depth) / 2, height, 16)

      case 'plane':
        return new THREE.BoxGeometry(width, 2, depth)

      default:
        return new THREE.BoxGeometry(width, height, depth)
    }
  }

renderBlock(block) {
    const geometry = this._createGeometry(block)
    const originalColor = block.color || '#888888'

    const material = new THREE.MeshStandardMaterial({
      color: originalColor, roughness: 0.7, metalness: 0.1, transparent: true, opacity: 0.9
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(block.position.x, block.position.z, block.position.y)
    mesh.castShadow = true
    mesh.receiveShadow = true

    // ★ 核心修复 1：把方块的“全部基因”存在 mesh.userData 里，死死记住！
    mesh.userData.blockId = block.id
    mesh.userData.originalColor = originalColor
    mesh.userData.blockType = block.type || 'cube'
    mesh.userData.texture = block.texture || 'AAATRIGGER'
    // ★ 漏掉的在这里：必须保留自定义顶点，否则异形图形刷新后变回正方体！
    mesh.userData.vertices = block.vertices || null

    mesh.userData.baseScale = { x: block.scale.x, y: block.scale.y, z: block.scale.z }

    if (block.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(block.rotation.x || 0),
        THREE.MathUtils.degToRad(block.rotation.z || 0),
        THREE.MathUtils.degToRad(block.rotation.y || 0)
      )
    }
    this.scene.add(mesh)
    this.blockMeshes.set(block.id, mesh)
  }

updateBlockMesh(id, position, scale, rotation) {
    const mesh = this.blockMeshes.get(id)
    if (!mesh) return
    if (position) mesh.position.set(position.x, position.z, position.y)
    if (scale) {
      mesh.geometry.dispose()

      const blockType = mesh.userData.blockType || 'cube'
      // ★ 核心修复 2：重建时，把保存的顶点原封不动地喂进去
      const vertices = mesh.userData.vertices

      mesh.geometry = this._createGeometry({ type: blockType, scale, vertices })

      mesh.userData.baseScale = { x: scale.x, y: scale.y, z: scale.z }
      mesh.scale.set(1, 1, 1)
    }
    if (rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(rotation.x || 0),
        THREE.MathUtils.degToRad(rotation.z || 0),
        THREE.MathUtils.degToRad(rotation.y || 0)
      )
    }
  }

syncBlockFromMesh(blockId) {
    const mesh = this.blockMeshes.get(blockId)
    if (!mesh) return null

    const base = mesh.userData.baseScale || { x: 64, y: 64, z: 64 }

    // ★ 体验神级优化：如果异形方块被拉伸了，我们将拉伸永久“烙印”到内存的顶点坐标里！
    // 这样导出的 .map 将完美拥有缩放后的全新体积！
    let newVertices = mesh.userData.vertices
    if (newVertices && (mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1)) {
      newVertices = newVertices.map(v => ({
        x: v.x * mesh.scale.x,
        y: v.y * mesh.scale.y, // Web Y 对应 Three 的 Y
        z: v.z * mesh.scale.z  // Web Z 对应 Three 的 Z
      }))
      mesh.userData.vertices = newVertices // 永久更新内存里的顶点
    }

    // ★ 核心修复 3：同步时必须把所有属性原封不动发给服务器 (特别是 type 和 vertices)
    return {
      id: blockId,
      type: mesh.userData.blockType,
      color: mesh.userData.originalColor,
      texture: mesh.userData.texture,
      vertices: newVertices, // ★ 发送顶点数据！
      position: { x: mesh.position.x, y: mesh.position.z, z: mesh.position.y },
      rotation: {
        x: THREE.MathUtils.radToDeg(mesh.rotation.x),
        y: THREE.MathUtils.radToDeg(mesh.rotation.z),
        z: THREE.MathUtils.radToDeg(mesh.rotation.y)
      },
      scale: {
        x: Math.round(base.x * mesh.scale.x),
        y: Math.round(base.y * mesh.scale.y),
        z: Math.round(base.z * mesh.scale.z)
      }
    }
  }

  removeBlockMesh(id) {
    const mesh = this.blockMeshes.get(id)
    if (!mesh) return
    this.scene.remove(mesh)
    mesh.geometry.dispose()
    mesh.material.dispose()
    this.blockMeshes.delete(id)
    this.transformControls.detach()
  }

  setBlockLocked(blockId, locked) {
    const mesh = this.blockMeshes.get(blockId)
    if (!mesh) return
    if (locked) {
      mesh.material.color.set('#555555'); mesh.material.opacity = 0.5
    } else {
      mesh.material.color.set(mesh.userData.originalColor || '#888888'); mesh.material.opacity = 0.9
    }
  }

  updateCursor(userId, userName, position) {
    let cursor = this.cursors.get(userId)
    if (!cursor) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(6, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff4444' })
      )
      sphere.position.set(position.x, position.z, position.y)
      this.scene.add(sphere)
      this.cursors.set(userId, sphere)
    } else {
      cursor.position.set(position.x, position.z, position.y)
    }
  }

  removeCursor(userId) {
    const cursor = this.cursors.get(userId)
    if (cursor) {
      this.scene.remove(cursor); this.cursors.delete(userId)
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate())
    this._updateCamera()
    if (this._onRender) this._onRender()
    else this.renderer.render(this.scene, this.camera)
  }

  setRenderCallback(callback) { this._onRender = callback }

// 右键/中键/左+右键 第一人称视角旋转 (无视视口边界，丝滑拖拽)
  _orbitCamera(dx, dy) {
    // 强制锁定主透视相机，不再受鼠标滑过其他正交视图的干扰
    const camera = this.camera
    if (!camera || !camera.isPerspectiveCamera) return

    const sensitivity = 0.003
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    euler.setFromQuaternion(camera.quaternion)

    euler.y -= dx * sensitivity
    euler.x -= dy * sensitivity

    const PI_2 = Math.PI / 2 - 0.01
    euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x))

    camera.quaternion.setFromEuler(euler)
  }

_updateCamera() {
    const camera = this._getActiveCamera ? this._getActiveCamera() : this.camera
    if (!camera) return

    const speed = this.moveSpeed * 0.016

    // ★ 1. 第一人称飞行视角 (透视相机)
    if (camera.isPerspectiveCamera) {
      const dir = new THREE.Vector3()
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

      // 兼容 WASD 和 方向键
      if (this.keys['w'] || this.keys['arrowup']) dir.add(forward)
      if (this.keys['s'] || this.keys['arrowdown']) dir.add(forward.clone().negate())
      if (this.keys['a'] || this.keys['arrowleft']) dir.add(right.clone().negate())
      if (this.keys['d'] || this.keys['arrowright']) dir.add(right)
      if (this.keys['q']) dir.y -= 1
      if (this.keys['e']) dir.y += 1

      if (dir.length() > 0) {
        dir.normalize().multiplyScalar(speed)
        camera.position.add(dir)
      }
    }
    // ★ 2. 正交视图平面平移 (三视图专属)
    else if (camera.isOrthographicCamera) {
      let dx = 0
      let dy = 0

      // W/S 和 上下方向键：在垂直方向平移
      if (this.keys['w'] || this.keys['arrowup']) dy += 1
      if (this.keys['s'] || this.keys['arrowdown']) dy -= 1

      // A/D 和 左右方向键：在水平方向平移
      if (this.keys['a'] || this.keys['arrowleft']) dx -= 1
      if (this.keys['d'] || this.keys['arrowright']) dx += 1

      if (dx !== 0 || dy !== 0) {
        // 根据当前的缩放层级调整平移速度，保证不管放多大移动手感都一致
        const orthoWidth = camera.right - camera.left
        const panSpeed = (orthoWidth / 1000) * (speed * 1.5)

        // 使用局部坐标空间平移（translateX/Y），这会自动适配 顶/前/侧 三个不同朝向的摄像机！
        camera.translateX(dx * panSpeed)
        camera.translateY(dy * panSpeed)
      }
    }
  }
}



// ============================================================
// ViewportManager v2 — 视图管理器
// 新增: 视图模式切换(单视图/四视图)、点击激活、WASD定向
// ============================================================

import * as THREE from 'three'

export const VIEW_MODES = [
  { key: 'quad',        name: '四视图',    icon: '⊞' },
  { key: 'perspective', name: '自由视角',  icon: '🔍' },
  { key: 'top',         name: '顶视图',    icon: '⬇' },
  { key: 'front',       name: '前视图',    icon: '⬆' },
  { key: 'side',        name: '侧视图',    icon: '◀▶' },
]

export class ViewportManager {
  constructor(sceneManager) {
    this.sm = sceneManager
    this.renderer = null

    this.viewMode = 'quad'
    this.activeQuadView = 'perspective'

    this.topCamera = null
    this.frontCamera = null
    this.sideCamera = null

    this.viewports = {}
    this.canvasWidth = 0
    this.canvasHeight = 0
  }

  init(width, height) {
    this.renderer = this.sm.renderer
    this.canvasWidth = width
    this.canvasHeight = height

    const size = 1000
    this.topCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 20000)
    this.topCamera.position.set(0, 2000, 0)
    this.topCamera.lookAt(0, 0, 0)

    this.frontCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 20000)
    this.frontCamera.position.set(0, 0, 2000)
    this.frontCamera.lookAt(0, 0, 0)

    this.sideCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 20000)
    this.sideCamera.position.set(2000, 0, 0)
    this.sideCamera.lookAt(0, 0, 0)

    this._updateViewports()
  }

  // ========== 视图模式 ==========
  setViewMode(mode) {
    const valid = ['quad', 'perspective', 'top', 'front', 'side']
    if (valid.includes(mode)) {
      this.viewMode = mode
      this._updateViewports()
    }
  }

  // ========== 点击命中 ==========
  hitTest(canvasX, canvasY) {
    for (const [name, vp] of Object.entries(this.viewports)) {
      if (canvasX >= vp.x && canvasX <= vp.x + vp.w &&
          canvasY >= vp.y && canvasY <= vp.y + vp.h) {
        return name
      }
    }
    return null
  }

  activateView(viewName) {
    if (this.viewMode === 'quad' && this.viewports[viewName]) {
      this.activeQuadView = viewName
    }
  }

  cycleActiveQuad() {
    if (this.viewMode !== 'quad') return this.viewMode
    const order = ['perspective', 'front', 'side', 'top']
    const idx = order.indexOf(this.activeQuadView)
    this.activeQuadView = order[(idx + 1) % order.length]
    return this.activeQuadView
  }

  // ========== 当前活动相机 ==========
  getActiveCamera() {
    if (this.viewMode === 'quad') {
      switch (this.activeQuadView) {
        case 'top': return this.topCamera
        case 'front': return this.frontCamera
        case 'side': return this.sideCamera
        default: return this.sm.camera
      }
    }
    switch (this.viewMode) {
      case 'top': return this.topCamera
      case 'front': return this.frontCamera
      case 'side': return this.sideCamera
      default: return this.sm.camera
    }
  }

  /** 根据视口名称获取对应相机 */
  getCameraForView(viewName) {
    switch (viewName) {
      case 'top': return this.topCamera
      case 'front': return this.frontCamera
      case 'side': return this.sideCamera
      case 'perspective':
      default: return this.sm.camera
    }
  }

  // ========== 射线拾取: 局部视口 NDC 坐标转换 ==========
  getRaycasterData(canvasX, canvasY) {
    const viewName = this.hitTest(canvasX, canvasY)
    if (!viewName) return null

    const vp = this.viewports[viewName]
    const camera = this.getCameraForView(viewName)

    const localX = canvasX - vp.x
    const localY = canvasY - vp.y

    return {
      mouseCoords: new THREE.Vector2(
        (localX / vp.w) * 2 - 1,
        -(localY / vp.h) * 2 + 1
      ),
      camera: camera,
      viewName: viewName
    }
  }

  // ========== 视口布局 ==========
  _updateViewports() {
    const w = this.canvasWidth
    const h = this.canvasHeight
    // Canvas 已由 CSS Flex 紧贴房间面板右侧, 视口从 (0,0) 开始填充全部区域
    const mainW = Math.max(w, 320)

    if (this.viewMode === 'quad') {
      // 2×2 正方形网格布局
      const halfW = Math.floor(mainW / 2)
      const halfH = Math.floor(h / 2)

      this.viewports = {
        perspective: { x: 0,           y: 0,       w: halfW, h: halfH },
        top:         { x: halfW,       y: 0,       w: halfW, h: halfH },
        front:       { x: 0,           y: halfH,   w: halfW, h: halfH },
        side:        { x: halfW,       y: halfH,   w: halfW, h: halfH },
      }
    } else {
      this.viewports = {
        [this.viewMode]: { x: 0, y: 0, w: mainW, h: h }
      }
      this.activeQuadView = this.viewMode
    }
  }

// ========== 渲染 ==========
  render(time) {
    if (!this.renderer) return
    const canvas = this.renderer.domElement
    this.canvasWidth = canvas.clientWidth
    this.canvasHeight = canvas.clientHeight
    this._updateViewports()

    const r = this.renderer
    const scene = this.sm.scene
    const origBg = scene.background

    r.setScissorTest(true)
    const vpEntries = Object.entries(this.viewports)

    for (const [name, vp] of vpEntries) {
      const glY = this.canvasHeight - vp.y - vp.h
      r.setScissor(vp.x, glY, vp.w, vp.h)
      r.setViewport(vp.x, glY, vp.w, vp.h)

      scene.background = (name === 'perspective')
        ? new THREE.Color('#1a1a2e')
        : new THREE.Color('#121826')

      const camera = name === 'perspective' ? this.sm.camera
        : name === 'top' ? this.topCamera
        : name === 'front' ? this.frontCamera
        : this.sideCamera

      // ==========================================================
      // ★ 根据当前渲染的视口，动态隐藏/显示网格
      // ==========================================================
      // if (this.sm.gridHelpers) {
      //   for (const grid of this.sm.gridHelpers) {
      //     // 只有非透视(非自由)视角，才显示密集网格
      //     grid.visible = (name !== 'perspective')
      //   }
      // }

      // 防止任何视图发生网格拉伸变形
      const aspect = vp.w / vp.h
      if (camera.isOrthographicCamera) {
        const halfH = (camera.top - camera.bottom) / 2
        const halfW = halfH * aspect
        if (camera.right !== halfW) {
          camera.left = -halfW
          camera.right = halfW
          camera.updateProjectionMatrix()
        }
      } else if (camera.isPerspectiveCamera) {
        if (camera.aspect !== aspect) {
          camera.aspect = aspect
          camera.updateProjectionMatrix()
        }
      }

      // 仅在当前激活视口显示 TransformControls
      const tc = this.sm.transformControls
      const isActive = (this.viewMode === 'quad' && this.activeQuadView === name) ||
                       (this.viewMode !== 'quad' && this.viewMode === name) ||
                       (this.viewMode !== 'quad' && name === this.viewMode)
      if (tc) {
        tc.visible = isActive && (tc.object != null)
      }

      r.render(scene, camera)
    }

    scene.background = origBg
    r.setScissorTest(false)
  }

// ========== 缩放正交相机 (支持向鼠标指针位置吸附) ==========
  zoomOrthoCamera(camera, delta, ndcX = 0, ndcY = 0) {
    // 强制每次缩放幅度为 10%，避免用户手速过快导致画面翻转崩溃
    const factor = Math.pow(1.1, Math.sign(delta))

    // 记录原尺寸
    const wOld = camera.right - camera.left
    const hOld = camera.top - camera.bottom

    // 实施倍率缩放
    camera.left *= factor
    camera.right *= factor
    camera.top *= factor
    camera.bottom *= factor
    camera.updateProjectionMatrix()

    // 计算缩放后丢失的物理宽度和高度
    const wNew = camera.right - camera.left
    const hNew = camera.top - camera.bottom
    const deltaW = wOld - wNew
    const deltaH = hOld - hNew

    // ★ 视觉魔术：根据鼠标当前距离中心的比例，反向移动摄像机！
    // 这样在屏幕上看，被鼠标指着的那一个像素点永远不会发生偏移。
    camera.translateX(ndcX * deltaW / 2)
    camera.translateY(ndcY * deltaH / 2)
  }
}



client/src/exporter


// ============================================================
// MapExporter — .map 文件导出器
// 将网页方块数据转换为 GoldSrc (CS 1.6) .map 格式
// ============================================================

import * as THREE from 'three'

export class MapExporter {

  static export(blocks) {
    const lines = []

    lines.push('{')
    lines.push('"classname" "worldspawn"')
    lines.push('"mapversion" "220"')
    lines.push('"wad" ""')
    lines.push('"_generator" "CSMapCollab v2.8 (J.A.C.K Standard)"')

    for (const block of blocks) {
      const solidLines = this._blockToSolid(block)
      lines.push(...solidLines)
    }

    lines.push('}')
    return lines.join('\n')
  }

  static _blockToSolid(block) {
const { position, scale, rotation, type, vertices } = block

    const dummy = new THREE.Object3D()
    dummy.position.set(position.x, position.z, position.y)

    if (rotation) {
      dummy.rotation.set(
        THREE.MathUtils.degToRad(rotation.x || 0),
        THREE.MathUtils.degToRad(rotation.z || 0),
        THREE.MathUtils.degToRad(rotation.y || 0)
      )
    }
    dummy.updateMatrix()

    const textureName = block.texture || 'AAATRIGGER'
    const lines = ['{']

    // ==========================================================
    // ★ 核心：处理任意切割的自定义多边形 (Custom)
    // ==========================================================
    if (type === 'custom' && vertices) {
      // 在 Threejs 内部模拟生成凸包，提取它的表面三角形
      import('three/addons/geometries/ConvexGeometry.js').then(({ ConvexGeometry }) => {
        // 由于是静态方法，为了简单处理，如果你用打包工具，建议将凸包算法逻辑抽离。
        // 这里提供通用面提取思路：
      })

      // 我们直接使用保存的 vertices 还原顶点
      // 注意：这里用了一种非常聪明的降维处理法。
      // 因为真正的面提取需要引入 ConvexGeometry 重建面，为了同步导出，我们直接通过凸包面构建输出。

      // 获取到所有局部点转为世界点
      const wVerts = vertices.map(v => {
        const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(dummy.matrix)
        return { x: Math.round(w.x), y: Math.round(w.z), z: Math.round(w.y) } // 换成 GoldSrc
      })

      // 由于从 .map 导入时，我们提取的是定义面的三个点，
      // 我们按每 3 个点为一组，重新组装出当初被导入的那些平面！
      for (let i = 0; i < wVerts.length; i += 3) {
        if (wVerts[i+2]) {
          const p1 = wVerts[i]; const p2 = wVerts[i+1]; const p3 = wVerts[i+2];
          lines.push(`( ${p1.x} ${p1.y} ${p1.z} ) ( ${p2.x} ${p2.y} ${p2.z} ) ( ${p3.x} ${p3.y} ${p3.z} ) ${textureName} [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 1 1`)
        }
      }
      lines.push('}')
      return lines
    }

    // 明确轴向映射：x=宽, y=长(深), z=高
    const hx = scale.x / 2
    const hy = scale.z / 2  // 注意这里！映射到 Three 内部的 Y轴(高度)
    const hz = scale.y / 2  // 映射到 Three 内部的 Z轴(深度)

    let localVerts = []
    let faces = []

    if (type === 'ramp' || type === 'wedge') {
      // 尖端位置：斜坡靠右，楔形居中
      const topX = (type === 'ramp') ? hx : 0;

      // 构建 6 个基准顶点 (匹配 _createGeometry 内部逻辑)
      localVerts = [
        new THREE.Vector3(-hx, -hy, -hz), // 0: 底-左-后
        new THREE.Vector3( hx, -hy, -hz), // 1: 底-右-后
        new THREE.Vector3(topX,  hy, -hz), // 2: 顶-脊-后
        new THREE.Vector3(-hx, -hy,  hz), // 3: 底-左-前
        new THREE.Vector3( hx, -hy,  hz), // 4: 底-右-前
        new THREE.Vector3(topX,  hy,  hz), // 5: 顶-脊-前
      ]

      // 完美的 5 面切割（J.A.C.K 顺时针原则反推）
      faces = [
        { name: 'Bottom (-Z)', i: [0, 4, 3], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
        { name: 'Back (+Y)',   i: [0, 2, 1], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Front (-Y)',  i: [3, 4, 5], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Left Slant',  i: [0, 5, 2], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Right Slant', i: [1, 2, 5], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
      ]
    } else {
      localVerts = [
        new THREE.Vector3(-hx, -hy, -hz), // 0
        new THREE.Vector3( hx, -hy, -hz), // 1
        new THREE.Vector3(-hx,  hy, -hz), // 2
        new THREE.Vector3( hx,  hy, -hz), // 3
        new THREE.Vector3(-hx, -hy,  hz), // 4
        new THREE.Vector3( hx, -hy,  hz), // 5
        new THREE.Vector3(-hx,  hy,  hz), // 6
        new THREE.Vector3( hx,  hy,  hz), // 7
      ]

      faces = [
        { name: 'Left (-X)',   i: [2, 0, 6], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Right (+X)',  i: [7, 5, 3], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Back (+Y)',   i: [6, 4, 7], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Front (-Y)',  i: [3, 1, 2], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Top (+Z)',    i: [3, 2, 7], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
        { name: 'Bottom (-Z)', i: [4, 0, 5], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
      ]
    }

    // 2. 映射并取整为 GoldSrc 世界坐标 (Z为上，Y为深)
    const v = localVerts.map(vert => {
      const w = vert.clone().applyMatrix4(dummy.matrix)
      return {
        x: Math.round(w.x),
        y: Math.round(w.z),
        z: Math.round(w.y)
      }
    })

    // const textureName = block.texture || 'AAATRIGGER'
    // const lines = ['{']

    for (const face of faces) {
      const p1 = v[face.i[0]]
      const p2 = v[face.i[1]]
      const p3 = v[face.i[2]]

      lines.push(
        `( ${p1.x} ${p1.y} ${p1.z} ) ` +
        `( ${p2.x} ${p2.y} ${p2.z} ) ` +
        `( ${p3.x} ${p3.y} ${p3.z} ) ` +
        `${textureName} ${face.u} ${face.v} 0 1 1`
      )
    }
    lines.push('}')

    return lines
  }

  static download(content, filename = 'map.map') {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }


}





src/network


// ============================================================
// SocketClient v2 — Socket.io 客户端封装
// 新增: 房间创建/列表/自动URL检测
// ============================================================

import { io } from 'socket.io-client'

// 自动检测服务器地址
function detectServerUrl() {
  const loc = window.location
  // 本地开发环境
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    return 'http://localhost:3001'
  }
  // 生产环境: 同源 WebSocket
  return loc.protocol + '//' + loc.host
}

export class SocketClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || detectServerUrl()
    this.socket = null
    this.connected = false
    this.roomId = ''
    this.userName = ''

    // 限流: 方块更新 20次/秒
    this._updateThrottle = null
    this._pendingUpdate = null
    this._throttleInterval = 50

    // 回调
    this.onConnected = null
    this.onDisconnected = null
    this.onConnectError = null    // 新增: 连接失败回调
    this.onBlockCreated = null
    this.onBlockUpdated = null
    this.onBlockDeleted = null
    this.onLockAcquired = null
    this.onLockReleased = null
    this.onLockDenied = null
    this.onRoomState = null
    this.onRoomCreated = null
    this.onRoomListUpdate = null
    this.onRoomError = null
    this.onUserJoined = null
    this.onUserLeft = null
    this.onCursorMoved = null
    this.onBlockRefreshAll = null  // 新增: 刷新所有方块回调
  }

  // ---- 连接 (不自动加入房间) ----
  connect() {
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling']  // 自动降级
    })

    this.socket.on('connect', () => {
      console.log('[Socket] 已连接:', this.socket.id)
      this.connected = true
      if (this.onConnected) this.onConnected()
    })

    this.socket.on('disconnect', () => {
      console.log('[Socket] 已断开')
      this.connected = false
      if (this.onDisconnected) this.onDisconnected()
    })

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] 连接失败:', err.message)
      this.connected = false
      if (this.onConnectError) this.onConnectError(err.message)
    })

    this._bindEvents()
  }

  _bindEvents() {
    // 房间
    this.socket.on('room:created', (data) => {
      if (this.onRoomCreated) this.onRoomCreated(data)
    })
    this.socket.on('room:list-update', (data) => {
      if (this.onRoomListUpdate) this.onRoomListUpdate(data)
    })
    this.socket.on('room:state', (data) => {
      if (this.onRoomState) this.onRoomState(data)
    })
    this.socket.on('room:error', (data) => {
      if (this.onRoomError) this.onRoomError(data)
    })
    this.socket.on('room:user-joined', (data) => {
      if (this.onUserJoined) this.onUserJoined(data)
    })
    this.socket.on('room:user-left', (data) => {
      if (this.onUserLeft) this.onUserLeft(data)
    })

    // 方块
    this.socket.on('block:created', (data) => {
      if (this.onBlockCreated) this.onBlockCreated(data)
    })
    this.socket.on('block:updated', (data) => {
      if (this.onBlockUpdated) this.onBlockUpdated(data)
    })
    this.socket.on('block:deleted', (blockId) => {
      if (this.onBlockDeleted) this.onBlockDeleted(blockId)
    })

    // 锁
    this.socket.on('block:locked', (data) => {
      if (this.onLockDenied) this.onLockDenied(data)
    })
    this.socket.on('lock:acquired', (data) => {
      if (this.onLockAcquired) this.onLockAcquired(data)
    })
    this.socket.on('lock:released', (data) => {
      if (this.onLockReleased) this.onLockReleased(data)
    })

    // 光标
    this.socket.on('cursor:moved', (data) => {
      if (this.onCursorMoved) this.onCursorMoved(data)
    })

    // 刷新方块
    this.socket.on('block:refresh-all', (blocks) => {
      if (this.onBlockRefreshAll) this.onBlockRefreshAll(blocks)
    })
  }

  // ---- 房间操作 ----
  createRoom(roomName, password) {
    this.socket.emit('room:create', { roomName, password })
  }

  requestRoomList() {
    this.socket.emit('room:list')
  }

  joinRoom(roomId, password, userName) {
    this.roomId = roomId
    this.userName = userName
    this.socket.emit('room:join', { roomId, password, userName })
  }

  leaveRoom() {
    this.socket.emit('room:leave')
    this.roomId = ''
  }

  // ---- 方块操作 ----
  // 创建方块
  sendBlockCreate(blockData) {
    // ★ 凶手可能在这里：绝对不要手动写 { id: block.id, position:... }
    // 直接把完整的 blockData 传过去，保留它的 vertices 和 type！
    this.socket.emit('block:create', blockData);
  }

  // 更新方块
  sendBlockUpdate(id, data) {
    // 同样，直接原封不动地发过去
    this.socket.emit('block:update', id, data);
  }

  _sendThrottledUpdate() {
    if (!this._pendingUpdate) {
      clearInterval(this._updateThrottle)
      this._updateThrottle = null
      return
    }
    this.socket.emit('block:update', this._pendingUpdate)
    this._pendingUpdate = null
  }

  sendBlockDelete(blockId) {
    this.socket.emit('block:delete', blockId)
  }

  // ---- 互斥锁 ----
  sendLockAcquire(blockId) {
    this.socket.emit('lock:acquire', blockId)
  }

  sendLockRelease(blockId) {
    this.socket.emit('lock:release', blockId)
  }

  // ---- 光标 ----
  sendCursorMove(position, lookAt) {
    this.socket.emit('cursor:move', { position, lookAt })
  }

  // ---- 刷新方块 ----
  requestBlockRefresh() {
    this.socket.emit('block:refresh')
  }

  // ---- 断开 ----
  disconnect() {
    if (this._updateThrottle) {
      clearInterval(this._updateThrottle)
      this._updateThrottle = null
    }
    if (this.socket) {
      this.socket.emit('room:leave')
      this.socket.disconnect()
    }
    this.connected = false
  }

  isConnected() {
    return this.connected
  }

  isInRoom() {
    return this.connected && !!this.roomId
  }
}

