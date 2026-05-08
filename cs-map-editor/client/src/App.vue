<template>
  <div class="app-layout">
    <!-- 顶部工具栏 -->
    <Toolbar
      :is-in-room="isInRoom"
      :grid-size="currentGridSize"
      @add-block="onAddBlock"
      @delete-block="onDeleteBlock"
      @export-map="onExportMap"
      @save-map="onSaveMap"
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

    <!-- 保存命名对话框 -->
    <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog = false">
      <div class="modal-box">
        <h4>💾 保存地图</h4>
        <label>地图名称</label>
        <input v-model="saveForm.mapName" placeholder="如 my_kz_map" maxlength="30" />
        <label class="hint-label">格式: .csmap (JSON)</label>
        <div class="save-info">房间: {{ saveForm.roomId || '离线' }} · 方块: {{ blockManager.getAllBlocks().length }}</div>
        <div class="modal-btns">
          <button class="modal-btn cancel" @click="showSaveDialog = false">取消</button>
          <button class="modal-btn confirm" @click="doSaveMap" :disabled="!saveForm.mapName">保存</button>
        </div>
      </div>
    </div>

    <!-- 加载对话框 -->
    <div v-if="showLoadDialog" class="modal-overlay" @click.self="showLoadDialog = false">
      <div class="modal-box">
        <h4>📂 打开地图</h4>
        <div v-if="loadFiles.length > 0" class="file-list">
          <div v-for="f in loadFiles" :key="f.name" class="file-card" @click="doLoadServerFile(f.name)">
            <span>📄 {{ f.name }}</span>
            <span class="file-info">{{ formatFileSize(f.size) }} · {{ formatDate(f.updatedAt) }}</span>
          </div>
        </div>
        <div v-else class="empty-list">服务器暂无存档</div>
        <div class="modal-btns">
          <button class="modal-btn cancel" @click="showLoadDialog = false">取消</button>
          <button class="modal-btn secondary" @click="doLoadLocalFile">📁 从本地选择</button>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input ref="fileInputRef" type="file" accept=".csmap,.json" style="display:none" @change="onFileSelected" />
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
import { MapExporter } from './exporter/MapExporter.js'
import { SaveManager } from './engine/SaveManager.js'
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
let lastSavedFilename = ''  // 首次保存后记录文件名，后续覆盖

// ---- 响应式状态 ----
const viewportRef = ref(null)
const roomPanelRef = ref(null)
const selectedBlock = ref(null)
const isInRoom = ref(false)
const currentGridSize = ref(16)

// 四视图激活标签
const activeQuadLabel = computed(() => {
  const names = { perspective: '自由视角', top: '顶视图', front: '前视图', side: '侧视图' }
  return names[viewportManager?.activeQuadView] || ''
})

// 正在被自己编辑的方块 ID (TransformControls 拖拽中)
let editingBlockId = null

// ---- 视图模式切换 ----
function onViewModeChange(e) {
  const mode = e.target.value
  viewMode.value = mode
  if (viewportManager) viewportManager.setViewMode(mode)
}

// ---- Canvas 点击激活视口 ----
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

// ---- 初始化 ----
onMounted(() => {
  const canvas = document.getElementById('three-canvas')
  const viewport = viewportRef.value
  sceneManager.init(canvas, viewport)

  // 初始化四视图管理器
  viewportManager = new ViewportManager(sceneManager)
  viewportManager.init(canvas.clientWidth, canvas.clientHeight)
  // 双向绑定: SceneManager ↔ ViewportManager
  sceneManager.setActiveCameraFn(() => viewportManager.getActiveCamera())
  sceneManager.setViewportManager(viewportManager)
  // 注入渲染回调
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

  // Tab 切换四视图焦点
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && viewportManager && viewportManager.viewMode === 'quad') {
      e.preventDefault()
      viewportManager.cycleActiveQuad()
    }
  })
})

// ---- Socket 连接 (独立于房间) ----
function initSocketConnection() {
  // 如果已连接，直接返回
  if (socketClient.value?.isConnected()) {
    if (roomPanelRef.value) roomPanelRef.value.setConnected(true)
    return
  }

  const sc = new SocketClient()

  // ★ 关键: 连接成功后才通知 RoomPanel
  sc.onConnected = () => {
    if (roomPanelRef.value) roomPanelRef.value.setConnected(true)
    sc.requestRoomList()
  }

  // 断线时通知 RoomPanel
  sc.onDisconnected = () => {
    if (roomPanelRef.value) roomPanelRef.value.setConnected(false)
    isInRoom.value = false
  }

  // 连接失败时通知 RoomPanel
  sc.onConnectError = (errMsg) => {
    if (roomPanelRef.value) roomPanelRef.value.setError(errMsg)
  }

  sc.connect()
  setupSocketCallbacks(sc)
  socketClient.value = sc
}

function setupSocketCallbacks(sc) {
  // 远程方块创建
  sc.onBlockCreated = (blockData) => {
    if (blockManager.getBlock(blockData.id)) return
    blockManager.createBlock(blockData)
    sceneManager.renderBlock(blockData)
  }

  // 远程方块更新
  sc.onBlockUpdated = (data) => {
    const block = blockManager.updateBlock(data.id, data)
    if (block) sceneManager.updateBlockMesh(data.id, data.position, data.scale, data.rotation)
  }

  // 远程方块删除
  sc.onBlockDeleted = (blockId) => {
    blockManager.deleteBlock(blockId)
    sceneManager.removeBlockMesh(blockId)
    if (selectedBlock.value?.id === blockId) selectedBlock.value = null
  }

  // 锁定状态
  sc.onLockAcquired = ({ blockId }) => {
    sceneManager.setBlockLocked(blockId, true)
  }
  sc.onLockReleased = ({ blockId }) => {
    sceneManager.setBlockLocked(blockId, false)
  }
  sc.onLockDenied = ({ id, lockedBy }) => {
    console.warn(`方块 ${id} 正被 ${lockedBy} 编辑`)
  }

  // 光标同步
  sc.onCursorMoved = ({ userId, position }) => {
    sceneManager.updateCursor(userId, '', position)
  }

  // 刷新方块 (重新渲染所有方块)
  sc.onBlockRefreshAll = (blocks) => {
    // 清除场景中所有方块
    for (const blockId of blockManager.getAllBlocks().map(b => b.id)) {
      sceneManager.removeBlockMesh(blockId)
    }
    blockManager.blocks.clear()
    // 重新渲染
    for (const block of blocks) {
      blockManager.createBlock(block)
      sceneManager.renderBlock(block)
    }
  }
}

// ---- 房间操作 ----
function onCreateRoom({ roomName, password }) {
  const sc = socketClient.value
  if (!sc?.isConnected()) {
    // 先连接，连接成功后自动创建房间
    ensureConnectedThen(() => {
      socketClient.value.createRoom(roomName, password)
    })
    return
  }
  sc.createRoom(roomName, password)
}

function onJoinRoom({ roomId, password, userName }) {
  const sc = socketClient.value
  if (!sc?.isConnected()) {
    ensureConnectedThen(() => {
      socketClient.value.joinRoom(roomId, password, userName)
    })
    return
  }
  sc.joinRoom(roomId, password, userName)
}

// 确保连接已建立，然后执行回调
function ensureConnectedThen(callback) {
  if (socketClient.value?.isConnected()) {
    callback()
    return
  }
  // 初始化连接
  initSocketConnection()
  // 轮询等待连接
  const check = setInterval(() => {
    if (socketClient.value?.isConnected()) {
      clearInterval(check)
      callback()
    }
  }, 100)
  // 超时保护 (10秒)
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

// ---- 方块操作 ----
function onSelectBlockType() {
  showBlockTypeSelector.value = true
}

function selectBlockType(type) {
  selectedBlockType.value = type
}

function confirmAddBlock() {
  showBlockTypeSelector.value = false
  doAddBlock(selectedBlockType.value)
}

function doAddBlock(blockType) {
  const sc = socketClient.value
  const inRoom = sc?.isInRoom() || false

  // 离线模式: 不允许创建
  if (!inRoom) {
    alert('离线模式下不能创建方块。请先加入房间。')
    return
  }

  const block = blockManager.createDefaultBlock(blockType)
  sceneManager.renderBlock(block)
  sc?.sendBlockCreate(block)
}

function onAddBlock() {
  // 点击工具栏按钮 → 展开类型选择
  showBlockTypeSelector.value = true
}

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

  blockManager.updateBlock(id, data)
  sceneManager.updateBlockMesh(id, data.position, data.scale, data.rotation)

  const sc = socketClient.value
  if (sc?.isInRoom()) {
    sc.sendBlockUpdate(id, data)
  }
}

function onExportMap() {
  const blocks = blockManager.getAllBlocks()
  const mapContent = MapExporter.export(blocks)
  MapExporter.download(mapContent, 'my_map.map')
}

function onRefreshBlocks() {
  const sc = socketClient.value
  if (sc?.isInRoom()) sc.requestBlockRefresh()
}

// ---- 保存 ----
function onSaveMap() {
  if (lastSavedFilename) {
    // 已保存过，直接覆盖
    doSaveMap()
    return
  }
  // 首次保存，弹出命名对话框
  const sc = socketClient.value
  saveForm.value.roomId = sc?.roomId || ''
  saveForm.value.mapName = sc?.roomId ? 'Map_' + sc.roomId : 'my_map'
  showSaveDialog.value = true
}

async function doSaveMap() {
  const mapName = saveForm.value.mapName
  if (!mapName) {
    showSaveDialog.value = false
    return
  }

  const sc = socketClient.value
  const roomId = sc?.roomId || ''
  const blocks = blockManager.getAllBlocks()
  const gridSize = currentGridSize.value

  try {
    if (sc?.isInRoom()) {
      // 在线模式: 保存到服务器
      const result = await SaveManager.saveToServer(mapName, roomId, blocks, gridSize)
      lastSavedFilename = result.filename
      console.log('[保存] 服务器保存成功:', result.filename)
    } else {
      // 离线模式: 下载到本地
      const json = SaveManager.serialize(blocks, mapName, roomId, gridSize)
      SaveManager.downloadFile(json, mapName + '.csmap')
      lastSavedFilename = mapName + '.csmap'
    }
    showSaveDialog.value = false
  } catch (err) {
    alert('保存失败: ' + err.message)
  }
}

// ---- 加载 ----
async function onLoadMap() {
  const sc = socketClient.value
  if (sc?.isInRoom()) {
    // 在线模式: 显示服务器文件列表
    try {
      loadFiles.value = await SaveManager.listServerFiles()
      showLoadDialog.value = true
    } catch (err) {
      alert('获取文件列表失败: ' + err.message)
    }
  } else {
    // 离线模式: 直接选择本地文件
    doLoadLocalFile()
  }
}

function doLoadLocalFile() {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
  showLoadDialog.value = false
}

async function doLoadServerFile(filename) {
  try {
    const data = await SaveManager.loadFromServer(filename)
    loadDataIntoScene(data)
    showLoadDialog.value = false
    lastSavedFilename = filename
  } catch (err) {
    alert('加载失败: ' + err.message)
  }
}

async function onFileSelected(event) {
  const file = event.target.files[0]
  if (!file) return
  try {
    const data = await SaveManager.readFromFile(file)
    loadDataIntoScene(data)
    lastSavedFilename = file.name
  } catch (err) {
    alert('读取文件失败: ' + err.message)
  }
  // 重置 input 以便重新选择同一文件
  event.target.value = ''
}

function loadDataIntoScene(data) {
  if (!data.blocks || data.blocks.length === 0) {
    alert('文件中没有方块数据')
    return
  }
  // 清空现有
  sceneManager.clearAllBlocks()
  blockManager.blocks.clear()
  selectedBlock.value = null
  // 应用网格大小
  if (data.gridSize) {
    currentGridSize.value = data.gridSize
    blockManager.setGridSize(data.gridSize)
    sceneManager.updateGridSize(data.gridSize)
  }
  // 逐块创建
  for (const blockData of data.blocks) {
    blockManager.createBlock(blockData)
    sceneManager.renderBlock(blockData)
  }
  console.log(`[加载] 已恢复 ${data.blocks.length} 个方块`)
}

// ---- 网格大小 ----
function onUpdateGridSize(newSize) {
  currentGridSize.value = newSize
  blockManager.setGridSize(newSize)
  sceneManager.updateGridSize(newSize)
}

// ---- 格式辅助 ----
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
  const scale = { ...block.scale }
  // 镜像: 在指定轴上翻转位置
  const pos = { ...block.position }
  pos[axis] = -pos[axis]
  onUpdateBlock({ position: pos })
}
</script>

<style scoped>
.app-layout {
  display: flex; flex-direction: column; height: 100vh; background: #1a1a2e;
  min-width: 720px;   /* 防止整体过窄 */
}
.main-area {
  display: flex; flex: 1; overflow: hidden;
}
.viewport {
  flex: 1 1 400px;     /* min-width 400px，不再被过度压缩 */
  position: relative; background: #0f0f23;
  min-width: 400px;
}
#three-canvas {
  display: block; width: 100%; height: 100%;
}
.viewport-hint {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  padding: 6px 16px; background: rgba(0,0,0,0.6); border-radius: 4px;
  font-size: 11px; color: #888; pointer-events: none; display: flex; gap: 8px; align-items: center;
  white-space: nowrap; overflow: hidden; max-width: 95%;
}
.offline-badge {
  background: #e94560; color: white; padding: 2px 8px; border-radius: 3px; font-size: 10px;
}

/* 视图模式切换 */
.view-mode-bar {
  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,0.7); border: 1px solid #0f3460;
  border-radius: 6px; padding: 4px 10px; z-index: 50;
}
.view-mode-select {
  background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px;
  color: #ccc; padding: 4px 8px; font-size: 12px; outline: none; cursor: pointer;
}
.view-mode-select:focus { border-color: #e94560; }
.active-quad-label {
  font-size: 11px; color: #ffcc00; white-space: nowrap;
}

/* 方块类型选择器 */
.block-type-selector {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: #16213e; border: 1px solid #0f3460; border-radius: 10px;
  padding: 20px; width: 320px; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.selector-title { font-size: 14px; color: #e94560; margin-bottom: 14px; text-align: center; }
.type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
.type-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px; background: #1a1a2e; border: 1px solid #0f3460;
  border-radius: 8px; cursor: pointer; transition: all 0.2s;
}
.type-card:hover { border-color: #4a9eff; }
.type-card.active { border-color: #e94560; background: #2a1a2e; }
.type-icon { font-size: 24px; }
.type-name { font-size: 11px; color: #ccc; }
.selector-footer { display: flex; gap: 8px; }
.sel-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }

/* 模态框 */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 999;
}
.modal-box {
  background: #16213e; border: 1px solid #0f3460; border-radius: 8px;
  padding: 20px; width: 320px; max-height: 80vh; overflow-y: auto;
}
.modal-box h4 { color: #e94560; margin-bottom: 14px; }
.modal-box label { display: block; color: #888; font-size: 11px; margin-bottom: 4px; }
.modal-box input {
  width: 100%; padding: 8px; margin-bottom: 12px;
  background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px;
  color: #eee; font-size: 13px; outline: none;
}
.modal-box input:focus { border-color: #e94560; }
.hint-label { font-size: 10px; color: #555; margin-top: -8px; }
.save-info { font-size: 11px; color: #888; margin-bottom: 12px; }
.modal-btns { display: flex; gap: 8px; margin-top: 8px; }
.modal-btn {
  flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.modal-btn.cancel { background: #333; color: #999; }
.modal-btn.confirm { background: #e94560; color: white; }
.modal-btn.confirm:disabled { background: #333; cursor: not-allowed; }
.modal-btn.secondary { background: #1a1a2e; color: #a855f7; border: 1px solid #333; }

/* 文件列表 */
.file-list { max-height: 200px; overflow-y: auto; margin-bottom: 10px; }
.file-card {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px; background: #1a1a2e; border: 1px solid #0f3460;
  border-radius: 4px; margin-bottom: 4px; cursor: pointer; font-size: 12px;
}
.file-card:hover { border-color: #e94560; }
.file-info { color: #666; font-size: 10px; }
.empty-list { padding: 16px; text-align: center; color: #555; font-size: 12px; }
</style>