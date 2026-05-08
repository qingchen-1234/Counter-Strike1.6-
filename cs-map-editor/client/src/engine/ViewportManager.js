// ============================================================
// ViewportManager v2 — 视图管理器
// 新增: 视图模式切换(单视图/四视图)、点击激活、WASD定向
// ============================================================

import * as THREE from 'three'

export const VIEW_MODES = [
  { key: 'quad',        name: '四视图',    icon: '⊞' },
  { key: 'perspective', name: '自由视角',  icon: '🔍' },
  { key: 'top',         name: '顶视图',    icon: '⬇' },
  { key: 'front',       name: '前视图',    icon: '⬆' },
  { key: 'side',        name: '侧视图',    icon: '◀▶' },
]

export class ViewportManager {
  constructor(sceneManager) {
    this.sm = sceneManager
    this.renderer = null

    this.viewMode = 'quad'
    this.activeQuadView = 'perspective'

    this.topCamera = null
    this.frontCamera = null
    this.sideCamera = null

    this.viewports = {}
    this.canvasWidth = 0
    this.canvasHeight = 0
  }

  init(width, height) {
    this.renderer = this.sm.renderer
    this.canvasWidth = width
    this.canvasHeight = height

    const size = 1000
    this.topCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 20000)
    this.topCamera.position.set(0, 2000, 0)
    this.topCamera.lookAt(0, 0, 0)

    this.frontCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 20000)
    this.frontCamera.position.set(0, 0, 2000)
    this.frontCamera.lookAt(0, 0, 0)

    this.sideCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 20000)
    this.sideCamera.position.set(2000, 0, 0)
    this.sideCamera.lookAt(0, 0, 0)

    this._updateViewports()
  }

  // ========== 视图模式 ==========
  setViewMode(mode) {
    const valid = ['quad', 'perspective', 'top', 'front', 'side']
    if (valid.includes(mode)) {
      this.viewMode = mode
      this._updateViewports()
    }
  }

  // ========== 点击命中 ==========
  hitTest(canvasX, canvasY) {
    for (const [name, vp] of Object.entries(this.viewports)) {
      if (canvasX >= vp.x && canvasX <= vp.x + vp.w &&
          canvasY >= vp.y && canvasY <= vp.y + vp.h) {
        return name
      }
    }
    return null
  }

  activateView(viewName) {
    if (this.viewMode === 'quad' && this.viewports[viewName]) {
      this.activeQuadView = viewName
    }
  }

  cycleActiveQuad() {
    if (this.viewMode !== 'quad') return this.viewMode
    const order = ['perspective', 'front', 'side', 'top']
    const idx = order.indexOf(this.activeQuadView)
    this.activeQuadView = order[(idx + 1) % order.length]
    return this.activeQuadView
  }

  // ========== 当前活动相机 ==========
  getActiveCamera() {
    if (this.viewMode === 'quad') {
      switch (this.activeQuadView) {
        case 'top': return this.topCamera
        case 'front': return this.frontCamera
        case 'side': return this.sideCamera
        default: return this.sm.camera
      }
    }
    switch (this.viewMode) {
      case 'top': return this.topCamera
      case 'front': return this.frontCamera
      case 'side': return this.sideCamera
      default: return this.sm.camera
    }
  }

  /** 根据视口名称获取对应相机 */
  getCameraForView(viewName) {
    switch (viewName) {
      case 'top': return this.topCamera
      case 'front': return this.frontCamera
      case 'side': return this.sideCamera
      case 'perspective':
      default: return this.sm.camera
    }
  }

  // ========== 射线拾取: 局部视口 NDC 坐标转换 ==========
  getRaycasterData(canvasX, canvasY) {
    const viewName = this.hitTest(canvasX, canvasY)
    if (!viewName) return null

    const vp = this.viewports[viewName]
    const camera = this.getCameraForView(viewName)

    const localX = canvasX - vp.x
    const localY = canvasY - vp.y

    return {
      mouseCoords: new THREE.Vector2(
        (localX / vp.w) * 2 - 1,
        -(localY / vp.h) * 2 + 1
      ),
      camera: camera,
      viewName: viewName
    }
  }

  // ========== 视口布局 ==========
  _updateViewports() {
    const w = this.canvasWidth
    const h = this.canvasHeight
    // Canvas 已由 CSS Flex 紧贴房间面板右侧, 视口从 (0,0) 开始填充全部区域
    const mainW = Math.max(w, 320)

    if (this.viewMode === 'quad') {
      // 2×2 正方形网格布局
      const halfW = Math.floor(mainW / 2)
      const halfH = Math.floor(h / 2)

      this.viewports = {
        perspective: { x: 0,           y: 0,       w: halfW, h: halfH },
        top:         { x: halfW,       y: 0,       w: halfW, h: halfH },
        front:       { x: 0,           y: halfH,   w: halfW, h: halfH },
        side:        { x: halfW,       y: halfH,   w: halfW, h: halfH },
      }
    } else {
      this.viewports = {
        [this.viewMode]: { x: 0, y: 0, w: mainW, h: h }
      }
      this.activeQuadView = this.viewMode
    }
  }

// ========== 渲染 ==========
  render(time) {
    if (!this.renderer) return
    const canvas = this.renderer.domElement
    this.canvasWidth = canvas.clientWidth
    this.canvasHeight = canvas.clientHeight
    this._updateViewports()

    const r = this.renderer
    const scene = this.sm.scene
    const origBg = scene.background

    r.setScissorTest(true)
    const vpEntries = Object.entries(this.viewports)

    for (const [name, vp] of vpEntries) {
      const glY = this.canvasHeight - vp.y - vp.h
      r.setScissor(vp.x, glY, vp.w, vp.h)
      r.setViewport(vp.x, glY, vp.w, vp.h)

      scene.background = (name === 'perspective')
        ? new THREE.Color('#1a1a2e')
        : new THREE.Color('#121826')

      const camera = name === 'perspective' ? this.sm.camera
        : name === 'top' ? this.topCamera
        : name === 'front' ? this.frontCamera
        : this.sideCamera

      // ==========================================================
      // ★ 核心修复：防止任何视图（单视图/四视图）发生网格拉伸变形
      // ==========================================================
      const aspect = vp.w / vp.h

      if (camera.isOrthographicCamera) {
        // 1. 获取当前相机的高度一半（保持用户滚轮缩放的比例不丢失）
        const halfH = (camera.top - camera.bottom) / 2
        // 2. 根据视口真实的宽高比，重新计算相机的宽度
        const halfW = halfH * aspect

        // 3. 只有当尺寸确实改变时才更新矩阵（优化性能）
        if (camera.right !== halfW) {
          camera.left = -halfW
          camera.right = halfW
          camera.updateProjectionMatrix()
        }
      } else if (camera.isPerspectiveCamera) {
        // 顺手保证透视相机在单/四视图切换时也绝不拉伸
        if (camera.aspect !== aspect) {
          camera.aspect = aspect
          camera.updateProjectionMatrix()
        }
      }
      // ==========================================================

      // 仅在当前激活视口显示 TransformControls
      const tc = this.sm.transformControls
      const isActive = (this.viewMode === 'quad' && this.activeQuadView === name) ||
                       (this.viewMode !== 'quad' && this.viewMode === name) ||
                       (this.viewMode !== 'quad' && name === this.viewMode)
      if (tc) {
        tc.visible = isActive && (tc.object != null)
      }

      r.render(scene, camera)
    }

    scene.background = origBg
    r.setScissorTest(false)
  }

  zoomOrthoCamera(camera, delta) {
    const factor = 1 + delta * 0.001
    const h = camera.top - camera.bottom
    const w = camera.right - camera.left
    camera.top = h * factor / 2
    camera.bottom = -h * factor / 2
    camera.right = w * factor / 2
    camera.left = -w * factor / 2
    camera.updateProjectionMatrix()
  }
}
