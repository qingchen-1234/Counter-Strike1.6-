<template>
  <div class="props-panel">
    <div v-if="!selectedBlock" class="empty-state">
      <p>选择一个方块查看属性</p>
      <p class="sub">左键点击 3D 场景中的方块</p>
    </div>

    <div v-else class="props-form">
      <h4>方块属性</h4>

      <div class="prop-row">
        <label>类型</label>
        <span class="prop-value">{{ blockTypeName }}</span>
      </div>

      <div class="prop-row">
        <label>ID</label>
        <span class="prop-value mono">{{ shortId }}</span>
      </div>

      <div class="prop-section">
        <h5>位置 (Position)</h5>
        <div class="input-row">
          <label>X</label>
          <input type="number" step="16" :value="selectedBlock.position.x"
            @change="onPosChange('x', $event)" />
        </div>
        <div class="input-row">
          <label>Y</label>
          <input type="number" step="16" :value="selectedBlock.position.y"
            @change="onPosChange('y', $event)" />
        </div>
        <div class="input-row">
          <label>Z</label>
          <input type="number" step="16" :value="selectedBlock.position.z"
            @change="onPosChange('z', $event)" />
        </div>
      </div>

      <div class="prop-section">
        <h5>尺寸 (Scale)</h5>
        <div class="input-row">
          <label>宽</label>
          <input type="number" step="16" min="16" :value="selectedBlock.scale.x"
            @change="onScaleChange('x', $event)" />
        </div>
        <div class="input-row">
          <label>长</label>
          <input type="number" step="16" min="16" :value="selectedBlock.scale.y"
            @change="onScaleChange('y', $event)" />
        </div>
        <div class="input-row">
          <label>高</label>
          <input type="number" step="16" min="16" :value="selectedBlock.scale.z"
            @change="onScaleChange('z', $event)" />
        </div>
      </div>

      <div class="prop-section">
        <h5>旋转 (Rotation °)</h5>
        <div class="input-row">
          <label>X</label>
          <input type="number" step="15" :value="selectedBlock.rotation?.x || 0"
            @change="onRotChange('x', $event)" />
        </div>
        <div class="input-row">
          <label>Y</label>
          <input type="number" step="15" :value="selectedBlock.rotation?.y || 0"
            @change="onRotChange('y', $event)" />
        </div>
        <div class="input-row">
          <label>Z</label>
          <input type="number" step="15" :value="selectedBlock.rotation?.z || 0"
            @change="onRotChange('z', $event)" />
        </div>
      </div>

      <div class="prop-section">
        <h5>颜色</h5>
        <input type="color" :value="selectedBlock.color"
          @change="onColorChange($event)" />
      </div>

      <div class="prop-section">
        <h5>操作</h5>
        <div class="op-grid">
          <button class="op-btn" @click="rotateBlock('x')" title="绕X轴旋转90°">↻ X90°</button>
          <button class="op-btn" @click="rotateBlock('y')" title="绕Y轴旋转90°">↻ Y90°</button>
          <button class="op-btn" @click="rotateBlock('z')" title="绕Z轴旋转90°">↻ Z90°</button>
          <button class="op-btn mirror" @click="mirrorBlock('x')" title="X轴镜像翻转">↔ X镜像</button>
          <button class="op-btn mirror" @click="mirrorBlock('y')" title="Y轴镜像翻转">↔ Y镜像</button>
          <button class="op-btn mirror" @click="mirrorBlock('z')" title="Z轴镜像翻转">↔ Z镜像</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { BLOCK_TYPES } from '../engine/BlockManager.js'

const props = defineProps({
  selectedBlock: { type: Object, default: null },
  isInRoom: { type: Boolean, default: false }
})
const emit = defineEmits(['update-block', 'rotate-block', 'mirror-block'])

const blockTypeName = computed(() => {
  if (!props.selectedBlock) return ''
  const type = props.selectedBlock.type || 'cube'
  return BLOCK_TYPES[type]?.name || type
})

const shortId = computed(() => {
  const id = props.selectedBlock?.id || ''
  return id.length > 16 ? id.substring(0, 14) + '...' : id
})

function onPosChange(axis, event) {
  const pos = { ...props.selectedBlock.position, [axis]: Number(event.target.value) }
  emit('update-block', { position: pos })
}

function onScaleChange(axis, event) {
  const scale = { ...props.selectedBlock.scale, [axis]: Number(event.target.value) }
  emit('update-block', { scale })
}

function onRotChange(axis, event) {
  const rot = { ...(props.selectedBlock.rotation || { x: 0, y: 0, z: 0 }), [axis]: Number(event.target.value) }
  emit('update-block', { rotation: rot })
}

function onColorChange(event) {
  emit('update-block', { color: event.target.value })
}

function rotateBlock(axis) {
  emit('rotate-block', axis)
}

function mirrorBlock(axis) {
  emit('mirror-block', axis)
}
</script>

<style scoped>
.props-panel {
  width: 220px; min-width: 220px; max-width: 220px; flex-shrink: 0;
  background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px; overflow-y: auto;
}
@media (max-width: 1100px) {
  .props-panel { display: none; }
}
@media (max-width: 900px) {
  .room-panel { width: 40px; min-width: 40px; max-width: 40px; padding: 8px; }
  .viewport-hint { font-size: 9px; padding: 4px 8px; gap: 4px; }
}

.empty-state {
  text-align: center;
  color: #666;
  margin-top: 40px;
}
.empty-state p { font-size: 13px; }
.empty-state .sub { font-size: 11px; margin-top: 6px; }

.props-form h4 {
  font-size: 14px;
  color: #e94560;
  margin-bottom: 12px;
}

.prop-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}
.prop-row label { color: #888; }
.prop-value.mono {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
  color: #aaa;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prop-section {
  margin-bottom: 14px;
}
.prop-section h5 {
  font-size: 11px;
  color: #4a9eff;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.input-row {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}
.input-row label {
  width: 24px;
  font-size: 12px;
  color: #888;
}
.input-row input {
  flex: 1;
  padding: 4px 6px;
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  color: #eee;
  font-size: 12px;
  outline: none;
}
.input-row input:focus {
  border-color: #e94560;
}

input[type="color"] {
  width: 40px;
  height: 28px;
  border: 1px solid #0f3460;
  border-radius: 3px;
  background: none;
  cursor: pointer;
}

.op-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.op-btn {
  padding: 5px 4px;
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  color: #aaa;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.op-btn:hover {
  border-color: #4a9eff;
  color: #4a9eff;
}
.op-btn.mirror:hover {
  border-color: #ffcc00;
  color: #ffcc00;
}
</style>
