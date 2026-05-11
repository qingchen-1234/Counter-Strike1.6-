// ============================================================
// SaveManager — 保存/读取文件
// 职责: 本地 .map 导出/解析、服务端协作状态同步
// ============================================================

import { MapExporter } from '../exporter/MapExporter.js' // 确保引入我们写好的导出器

export class SaveManager {

  // ==========================================================
  // ★ 本地文件操作：全面使用 .map 标准格式
  // ==========================================================

  /**
   * 本地下载 .map 文件 (合并了原先的保存与导出)
   * @param {Array} blocks - 方块数据数组
   * @param {string} mapName - 地图名称
   */
  static downloadLocalMap(blocks, mapName = 'map') {
    // 调用 MapExporter 生成 .map 文本
    const mapText = MapExporter.export(blocks)

    const filename = mapName.endsWith('.map') ? mapName : mapName + '.map'
    const blob = new Blob([mapText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * 从本地读取并解析 .map 文件
   * @param {File} file
   * @returns {Promise<object>} 返回 { mapName, blocks, gridSize }
   */
  static readLocalMap(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const mapText = e.target.result
          const blocks = SaveManager.parseMapText(mapText)

          let mapName = file.name
          if (mapName.endsWith('.map')) mapName = mapName.slice(0, -4)

          resolve({
            mapName: mapName,
            roomId: '', // 本地读取不强制绑定协作房间
            gridSize: 16,
            blocks: blocks
          })
        } catch (err) {
          reject(new Error('解析 .map 文件失败: ' + err.message))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }

/**
   * 核心逆向算法：将 .map 文本反算为网页的 Blocks 数据 (支持任意凸多边形)
   */
  static parseMapText(mapText) {
    const blocks = []
    const brushRegex = /\{([^{}]*\(\s*-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s*\)[^{}]*)\}/g
    let match

    while ((match = brushRegex.exec(mapText)) !== null) {
      const brushContent = match[1]
      const rawPoints = []

      // 提取所有坐标点 ( J.A.C.K 坐标: X=左右, Y=深度, Z=高度 )
      const pointRegex = /\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/g
      let ptMatch
      while ((ptMatch = pointRegex.exec(brushContent)) !== null) {
        rawPoints.push({
          x: parseFloat(ptMatch[1]), // JACK X -> Three X
          y: parseFloat(ptMatch[3]), // JACK Z -> Three Y (高度)
          z: parseFloat(ptMatch[2])  // JACK Y -> Three Z (深度)
        })
      }

      if (rawPoints.length === 0) continue

      // 计算包围盒 (Bounding Box) 找出最大最小值
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

      for (const p of rawPoints) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }

      const width = maxX - minX
      const height = maxY - minY
      const depth = maxZ - minZ

      // 算出方块的世界中心点
      const cx = minX + width / 2
      const cy = minY + height / 2
      const cz = minZ + depth / 2

      // ★ 核心转换：将世界坐标点转换为相对于中心点的局部坐标 (Local Vertices)
      const localVertices = rawPoints.map(p => ({
        x: p.x - cx,
        y: p.y - cy,
        z: p.z - cz
      }))

      blocks.push({
        id: 'block_' + Math.random().toString(36).substr(2, 9),
        type: 'custom', // ★ 抛弃死板的预设类型，标记为自定义几何体
        vertices: localVertices, // ★ 保存决定形状的灵魂顶点
        position: { x: cx, y: cz, z: cy }, // 对应你的UI: y=深度, z=高度
        scale: { x: width, y: depth, z: height }, // 仅用作 UI 属性面板展示
        rotation: { x: 0, y: 0, z: 0 },
        color: '#607d8b',
        texture: 'AAATRIGGER'
      })
    }
    return blocks
  }


  // ==========================================================
  // ★ 服务端 API 保持不变 (维持你的 Node/Python 协作后端稳定)
  // ==========================================================
  static serialize(blocks, mapName, roomId, gridSize = 16) {
    const now = new Date().toISOString()
    const data = {
      version: '2.2', mapName: mapName || '未命名地图', roomId: roomId || '',
      createdAt: now, updatedAt: now, gridSize,
      blocks: blocks.map(b => ({
        id: b.id, type: b.type || 'cube', position: b.position, scale: b.scale,
        rotation: b.rotation || { x: 0, y: 0, z: 0 }, color: b.color,
        texture: b.texture || 'AAATRIGGER', tags: b.tags || []
      }))
    }
    return JSON.stringify(data, null, 2)
  }

  static deserialize(jsonString) {
    const data = JSON.parse(jsonString)
    if (!data.blocks || !Array.isArray(data.blocks)) throw new Error('无效的文件格式')
    return {
      mapName: data.mapName || '未命名地图', roomId: data.roomId || '',
      gridSize: data.gridSize || 16, version: data.version || '2.0', blocks: data.blocks
    }
  }

  static async saveToServer(mapName, roomId, blocks, gridSize) {
    const json = SaveManager.serialize(blocks, mapName, roomId, gridSize)
    const resp = await fetch('/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, mapName, blocks, gridSize })
    })
    if (!resp.ok) throw new Error('保存失败: ' + (await resp.text()))
    return resp.json()
  }

  static async listServerFiles() {
    const resp = await fetch('/api/files')
    if (!resp.ok) throw new Error('获取文件列表失败')
    return resp.json()
  }

  static async loadFromServer(filename) {
    const resp = await fetch('/api/files/' + encodeURIComponent(filename))
    if (!resp.ok) throw new Error('加载失败: ' + (await resp.text()))
    const text = await resp.text()
    return SaveManager.deserialize(text)
  }

  static async deleteServerFile(filename) {
    const resp = await fetch('/api/files/' + encodeURIComponent(filename), { method: 'DELETE' })
    if (!resp.ok) throw new Error('删除失败')
    return resp.json()
  }
}