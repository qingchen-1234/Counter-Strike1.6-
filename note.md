之前的设计确实有些精神分裂：既然叫离线模式，却又不让人放方块，但又能导来导去，非常割裂。
你的思路非常正确，现代 Web 编辑器（比如 Figma、VSCode Web）的标准做法是：**把“离线模式”当成“本地单机编辑器”，把“在线房间”当成“联机协作状态”**。

为了实现你说的“防止白做”、“未保存提示”以及“网页防误关保护”，我们需要引入一套完整的 **文件状态管理（Dirty Checking）机制**。

下面我们分两步来改造：

---

### 第一步：更新顶部工具栏 (`Toolbar.vue`)
我们需要在顶部显示当前正在编辑的地图名字，如果做了修改还没保存，就在名字后面加个小星星 `*` 提示用户。

请替换 `client/src/components/Toolbar.vue`：

```vue
<template>
  <div class="toolbar">
    <span class="logo">🧱 CSMapCollab</span>

    <!-- ★ 新增：文件状态显示 -->
    <div class="file-info" :title="isDirty ? '有未保存的修改' : '已保存'">
      <span class="file-name">📝 {{ mapName }}.map</span>
      <span v-if="isDirty" class="dirty-star">*</span>
    </div>

    <div class="tool-group">
      <button class="tool-btn primary" @click="$emit('add-block')" title="选择方块类型后创建">
        ➕ 新建
      </button>
      <button class="tool-btn danger" @click="$emit('delete-block')" title="删除选中的方块">
        🗑 删除
      </button>
    </div>

    <div class="tool-group">
      <!-- ★ 修改：触发带有拦截保护的读取事件 -->
      <button class="tool-btn load" @click="$emit('request-load')" title="导入本地的 .map 文件">
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
      <span v-else class="status-badge offline">⚫ 单机模式</span>
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
  gridSize: { type: Number, default: 16 },
  mapName: { type: String, default: '未命名地图' }, // ★ 新增属性
  isDirty: { type: Boolean, default: false }        // ★ 新增属性
})

// 修改了抛出的事件，改为 request-load
const emit = defineEmits(['add-block', 'delete-block', 'export-map', 'request-load', 'update-grid-size'])

const gridOptions = BlockManager.getGridOptions()

function onGridChange(e) {
  emit('update-grid-size', Number(e.target.value))
}
</script>

<style scoped>
/* 保持原有样式，新增以下几个类 */
.toolbar { display: flex; align-items: center; gap: 12px; padding: 4px 12px; background: #16213e; border-bottom: 1px solid #0f3460; min-height: 38px; flex-wrap: nowrap; overflow-x: auto; }
.toolbar::-webkit-scrollbar { height: 3px; }
.toolbar::-webkit-scrollbar-thumb { background: #333; }
.logo { font-weight: bold; font-size: 14px; color: #e94560; white-space: nowrap; margin-right: 8px; }

/* ★ 新增文件信息样式 */
.file-info { display: flex; align-items: center; background: #1a1a2e; padding: 4px 10px; border-radius: 4px; border: 1px solid #0f3460; font-size: 12px; color: #ccc; }
.dirty-star { color: #ffcc00; font-weight: bold; margin-left: 4px; font-size: 14px; line-height: 1; }

.tool-group { display: flex; gap: 6px; align-items: center; }
.tool-btn { padding: 5px 12px; border: 1px solid #333; border-radius: 4px; background: #1a1a2e; color: #ccc; cursor: pointer; font-size: 12px; transition: all 0.2s; white-space: nowrap; }
.tool-btn:hover { background: #0f3460; border-color: #e94560; }
.tool-btn.primary { border-color: #4a9eff; color: #4a9eff; }
.tool-btn.danger  { border-color: #ff6b6b; color: #ff6b6b; }
.tool-btn.success { border-color: #51cf66; color: #51cf66; }
.tool-btn.load    { border-color: #ffcc00; color: #ffcc00; }
.grid-label { color: #888; font-size: 11px; }
.grid-select { background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px; color: #ccc; padding: 4px 6px; font-size: 12px; outline: none; cursor: pointer; }
.grid-select:focus { border-color: #e94560; }
.status-badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: bold; }
.status-badge.online { background: #1a3a1a; color: #51cf66; }
.status-badge.offline { background: #2a2a2a; color: #aaa; }
.hint-group { margin-left: auto; }
.hint { font-size: 10px; color: #555; }
</style>
```

---

### 第二步：在 `App.vue` 中接入防误操作与全功能单机版逻辑
这一次，我们要彻底**解除离线不能放方块的限制**，并加上一套完美的“未保存拦截弹窗”和“浏览器页面防关闭保护”。

**请按以下步骤更新 `App.vue`：**

**1. 替换 `<template>` 里的 Toolbar 组件及底部弹窗部分：**
找到 `<Toolbar ... />` 以及 `<div v-if="showSaveDialog" ...>` 的地方，替换为以下代码：

```vue
    <!-- 顶部工具栏 -->
    <Toolbar
      :is-in-room="isInRoom"
      :grid-size="currentGridSize"
      :map-name="currentMapName"
      :is-dirty="isDirty"
      @add-block="onAddBlock"
      @delete-block="onDeleteBlock"
      @export-map="onExportMap"
      @request-load="onRequestLoadMap"
      @update-grid-size="onUpdateGridSize"
    />

    <!-- ...中间代码保持不变... -->

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
```

**2. 在 `<script setup>` 中添加状态和生命周期保护：**
在 `// ---- 保存/读取 ----` 的声明部分，替换成下面的代码：

```javascript
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

// 网页防关闭保护
onMounted(() => {
  window.addEventListener('beforeunload', (e) => {
    if (isDirty.value) {
      e.preventDefault()
      e.returnValue = '您有未保存的更改，确定要离开吗？' // 标准浏览器的保护提示
    }
  })
  // ... 其他 onMounted 逻辑保持不变
```

**3. 解除 `doAddBlock` 和 `onDeleteBlock` 的离线限制：**
删掉原代码里那些 `if (!inRoom) alert('离线不能...') return`，并加上 `markDirty()`：

```javascript
function doAddBlock(blockType) {
  const block = blockManager.createDefaultBlock(blockType)
  sceneManager.renderBlock(block)

  markDirty() // 标记更改

  const sc = socketClient.value
  if (sc?.isInRoom()) {
    sc.sendBlockCreate(block)
  }
}

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

// 同时在更新方块时也要标记
function onUpdateBlock(data) {
  if (!selectedBlock.value) return
  const id = selectedBlock.value.id

  blockManager.updateBlock(id, data)
  sceneManager.updateBlockMesh(id, data.position, data.scale, data.rotation)

  markDirty() // 标记更改

  const sc = socketClient.value
  if (sc?.isInRoom()) {
    const fullData = sceneManager.syncBlockFromMesh(id)
    if (fullData) sc.sendBlockUpdate(id, fullData)
  }
}
```

**4. 加入读取拦截与保存逻辑重构：**
把原本的 `onLoadMap()` 替换为这套全新的拦截体系：

```javascript
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
    // 注意：浏览器安全限制无法在下载后自动弹文件选择器，
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
```

**5. 在导出和进入房间时重置状态：**
最后，在 `doSaveMap` 里，保存成功后把 `isDirty.value` 变回 `false`。并且如果是联机，需要同步地图名。

```javascript
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

// ★ 在 onRoomStateUpdated 中同步联机地图名
function onRoomStateUpdated(data) {
  isInRoom.value = true
  if (data && data.roomName) {
    currentMapName.value = data.roomName
    isDirty.value = false // 刚进入房间，状态与服务器一致，不算脏
    currentMapDocument = null // 联机时抛弃本地缓存原稿
  }
}
```

**最后在 `<style>` 最下面加一点未保存弹窗的 CSS：**
```css
.warning-box p { color: #ccc; font-size: 13px; margin-bottom: 8px; line-height: 1.4; }
.warning-box .warning-sub { color: #888; font-size: 11px; margin-bottom: 16px; }
.vertical-btns { flex-direction: column; gap: 8px; }
.modal-btn.danger { background: #e94560; color: white; }
.modal-btn.confirm { background: #4a9eff; color: white; }
```

---

### 这波操作带来的质变体验：
1. **完全解禁单机模式**：刚打开网页就是一张 `未命名地图`。你不需要进房间，就可以直接本地拼装地图，甚至直接导入 `.map` 编辑再导出，非常顺畅！
2. **防误关保命机制**：做了一半不小心刷新页面或者关掉标签页？浏览器会跳出原生警告：“您有未保存的更改，确定要离开吗？”。
3. **强迫症福音 `*` 星星提示**：不管你是新建、移动、还是删除了方块，顶部的名字旁边立马出现一个 `*` 号，时刻提醒你“哥们，记得保存”。
4. **中断拦截**：在有星星 `*` 的情况下点击“打开 .map”，会弹出一个很正规的提示，防止你因为手抖打开别人的地图，导致自己刚拼好的地图灰飞烟灭。
