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