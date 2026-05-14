<template>
  <div class="app-layout">
    <!-- 顶部工具栏 -->
    <Toolbar
      :is-in-room="isInRoom"
      :grid-size="currentGridSize"
      :map-name="currentMapName"
      :is-dirty="isDirty"
      :is-snap-enabled="isSnapEnabled"
      @add-block="onAddBlock"
      @delete-block="onDeleteBlock"
      @export-map="onExportMap"
      @request-load="onRequestLoadMap"
      @update-grid-size="onUpdateGridSize"
      @toggle-snap="onToggleSnap"
      @open-settings="showSettingsModal = true"
      @open-help="showHelpModal = true"
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

      </div>
    <!-- </div> -->

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
        <h4>💾 保存 / 导出地图</h4>
        <label>地图名称</label>
        <input v-model="saveForm.mapName" placeholder="如 my_kz_map" maxlength="30" />
        <label class="hint-label">格式: .map (J.A.C.K / Hammer 标准格式)</label>
        <div class="save-info">状态: {{ isInRoom ? '协作中' : '单机模式' }} · 方块: {{ blockManager.getAllBlocks().length }}</div>
        <div class="modal-btns">
          <button class="modal-btn cancel" @click="showSaveDialog = false">取消</button>
          <button class="modal-btn confirm" @click="doSaveMap" :disabled="!saveForm.mapName">生成文件</button>
        </div>
      </div>
    </div>

    <!-- ★ 新增：未保存拦截弹窗 -->
    <div v-if="showUnsavedDialog" class="modal-overlay" @click.self="showUnsavedDialog = false">
      <div class="modal-box warning-box">
        <h4>⚠️ 未保存提示</h4>
        <p>您当前编辑的地图 <strong>{{ currentMapName }}</strong> 有未保存的更改。</p>
        <p class="warning-sub">继续打开新地图将丢失这些更改，是否先保存？</p>
        <div class="modal-btns vertical-btns">
          <button class="modal-btn confirm" @click="handleUnsaved('save')">保存并打开</button>
          <button class="modal-btn danger" @click="handleUnsaved('discard')">放弃更改，直接打开</button>
          <button class="modal-btn cancel" @click="handleUnsaved('cancel')">取消操作</button>
        </div>
      </div>
    </div>

    <!-- ★ 帮助说明弹窗 -->
    <div v-if="showHelpModal" class="modal-overlay" @click.self="showHelpModal = false">
      <div class="modal-box help-box">
        <h4>❓ 操作快捷键</h4>
        <ul>
          <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 漫游视角/平移视图</li>
          <li><kbd>右键</kbd> 拖拽旋转 3D 视角</li>
          <li><kbd>滚轮</kbd> 向鼠标位置缩放</li>
          <li><kbd>Shift</kbd> (按住) 加速移动</li>
          <li><kbd>方向键</kbd> 精准微调选中方块 (Nudge)</li>
          <li><kbd>G</kbd> 开启/关闭网格吸附</li>
          <li><kbd>Tab</kbd> 在四视图中循环切换活动视口</li>
          <li><kbd>左键</kbd> 选中场景中的方块进行编辑</li>
        </ul>
        <button class="modal-btn confirm" @click="showHelpModal = false">我知道了</button>
      </div>
    </div>

    <!-- ★ 设置弹窗 -->
    <div v-if="showSettingsModal" class="modal-overlay" @click.self="showSettingsModal = false">
      <div class="modal-box">
        <h4>⚙️ 编辑器设置</h4>
        <div class="prop-section">
          <label>移动速度 (WASD)</label>
          <input type="range" min="100" max="5000" step="100" v-model="editorSettings.moveSpeed" @input="applySettings" />
          <div class="range-val">{{ editorSettings.moveSpeed }}</div>
        </div>
        <div class="prop-section">
          <label>鼠标灵敏度 (视角旋转)</label>
          <input type="range" min="0.001" max="0.01" step="0.001" v-model="editorSettings.lookSpeed" @input="applySettings" />
          <div class="range-val">{{ editorSettings.lookSpeed }}</div>
        </div>
        <button class="modal-btn confirm mt-3" @click="showSettingsModal = false">关闭</button>
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

// ---- 保存/读取及文件状态 ----
const showSaveDialog = ref(false)
const showUnsavedDialog = ref(false) // 控制未保存提示
const saveForm = ref({ mapName: '', roomId: '' })
const fileInputRef = ref(null)

let lastSavedFilename = ''
let currentMapDocument = null

// ★ 文件状态管理核心
const currentMapName = ref('未命名地图')
const isDirty = ref(false)

// 标记：如果修改了场景，则设为脏状态
function markDirty() {
  isDirty.value = true
}

// ---- 响应式状态 ----
const viewportRef = ref(null)
const roomPanelRef = ref(null)
const selectedBlock = ref(null)
const isInRoom = ref(false)
const currentGridSize = ref(16)
const isSnapEnabled = ref(true)

// 设置和帮助弹窗
const showHelpModal = ref(false)
const showSettingsModal = ref(false)
const editorSettings = ref({
  moveSpeed: 1500,
  lookSpeed: 0.003
})

function applySettings() {
  if (sceneManager) {
    sceneManager.moveSpeed = Number(editorSettings.value.moveSpeed)
    sceneManager.lookSensitivity = Number(editorSettings.value.lookSpeed)
  }
}

const activeQuadLabel = computed(() => {
  const names = { perspective: '自由视角', top: '顶视图', front: '前视图', side: '侧视图' }
  return names[viewportManager?.activeQuadView] || ''
})

let editingBlockId = null

function onToggleSnap() {
  isSnapEnabled.value = !isSnapEnabled.value
  blockManager.setSnapEnabled(isSnapEnabled.value)
  sceneManager.setSnapEnabled(isSnapEnabled.value)
}

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
  // ★ 网页防关闭保护
  window.addEventListener('beforeunload', (e) => {
    if (isDirty.value) {
      e.preventDefault()
      e.returnValue = '您有未保存的更改，确定要离开吗？'
    }
  })

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
    markDirty() // 标记更改
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
    // 忽略在输入框中打字时的按键
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return

    // Tab 切换视图
    if (e.key === 'Tab' && viewportManager && viewportManager.viewMode === 'quad') {
      e.preventDefault()
      viewportManager.cycleActiveQuad()
    }

    // ★ 快捷键 G 切换吸附
    if (e.key.toLowerCase() === 'g') {
      onToggleSnap()
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

function onRoomStateUpdated(data) {
  isInRoom.value = true
  if (data && data.roomName) {
    currentMapName.value = data.roomName
    isDirty.value = false // 刚进入房间，状态与服务器一致，不算脏
    currentMapDocument = null // 联机时抛弃本地缓存原稿
  }
}

function onSelectBlockType() { showBlockTypeSelector.value = true }
function selectBlockType(type) { selectedBlockType.value = type }
function confirmAddBlock() {
  showBlockTypeSelector.value = false
  doAddBlock(selectedBlockType.value)
}

function doAddBlock(blockType) {
  const block = blockManager.createDefaultBlock(blockType)
  sceneManager.renderBlock(block)

  markDirty() // 标记更改

  const sc = socketClient.value
  if (sc?.isInRoom()) {
    sc.sendBlockCreate(block)
  }
}

function onAddBlock() { showBlockTypeSelector.value = true }

function onDeleteBlock() {
  if (!selectedBlock.value) return
  const id = selectedBlock.value.id

  blockManager.deleteBlock(id)
  sceneManager.removeBlockMesh(id)

  markDirty() // 标记更改

  const sc = socketClient.value
  if (sc?.isInRoom()) {
    sc.sendBlockDelete(id)
  }
  selectedBlock.value = null
}

function onUpdateBlock(data) {
  if (!selectedBlock.value) return
  const id = selectedBlock.value.id

  // 先更新本地
  blockManager.updateBlock(id, data)
  sceneManager.updateBlockMesh(id, data.position, data.scale, data.rotation)

  markDirty() // 标记更改

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

  // 默认名称优先使用当前地图名
  saveForm.value.mapName = currentMapName.value
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

    // 保存成功，更新状态
    currentMapName.value = mapName
    lastSavedFilename = mapName + '.map'
    isDirty.value = false // ★ 刚保存完，去掉星星
    showSaveDialog.value = false

  } catch (err) {
    alert('导出出错: ' + err.message)
  }
}

// ==========================================================
// ★ 拦截读取逻辑与弹窗控制
// ==========================================================
function onRequestLoadMap() {
  // 如果当前地图做过修改，拦截它！
  if (isDirty.value) {
    showUnsavedDialog.value = true
  } else {
    executeLoadMap()
  }
}

function handleUnsaved(action) {
  showUnsavedDialog.value = false
  if (action === 'save') {
    // 自动调用导出
    onExportMap()
    // 注意：浏览器安全限制无法在下载后自动弹文件选择器,
    // 这里我们重置脏状态，用户保存后需再点一次打开。
    isDirty.value = false
  } else if (action === 'discard') {
    executeLoadMap()
  }
  // cancel 则什么都不做
}

function executeLoadMap() {
  if (fileInputRef.value) fileInputRef.value.click()
}

// 核心：处理本地上传的 .map 文件
async function onFileSelected(event) {
  const file = event.target.files[0]
  if (!file) return

  try {
    const data = await MapImporter.readLocalMap(file)
    currentMapDocument = data.mapDoc
    loadDataIntoScene(data)

    // 重置状态为全新
    currentMapName.value = data.mapName
    lastSavedFilename = data.mapName + '.map'
    isDirty.value = false // 新加载的地图还没被修改

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

  // ★ 核心：地图渲染完毕，立刻让镜头瞬移并全景聚焦！
  sceneManager.focusOnMap(data.blocks)

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
.app-layout { display: flex; flex-direction: column; height: 100vh; background: #1a1a2e; min-width: 900px; }
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
.warning-box p { color: #ccc; font-size: 13px; margin-bottom: 8px; line-height: 1.4; }
.warning-box .warning-sub { color: #888; font-size: 11px; margin-bottom: 16px; }
.vertical-btns { flex-direction: column; gap: 8px; }
.modal-btn.danger { background: #e94560; color: white; }
.modal-btn.confirm { background: #4a9eff; color: white; }
/* 帮助弹窗 & 设置弹窗 */
.help-box ul { list-style: none; padding: 0; margin: 0 0 16px; color: #ccc; font-size: 13px; line-height: 2; }
.help-box kbd { background: #2a3b5c; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #ffcc00; font-weight: bold; font-size: 11px; margin-right: 4px; box-shadow: 0 2px 0 #0f172a; }
.mt-3 { margin-top: 16px; }
input[type="range"] { width: 100%; cursor: pointer; accent-color: #e94560; }
.range-val { text-align: right; font-size: 11px; color: #4a9eff; font-family: monospace; margin-top: 4px; }
</style>