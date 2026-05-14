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