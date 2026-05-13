# 任务：重构 CSMapCollab 项目 — 清理 .csmap 遗留代码

## 项目背景
您将阅读上方提供的 `README.md`（CSMapCollab v2.8）。这是一个基于 Web 的 CS 1.6 地图灰模协作编辑器，目前已完全转向 **纯 .map 220 格式** 的本地导入/导出，不再使用 `.csmap` 服务端存储方案。

## 目标
以该 README 为“当前实现”的参考文档，对项目进行**整体架构清理**，彻底移除所有与 `.csmap` 相关的未使用功能、代码、API、目录和依赖，减少资源占用，提高可维护性。

具体要求如下：

### 1. 识别并删除以下内容
- **服务端遗留 API**：
  - `POST /api/save`（保存 .csmap 到服务器）
  - `GET /api/files`（获取 .csmap 存档列表）
  - `GET /api/files/:filename`（下载指定 .csmap）
  - `DELETE /api/files/:filename`（删除指定 .csmap）
- **服务端相关代码**：`server/index.js` 中处理上述路由的代码块，以及任何 `fs` 操作写入 `data/` 目录的逻辑。
- **服务端目录**：`/data` 整个文件夹（如果存在），不再需要服务器端存储任何地图文件。
- **客户端遗留模块**：
  - `client/src/engine/SaveManager.js` 中 **所有与 `.csmap` 序列化/反序列化相关的函数**（如 `saveToCSMap`、`loadFromCSMap`），仅保留 `.map` 导入解析功能。可重命名为 `MapImporter.js` 更清晰。
  - `client/src/exporter/MapExporter.js` 仅保留 `.map` 导出功能，无 .csmap 相关。
  - `client/src/network/SocketClient.js` 中是否有调用上述遗留 API 的代码？若有则删除。
  - `client/src/App.vue` 或 `Toolbar.vue` 中任何“保存到服务器”、“打开服务器存档”等按钮及相关 UI。
  - 任何遗留的 `.csmap` 文件处理提示或控制台输出。
- **文档更新**：
  - 删除 README 中 **“遗留”** 标记的 API 表格（REST API 部分的后半段）。
  - 删除 `data/` 目录的说明。
  - 删除所有与 `.csmap` 相关的描述，例如 “.csmap 序列化(遗留)”、“服务器 .csmap 存档目录 (遗留，客户端已不使用)” 等。
  - 在“项目结构”中移除 `data/` 条目，并更新 `SaveManager.js` 为 `MapImporter.js`（若重命名）。
- **可选清理**：从 `BlockManager.js` 中移除已注释的 `stairs`、`cylinder`、`plane` 类型定义（如果确定不再启用）。但保留代码也无大碍，可标记为“待扩展”。

### 2. 输出格式要求
请按以下结构输出最终答案：

#### (1) 修改摘要
用表格或列表形式，简明列出将被删除/修改的文件、API 端点、UI 组件及说明。

#### (2) 更新后的项目结构（完整树形图）
反映删除 `data/`、重命名 `SaveManager.js` 等变化后的新结构。

#### (3) 修改后的核心代码片段（仅关键部分）
- `server/index.js` 中移除遗留 API 后的新路由表。
- `client/src/engine/MapImporter.js`（原 SaveManager）仅保留 `.map` 导入解析的核心函数签名。
- `client/src/App.vue` 中移除相关按钮的模板代码。

#### (4) 更新后的 README 内容（Markdown 格式）
基于原 README，按照上述清理要求重写一份**精简版 README.md**，确保：
- 不再提及 `.csmap`、`data/`、遗留 API。
- 功能描述聚焦于纯 .map 导入/导出 + 实时协同。
- 技术栈、启动方式、核心功能、Socket 事件等保持不变。
- 移除“遗留”等过时标注。

### 3. 额外约束
- 不能破坏现有**.map 导入/导出**、**四视图编辑**、**多人协同（Socket.io）** 等核心功能。
- 所有修改建议必须是可执行的（即提供具体的删除行号或替换代码）。若无法确切知道行号，请描述逻辑位置。
- 如果某些代码同时被 .map 和 .csmap 共用（如顶点处理），请明确指出保留部分并抽取公共逻辑。


## 开始执行
请按照上述要求进行输出重构。