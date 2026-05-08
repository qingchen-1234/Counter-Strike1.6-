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

  // 创建方块
  socket.on('block:create', (blockData) => {
    const room = getRoom(socket, rooms);
    if (!room) return;

    const block = {
      id: blockData.id,
      type: blockData.type || 'cube',
      position: blockData.position,
      scale: blockData.scale,
      rotation: blockData.rotation || { x: 0, y: 0, z: 0 },
      color: blockData.color || '#888888',
      texture: blockData.texture || 'AAATRIGGER',
      creator: socket.id,
      createdAt: blockData.createdAt || Date.now(),
      lockedBy: null,
      tags: blockData.tags || []
    };
    room.blocks.set(block.id, block);

    io.in(socket.data.roomId).emit('block:created', block);
  });

  // 更新方块
  socket.on('block:update', (data) => {
    const room = getRoom(socket, rooms);
    if (!room) return;
    if (!room.blocks.has(data.id)) return;

    // 检查锁
    if (room.locks.has(data.id) && room.locks.get(data.id) !== socket.id) {
      socket.emit('block:locked', { id: data.id, lockedBy: room.locks.get(data.id) });
      return;
    }

    const block = room.blocks.get(data.id);
    if (data.position) block.position = data.position;
    if (data.scale) block.scale = data.scale;
    if (data.rotation) block.rotation = data.rotation;
    if (data.color !== undefined) block.color = data.color;

    socket.to(socket.data.roomId).emit('block:updated', data);
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

