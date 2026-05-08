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

// ==================== 文件存储 API ====================

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 保存 .csmap 文件
app.post('/api/save', (req, res) => {
  const { roomId, mapName, blocks, gridSize } = req.body;
  if (!mapName) return res.status(400).json({ error: '缺少地图名称' });
  if (!blocks) return res.status(400).json({ error: '缺少方块数据' });

  const safeName = mapName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
  const filename = (roomId ? roomId + '_' : '') + safeName + '.csmap';

  const data = {
    version: '2.2',
    mapName,
    roomId: roomId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    gridSize: gridSize || 16,
    blocks
  };

  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[存档] 已保存: ${filename} (${blocks.length} 方块)`);
  res.json({ success: true, filename });
});

// 获取存档列表
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.csmap'))
      .map(f => {
        const filePath = path.join(DATA_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          size: stat.size,
          updatedAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: '读取文件列表失败' });
  }
});

// 获取指定存档
app.get('/api/files/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  res.sendFile(filePath);
});

// 删除存档
app.delete('/api/files/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  fs.unlinkSync(filePath);
  console.log(`[存档] 已删除: ${filename}`);
  res.json({ success: true });
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

