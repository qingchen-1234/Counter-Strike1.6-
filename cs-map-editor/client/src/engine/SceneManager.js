// ============================================================
// SceneManager — Three.js 场景管理器 (专业级渲染 & 拖拽缩放)
// ============================================================

import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

const GRID_SIZE = 16

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

    this.moveSpeed = 1500
    this.lookSensitivity = 0.003

    this.isRightDragging = false
    this.isLeftDragging = false
    this.isMiddleDragging = false
    this.prevMouse = { x: 0, y: 0 }

    this.currentGridSize = GRID_SIZE
    this.isSnapEnabled = true
    this._getActiveCamera = null
    this._viewportManager = null
    this._activeDragView = null

    // ★ 新增：选中状态与缩放拖拽系统
    this.selectedBlockId = null
    this.resizeGizmo = null
    this.resizeHandles = null
    this.isResizing = false
    this.activeResizeHandle = null
    this.dragPlane = new THREE.Plane()
    this.dragStartLocal = new THREE.Vector3()
    this.resizeStartScale = new THREE.Vector3()
    this.resizeStartPos = new THREE.Vector3()
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
    if (this.transformControls && this.isSnapEnabled) {
      this.transformControls.setTranslationSnap(this.currentGridSize)
    }
    this._rebuildGrids()
  }

  _rebuildGrids() {
    for (const g of this.gridHelpers) {
      this.scene.remove(g); g.geometry.dispose(); g.material.dispose()
    }
    this.gridHelpers = []

    const range = 16384
    const buildGridLayer = (size, color, isMajor) => {
      const divisions = Math.floor(range / size)
      const grid = new THREE.GridHelper(range, divisions, color, color)
      grid.material.transparent = true
      grid.material.opacity = isMajor ? 0.5 : 0.2
      grid.material.depthWrite = false
      grid.renderOrder = -1
      return grid
    }

    this.gridXZ_minor = buildGridLayer(this.currentGridSize, '#333344', false)
    this.gridXZ_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true)
    this.scene.add(this.gridXZ_minor, this.gridXZ_major)
    this.gridHelpers.push(this.gridXZ_minor, this.gridXZ_major)

    this.gridXY_minor = buildGridLayer(this.currentGridSize, '#333344', false); this.gridXY_minor.rotation.x = -Math.PI / 2
    this.gridXY_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true); this.gridXY_major.rotation.x = -Math.PI / 2
    this.scene.add(this.gridXY_minor, this.gridXY_major)
    this.gridHelpers.push(this.gridXY_minor, this.gridXY_major)

    this.gridYZ_minor = buildGridLayer(this.currentGridSize, '#333344', false); this.gridYZ_minor.rotation.z = Math.PI / 2
    this.gridYZ_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true); this.gridYZ_major.rotation.z = Math.PI / 2
    this.scene.add(this.gridYZ_minor, this.gridYZ_major)
    this.gridHelpers.push(this.gridYZ_minor, this.gridYZ_major)
  }

  clearAllBlocks() {
    for (const [id, mesh] of this.blockMeshes) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    this.blockMeshes.clear()
    this.transformControls.detach()
    this.selectedBlockId = null
    this._updateResizeGizmo(null)
  }

  focusOnMap(blocks) {
    if (!blocks || blocks.length === 0) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (const b of blocks) {
      const hx = (b.scale.x || 64) / 2
      const hy = (b.scale.y || 64) / 2
      const hz = (b.scale.z || 64) / 2
      if (b.position.x - hx < minX) minX = b.position.x - hx
      if (b.position.x + hx > maxX) maxX = b.position.x + hx
      if (b.position.z - hz < minZ) minZ = b.position.z - hz
      if (b.position.z + hz > maxZ) maxZ = b.position.z + hz
      if (b.position.y - hy < minY) minY = b.position.y - hy
      if (b.position.y + hy > maxY) maxY = b.position.y + hy
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1000)

    if (this.camera) {
      this.camera.position.set(centerX + maxDim * 0.8, centerY + maxDim * 0.8, centerZ + maxDim * 0.8)
      this.camera.lookAt(centerX, centerY, centerZ)
    }

    if (this._viewportManager) {
      this._viewportManager.focusOnMap(centerX, centerY, centerZ, maxDim)
    }

    if (this.transformControls) {
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
    this.camera = new THREE.PerspectiveCamera(70, viewportEl.clientWidth / viewportEl.clientHeight, 1, 60000)

    this._setupLights()
    this._setupGrid()
    this._createResizeGizmo() // ★ 初始化缩放控制器

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
      listeners: {},
      ownerDocument: this,
      setPointerCapture: () => {},
      releasePointerCapture: () => {}
    }
    this.transformControlsDummy.ownerDocument = this.transformControlsDummy

    this.transformControls = new TransformControls(this.camera, this.transformControlsDummy)
    this.transformControls.setSize(0.8)
    this.transformControls.setTranslationSnap(GRID_SIZE)

    this.transformControls.addEventListener('dragging-changed', (e) => {
      if (!e.value) {
        const obj = this.transformControls.object
        if (obj && obj.userData.blockId && this.onBlockMoved) {
          const data = this.syncBlockFromMesh(obj.userData.blockId)
          if (data) this.onBlockMoved(obj.userData.blockId, data)
        }
        this._updateResizeGizmo(this.selectedBlockId) // 更新包围盒
      } else {
        this._updateResizeGizmo(null) // 拖拽时隐藏包围盒
      }
    })
    this.scene.add(this.transformControls)

    this._bindEvents(viewportEl)
    this._animate()
  }

  // ==========================================================
  // ★ 1D 单向自由缩放拖拽柄 (J.A.C.K 样式)
  // ==========================================================
  _createResizeGizmo() {
    this.resizeGizmo = new THREE.Group()
    this.resizeGizmo.visible = false
    this.scene.add(this.resizeGizmo)

    // 创建 6 个面的黄色拖拽方块
    this.resizeHandles = new THREE.Group()
    this.resizeGizmo.add(this.resizeHandles)

    const handleMat = new THREE.MeshBasicMaterial({ color: '#ffcc00', depthTest: false })
    const createHandle = (name) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), handleMat)
      mesh.name = name
      mesh.renderOrder = 1002 // 永远在最上层
      this.resizeHandles.add(mesh)
      return mesh
    }

    this.handlePX = createHandle('px')
    this.handleNX = createHandle('nx')
    this.handlePY = createHandle('py')
    this.handleNY = createHandle('ny')
    this.handlePZ = createHandle('pz')
    this.handleNZ = createHandle('nz')
  }

  _updateResizeGizmo(blockId) {
    if (!blockId || !this.blockMeshes.has(blockId)) {
      this.resizeGizmo.visible = false
      return
    }
    const mesh = this.blockMeshes.get(blockId)
    this.resizeGizmo.visible = true
    this.resizeGizmo.position.copy(mesh.position)
    this.resizeGizmo.quaternion.copy(mesh.quaternion)

    const w = mesh.userData.baseScale.x * mesh.scale.x
    const d = mesh.userData.baseScale.y * mesh.scale.y
    const h = mesh.userData.baseScale.z * mesh.scale.z

    // 把柄放到 6 个面的正中心
    this.handlePX.position.set(w/2, 0, 0)
    this.handleNX.position.set(-w/2, 0, 0)
    this.handlePY.position.set(0, h/2, 0)
    this.handleNY.position.set(0, -h/2, 0)
    this.handlePZ.position.set(0, 0, d/2)
    this.handleNZ.position.set(0, 0, -d/2)
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
    const axisLen = 8192
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0)]),
      new THREE.LineBasicMaterial({ color: '#ff4444', opacity: 0.4, transparent: true, depthWrite: false })
    )
    const yAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -axisLen, 0), new THREE.Vector3(0, axisLen, 0)]),
      new THREE.LineBasicMaterial({ color: '#44ff44', opacity: 0.4, transparent: true, depthWrite: false })
    )
    const zAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen)]),
      new THREE.LineBasicMaterial({ color: '#4444ff', opacity: 0.4, transparent: true, depthWrite: false })
    )
    this.scene.add(xAxis, yAxis, zAxis)
  }

  _dispatchToTransformControls(type, event, viewportEl) {
    if (!this.transformControls || !this._viewportManager) return

    const rect = viewportEl.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top

    let viewName = null
    if (this.transformControls.dragging && this._activeDragView) {
      viewName = this._activeDragView
    } else {
      viewName = this._viewportManager.hitTest(canvasX, canvasY)
    }
    if (!viewName) return

    if (type === 'pointerdown') this._activeDragView = viewName
    if (type === 'pointerup') this._activeDragView = null

    const vp = this._viewportManager.viewports[viewName]
    const camera = this._viewportManager.getCameraForView(viewName)

    if (!this.transformControls.dragging) {
      this.transformControls.camera = camera
      this._viewportManager.activateView(viewName)
    }

    const localX = canvasX - vp.x
    const localY = canvasY - vp.y
    const ndcX = (localX / vp.w) * 2 - 1
    const ndcY = -(localY / vp.h) * 2 + 1

    const fakeClientX = ((ndcX + 1) / 2) * rect.width + rect.left
    const fakeClientY = ((-ndcY + 1) / 2) * rect.height + rect.top

    const fakeEvent = {
      type: type,
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
      const listenersCopy = [...listeners]
      for (const listener of listenersCopy) listener(fakeEvent)
    }
  }

  // ==========================================================
  // ★ 事件绑定 (包含拖拽柄的拦截逻辑)
  // ==========================================================
  _bindEvents(viewportEl) {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      this.keys[e.key.toLowerCase()] = true
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.transformControls && this.transformControls.object) {
          e.preventDefault()
          this._nudgeSelectedBlock(e.key)
        }
      }
    })
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false })

    viewportEl.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.isLeftDragging = true
      if (e.button === 1) this.isMiddleDragging = true
      if (e.button === 2) this.isRightDragging = true
      this.prevMouse.x = e.clientX; this.prevMouse.y = e.clientY

      // ★ 拦截缩放柄拖拽
      if (e.button === 0 && this.resizeGizmo.visible) {
        const rect = viewportEl.getBoundingClientRect()
        const rayData = this._viewportManager.getRaycasterData(e.clientX - rect.left, e.clientY - rect.top)

        if (rayData) {
          // 放宽射线的检测范围，让细小的柄更容易被点中
          this.raycaster.params.Line.threshold = 10
          this.raycaster.setFromCamera(rayData.mouseCoords, rayData.camera)

          const hits = this.raycaster.intersectObjects(this.resizeHandles.children, false)
          if (hits.length > 0) {
            this.isResizing = true
            this.activeResizeHandle = hits[0].object.name
            const targetMesh = this.blockMeshes.get(this.selectedBlockId)

            this.resizeStartScale.copy(targetMesh.scale)
            this.resizeStartPos.copy(targetMesh.position)

            // 创建一个面向相机的虚拟平面，用于映射鼠标拖拽距离
            const planeNormal = new THREE.Vector3().copy(rayData.camera.position).sub(targetMesh.position).normalize()
            this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, targetMesh.position)

            const intersect = new THREE.Vector3()
            this.raycaster.ray.intersectPlane(this.dragPlane, intersect)
            // 记录本地坐标系下的起始拖拽点
            this.dragStartLocal.copy(targetMesh.worldToLocal(intersect))

            this.transformControls.detach() // 隐藏移动轴
            return // 拦截，不传递给 TransformControls
          }
        }
      }

      this._dispatchToTransformControls('pointerdown', e, viewportEl)
    })

    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.isLeftDragging = false
      if (e.button === 1) this.isMiddleDragging = false
      if (e.button === 2) this.isRightDragging = false

      // ★ 结束拖拽
      if (this.isResizing) {
        this.isResizing = false
        const targetMesh = this.blockMeshes.get(this.selectedBlockId)
        if (targetMesh) {
          this.transformControls.attach(targetMesh)
          if (this.onBlockMoved) {
            const data = this.syncBlockFromMesh(this.selectedBlockId)
            if (data) this.onBlockMoved(this.selectedBlockId, data)
          }
        }
        return
      }

      this._dispatchToTransformControls('pointerup', e, viewportEl)
    })

    window.addEventListener('pointermove', (e) => {
      // ★ 处理 1D 面拖拽逻辑
      if (this.isResizing && this.selectedBlockId) {
        const rect = viewportEl.getBoundingClientRect()
        const rayData = this._viewportManager.getRaycasterData(e.clientX - rect.left, e.clientY - rect.top)

        if (rayData) {
          this.raycaster.setFromCamera(rayData.mouseCoords, rayData.camera)
          const intersect = new THREE.Vector3()
          if (this.raycaster.ray.intersectPlane(this.dragPlane, intersect)) {
            const targetMesh = this.blockMeshes.get(this.selectedBlockId)
            const localMouse = targetMesh.worldToLocal(intersect)

            let axis = 'x', dir = 1
            if (this.activeResizeHandle.includes('x')) { axis = 'x'; dir = this.activeResizeHandle.includes('p') ? 1 : -1 }
            else if (this.activeResizeHandle.includes('y')) { axis = 'y'; dir = this.activeResizeHandle.includes('p') ? 1 : -1 }
            else if (this.activeResizeHandle.includes('z')) { axis = 'z'; dir = this.activeResizeHandle.includes('p') ? 1 : -1 }

            let localDelta = (localMouse[axis] - this.dragStartLocal[axis]) * dir

            // ★ 应用网格吸附
            if (this.isSnapEnabled) {
              localDelta = Math.round(localDelta / this.currentGridSize) * this.currentGridSize
            }

            const baseLength = targetMesh.userData.baseScale[axis] * this.resizeStartScale[axis]
            const newLength = baseLength + localDelta

            // 防止缩成负数或太小
            if (newLength >= Math.max(1, this.currentGridSize)) {
              // 1. 改变该轴的缩放比例
              targetMesh.scale[axis] = newLength / targetMesh.userData.baseScale[axis]

              // 2. 将方块的中心点向拉伸的方向移动一半，实现“固定对侧”的效果
              const localShift = new THREE.Vector3()
              localShift[axis] = (localDelta / 2) * dir
              const worldShift = localShift.applyQuaternion(targetMesh.quaternion)

              targetMesh.position.copy(this.resizeStartPos).add(worldShift)

              // 3. 实时更新拖拽柄的位置
              this._updateResizeGizmo(this.selectedBlockId)
            }
          }
        }
        return // 拦截
      }

      this._dispatchToTransformControls('pointermove', e, viewportEl)

      const isDraggingTransform = this.transformControls && this.transformControls.dragging
      const shouldOrbit = this.isRightDragging || (this.isLeftDragging && this.isMiddleDragging) || this.isMiddleDragging

      if (shouldOrbit && !isDraggingTransform) {
        this._orbitCamera(e.clientX - this.prevMouse.x, e.clientY - this.prevMouse.y)
        this.prevMouse.x = e.clientX; this.prevMouse.y = e.clientY
      }
    })

    viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = viewportEl.getBoundingClientRect()
      const rayData = this._viewportManager.getRaycasterData(e.clientX - rect.left, e.clientY - rect.top)

      let targetCamera = this.camera
      let ndcX = 0, ndcY = 0

      if (rayData) {
        targetCamera = rayData.camera
        ndcX = rayData.mouseCoords.x; ndcY = rayData.mouseCoords.y
        this._viewportManager.activateView(rayData.viewName)
      }

      if (targetCamera && targetCamera.isOrthographicCamera) {
        this._viewportManager.zoomOrthoCamera(targetCamera, e.deltaY, ndcX, ndcY)
      } else if (targetCamera) {
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
      if (Math.abs(e.clientX - clickStart.x) > 5 || Math.abs(e.clientY - clickStart.y) > 5) return
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

  // ==========================================================
  // ★ 双轨射线拾取 (解决遮挡，精准点选线条与X)
  // ==========================================================
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
    let intersects = []

    if (camera.isOrthographicCamera) {
      // 2D 视图下：放大线条点击宽容度，且只检测线条和十字星，完全无视面墙！
      this.raycaster.params.Line.threshold = (camera.right - camera.left) / 100

      const pickables = []
      for (const mesh of this.blockMeshes.values()) {
        if (mesh.userData.edges) pickables.push(mesh.userData.edges)
        if (mesh.userData.centerMarker) pickables.push(mesh.userData.centerMarker)
      }
      intersects = this.raycaster.intersectObjects(pickables, false)
    } else {
      // 3D 视图下：正常检测实体方块
      const meshes = Array.from(this.blockMeshes.values())
      intersects = this.raycaster.intersectObjects(meshes, false)
    }

    if (intersects.length > 0) {
      let obj = intersects[0].object
      if (obj.parent && obj.parent.userData && obj.parent.userData.blockId) {
        obj = obj.parent // 如果点中的是线条/X，向上找实体
      }

      this.selectedBlockId = obj.userData.blockId
      this._highlightBlock(this.selectedBlockId)

      this.transformControls.camera = camera
      this.transformControls.attach(obj)
      if (this.onSelectBlock) this.onSelectBlock(this.selectedBlockId)
    } else {
      // 点击空白处，取消选中
      this.selectedBlockId = null
      this._highlightBlock(null)
      this.transformControls.detach()
      if (this.onSelectBlock) this.onSelectBlock(null)
    }
  }

  // ==========================================================
  // ★ 渲染模式切换 (解决外框线问题)
  // ==========================================================
  setRenderMode(mode) {
    const isWireframe = (mode === 'wireframe')

    for (const [id, mesh] of this.blockMeshes) {
      // 2D 模式下，直接隐藏实体墙面，绝不遮挡！
      mesh.material.visible = !isWireframe

      if (mesh.userData.edges) mesh.userData.edges.visible = isWireframe
      if (mesh.userData.centerMarker) mesh.userData.centerMarker.visible = isWireframe
    }
  }

  // ==========================================================
  // ★ 高亮与图层覆盖 (选中的方块浮于最顶层)
  // ==========================================================
  _highlightBlock(blockId) {
    for (const [id, mesh] of this.blockMeshes) {
      if (id === blockId) {
        mesh.material.emissive?.set('#333333')
        if (mesh.userData.edges) {
          mesh.userData.edges.material.color.set('#ffffff')
          mesh.userData.edges.renderOrder = 1000 // ★ 选中浮顶
        }
        if (mesh.userData.centerMarker) {
          mesh.userData.centerMarker.material.color.set('#ffffff')
          mesh.userData.centerMarker.renderOrder = 1000 // ★ 选中浮顶
        }
      } else {
        mesh.material.emissive?.set('#000000')
        if (mesh.userData.edges) {
          mesh.userData.edges.material.color.set('#4a9eff')
          mesh.userData.edges.renderOrder = 998 // ★ 未选中沉底
        }
        if (mesh.userData.centerMarker) {
          mesh.userData.centerMarker.material.color.set('#00ffff')
          mesh.userData.centerMarker.renderOrder = 998
        }
      }
    }
    this._updateResizeGizmo(blockId) // 刷新拖拽柄
  }

  _createGeometry(block) {
    const { type, scale, vertices } = block
    const width = scale.x; const depth = scale.y; const height = scale.z
    const hx = width / 2; const hy = height / 2; const hz = depth / 2

    if (type === 'custom' && vertices && vertices.length >= 4) {
      try {
        const points = vertices.map(v => new THREE.Vector3(v.x, v.y, v.z))
        return new ConvexGeometry(points)
      } catch (err) {
        console.warn(`[降级] 方块 ${block.id} 无法生成复杂凸包，已降级为长方体。`)
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
    mesh.castShadow = true; mesh.receiveShadow = true

    mesh.userData.blockId = block.id
    mesh.userData.originalColor = originalColor
    mesh.userData.blockType = block.type || 'cube'
    mesh.userData.texture = block.texture || 'AAATRIGGER'
    mesh.userData.vertices = block.vertices || null
    mesh.userData.baseScale = { x: block.scale.x, y: block.scale.y, z: block.scale.z }

    if (block.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(block.rotation.x || 0),
        THREE.MathUtils.degToRad(block.rotation.z || 0),
        THREE.MathUtils.degToRad(block.rotation.y || 0)
      )
    }

    // ★ 增加 Edge 轮廓线 (无对角线)
    const edgesGeo = new THREE.EdgesGeometry(geometry, 15)
    const edgesMat = new THREE.LineBasicMaterial({ color: '#4a9eff', depthTest: false })
    const edges = new THREE.LineSegments(edgesGeo, edgesMat)
    edges.renderOrder = 998
    edges.visible = false
    mesh.add(edges)
    mesh.userData.edges = edges

    // ★ 增加十字中心星
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-16, 0, 0), new THREE.Vector3(16, 0, 0),
      new THREE.Vector3(0, -16, 0), new THREE.Vector3(0, 16, 0),
      new THREE.Vector3(0, 0, -16), new THREE.Vector3(0, 0, 16)
    ])
    const crossMat = new THREE.LineBasicMaterial({ color: '#00ffff', depthTest: false })
    const crossMarker = new THREE.LineSegments(crossGeo, crossMat)
    crossMarker.renderOrder = 999
    crossMarker.visible = false
    mesh.add(crossMarker)
    mesh.userData.centerMarker = crossMarker

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
      const vertices = mesh.userData.vertices
      mesh.geometry = this._createGeometry({ type: blockType, scale, vertices })

      // ★ 重建外框线
      if (mesh.userData.edges) {
        mesh.userData.edges.geometry.dispose()
        mesh.userData.edges.geometry = new THREE.EdgesGeometry(mesh.geometry, 15)
      }

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
    // 实时更新黄色的拖拽柄
    if (this.selectedBlockId === id) this._updateResizeGizmo(id)
  }

  syncBlockFromMesh(blockId) {
    const mesh = this.blockMeshes.get(blockId)
    if (!mesh) return null

    const base = mesh.userData.baseScale || { x: 64, y: 64, z: 64 }
    let newVertices = mesh.userData.vertices

    if (newVertices && (mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1)) {
      newVertices = newVertices.map(v => ({
        x: v.x * mesh.scale.x,
        y: v.y * mesh.scale.y,
        z: v.z * mesh.scale.z
      }))
      mesh.userData.vertices = newVertices
    }

    return {
      id: blockId,
      type: mesh.userData.blockType,
      color: mesh.userData.originalColor,
      texture: mesh.userData.texture,
      vertices: newVertices,
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
    if (this.selectedBlockId === id) {
      this.selectedBlockId = null
      this._updateResizeGizmo(null)
    }
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
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff4444' }))
      sphere.position.set(position.x, position.z, position.y)
      this.scene.add(sphere)
      this.cursors.set(userId, sphere)
    } else {
      cursor.position.set(position.x, position.z, position.y)
    }
  }

  removeCursor(userId) {
    const cursor = this.cursors.get(userId)
    if (cursor) { this.scene.remove(cursor); this.cursors.delete(userId) }
  }

  _animate() {
    requestAnimationFrame(() => this._animate())
    this._updateCamera()
    if (this._onRender) this._onRender()
    else this.renderer.render(this.scene, this.camera)
  }

  setRenderCallback(callback) { this._onRender = callback }

  _orbitCamera(dx, dy) {
    const camera = this.camera
    if (!camera || !camera.isPerspectiveCamera) return
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

    if (camera.isPerspectiveCamera) {
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
    } else if (camera.isOrthographicCamera) {
      let dx = 0, dy = 0
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

  _nudgeSelectedBlock(key) {
    const obj = this.transformControls.object
    if (!obj || !obj.userData.blockId) return

    const step = this.isSnapEnabled ? this.currentGridSize : 1
    let dx = 0, dy = 0, dz = 0

    let view = 'top'
    if (this._viewportManager) {
      view = this._viewportManager.viewMode === 'quad' ? this._viewportManager.activeQuadView : this._viewportManager.viewMode
    }

    if (view === 'top' || view === 'perspective') {
      if (key === 'ArrowUp') dz = -step; if (key === 'ArrowDown') dz = step
      if (key === 'ArrowLeft') dx = -step; if (key === 'ArrowRight') dx = step
    } else if (view === 'front') {
      if (key === 'ArrowUp') dy = step; if (key === 'ArrowDown') dy = -step
      if (key === 'ArrowLeft') dx = -step; if (key === 'ArrowRight') dx = step
    } else if (view === 'side') {
      if (key === 'ArrowUp') dy = step; if (key === 'ArrowDown') dy = -step
      if (key === 'ArrowLeft') dz = step; if (key === 'ArrowRight') dz = -step
    }

    obj.position.x += dx; obj.position.y += dy; obj.position.z += dz

    if (this.onBlockMoved) {
      const data = this.syncBlockFromMesh(obj.userData.blockId)
      if (data) this.onBlockMoved(obj.userData.blockId, data)
    }
  }
}