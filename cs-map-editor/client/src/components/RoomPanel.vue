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