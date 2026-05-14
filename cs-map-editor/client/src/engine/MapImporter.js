// ============================================================
// MapImporter — .map 文件导入解析 (AST 解析器)
// 职责: 逐行解析 220 格式，生成无损的 MapDocument 缓存和渲染区块
// ============================================================

import { MapExporter } from '../exporter/MapExporter.js'

export class MapImporter {

  static downloadLocalMap(blocks, mapName = 'map', cachedMapDoc = null) {
    // 稍后我们会在 MapExporter 中支持传入 cachedMapDoc 实现无损导出
    // 目前先保持兼容旧逻辑
    const mapText = MapExporter.export(blocks, cachedMapDoc)

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

  static readLocalMap(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const mapText = e.target.result

          // ★ 核心改变：返回完整的 mapDoc 缓存对象和 blocks
          const { blocks, mapDoc } = MapImporter.parseMapToAST(mapText)

          let mapName = file.name
          if (mapName.endsWith('.map')) mapName = mapName.slice(0, -4)

          resolve({
            mapName: mapName,
            roomId: '',
            gridSize: 16,
            blocks: blocks,
            mapDoc: mapDoc // ★ 将无损缓存抛出给 App.vue
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
   * ★ 全新逐行 AST 解析器 (完美支持 220 格式与嵌套结构)
   */
  static parseMapToAST(mapText) {
    const lines = mapText.split('\n').map(l => l.trim())

    const mapDoc = { entities: [] }
    const blocks = []

    let currentEntity = null
    let currentBrush = null
    let depth = 0 // 0=外面, 1=实体内, 2=笔刷内

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      // 忽略注释和空行
      if (!line || line.startsWith('//')) continue

      if (line === '{') {
        depth++
        if (depth === 1) {
          // 创建新实体
          currentEntity = { properties: {}, brushes: [] }
          mapDoc.entities.push(currentEntity)
        } else if (depth === 2) {
          // 创建新笔刷
          const blockId = 'b_' + Math.random().toString(36).substr(2, 9)
          currentBrush = {
            id: blockId,
            originalLines: [], // 用于无损导出
            rawPoints: []      // 用于生成 3D 几何体
          }
          currentEntity.brushes.push(currentBrush)
        }
        continue
      }

      if (line === '}') {
        if (depth === 2) {
          // 笔刷结束，将解析出的点转化为 Block 数据
          if (currentBrush && currentBrush.rawPoints.length > 0) {
            const blockData = MapImporter._convertBrushToBlock(currentBrush)
            if (blockData) blocks.push(blockData)
          }
          currentBrush = null
        } else if (depth === 1) {
          // 实体结束
          currentEntity = null
        }
        depth--
        continue
      }

      // 处理实体属性 ("key" "value")
      if (depth === 1 && line.startsWith('"')) {
        const propMatch = line.match(/^"([^"]+)"\s+"([^"]*)"/)
        if (propMatch) {
          currentEntity.properties[propMatch[1]] = propMatch[2]
        }
        continue
      }

      // 处理笔刷面 ( x y z ) ( x y z ) ( x y z ) TEXTURE ...
      if (depth === 2 && currentBrush && line.startsWith('(')) {
        currentBrush.originalLines.push(line) // 缓存原始文本

        // 提取前三个坐标点 (J.A.C.K 坐标: X=左右, Y=深度, Z=高度)
        const pointRegex = /\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/g
        let ptMatch
        let pointsFound = 0
        while ((ptMatch = pointRegex.exec(line)) !== null && pointsFound < 3) {
          currentBrush.rawPoints.push({
            x: parseFloat(ptMatch[1]), // JACK X → Three X
            y: parseFloat(ptMatch[3]), // JACK Z → Three Y (高度)
            z: parseFloat(ptMatch[2])  // JACK Y → Three Z (深度)
          })
          pointsFound++
        }
      }
    }

    return { blocks, mapDoc }
  }

  /**
   * 将提取的坐标点转换为场景区块 (保持原有反推逻辑)
   */
  static _convertBrushToBlock(brush) {
    const rawPoints = brush.rawPoints
    if (rawPoints.length === 0) return null

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

    const cx = minX + width / 2
    const cy = minY + height / 2
    const cz = minZ + depth / 2

    const localVertices = rawPoints.map(p => ({
      x: p.x - cx,
      y: p.y - cy,
      z: p.z - cz
    }))

    return {
      id: brush.id, // ★ 关键绑定：生成的方块 ID 必须和缓存树中的笔刷 ID 一致！
      type: 'custom',
      vertices: localVertices,
      position: { x: cx, y: cz, z: cy },
      scale: { x: width, y: depth, z: height },
      rotation: { x: 0, y: 0, z: 0 },
      color: '#607d8b',
      texture: 'AAATRIGGER'
    }
  }
}