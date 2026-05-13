// ============================================================
// MapImporter — .map 文件导入/导出
// 职责: 本地 .map (J.A.C.K / Hammer 220) 导入解析 + 下载导出
// ============================================================

import { MapExporter } from '../exporter/MapExporter.js'

export class MapImporter {

  // ==========================================================
  // ★ .map 导出: 生成并触发浏览器下载
  // ==========================================================

  /**
   * 本地下载 .map 文件
   * @param {Array} blocks - 方块数据数组
   * @param {string} mapName - 地图名称
   */
  static downloadLocalMap(blocks, mapName = 'map') {
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

  // ==========================================================
  // ★ .map 导入: 读取文件 → 解析 → 返回 Blocks 数据
  // ==========================================================

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
          const blocks = MapImporter.parseMapText(mapText)

          let mapName = file.name
          if (mapName.endsWith('.map')) mapName = mapName.slice(0, -4)

          resolve({
            mapName: mapName,
            roomId: '',
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
   * @param {string} mapText - .map 文件原始文本
   * @returns {Array} blocks 数组
   */
  static parseMapText(mapText) {
    const blocks = []
    const brushRegex = /\{([^{}]*\(\s*-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s*\)[^{}]*)\}/g
    let match

    while ((match = brushRegex.exec(mapText)) !== null) {
      const brushContent = match[1]
      const rawPoints = []

      // 提取所有坐标点 (J.A.C.K 坐标: X=左右, Y=深度, Z=高度)
      const pointRegex = /\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/g
      let ptMatch
      while ((ptMatch = pointRegex.exec(brushContent)) !== null) {
        rawPoints.push({
          x: parseFloat(ptMatch[1]), // JACK X → Three X
          y: parseFloat(ptMatch[3]), // JACK Z → Three Y (高度)
          z: parseFloat(ptMatch[2])  // JACK Y → Three Z (深度)
        })
      }

      if (rawPoints.length === 0) continue

      // 计算包围盒 (Bounding Box)
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

      for (const p of rawPoints) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
      }

      const width = maxX - minX
      const height = maxY - minY
      const depth = maxZ - minZ

      // 世界中心点
      const cx = minX + width / 2
      const cy = minY + height / 2
      const cz = minZ + depth / 2

      // 转换为相对于中心点的局部坐标 (Local Vertices)
      const localVertices = rawPoints.map(p => ({
        x: p.x - cx,
        y: p.y - cy,
        z: p.z - cz
      }))

      blocks.push({
        id: 'block_' + Math.random().toString(36).substr(2, 9),
        type: 'custom',
        vertices: localVertices,
        position: { x: cx, y: cz, z: cy },
        scale: { x: width, y: depth, z: height },
        rotation: { x: 0, y: 0, z: 0 },
        color: '#607d8b',
        texture: 'AAATRIGGER'
      })
    }
    return blocks
  }
}
