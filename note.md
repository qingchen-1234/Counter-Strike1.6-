### 第一步：修复“方块加载中断”并大幅提升默认视野距离

我们要给 3D 几何体生成加上“防弹衣”（`try...catch`），一旦遇到无法生成凸包的破损几何体，我们自动给它降级为一个对应尺寸的长方体，这样绝不会中断加载！同时开放速度和视野的设置。

**请修改 `client/src/engine/SceneManager.js`：**

1. 找到 `constructor()`，增加几个属性：
```javascript
    this.moveSpeed = 1500 // ★ 默认速度从 300 提升到 1500，走得更快
    this.lookSensitivity = 0.003 // 鼠标灵敏度
    // ... 原有代码
```

2. 找到 `init(canvas, viewportEl)`，修改透视相机的 `far` 值（从 `10000` 改为 `60000`）：
```javascript
    this.camera = new THREE.PerspectiveCamera(
      70, viewportEl.clientWidth / viewportEl.clientHeight, 1, 60000 // ★ 增加视野范围
    )
```

3. 找到 `_createGeometry(block)` 方法，**替换**为以下防弹版本：
```javascript
  // ---- 方块可视化 (防弹版) ----
  _createGeometry(block) {
    const { type, scale, vertices } = block
    const width = scale.x; const depth = scale.y; const height = scale.z
    const hx = width / 2; const hy = height / 2; const hz = depth / 2

    // ★ 核心修复：添加 try...catch 防崩溃保护
    if (type === 'custom' && vertices && vertices.length >= 4) {
      try {
        const points = vertices.map(v => new THREE.Vector3(v.x, v.y, v.z))
        return new ConvexGeometry(points)
      } catch (err) {
        console.warn(`[降级] 方块 ${block.id} 无法生成复杂凸包，已降级为标准长方体。原因:`, err.message)
        // 发生错误时，不要崩溃，继续往下走，降级为长方体
      }
    }

    switch (type) {
      case 'ramp': {
        const shape = new THREE.Shape()
        shape.moveTo(-hx, -hy); shape.lineTo( hx, -hy); shape.lineTo( hx,  hy); shape.lineTo(-hx, -hy)
        const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false })
        geo.translate(0, 0, -hz)
        return geo
      }
      case 'wedge': {
        const shape = new THREE.Shape()
        shape.moveTo(-hx, -hy); shape.lineTo( hx, -hy); shape.lineTo( 0,   hy); shape.closePath()
        const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false })
        geo.translate(0, 0, -hz)
        return geo
      }
      default:
        // 包含 cube 以及所有 fallback 降级的情况
        return new THREE.BoxGeometry(width, height, depth)
    }
  }
```

4. 找到 `_orbitCamera(dx, dy)`，更新鼠标灵敏度：
```javascript
  _orbitCamera(dx, dy) {
    const camera = this.camera
    if (!camera || !camera.isPerspectiveCamera) return

    // ★ 使用可配置的灵敏度
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    euler.setFromQuaternion(camera.quaternion)

    euler.y -= dx * this.lookSensitivity
    euler.x -= dy * this.lookSensitivity

    const PI_2 = Math.PI / 2 - 0.01
    euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x))

    camera.quaternion.setFromEuler(euler)
  }
```

---

### 第二步：修改 `client/src/engine/ViewportManager.js`
同步扩大正交相机的视野距离，否则三视图的大地图也会被截断。

找到 `init(width, height)`，将里面的 `20000` 全部改为 `60000`：
```javascript
    const size = 1000
    // ★ 把 20000 改为 60000
    this.topCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 60000)
    this.topCamera.position.set(0, 30000, 0) // 高度也拉高
    this.topCamera.lookAt(0, 0, 0)

    this.frontCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 60000)
    this.frontCamera.position.set(0, 0, 30000)
    this.frontCamera.lookAt(0, 0, 0)

    this.sideCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 60000)
    this.sideCamera.position.set(30000, 0, 0)
    this.sideCamera.lookAt(0, 0, 0)
```

---

### 第三步：优化 UI 工具栏 (`client/src/components/Toolbar.vue`)
精简高度，删除文本提示，替换为精巧的“帮助”和“设置”按钮。

```vue
<template>
  <div class="toolbar">
    <span class="logo">🧱 CSMapCollab</span>

    <div class="file-info" :title="isDirty ? '有未保存的修改' : '已保存'">
      <span class="file-name">📝 {{ mapName }}.map</span>
      <span v-if="isDirty" class="dirty-star">*</span>
    </div>

    <div class="tool-group divider">
      <button class="tool-btn primary" @click="$emit('add-block')">➕ 新建</button>
      <button class="tool-btn danger" @click="$emit('delete-block')">🗑 删除</button>
    </div>

    <div class="tool-group divider">
      <button class="tool-btn load" @click="$emit('request-load')">📂 打开</button>
      <button class="tool-btn success" @click="$emit('export-map')">💾 导出</button>
    </div>

    <div class="tool-group divider">
      <button class="tool-btn snap-btn" :class="{ active: isSnapEnabled }" @click="$emit('toggle-snap')">
        🧲 {{ isSnapEnabled ? 'ON' : 'OFF' }}
      </button>
      <select class="grid-select" :value="gridSize" @change="onGridChange" :disabled="!isSnapEnabled">
        <option v-for="opt in gridOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <div class="tool-group spacer"></div> <!-- 将右侧推过去 -->

    <!-- ★ 新增：设置与帮助按钮 -->
    <div class="tool-group">
      <button class="tool-btn icon-btn" @click="$emit('open-settings')" title="编辑器设置">⚙️</button>
      <button class="tool-btn icon-btn" @click="$emit('open-help')" title="操作说明">❓</button>
    </div>

    <div class="tool-group">
      <span v-if="isInRoom" class="status-badge online">🟢 协作中</span>
      <span v-else class="status-badge offline">⚫ 单机</span>
    </div>
  </div>
</template>

<script setup>
import { BlockManager } from '../engine/BlockManager.js'

const props = defineProps({
  isInRoom: { type: Boolean, default: false },
  gridSize: { type: Number, default: 16 },
  mapName: { type: String, default: '未命名地图' },
  isDirty: { type: Boolean, default: false },
  isSnapEnabled: { type: Boolean, default: true }
})

// 增加 open-settings 和 open-help
const emit = defineEmits(['add-block', 'delete-block', 'export-map', 'request-load', 'update-grid-size', 'toggle-snap', 'open-settings', 'open-help'])

const gridOptions = BlockManager.getGridOptions()

function onGridChange(e) {
  emit('update-grid-size', Number(e.target.value))
}
</script>

<style scoped>
/* ★ 优化：降低 Toolbar 高度，减少 padding，更加紧凑 */
.toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: #16213e; border-bottom: 1px solid #0f3460; height: 36px; min-height: 36px; box-sizing: border-box; }
.logo { font-weight: bold; font-size: 14px; color: #e94560; white-space: nowrap; margin-right: 4px; }
.file-info { display: flex; align-items: center; background: #1a1a2e; padding: 3px 8px; border-radius: 4px; border: 1px solid #0f3460; font-size: 12px; color: #ccc; }
.dirty-star { color: #ffcc00; font-weight: bold; margin-left: 4px; font-size: 14px; line-height: 1; }
.tool-group { display: flex; gap: 4px; align-items: center; }
.divider { padding-right: 8px; border-right: 1px solid #2a3b5c; }
.spacer { flex: 1; border: none; } /* 撑开中间，把右侧按钮挤到右边 */

.tool-btn { padding: 4px 10px; border: 1px solid #333; border-radius: 4px; background: #1a1a2e; color: #ccc; cursor: pointer; font-size: 12px; transition: all 0.2s; white-space: nowrap; }
.tool-btn:hover { background: #0f3460; border-color: #e94560; }
.tool-btn.primary { border-color: #4a9eff; color: #4a9eff; }
.tool-btn.danger  { border-color: #ff6b6b; color: #ff6b6b; }
.tool-btn.success { border-color: #51cf66; color: #51cf66; }
.tool-btn.load    { border-color: #ffcc00; color: #ffcc00; }
.icon-btn { padding: 4px 8px; font-size: 14px; background: transparent; border-color: #2a3b5c; }
.icon-btn:hover { background: #2a3b5c; }

.snap-btn { border-color: #555; color: #888; }
.snap-btn.active { border-color: #ffcc00; color: #ffcc00; background: rgba(255, 204, 0, 0.1); }
.grid-select:disabled { opacity: 0.5; cursor: not-allowed; }
.grid-select { background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px; color: #ccc; padding: 2px 4px; font-size: 12px; outline: none; cursor: pointer; }
.status-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
.status-badge.online { background: #1a3a1a; color: #51cf66; }
.status-badge.offline { background: #2a2a2a; color: #aaa; }
</style>
```

---

### 第四步：在 `App.vue` 中接入弹窗和挡视野的提示移除
最后，我们删除挡视野的文字，并实现真正的弹出层！

1. 在 `App.vue` 模板中，**彻底删除**以下这行代码（它就是挡视野的罪魁祸首）：
```html
<!-- 删除这一行！ -->
<div class="viewport-hint">WASD | 右键/中键旋转 | 滚轮缩放 | Shift加速 | 左键选中 | Tab切换 ... </div>
```

2. 绑定 `Toolbar` 的新事件：
```html
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
```

3. 在 `App.vue` 模板的 `<div v-if="showUnsavedDialog"...>` 弹窗**下方**，加入两个新的弹窗：
```html
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
```

4. 在 `<script setup>` 中添加状态和应用逻辑：
```javascript
// 在 ref 定义区域增加：
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
```

5. 在 `<style scoped>` 最底部加一点美化样式：
```css
.help-box ul { list-style: none; padding: 0; margin: 0 0 16px; color: #ccc; font-size: 13px; line-height: 2; }
.help-box kbd { background: #2a3b5c; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #ffcc00; font-weight: bold; font-size: 11px; margin-right: 4px; box-shadow: 0 2px 0 #0f172a; }
.mt-3 { margin-top: 16px; }
input[type="range"] { width: 100%; cursor: pointer; accent-color: #e94560; }
.range-val { text-align: right; font-size: 11px; color: #4a9eff; font-family: monospace; margin-top: 4px; }
```
