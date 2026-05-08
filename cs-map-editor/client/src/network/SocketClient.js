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
  sendBlockCreate(block) {
    this.socket.emit('block:create', {
      id: block.id,
      type: block.type || 'cube',
      position: block.position,
      scale: block.scale,
      rotation: block.rotation || { x: 0, y: 0, z: 0 },
      color: block.color,
      texture: block.texture || 'AAATRIGGER',
      tags: block.tags || []
    })
  }

  sendBlockUpdate(id, data) {
    this._pendingUpdate = { id, ...data }
    if (!this._updateThrottle) {
      this._sendThrottledUpdate()
      this._updateThrottle = setInterval(() => {
        this._sendThrottledUpdate()
      }, this._throttleInterval)
    }
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

