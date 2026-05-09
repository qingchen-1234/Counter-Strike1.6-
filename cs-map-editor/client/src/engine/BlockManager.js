// ============================================================
// BlockManager — 方块数据管理 (纯逻辑，不涉及渲染)
// 职责: 方块的 CRUD、ID生成、网格吸附、多类型支持
// ============================================================

// ID 生成 — 兼容非 HTTPS / 非 localhost 环境
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 降级方案 (非 HTTPS 且非 localhost 时 crypto.randomUUID 不可用)
  return 'b_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).substring(2, 10) + '_' +
    performance.now().toString(36).replace('.', '')
}

// 方块类型定义
export const BLOCK_TYPES = {
  cube:      { name: '立方体', icon: '🟫', geom: 'box' },
  ramp:      { name: '斜坡',   icon: '📐', geom: 'ramp' },
  // stairs:    { name: '楼梯',   icon: '🪜', geom: 'stairs' },
  wedge:     { name: '楔形',   icon: '🔺', geom: 'wedge' },
  // cylinder:  { name: '圆柱',   icon: '🫙', geom: 'cylinder' },
  // plane:     { name: '平面',   icon: '⬜', geom: 'plane' },
}

let GRID_SNAP = 16          // 网格吸附单位（可变）
const GRID_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256]
const DEFAULT_SCALE = { x: 64, y: 64, z: 64 }

export class BlockManager {
  constructor() {
    this.blocks = new Map()
    this.gridSize = GRID_SNAP
  }

  // ---- 网格大小管理 ----
  setGridSize(size) {
    this.gridSize = Math.max(1, Math.min(256, Math.round(size)))
    GRID_SNAP = this.gridSize
    return this.gridSize
  }

  getGridSize() {
    return this.gridSize
  }

  static getGridOptions() {
    return GRID_OPTIONS
  }

  // ---- 创建方块 (支持类型) ----
  createDefaultBlock(blockType = 'cube') {
    const block = {
      id: generateId(),
      type: blockType,
      position: { x: 0, y: 0, z: 0 },
      scale: { ...DEFAULT_SCALE },
      rotation: { x: 0, y: 0, z: 0 },
      color: this._randomGrayColor(),
      texture: 'AAATRIGGER',
      createdAt: Date.now(),
      creator: '',
      lockedBy: null,
      tags: []
    }
    this.blocks.set(block.id, block)
    return block
  }

  createBlock(data, isLocal = false) {
    const block = {
      id: data.id,
      type: data.type || 'cube',
      position: data.position || { x: 0, y: 0, z: 0 },
      scale: data.scale || { ...DEFAULT_SCALE },
      rotation: data.rotation || { x: 0, y: 0, z: 0 },
      color: data.color || this._randomGrayColor(),
      texture: data.texture || 'AAATRIGGER',
      createdAt: data.createdAt || Date.now(),
      creator: data.creator || '',
      lockedBy: data.lockedBy || null,
      tags: data.tags || []
    }
    this.blocks.set(block.id, block)
    return block
  }

  // ---- 更新方块 ----
  updateBlock(id, { position, scale, rotation, color, texture }) {
    const block = this.blocks.get(id)
    if (!block) return null
    if (position) {
      block.position = {
        x: this._snap(position.x),
        y: this._snap(position.y),
        z: this._snap(position.z)
      }
    }
    if (scale) {
      block.scale = {
        x: this._snap(scale.x),
        y: this._snap(scale.y),
        z: this._snap(scale.z)
      }
    }
    if (rotation) {
      block.rotation = {
        x: this._snapRotation(rotation.x),
        y: this._snapRotation(rotation.y),
        z: this._snapRotation(rotation.z)
      }
    }
    if (color !== undefined) block.color = color
    if (texture !== undefined) block.texture = texture
    return block
  }

  // ---- 删除方块 ----
  deleteBlock(id) {
    this.blocks.delete(id)
  }

  // ---- 查询 ----
  getBlock(id) {
    return this.blocks.get(id) || null
  }

  getAllBlocks() {
    return Array.from(this.blocks.values())
  }

  // ---- 网格吸附 ----
  _snap(value) {
    const gs = this.gridSize || GRID_SNAP
    return Math.round(value / gs) * gs
  }

  _snapRotation(value) {
    return Math.round(value / 15) * 15
  }

  // ---- 随机灰色调 ----
  _randomGrayColor() {
    const v = 100 + Math.floor(Math.random() * 100)
    return `rgb(${v},${v},${v})`
  }
}
