<template>
  <div class="toolbar">
    <span class="logo">🧱 CSMapCollab</span>

    <div class="tool-group">
      <button class="tool-btn primary" @click="$emit('add-block')" title="选择方块类型后创建">
        ➕ 新建
      </button>
      <button class="tool-btn danger" @click="$emit('delete-block')" title="删除选中的方块">
        🗑 删除
      </button>
    </div>

    <div class="tool-group">
      <button class="tool-btn save" @click="$emit('save-map')" title="保存 .csmap">
        💾 保存
      </button>
      <button class="tool-btn load" @click="$emit('load-map')" title="打开 .csmap">
        📂 打开
      </button>
      <button class="tool-btn success" @click="$emit('export-map')" title="导出为 .map 文件">
        📤 导出.map
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
      <span v-else class="status-badge offline">⚫ 离线</span>
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
  gridSize: { type: Number, default: 16 }
})
const emit = defineEmits(['add-block', 'delete-block', 'export-map', 'save-map', 'load-map', 'update-grid-size'])

const gridOptions = BlockManager.getGridOptions()

function onGridChange(e) {
  emit('update-grid-size', Number(e.target.value))
}
</script>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 12px; background: #16213e;
  border-bottom: 1px solid #0f3460; min-height: 38px;
  flex-wrap: nowrap; overflow-x: auto;
}
.toolbar::-webkit-scrollbar { height: 3px; }
.toolbar::-webkit-scrollbar-thumb { background: #333; }

.logo {
  font-weight: bold; font-size: 14px; color: #e94560; white-space: nowrap;
}

.tool-group {
  display: flex; gap: 6px; align-items: center;
}

.tool-btn {
  padding: 5px 12px; border: 1px solid #333; border-radius: 4px;
  background: #1a1a2e; color: #ccc; cursor: pointer;
  font-size: 12px; transition: all 0.2s; white-space: nowrap;
}
.tool-btn:hover { background: #0f3460; border-color: #e94560; }

.tool-btn.primary { border-color: #4a9eff; color: #4a9eff; }
.tool-btn.danger  { border-color: #ff6b6b; color: #ff6b6b; }
.tool-btn.success { border-color: #51cf66; color: #51cf66; }
.tool-btn.save    { border-color: #ffcc00; color: #ffcc00; }
.tool-btn.load    { border-color: #a855f7; color: #a855f7; }

.grid-label { color: #888; font-size: 11px; }
.grid-select {
  background: #1a1a2e; border: 1px solid #0f3460; border-radius: 4px;
  color: #ccc; padding: 4px 6px; font-size: 12px; outline: none; cursor: pointer;
}
.grid-select:focus { border-color: #e94560; }

.status-badge {
  padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: bold;
}
.status-badge.online { background: #1a3a1a; color: #51cf66; }
.status-badge.offline { background: #1a1a2e; color: #666; }

.hint-group { margin-left: auto; }
.hint { font-size: 10px; color: #555; }
</style>
