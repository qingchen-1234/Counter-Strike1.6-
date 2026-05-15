
---

#### 1. 替换 `renderBlock` 方法（增加外轮廓线Edges）
找到 `renderBlock(block)` 方法，在其末尾（`this.scene.add(mesh)` 之前）进行如下修改：

```javascript
    // ... 原有的 mesh.rotation.set ...

    // ★ 1. 新增：专业级边缘轮廓线 (剔除共面的多余对角线，阈值 15度)
    const edgesGeo = new THREE.EdgesGeometry(geometry, 15)
    const edgesMat = new THREE.LineBasicMaterial({ color: '#4a9eff', depthTest: false })
    const edges = new THREE.LineSegments(edgesGeo, edgesMat)
    edges.renderOrder = 998
    edges.visible = false
    mesh.add(edges)
    mesh.userData.edges = edges

    // ★ 2. 新增：2D 视图专用的中心十字星 (X)
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
```

#### 2. 替换 `updateBlockMesh` 方法（确保缩放后轮廓线一并更新）
找到该方法中 `if (scale)` 的内部区块，增加更新逻辑：

```javascript
  updateBlockMesh(id, position, scale, rotation) {
    const mesh = this.blockMeshes.get(id)
    if (!mesh) return
    if (position) mesh.position.set(position.x, position.z, position.y)

    if (scale) {
      mesh.geometry.dispose()
      const blockType = mesh.userData.blockType || 'cube'
      const vertices = mesh.userData.vertices
      mesh.geometry = this._createGeometry({ type: blockType, scale, vertices })

      // ★ 新增：同步重建边缘轮廓线
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
  }
```

#### 3. 替换 `setRenderMode` 和 `_highlightBlock`（智能视觉切换）
更新渲染模式逻辑，使用 `material.visible = false` 彻底隐藏墙面，而不是变透明。
```javascript
  // ★ 2D线框与3D实体 智能切换引擎
  setRenderMode(mode) {
    const isWireframe = (mode === 'wireframe')

    for (const [id, mesh] of this.blockMeshes) {
      // ★ 核心修改：2D模式下彻底隐藏墙面实体材质，只显示线框和X！
      mesh.material.visible = !isWireframe

      if (mesh.userData.edges) mesh.userData.edges.visible = isWireframe
      if (mesh.userData.centerMarker) mesh.userData.centerMarker.visible = isWireframe

      if (!isWireframe) {
        // 3D 模式下，恢复原有颜色
        const isLocked = mesh.material.opacity === 0.5
        mesh.material.color.set(isLocked ? '#555555' : (mesh.userData.originalColor || '#888888'))
      }
    }
  }

  // ★ 优化高亮显示：同时支持 3D实体高亮 和 2D线框高亮
  _highlightBlock(blockId) {
    for (const [id, mesh] of this.blockMeshes) {
      if (id === blockId) {
        mesh.material.emissive?.set('#333333')
        if (mesh.userData.edges) mesh.userData.edges.material.color.set('#ffcc00') // 选中变黄
        if (mesh.userData.centerMarker) mesh.userData.centerMarker.material.color.set('#ffcc00')
      } else {
        mesh.material.emissive?.set('#000000')
        if (mesh.userData.edges) mesh.userData.edges.material.color.set('#4a9eff') // 默认青蓝
        if (mesh.userData.centerMarker) mesh.userData.centerMarker.material.color.set('#00ffff')
      }
    }
  }
```

#### 4. 替换 `_pickBlock`（解决穿透点击的神级算法）
找到 `_pickBlock(event, viewportEl)`，重新编写它的射线检测逻辑：

```javascript
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

    // ==========================================================
    // ★ 核心：双轨射线拾取算法
    // ==========================================================
    if (camera.isOrthographicCamera) {
      // 【2D 正交视图】
      // 动态计算点击宽容度 (地图放得越小，鼠标容错率越大)
      const viewWidth = camera.right - camera.left
      this.raycaster.params.Line.threshold = viewWidth / 150

      // 提取所有的线条和中心 X 进行射线检测 (完全无视隐形的实体面！)
      const pickables = []
      for (const mesh of this.blockMeshes.values()) {
        if (mesh.userData.edges) pickables.push(mesh.userData.edges)
        if (mesh.userData.centerMarker) pickables.push(mesh.userData.centerMarker)
      }
      // 射线检测
      intersects = this.raycaster.intersectObjects(pickables, false)
    } else {
      // 【3D 透视视图】
      // 正常检测实体方块
      const meshes = Array.from(this.blockMeshes.values())
      intersects = this.raycaster.intersectObjects(meshes, false)
    }

    if (intersects.length > 0) {
      let obj = intersects[0].object

      // 如果在 2D 里点中的是线框或十字星，我们需要向上找到它的父级(真正的网格实体)
      if (obj.parent && obj.parent.userData && obj.parent.userData.blockId) {
        obj = obj.parent
      }

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
```

---
