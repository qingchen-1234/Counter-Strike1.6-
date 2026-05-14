// ============================================================
// MapExporter — .map 文件导出器 (支持无损缓存合并)
// ============================================================

import * as THREE from 'three'

export class MapExporter {

  /**
   * 导出为 .map 文本
   * @param {Array} blocks 当前场景中的方块数据
   * @param {Object} cachedMapDoc 导入时保存的原稿缓存 (AST)
   */
  static export(blocks, cachedMapDoc = null) {
    const lines = []

    // ======================================================
    // 场景一：纯新建地图 (没有导入原稿)
    // ======================================================
    if (!cachedMapDoc) {
      lines.push('{')
      lines.push('"classname" "worldspawn"')
      lines.push('"mapversion" "220"')
      lines.push('"wad" ""')
      lines.push('"_generator" "CSMapCollab v2.8 (J.A.C.K Standard)"')

      for (const block of blocks) {
        const solidLines = this._blockToSolid(block)
        lines.push(...solidLines)
      }

      lines.push('}')
      return lines.join('\n')
    }

    // ======================================================
    // 场景二：基于原稿修改 (无损合并导出)
    // ======================================================

    // 1. 建立当前场景中所有方块的快速索引 Map
    const blocksMap = new Map()
    for (const b of blocks) {
      blocksMap.set(b.id, b)
    }

    // 2. 遍历原稿中的每一个实体 (Entities)
    for (const entity of cachedMapDoc.entities) {
      lines.push('{')

      // 还原实体属性 (无损保留 wad, sounds, _generator 等全部属性)
      let isWorldSpawn = false
      for (const [key, value] of Object.entries(entity.properties)) {
        if (key === 'classname' && value === 'worldspawn') isWorldSpawn = true
        lines.push(`"${key}" "${value}"`)
      }

      // 还原该实体下的所有笔刷 (Brush)
      for (const brush of entity.brushes) {
        const currentBlock = blocksMap.get(brush.id)

        if (!currentBlock) {
          // 核心逻辑：如果在场景里找不到这个 ID，说明被用户删除了！直接跳过，不导出。
          continue
        }

        // 方块还活着，拼接最新的坐标和原本的纹理 UV
        const solidLines = this._exportCachedBrush(currentBlock, brush)
        lines.push(...solidLines)

        // 标记该方块已导出，从 Map 中剔除
        blocksMap.delete(brush.id)
      }

      // 3. 如果当前实体是 worldspawn，需要把我们在网页中【全新创建】的方块塞进去
      if (isWorldSpawn) {
        for (const [id, newBlock] of blocksMap.entries()) {
          // 剩下的全是没有在原稿里出现过的新方块
          const solidLines = this._blockToSolid(newBlock)
          lines.push(...solidLines)
        }
        // 清空 Map，防止后续重复导出
        blocksMap.clear()
      }

      lines.push('}')
    }

    return lines.join('\n')
  }

  /**
   * ★ 核心缝合魔法：处理带有原稿的 Brush (完美保留纹理和 UV)
   */
  static _exportCachedBrush(block, cachedBrush) {
    const lines = ['{']
    const { position, scale, rotation, vertices } = block

    // 如果是自定义不规则图形，且拥有原稿缓存的字符串
    if (block.type === 'custom' && vertices && cachedBrush.originalLines) {
      const dummy = new THREE.Object3D()
      dummy.position.set(position.x, position.z, position.y)
      if (rotation) {
        dummy.rotation.set(
          THREE.MathUtils.degToRad(rotation.x || 0),
          THREE.MathUtils.degToRad(rotation.z || 0),
          THREE.MathUtils.degToRad(rotation.y || 0)
        )
      }
      dummy.updateMatrix()

      // 计算所有顶点的最新世界坐标 (GoldSrc 坐标系: z=高度, y=深度)
      const wVerts = vertices.map(v => {
        const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(dummy.matrix)
        return { x: Math.round(w.x), y: Math.round(w.z), z: Math.round(w.y) }
      })

      // 逐面替换坐标，保留尾部纹理 UV 基因
      for (let i = 0; i < cachedBrush.originalLines.length; i++) {
        const origLine = cachedBrush.originalLines[i]

        // 提取尾部 (从原字符串第三个 ')' 之后的所有字符)
        let closedCount = 0
        let tail = ' AAATRIGGER [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 1 1' // 默认防错
        for (let c = 0; c < origLine.length; c++) {
          if (origLine[c] === ')') closedCount++
          if (closedCount === 3) {
            tail = origLine.substring(c + 1)
            break
          }
        }

        const p1 = wVerts[i * 3]
        const p2 = wVerts[i * 3 + 1]
        const p3 = wVerts[i * 3 + 2]

        if (p1 && p2 && p3) {
          // 【绝妙拼合】：最新的世界坐标 + 最原始的纹理UV尾巴
          lines.push(`( ${p1.x} ${p1.y} ${p1.z} ) ( ${p2.x} ${p2.y} ${p2.z} ) ( ${p3.x} ${p3.y} ${p3.z} )` + tail)
        } else {
          lines.push(origLine) // 极端异常情况 fallback
        }
      }
    } else {
      // 降级：用户在代码里强行把它改成了 cube，走老逻辑
      return this._blockToSolid(block)
    }

    lines.push('}')
    return lines
  }

  /**
   * 纯新建方块的默认导出逻辑 (保持原有逻辑不变)
   */
  static _blockToSolid(block) {
    const { position, scale, rotation, type } = block

    const dummy = new THREE.Object3D()
    dummy.position.set(position.x, position.z, position.y)

    if (rotation) {
      dummy.rotation.set(
        THREE.MathUtils.degToRad(rotation.x || 0),
        THREE.MathUtils.degToRad(rotation.z || 0),
        THREE.MathUtils.degToRad(rotation.y || 0)
      )
    }
    dummy.updateMatrix()

    const textureName = block.texture || 'AAATRIGGER'
    const lines = ['{']

    // 明确轴向映射：x=宽, y=长(深), z=高
    const hx = scale.x / 2
    const hy = scale.z / 2
    const hz = scale.y / 2

    let localVerts = []
    let faces = []

    if (type === 'ramp' || type === 'wedge') {
      const topX = (type === 'ramp') ? hx : 0;
      localVerts = [
        new THREE.Vector3(-hx, -hy, -hz), // 0: 底-左-后
        new THREE.Vector3( hx, -hy, -hz), // 1: 底-右-后
        new THREE.Vector3(topX,  hy, -hz), // 2: 顶-脊-后
        new THREE.Vector3(-hx, -hy,  hz), // 3: 底-左-前
        new THREE.Vector3( hx, -hy,  hz), // 4: 底-右-前
        new THREE.Vector3(topX,  hy,  hz), // 5: 顶-脊-前
      ]
      faces = [
        { name: 'Bottom (-Z)', i: [0, 4, 3], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
        { name: 'Back (+Y)',   i: [0, 2, 1], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Front (-Y)',  i: [3, 4, 5], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Left Slant',  i: [0, 5, 2], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Right Slant', i: [1, 2, 5], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
      ]
    } else {
      // 默认走 Cube 逻辑
      localVerts = [
        new THREE.Vector3(-hx, -hy, -hz), // 0
        new THREE.Vector3( hx, -hy, -hz), // 1
        new THREE.Vector3(-hx,  hy, -hz), // 2
        new THREE.Vector3( hx,  hy, -hz), // 3
        new THREE.Vector3(-hx, -hy,  hz), // 4
        new THREE.Vector3( hx, -hy,  hz), // 5
        new THREE.Vector3(-hx,  hy,  hz), // 6
        new THREE.Vector3( hx,  hy,  hz), // 7
      ]
      faces = [
        { name: 'Left (-X)',   i: [2, 0, 6], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Right (+X)',  i: [7, 5, 3], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Back (+Y)',   i: [6, 4, 7], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Front (-Y)',  i: [3, 1, 2], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Top (+Z)',    i: [3, 2, 7], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
        { name: 'Bottom (-Z)', i: [4, 0, 5], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
      ]
    }

    const v = localVerts.map(vert => {
      const w = vert.clone().applyMatrix4(dummy.matrix)
      return {
        x: Math.round(w.x),
        y: Math.round(w.z),
        z: Math.round(w.y)
      }
    })

    for (const face of faces) {
      const p1 = v[face.i[0]]
      const p2 = v[face.i[1]]
      const p3 = v[face.i[2]]

      lines.push(
        `( ${p1.x} ${p1.y} ${p1.z} ) ` +
        `( ${p2.x} ${p2.y} ${p2.z} ) ` +
        `( ${p3.x} ${p3.y} ${p3.z} ) ` +
        `${textureName} ${face.u} ${face.v} 0 1 1`
      )
    }
    lines.push('}')

    return lines
  }
}