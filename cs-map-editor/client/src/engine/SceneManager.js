// ============================================================
// SceneManager — Three.js 场景管理器
// 职责: 初始化3D场景、摄像机、光照、网格吸附、鼠标交互
// ============================================================

import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
// ★ 新增：引入凸包几何体生成器
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

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
    this.moveSpeed = 1500 // ★ 默认速度从 300 提升到 1500，走得更快
    this.lookSpeed = 0.002
    this.lookSensitivity = 0.003 // 鼠标灵敏度
    this.isRightDragging = false
    this.isLeftDragging = false
    this.isMiddleDragging = false
    this.prevMouse = { x: 0, y: 0 }
    this.currentGridSize = GRID_SIZE
    this.isSnapEnabled = true
    this._getActiveCamera = null
    this._viewportManager = null

    // ★ 新增：用于记录拖拽起始所在的视口，防止跨视图拖拽断裂
    this._activeDragView = null
  }

  setActiveCameraFn(fn) { this._getActiveCamera = fn }
  setViewportManager(vm) { this._viewportManager = vm }

  setSnapEnabled(enabled) {
    this.isSnapEnabled = enabled
    if (this.transformControls) {
      this.transformControls.setTranslationSnap(enabled ? this.currentGridSize : null)
    }
  }

  updateGridSize(newSize) {
    this.currentGridSize = Math.max(1, Math.min(256, newSize))
    // ★ 只有在吸附开启时，才把网格大小喂给移动轴组件
    if (this.transformControls && this.isSnapEnabled) {
      this.transformControls.setTranslationSnap(this.currentGridSize)
    }
    this._rebuildGrids()
  }

// ---- 优化：创建不遮挡模型、覆盖全图的网格 ----
  _createGridHelper(color1 = '#333355', color2 = '#222244') {
    // 1. 设置巨大的固定范围。CS 1.6 的最大地图边界为 8192，所以 16384 可以完美覆盖整个世界
    const range = 16384
    const divisions = Math.floor(range / this.currentGridSize)
    const grid = new THREE.GridHelper(range, divisions, color1, color2)

    // 2. 材质优化：解决网格遮挡方块的问题
    grid.material.transparent = true
    grid.material.opacity = 0.35     // 调低透明度，让它变成较暗的辅助线
    grid.material.depthWrite = false // ★ 核心：关闭深度写入，这意味着网格永远不会在物理上“挡住”后面的方块

    return grid
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

  // ==========================================================
  // ★ 计算地图边界，并让所有摄像机自动聚焦过去
  // ==========================================================
  focusOnMap(blocks) {
    if (!blocks || blocks.length === 0) return

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    // 计算包含所有方块的超级包围盒
    for (const b of blocks) {
      const hx = (b.scale.x || 64) / 2
      const hy = (b.scale.y || 64) / 2
      const hz = (b.scale.z || 64) / 2

      if (b.position.x - hx < minX) minX = b.position.x - hx
      if (b.position.x + hx > maxX) maxX = b.position.x + hx
      // 注意：Three.js 中 Z是深度，Y是高度
      if (b.position.z - hz < minZ) minZ = b.position.z - hz
      if (b.position.z + hz > maxZ) maxZ = b.position.z + hz
      if (b.position.y - hy < minY) minY = b.position.y - hy
      if (b.position.y + hy > maxY) maxY = b.position.y + hy
    }

    // 地图物理中心点
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2

    // 找出地图最大的跨度
    const sizeX = maxX - minX
    const sizeY = maxY - minY
    const sizeZ = maxZ - minZ
    const maxDim = Math.max(sizeX, sizeY, sizeZ, 1000) // 最小视野保证 1000

    // 1. 瞬移透视相机 (放在斜上方 45 度角)
    if (this.camera) {
      this.camera.position.set(centerX + maxDim * 0.8, centerY + maxDim * 0.8, centerZ + maxDim * 0.8)
      // 强制重置透视相机的角度，让它看向中心
      this.camera.lookAt(centerX, centerY, centerZ)
    }

    // 2. 指挥三视图正交相机聚焦
    if (this._viewportManager) {
      this._viewportManager.focusOnMap(centerX, centerY, centerZ, maxDim)
    }

    // 3. 把移动控制器的中心也吸附过去，防止操作错乱
    if (this.transformControls) {
      // 这里的 detach 是为了重置内部状态
      const attachedObj = this.transformControls.object
      this.transformControls.detach()
      if (attachedObj) this.transformControls.attach(attachedObj)
    }
  }

  init(canvas, viewportEl) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight)
    this.renderer.shadowMap.enabled = true

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#1a1a2e')

    this.camera = new THREE.PerspectiveCamera(
      70, viewportEl.clientWidth / viewportEl.clientHeight, 1, 60000 // ★ 增加视野范围
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

  // ---- 参考网格与坐标轴 ----
  _setupGrid() {
    this._rebuildGrids()

    // 让红绿蓝三根中心坐标轴也贯穿整个世界
    const axisLen = 8192

    // 给坐标轴也加上 depthWrite: false，防止遮挡中心点的细小方块
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: '#ff4444', opacity: 0.4, transparent: true, depthWrite: false })
    )
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -axisLen, 0), new THREE.Vector3(0, axisLen, 0)
      ]),
      new THREE.LineBasicMaterial({ color: '#44ff44', opacity: 0.4, transparent: true, depthWrite: false })
    )
    const zAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen)
      ]),
      new THREE.LineBasicMaterial({ color: '#4444ff', opacity: 0.4, transparent: true, depthWrite: false })
    )
    this.scene.add(xAxis, yAxis, zAxis)

    // 注意：xAxis, yAxis, zAxis 没有被加入 this.gridHelpers 数组
    // 这恰好帮助我们实现了“自由视角隐藏网格，但保留坐标轴”的需求！
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
    window.addEventListener('keydown', (e) => {
      // 忽略输入框，防止打字时移动方块
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return

      this.keys[e.key.toLowerCase()] = true

      // ★ 核心拦截：方向键用于精准微调已选中的方块
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.transformControls && this.transformControls.object) {
          e.preventDefault() // 防止页面自带的上下滚动
          this._nudgeSelectedBlock(e.key)
        }
      }
    })
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

// 滚轮缩放 (支持向鼠标中心精准缩放)
    viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault()

      const rect = viewportEl.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top

      let targetCamera = this.camera
      let ndcX = 0, ndcY = 0

      if (this._viewportManager) {
        const rayData = this._viewportManager.getRaycasterData(canvasX, canvasY)
        if (rayData) {
          // ★ 核心修复：永远缩放鼠标【当前悬停】的那个视图！
          targetCamera = rayData.camera
          ndcX = rayData.mouseCoords.x
          ndcY = rayData.mouseCoords.y

          // 顺手将其设为激活视图，这样滚轮缩放后直接按 WASD 就能无缝平移了
          this._viewportManager.activateView(rayData.viewName)
        } else if (this._getActiveCamera) {
          targetCamera = this._getActiveCamera()
        }
      }

      // 如果目标是三视图的正交相机
      if (targetCamera && targetCamera.isOrthographicCamera && this._viewportManager) {
        this._viewportManager.zoomOrthoCamera(targetCamera, e.deltaY, ndcX, ndcY)
      }
      // 如果目标是自由视角的透视相机
      else if (targetCamera) {
        const forward = new THREE.Vector3()
        targetCamera.getWorldDirection(forward)
        targetCamera.position.addScaledVector(forward, -e.deltaY * 50 * 0.01)
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

    // ★ 核心修复 1：把方块的“全部基因”存在 mesh.userData 里，死死记住！
    mesh.userData.blockId = block.id
    mesh.userData.originalColor = originalColor
    mesh.userData.blockType = block.type || 'cube'
    mesh.userData.texture = block.texture || 'AAATRIGGER'
    // ★ 漏掉的在这里：必须保留自定义顶点，否则异形图形刷新后变回正方体！
    mesh.userData.vertices = block.vertices || null

    mesh.userData.baseScale = { x: block.scale.x, y: block.scale.y, z: block.scale.z }

    if (block.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(block.rotation.x || 0),
        THREE.MathUtils.degToRad(block.rotation.z || 0),
        THREE.MathUtils.degToRad(block.rotation.y || 0)
      )
    }

    // ★ 新增：创建 2D 视图专用的中心十字星 (X)
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-16, 0, 0), new THREE.Vector3(16, 0, 0),
      new THREE.Vector3(0, -16, 0), new THREE.Vector3(0, 16, 0),
      new THREE.Vector3(0, 0, -16), new THREE.Vector3(0, 0, 16)
    ])
    // 材质设为亮青色，关闭深度测试以保证穿透可见
    const crossMat = new THREE.LineBasicMaterial({ color: '#00ffff', depthTest: false })
    const crossMarker = new THREE.LineSegments(crossGeo, crossMat)
    crossMarker.renderOrder = 999 // 保证在最上层
    crossMarker.visible = false   // 默认在 3D 视图中隐藏

    mesh.add(crossMarker)
    mesh.userData.centerMarker = crossMarker // 存入基因

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
      // ★ 核心修复 2：重建时，把保存的顶点原封不动地喂进去
      const vertices = mesh.userData.vertices

      mesh.geometry = this._createGeometry({ type: blockType, scale, vertices })

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

    // ★ 体验神级优化：如果异形方块被拉伸了，我们将拉伸永久“烙印”到内存的顶点坐标里！
    // 这样导出的 .map 将完美拥有缩放后的全新体积！
    let newVertices = mesh.userData.vertices
    if (newVertices && (mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1)) {
      newVertices = newVertices.map(v => ({
        x: v.x * mesh.scale.x,
        y: v.y * mesh.scale.y, // Web Y 对应 Three 的 Y
        z: v.z * mesh.scale.z  // Web Z 对应 Three 的 Z
      }))
      mesh.userData.vertices = newVertices // 永久更新内存里的顶点
    }

    // ★ 核心修复 3：同步时必须把所有属性原封不动发给服务器 (特别是 type 和 vertices)
    return {
      id: blockId,
      type: mesh.userData.blockType,
      color: mesh.userData.originalColor,
      texture: mesh.userData.texture,
      vertices: newVertices, // ★ 发送顶点数据！
      position: { x: mesh.position.x, y: mesh.position.z, z: mesh.position.y },
      rotation: {
        x: THREE.MathUtils.radToDeg(mesh.rotation.x),
        y: THREE.MathUtils.radToDeg(mesh.rotation.z),
        z: THREE.MathUtils.radToDeg(mesh.rotation.y)
      },
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

  // ==========================================================
  // ★ 2D线框与3D实体 智能切换引擎
  // ==========================================================
  setRenderMode(mode) {
    const isWireframe = (mode === 'wireframe')

    for (const [id, mesh] of this.blockMeshes) {
      // 切换线框状态
      mesh.material.wireframe = isWireframe
      mesh.material.transparent = !isWireframe
      mesh.material.opacity = isWireframe ? 1.0 : 0.9

      // 线框模式下，使用高亮青色；实体模式下，恢复原有颜色
      const isLocked = mesh.material.opacity === 0.5 // 互斥锁检测
      if (isWireframe) {
        mesh.material.color.set('#4a9eff')
      } else {
        mesh.material.color.set(isLocked ? '#555555' : (mesh.userData.originalColor || '#888888'))
      }

      // 切换中心十字星的显示
      if (mesh.userData.centerMarker) {
        mesh.userData.centerMarker.visible = isWireframe
      }
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

    // ★ 使用可配置的灵敏度
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    euler.setFromQuaternion(camera.quaternion)

    euler.y -= dx * this.lookSensitivity
    euler.x -= dy * this.lookSensitivity

    const PI_2 = Math.PI / 2 - 0.01
    euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x))

    camera.quaternion.setFromEuler(euler)
  }

_updateCamera() {
    const camera = this._getActiveCamera ? this._getActiveCamera() : this.camera
    if (!camera) return

    const speed = this.moveSpeed * 0.016

    // 1. 第一人称飞行视角 (透视相机)
    if (camera.isPerspectiveCamera) {
      const dir = new THREE.Vector3()
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

      // ★ 移除了所有的 arrowup/down 等，只保留 WASD + QE
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
    // 2. 正交视图平面平移 (三视图专属)
    else if (camera.isOrthographicCamera) {
      let dx = 0
      let dy = 0

      // ★ 移除了所有的 arrowup/down 等
      if (this.keys['w']) dy += 1
      if (this.keys['s']) dy -= 1
      if (this.keys['a']) dx -= 1
      if (this.keys['d']) dx += 1

      if (dx !== 0 || dy !== 0) {
        const orthoWidth = camera.right - camera.left
        const panSpeed = (orthoWidth / 1000) * (speed * 1.5)
        camera.translateX(dx * panSpeed)
        camera.translateY(dy * panSpeed)
      }
    }
  }

  // ==========================================================
  // ★ 视口感知的方块微调算法 (Nudging)
  // ==========================================================
  _nudgeSelectedBlock(key) {
    const obj = this.transformControls.object
    if (!obj || !obj.userData.blockId) return

    // 计算单次移动步长
    const step = this.isSnapEnabled ? this.currentGridSize : 1
    let dx = 0, dy = 0, dz = 0

    // 判断用户当前目光落在哪一个视图里
    let view = 'top'
    if (this._viewportManager) {
      view = this._viewportManager.viewMode === 'quad'
        ? this._viewportManager.activeQuadView
        : this._viewportManager.viewMode
    }

    // 根据视口朝向，完美映射方向键的空间物理意义
    // 提示: Three.js 中 X=左右, Y=上下(高度), Z=前后(深度)
    if (view === 'top' || view === 'perspective') {
      // 顶视图向下看，映射到 XZ 平面
      if (key === 'ArrowUp') dz = -step
      if (key === 'ArrowDown') dz = step
      if (key === 'ArrowLeft') dx = -step
      if (key === 'ArrowRight') dx = step
    }
    else if (view === 'front') {
      // 前视图向前看，映射到 XY 平面
      if (key === 'ArrowUp') dy = step
      if (key === 'ArrowDown') dy = -step
      if (key === 'ArrowLeft') dx = -step
      if (key === 'ArrowRight') dx = step
    }
    else if (view === 'side') {
      // 侧视图向左看 (沿着X轴负方向)，映射到 ZY 平面
      if (key === 'ArrowUp') dy = step
      if (key === 'ArrowDown') dy = -step
      if (key === 'ArrowLeft') dz = step
      if (key === 'ArrowRight') dz = -step
    }

    // 实施移动
    obj.position.x += dx
    obj.position.y += dy
    obj.position.z += dz

    // 触发全局同步事件
    if (this.onBlockMoved) {
      const data = this.syncBlockFromMesh(obj.userData.blockId)
      if (data) this.onBlockMoved(obj.userData.blockId, data)
    }
  }
}