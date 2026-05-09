// ============================================================
// SceneManager — Three.js 场景管理器
// 职责: 初始化3D场景、摄像机、光照、网格吸附、鼠标交互
// ============================================================

import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

const GRID_SIZE = 16

function mergeGeometries(geometries) {
  const merged = new THREE.BufferGeometry()
  return geometries[0] || new THREE.BoxGeometry(64, 64, 64)
}

export class SceneManager {
  constructor() {
    this.scene = null
    this.camera = null
    this.renderer = null
    this.transformControls = null
    this.transformControlsDummy = null
    this.gridHelpers = []
    this.onSelectBlock = null
    this.onBlockMoved = null
    this.blockMeshes = new Map()
    this.cursors = new Map()
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    this.keys = {}
    this.moveSpeed = 300
    this.lookSpeed = 0.002
    this.isRightDragging = false
    this.isLeftDragging = false
    this.isMiddleDragging = false
    this.prevMouse = { x: 0, y: 0 }
    this.currentGridSize = GRID_SIZE
    this._getActiveCamera = null
    this._viewportManager = null

    // ★ 新增：用于记录拖拽起始所在的视口，防止跨视图拖拽断裂
    this._activeDragView = null
  }

  setActiveCameraFn(fn) { this._getActiveCamera = fn }
  setViewportManager(vm) { this._viewportManager = vm }

  updateGridSize(newSize) {
    this.currentGridSize = Math.max(1, Math.min(256, newSize))
    if (this.transformControls) {
      this.transformControls.setTranslationSnap(this.currentGridSize)
    }
    this._rebuildGrids()
  }

  _createGridHelper(color1 = '#333355', color2 = '#222244') {
    const range = Math.max(2048, (this.camera?.position.length() || 0) * 2)
    const divisions = Math.floor(range / this.currentGridSize)
    return new THREE.GridHelper(range, divisions, color1, color2)
  }

  _rebuildGrids() {
    for (const g of this.gridHelpers) {
      this.scene.remove(g)
      g.geometry.dispose()
      g.material.dispose()
    }
    this.gridHelpers = []

    const gXZ = this._createGridHelper('#553333', '#442222')
    this.scene.add(gXZ)
    this.gridHelpers.push(gXZ)

    const gXY = this._createGridHelper('#333366', '#222244')
    gXY.rotation.x = -Math.PI / 2
    this.scene.add(gXY)
    this.gridHelpers.push(gXY)

    const gYZ = this._createGridHelper('#336633', '#224422')
    gYZ.rotation.z = Math.PI / 2
    this.scene.add(gYZ)
    this.gridHelpers.push(gYZ)
  }

  clearAllBlocks() {
    for (const [id, mesh] of this.blockMeshes) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    this.blockMeshes.clear()
    this.transformControls.detach()
  }

  init(canvas, viewportEl) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight)
    this.renderer.shadowMap.enabled = true

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#1a1a2e')

    this.camera = new THREE.PerspectiveCamera(
      70, viewportEl.clientWidth / viewportEl.clientHeight, 1, 10000
    )
    this.camera.position.set(256, 256, 256)
    this.camera.lookAt(0, 0, 0)

    this._setupLights()
    this._setupGrid()

    // ==========================================================
    // ★ 核心改进：极其健壮的虚拟 DOM 事件代理
    // ==========================================================
    this.transformControlsDummy = {
      addEventListener: function(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = []
        this.listeners[type].push(listener)
      },
      removeEventListener: function(type, listener) {
        if (!this.listeners[type]) return
        this.listeners[type] = this.listeners[type].filter(l => l !== listener)
      },
      getBoundingClientRect: () => viewportEl.getBoundingClientRect(),
      style: viewportEl.style,
      listeners: {}
    }

    // 【魔法代码】将自身伪装成 ownerDocument，这样就能截获 TransformControls 绑定的全局拖拽事件
    this.transformControlsDummy.ownerDocument = this.transformControlsDummy
    // 兼容高版本 Three.js 的指针捕获 API
    this.transformControlsDummy.setPointerCapture = () => {}
    this.transformControlsDummy.releasePointerCapture = () => {}

    this.transformControls = new TransformControls(this.camera, this.transformControlsDummy)
    this.transformControls.setSize(0.8)
    this.transformControls.setTranslationSnap(GRID_SIZE)

// 在 init() 中找到这里，替换掉原有的 dragging-changed 和 objectChange
    this.transformControls.addEventListener('dragging-changed', (e) => {
      // 当 e.value 为 false 时，代表鼠标松开，拖拽完成
      if (!e.value) {
        const obj = this.transformControls.object
        if (obj && obj.userData.blockId && this.onBlockMoved) {
          // 此时同步，不仅同步位移，还会把你拉伸后的绝对尺寸同步给核心数据
          const data = this.syncBlockFromMesh(obj.userData.blockId)
          if (data) this.onBlockMoved(obj.userData.blockId, data)
        }
      }
    })
    this.scene.add(this.transformControls)

    this._bindEvents(viewportEl)
    this._animate()
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight('#ffffff', 0.6)
    this.scene.add(ambient)

    const dirLight = new THREE.DirectionalLight('#ffffff', 0.8)
    dirLight.position.set(200, 400, 300)
    dirLight.castShadow = true
    this.scene.add(dirLight)
  }

  _setupGrid() {
    this._rebuildGrids()

    const axisLen = 1024
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: '#ff4444', opacity: 0.3, transparent: true })
    )
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -axisLen, 0), new THREE.Vector3(0, axisLen, 0)
      ]),
      new THREE.LineBasicMaterial({ color: '#44ff44', opacity: 0.3, transparent: true })
    )
    const zAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen)
      ]),
      new THREE.LineBasicMaterial({ color: '#4444ff', opacity: 0.3, transparent: true })
    )
    this.scene.add(xAxis, yAxis, zAxis)
  }

  // ==========================================================
  // ★ 终极分发机制：带“视口锁定”的精确坐标推算
  // ==========================================================
  _dispatchToTransformControls(type, event, viewportEl) {
    if (!this.transformControls || !this._viewportManager) return

    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top

    let viewName = null

    // 1. 【视口锁定】如果正在拖拽，强制使用开始拖拽时的视口，无视鼠标当前滑动到了哪里
    if (this.transformControls.dragging && this._activeDragView) {
      viewName = this._activeDragView
    } else {
      viewName = this._viewportManager.hitTest(canvasX, canvasY)
    }

    if (!viewName) return

    // 2. 维护拖拽状态标志
    if (type === 'pointerdown') this._activeDragView = viewName
    if (type === 'pointerup') this._activeDragView = null

    const vp = this._viewportManager.viewports[viewName]
    const camera = this._viewportManager.getCameraForView(viewName)

    // 3. 非拖拽时实时更新内部相机
    if (!this.transformControls.dragging) {
      this.transformControls.camera = camera
      this._viewportManager.activateView(viewName)
    }

    // 4. 根据当前锁定的视口，计算完美的局部 NDC 坐标
    const localX = canvasX - vp.x
    const localY = canvasY - vp.y
    const ndcX = (localX / vp.w) * 2 - 1
    const ndcY = -(localY / vp.h) * 2 + 1

    // 5. 逆向推算：欺骗 TransformControls 的全局长宽比计算
    const fakeClientX = ((ndcX + 1) / 2) * rect.width + rect.left
    const fakeClientY = ((-ndcY + 1) / 2) * rect.height + rect.top

    const fakeEvent = {
      type: type, // 将真实类型传递过去
      clientX: fakeClientX,
      clientY: fakeClientY,
      button: event.button !== undefined ? event.button : 0,
      pointerId: event.pointerId || 1,
      pointerType: event.pointerType || 'mouse',
      preventDefault: () => { if (event.preventDefault) event.preventDefault() },
      stopPropagation: () => { if (event.stopPropagation) event.stopPropagation() }
    }

    const listeners = this.transformControlsDummy.listeners[type]
    if (listeners) {
      // 使用副本遍历，防止拖拽结束时自身解绑引发的数组越界
      const listenersCopy = [...listeners]
      for (const listener of listenersCopy) {
        listener(fakeEvent)
      }
    }
  }

  // ---- 事件绑定 ----
  _bindEvents(viewportEl) {
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true })
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false })

    viewportEl.addEventListener('pointerdown', (e) => {
      this._dispatchToTransformControls('pointerdown', e, viewportEl)

      if (e.button === 0) this.isLeftDragging = true
      if (e.button === 1) this.isMiddleDragging = true
      if (e.button === 2) this.isRightDragging = true
      this.prevMouse.x = e.clientX
      this.prevMouse.y = e.clientY
    })

    window.addEventListener('pointerup', (e) => {
      this._dispatchToTransformControls('pointerup', e, viewportEl)

      if (e.button === 0) this.isLeftDragging = false
      if (e.button === 1) this.isMiddleDragging = false
      if (e.button === 2) this.isRightDragging = false
    })

    window.addEventListener('pointermove', (e) => {
      this._dispatchToTransformControls('pointermove', e, viewportEl)

      const isDraggingTransform = this.transformControls && this.transformControls.dragging
      const shouldOrbit = this.isRightDragging || (this.isLeftDragging && this.isMiddleDragging) || this.isMiddleDragging

      if (shouldOrbit && !isDraggingTransform) {
        const dx = e.clientX - this.prevMouse.x
        const dy = e.clientY - this.prevMouse.y
        this._orbitCamera(dx, dy)
        this.prevMouse.x = e.clientX
        this.prevMouse.y = e.clientY
      }
    })

    viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault()
      const camera = this._getActiveCamera ? this._getActiveCamera() : this.camera
      if (camera.isOrthographicCamera && this._viewportManager) {
        this._viewportManager.zoomOrthoCamera(camera, e.deltaY)
      } else {
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        camera.position.addScaledVector(forward, -e.deltaY * 50 * 0.01)
      }
    }, { passive: false })

    let clickStart = { x: 0, y: 0 }
    viewportEl.addEventListener('mousedown', (e) => {
      if (e.button === 0) clickStart = { x: e.clientX, y: e.clientY }
    })
    viewportEl.addEventListener('click', (e) => {
      if (e.button !== 0) return
      const dx = e.clientX - clickStart.x
      const dy = e.clientY - clickStart.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return
      this._pickBlock(e, viewportEl)
    })

    window.addEventListener('resize', () => {
      if (!this.renderer || !this.camera) return
      this.camera.aspect = viewportEl.clientWidth / viewportEl.clientHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight)
    })

    viewportEl.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // ---- 下面都是原有逻辑保持不变 ----
  _pickBlock(event, viewportEl) {
    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top

    let camera = this.camera
    this.mouse.x = (canvasX / rect.width) * 2 - 1
    this.mouse.y = -(canvasY / rect.height) * 2 + 1

    if (this._viewportManager) {
      const rayData = this._viewportManager.getRaycasterData(canvasX, canvasY)
      if (rayData) {
        camera = rayData.camera
        this.mouse.copy(rayData.mouseCoords)
      }
    }

    this.raycaster.setFromCamera(this.mouse, camera)
    const meshes = Array.from(this.blockMeshes.values())
    const intersects = this.raycaster.intersectObjects(meshes)

    if (intersects.length > 0) {
      const obj = intersects[0].object
      const blockId = obj.userData.blockId
      this._highlightBlock(blockId)

      this.transformControls.camera = camera
      this.transformControls.attach(obj)
      if (this.onSelectBlock) this.onSelectBlock(blockId)
    } else {
      this._highlightBlock(null)
      this.transformControls.detach()
      if (this.onSelectBlock) this.onSelectBlock(null)
    }
  }

  _highlightBlock(blockId) {
    for (const [id, mesh] of this.blockMeshes) {
      if (id === blockId) {
        mesh.material.emissive?.set('#333333')
      } else {
        mesh.material.emissive?.set('#000000')
      }
    }
  }

// ---- 方块可视化 (支持多种几何体) ----
  _createGeometry(block) {
    const { type, scale } = block
    // 明确映射关系：X=宽, Y=深(长), Z=高
    const width = scale.x
    const depth = scale.y
    const height = scale.z

    const hx = width / 2
    const hy = height / 2
    const hz = depth / 2

    switch (type) {
      case 'cube':
        return new THREE.BoxGeometry(width, height, depth)

      case 'ramp': {
        // 斜坡: 绘制在 XY 平面 (此时 Y 为高度), 向 Z轴 挤压 (深度)
        const shape = new THREE.Shape()
        shape.moveTo(-hx, -hy) // 左下
        shape.lineTo( hx, -hy) // 右下
        shape.lineTo( hx,  hy) // 右上 (直角在这里)
        shape.lineTo(-hx, -hy) // 闭合
        const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false })
        geo.translate(0, 0, -hz) // 将挤压后的几何体居中
        return geo
      }

      case 'stairs': {
        const group = []
        const stepH = height / 4
        const stepD = depth / 4
        for (let i = 0; i < 4; i++) {
          const stepGeo = new THREE.BoxGeometry(width, stepH, stepD)
          stepGeo.translate(0, -height / 2 + stepH * i + stepH / 2, -depth / 2 + stepD * i + stepD / 2)
          group.push(stepGeo)
        }
        return mergeGeometries(group)
      }

      case 'wedge': {
        // 楔形: 尖端居中
        const shape = new THREE.Shape()
        shape.moveTo(-hx, -hy) // 左下
        shape.lineTo( hx, -hy) // 右下
        shape.lineTo( 0,   hy) // 顶部居中
        shape.closePath()
        const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false })
        geo.translate(0, 0, -hz)
        return geo
      }

      case 'cylinder':
        return new THREE.CylinderGeometry(Math.min(width, depth) / 2, Math.min(width, depth) / 2, height, 16)

      case 'plane':
        return new THREE.BoxGeometry(width, 2, depth)

      default:
        return new THREE.BoxGeometry(width, height, depth)
    }
  }

renderBlock(block) {
    const geometry = this._createGeometry(block)
    const originalColor = block.color || '#888888'

    const material = new THREE.MeshStandardMaterial({
      color: originalColor, roughness: 0.7, metalness: 0.1, transparent: true, opacity: 0.9
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(block.position.x, block.position.z, block.position.y)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.blockId = block.id
    mesh.userData.originalColor = originalColor
    mesh.userData.blockType = block.type || 'cube'

    // ★ 新增：将初始物理尺寸存入 userData 中，作为后续拉伸的基准计算值
    mesh.userData.baseScale = { x: block.scale.x, y: block.scale.y, z: block.scale.z }

    if (block.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(block.rotation.x || 0),
        THREE.MathUtils.degToRad(block.rotation.z || 0),
        THREE.MathUtils.degToRad(block.rotation.y || 0)
      )
    }
    this.scene.add(mesh)
    this.blockMeshes.set(block.id, mesh)
  }

updateBlockMesh(id, position, scale, rotation) {
    const mesh = this.blockMeshes.get(id)
    if (!mesh) return
    if (position) mesh.position.set(position.x, position.z, position.y)
    if (scale) {
      mesh.geometry.dispose()
      const blockType = mesh.userData.blockType || 'cube'
      // 重新生成拥有绝对物理尺寸的几何体
      mesh.geometry = this._createGeometry({ type: blockType, scale })

      // ★ 新增：更新基准尺寸，并将网格的缩放倍率归零复位，防止无限变大
      mesh.userData.baseScale = { x: scale.x, y: scale.y, z: scale.z }
      mesh.scale.set(1, 1, 1)
    }
    if (rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(rotation.x || 0),
        THREE.MathUtils.degToRad(rotation.z || 0),
        THREE.MathUtils.degToRad(rotation.y || 0)
      )
    }
  }

syncBlockFromMesh(blockId) {
    const mesh = this.blockMeshes.get(blockId)
    if (!mesh) return null

    const base = mesh.userData.baseScale || { x: 64, y: 64, z: 64 }

    return {
      position: { x: mesh.position.x, y: mesh.position.z, z: mesh.position.y },
      rotation: {
        x: THREE.MathUtils.radToDeg(mesh.rotation.x),
        y: THREE.MathUtils.radToDeg(mesh.rotation.z),
        z: THREE.MathUtils.radToDeg(mesh.rotation.y)
      },
      // ★ 新增：将 相对拉伸率 * 基准尺寸 还原为绝对尺寸，输出给导出器！
      scale: {
        x: Math.round(base.x * mesh.scale.x),
        y: Math.round(base.y * mesh.scale.y),
        z: Math.round(base.z * mesh.scale.z)
      }
    }
  }

  removeBlockMesh(id) {
    const mesh = this.blockMeshes.get(id)
    if (!mesh) return
    this.scene.remove(mesh)
    mesh.geometry.dispose()
    mesh.material.dispose()
    this.blockMeshes.delete(id)
    this.transformControls.detach()
  }

  setBlockLocked(blockId, locked) {
    const mesh = this.blockMeshes.get(blockId)
    if (!mesh) return
    if (locked) {
      mesh.material.color.set('#555555'); mesh.material.opacity = 0.5
    } else {
      mesh.material.color.set(mesh.userData.originalColor || '#888888'); mesh.material.opacity = 0.9
    }
  }

  updateCursor(userId, userName, position) {
    let cursor = this.cursors.get(userId)
    if (!cursor) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(6, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff4444' })
      )
      sphere.position.set(position.x, position.z, position.y)
      this.scene.add(sphere)
      this.cursors.set(userId, sphere)
    } else {
      cursor.position.set(position.x, position.z, position.y)
    }
  }

  removeCursor(userId) {
    const cursor = this.cursors.get(userId)
    if (cursor) {
      this.scene.remove(cursor); this.cursors.delete(userId)
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate())
    this._updateCamera()
    if (this._onRender) this._onRender()
    else this.renderer.render(this.scene, this.camera)
  }

  setRenderCallback(callback) { this._onRender = callback }

// 右键/中键/左+右键 第一人称视角旋转 (无视视口边界，丝滑拖拽)
  _orbitCamera(dx, dy) {
    // 强制锁定主透视相机，不再受鼠标滑过其他正交视图的干扰
    const camera = this.camera
    if (!camera || !camera.isPerspectiveCamera) return

    const sensitivity = 0.003
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    euler.setFromQuaternion(camera.quaternion)

    euler.y -= dx * sensitivity
    euler.x -= dy * sensitivity

    const PI_2 = Math.PI / 2 - 0.01
    euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x))

    camera.quaternion.setFromEuler(euler)
  }

  _updateCamera() {
    const camera = this._getActiveCamera ? this._getActiveCamera() : this.camera
    if (!camera.isPerspectiveCamera) return

    const speed = this.moveSpeed * 0.016
    const dir = new THREE.Vector3()
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0; forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    if (this.keys['w']) dir.add(forward)
    if (this.keys['s']) dir.add(forward.clone().negate())
    if (this.keys['a']) dir.add(right.clone().negate())
    if (this.keys['d']) dir.add(right)
    if (this.keys['q']) dir.y -= 1
    if (this.keys['e']) dir.y += 1

    if (dir.length() > 0) {
      dir.normalize().multiplyScalar(speed)
      camera.position.add(dir)
    }
  }
}