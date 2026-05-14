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

// ★ 新增：用于存放导入时的 .map 无损原稿缓存
let currentMapDocument = null

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
    // ★ 将 currentMapDocument 传给导出器
    MapImporter.downloadLocalMap(blocks, mapName, currentMapDocument)
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
    const data = await MapImporter.readLocalMap(file)
    // ★ 接收原稿缓存！
    currentMapDocument = data.mapDoc

    loadDataIntoScene(data)
    lastSavedFilename = file.name
  } catch (err) {
    console.error(err)
    alert('读取 .map 文件失败: ' + err.message)
  }
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