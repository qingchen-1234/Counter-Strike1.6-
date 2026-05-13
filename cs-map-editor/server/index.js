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

