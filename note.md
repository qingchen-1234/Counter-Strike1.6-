 3D 编辑器在正交视图（2D视图）下最核心的痛点：**遮挡与网格密度**。

J.A.C.K. 和 Hammer 编辑器之所以好用，正是因为它们在 3D 视图使用**实体渲染（Solid）**，而在 2D 三视图强制使用**线框渲染（Wireframe）**，并且配合了**视口智能网格**。


---

### 第一步：解除工具栏网格大小与吸附的强制绑定 - (此步骤已执行，直接进行第二步)

打开 `client/src/components/Toolbar.vue`，找到下拉菜单 `<select>`，**删掉 `disabled` 属性**：

```html
<!-- 修改前： -->
<select class="grid-select" :value="gridSize" @change="onGridChange" :disabled="!isSnapEnabled">

<!-- ✅ 修改后： -->
<select class="grid-select" :value="gridSize" @change="onGridChange">
```

---

### 第二步：重构 `SceneManager.js` 的材质与网格系统

我们要给每个方块加上一个**中心十字星（X）**，并且编写一套“智能双层网格”和“线框/实体切换”逻辑。

请在 `client/src/engine/SceneManager.js` 中进行以下替换：

**1. 替换 `_rebuildGrids` 方法（构建智能双层网格，且永远置于底层）：**
```javascript
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
      // ★ 核心：让网格永远在最底层渲染，绝不遮挡任何方块线框！
      grid.renderOrder = -1
      return grid
    }

    // XZ 平面 (顶视图)
    this.gridXZ_minor = buildGridLayer(this.currentGridSize, '#333344', false)
    this.gridXZ_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true)
    this.scene.add(this.gridXZ_minor, this.gridXZ_major)
    this.gridHelpers.push(this.gridXZ_minor, this.gridXZ_major)

    // XY 平面 (前视图)
    this.gridXY_minor = buildGridLayer(this.currentGridSize, '#333344', false); this.gridXY_minor.rotation.x = -Math.PI / 2
    this.gridXY_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true); this.gridXY_major.rotation.x = -Math.PI / 2
    this.scene.add(this.gridXY_minor, this.gridXY_major)
    this.gridHelpers.push(this.gridXY_minor, this.gridXY_major)

    // YZ 平面 (侧视图)
    this.gridYZ_minor = buildGridLayer(this.currentGridSize, '#333344', false); this.gridYZ_minor.rotation.z = Math.PI / 2
    this.gridYZ_major = buildGridLayer(Math.max(256, this.currentGridSize * 4), '#555566', true); this.gridYZ_major.rotation.z = Math.PI / 2
    this.scene.add(this.gridYZ_minor, this.gridYZ_major)
    this.gridHelpers.push(this.gridYZ_minor, this.gridYZ_major)
  }
```

**2. 找到 `renderBlock(block)`，在末尾给方块加上中心十字（X）：**
```javascript
    // ... 原有逻辑 (mesh.rotation.set...)

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
```
*(注意 `updateBlockMesh` 里面重构 geometry 时，原来挂载的 crossMarker 会自动保留，不需要额外修改。)*

**3. 在 `SceneManager.js` 中新增渲染模式切换方法：**
找个空白地方（比如 `setBlockLocked` 附近）加上这个函数：
```javascript
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
```

---

### 第三步：修改 `client/src/engine/ViewportManager.js`
这是最神奇的一步！我们将利用 WebGL 的渲染循环，在画 3D 视角前把世界变成实体，在画 2D 视角前把世界变成线框，并根据缩放智能隐藏细密网格！

找到 `render(time)` 方法，**将其完全替换**为以下代码：

```javascript
  // ========== 渲染 (含智能网格与线框切换) ==========
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

      const isPerspective = (name === 'perspective')
      const camera = isPerspective ? this.sm.camera
        : name === 'top' ? this.topCamera
        : name === 'front' ? this.frontCamera
        : this.sideCamera

      // 1. 设置背景色
      scene.background = isPerspective
        ? new THREE.Color('#1a1a2e')  // 3D 视图背景
        : new THREE.Color('#0a0a14')  // 2D 视图背景 (更深，突出线框)

      // 2. ★ 核心：渲染模式切换
      this.sm.setRenderMode(isPerspective ? 'solid' : 'wireframe')

      // 3. ★ 核心：智能网格调度
      if (this.sm.gridXZ_minor) {
        // 先隐藏所有网格
        for (const g of this.sm.gridHelpers) g.visible = false

        if (!isPerspective) {
          // 根据当前正交相机的视野宽度(缩放程度)决定显示哪些网格
          const viewWidth = camera.right - camera.left
          const showMinor = viewWidth < 6000  // 放大时显示密网格
          const showMajor = viewWidth < 30000 // 缩小时只显示粗网格

          if (name === 'top') {
            if (showMinor) this.sm.gridXZ_minor.visible = true
            if (showMajor) this.sm.gridXZ_major.visible = true
          } else if (name === 'front') {
            if (showMinor) this.sm.gridXY_minor.visible = true
            if (showMajor) this.sm.gridXY_major.visible = true
          } else if (name === 'side') {
            if (showMinor) this.sm.gridYZ_minor.visible = true
            if (showMajor) this.sm.gridYZ_major.visible = true
          }
        }
      }

      // 4. 防止视图形变
      const aspect = vp.w / vp.h
      if (camera.isOrthographicCamera) {
        const halfH = (camera.top - camera.bottom) / 2
        const halfW = halfH * aspect
        if (camera.right !== halfW) {
          camera.left = -halfW; camera.right = halfW; camera.updateProjectionMatrix()
        }
      } else if (camera.isPerspectiveCamera) {
        if (camera.aspect !== aspect) {
          camera.aspect = aspect; camera.updateProjectionMatrix()
        }
      }

      // 5. 变换控件显示逻辑
      const tc = this.sm.transformControls
      const isActive = (this.viewMode === 'quad' && this.activeQuadView === name) ||
                       (this.viewMode !== 'quad' && this.viewMode === name) ||
                       (this.viewMode !== 'quad' && name === this.viewMode)
      if (tc) tc.visible = isActive && (tc.object != null)

      r.render(scene, camera)
    }

    // 恢复现场
    scene.background = origBg
    r.setScissorTest(false)
  }
```

---

