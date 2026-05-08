# 问题
当前图片/img/image4.png是我选择了左上角操作区域，点击了方块后，想要移动方块时截的图，但是此时我鼠标是放在四个视图中心交界处，放在中心交界处才显示悬浮在了移动向量上

## 回答

这是一个非常典型的 Web 3D 开发（如 Three.js / Babylon.js 等）中遇到的**“坐标偏移（Raycaster 拾取错位）”**问题。

根据您的描述和图片，我为您绘制了当前的视图状态与问题所在的文本布局图：

### 🎯 当前问题布局图
/img/image4.png
```text
┌──────────────────────────────────────────────────────────────────┐
│  顶部工具栏 (CSMapCollab, 协作中状态等)                          │
├──────────┬─────────────────────────────┬─────────────────────────┤
│ 房间面板 │  透视 (左上)                │  顶视 (右上)            │
│ (已连接) │                             │                         │
│          │  📦【视觉位置】             │                         │
│          │  (方块和黄色的移动轴渲染    │                         │
│          │   在这个区域)               │                         │
│          │        ↘                    │                         │
│          │          ↘ (鼠标拾取判定    │                         │
│          │            发生了严重偏移)  │                         │
│          ├──────────────┼──────────────┼─────────────────────────┤
│          │              │ 🖱️【物理位置】                       │
│          │              │ (鼠标实际悬停在四视图中心交界处，      │
│          │  前视 (左下) │  却触发了左上角方块的悬浮高亮)         │
│          │                             │  侧视 (右下)            │
└──────────┴─────────────────────────────┴─────────────────────────┘
```

---

### 🐛 问题详细描述与诊断

**现象描述：**
视觉渲染（方块和移动坐标轴显示在左上角视图）与 物理交互（鼠标感应区/Hitbox）完全脱节。您必须把鼠标放在屏幕正中央的四视图交界处，系统才会认为您“碰到”了位于左上角的坐标轴。

**产生此问题的根本原因（结合您上一个 CSS 布局问题）：**
在 3D 网页开发中，鼠标点击/悬浮选择物体依赖于一条“射线（Raycaster）”。这条射线的计算，需要极其准确的**鼠标相对于 3D Canvas 画布的 X/Y 坐标**。

出现这种严重的向右下方偏移，99% 是因为以下原因：

1. **受到之前 CSS 侧边栏及间距的影响**：
   在计算鼠标相对坐标时，代码直接使用了全局的 `window.innerWidth / innerHeight` 或 `clientX / clientY`，**没有减去**左侧边栏占据的宽度以及顶部导航栏占据的高度。
2. **Canvas 尺寸与实际显示尺寸不匹配**：
   如果您的 3D 画布（Canvas）被 CSS 缩放了（比如被硬性拉伸或压缩适应那个有间距的网格容器），但 JavaScript 内部相机的宽高比（Aspect Ratio）以及射线拾取的计算依然使用的是原来的大尺寸，就会产生明显的“鼠标在这里，但准星偏到十万八千里外”的现象。
3. **未调用 `getBoundingClientRect()`**：
   标准的拾取坐标计算公式应该基于画布容器的真实屏幕位置。由于左侧有房间面板，画布的左上角并非屏幕的 `(0,0)` 点。如果获取鼠标坐标时没有减去容器的 `rect.left` 和 `rect.top`，鼠标的判定区域就会整体向右下角漂移。

**总结：**
这正是您上一个提问中提到的“网格视图与侧边栏有间距”这个 CSS 布局 Bug 带来的**连锁反应**。布局位置不对/获取坐标方法不对，导致 3D 引擎计算鼠标射线时产生了巨大的坐标偏差。






# 第二部分

这个问题是 **3D 引擎中多视图（Split Viewport）开发最经典的 Bug**。

### 🐛 为什么会发生严重的偏移？
在默认的 3D 射线拾取（Raycaster）逻辑中，我们通常这样计算鼠标标准化坐标 (NDC)：
`mouse.x = (X / canvas总宽度) * 2 - 1`

**在你的“四视图”模式下，这个公式失效了！**
因为左上角的“透视相机”只占了画布的 **1/4**（宽一半，高一半）。
当你把鼠标放在屏幕**正中央交界处**时，按照整体 Canvas 计算，此时 `mouse.x = 0, mouse.y = 0`。而 `(0,0)` 这个坐标传递给左上角的相机时，相机认为：**“哦，(0,0) 代表视口的绝对正中心！我就去高亮显示正中心的方块和移动轴。”**

这就导致了你看到的现象：鼠标在屏幕中心，却激活了左上角视图中心的控件。

---

### 🛠️ 解决方案

要解决这个问题，我们需要在 `ViewportManager` 中新增一个方法，专门把全局的 Canvas 像素坐标，**换算成鼠标所在“局部视口”的相对 NDC 坐标 [-1, 1]**。

请按照以下步骤修改你的代码：

#### 第一步：在 `ViewportManager.js` 中新增坐标转换方法
将以下方法添加到你的 `ViewportManager` 类中（可以放在 `hitTest` 方法下方）：

```javascript
  // ========== 射线拾取/坐标系转换 ==========
  /**
   * 获取针对当前激活视口修正后的鼠标 NDC 坐标和相机
   * @param {number} canvasX - 鼠标相对 Canvas 左边缘的像素(event.offsetX 或 bounding计算后的值)
   * @param {number} canvasY - 鼠标相对 Canvas 上边缘的像素(event.offsetY 或 bounding计算后的值)
   */
  getRaycasterData(canvasX, canvasY) {
    // 1. 判断鼠标在哪个视口里
    const viewName = this.hitTest(canvasX, canvasY);
    if (!viewName) return null;

    const vp = this.viewports[viewName];
    const camera = this.getCameraForView(viewName);

    // 2. 计算鼠标在【当前局部视口】内的像素坐标
    const localX = canvasX - vp.x;
    const localY = canvasY - vp.y;

    // 3. 将局部像素坐标转换为 NDC 坐标 [-1 到 1]
    const ndcX = (localX / vp.w) * 2 - 1;
    const ndcY = -(localY / vp.h) * 2 + 1; // WebGL Y轴向上，所以反转

    return {
      mouseCoords: new THREE.Vector2(ndcX, ndcY),
      camera: camera,
      viewName: viewName
    };
  }
```

#### 第二步：修改你外部的鼠标事件监听（极其关键！）
无论是你自己写 Raycaster 选方块，还是使用 `THREE.TransformControls` 移动方块，都需要使用修正后的坐标。在你的 `pointermove` / `pointerdown` 事件中，按照下面这样改写：

```javascript
// 假设这是你的 canvas DOM 元素
const canvas = renderer.domElement;

canvas.addEventListener('pointermove', (event) => {
  // 1. 获取剔除了侧边栏间距的、绝对准确的 Canvas 内部像素坐标
  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // 2. 调用我们刚刚新增的方法，获取局部坐标和对应相机
  const rayData = viewportManager.getRaycasterData(canvasX, canvasY);

  if (rayData) {
    // 激活对应的视图（保证 TransformControls 渲染在鼠标所在的视图）
    viewportManager.activateView(rayData.viewName);

    // === 【如果你自己在用 Raycaster 选方块】 ===
    raycaster.setFromCamera(rayData.mouseCoords, rayData.camera);
    // ... 执行你的 intersects 判定逻辑 ...


    // === 【修复 TransformControls 偏移的核心技巧】 ===
    if (transformControls) {
      // 必须将控件的相机切换为当前鼠标所在视口的相机
      transformControls.camera = rayData.camera;

      // 【Hack 修复】：TransformControls 内部仍在使用全局 width/height
      // 我们需要强制覆盖它的内部射线计算指针
      transformControls.pointer.copy(rayData.mouseCoords);
      transformControls.raycaster.setFromCamera(rayData.mouseCoords, rayData.camera);
    }
  }
});
```

### 💡 核心原理解释：
1. **`const rect = canvas.getBoundingClientRect()`**：这一步解决了你上一问中“侧边栏有间距”带来的整体坐标错位。
2. **`localX / vp.w`**：这一步解决了四视图带来的坐标偏移。我们不再除以整个画布的宽，而是除以 `vp.w`（即画布宽的一半），这样射线发出的位置就与你的视觉渲染完美对齐了。
3. **针对 TransformControls**：THREE.js 自带的移动控件是不原生支持局部多视口(`setViewport`)的，所以我们必须在鼠标移动时，把局部计算出来的 `NDC坐标` 硬塞给它（`pointer.copy`），它才能在四视图中准确识别鼠标的悬停。