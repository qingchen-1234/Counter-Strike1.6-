// ============================================================
// MapExporter — .map 文件导出器
// 将网页方块数据转换为 GoldSrc (CS 1.6) .map 格式
// ============================================================

import * as THREE from 'three'

export class MapExporter {

  static export(blocks) {
    const lines = []

    lines.push('{')
    lines.push('"classname" "worldspawn"')
    lines.push('"mapversion" "220"')
    lines.push('"wad" ""')
    lines.push('"_generator" "CSMapCollab v2.6 (J.A.C.K Standard)"')

    for (const block of blocks) {
      const solidLines = this._blockToSolid(block)
      lines.push(...solidLines)
    }

    lines.push('}')
    return lines.join('\n')
  }

  static _blockToSolid(block) {
    const { position, scale, rotation, type } = block

    // 1. 同步世界变换矩阵
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

    const hx = scale.x / 2
    const hy = scale.y / 2
    const hz = scale.z / 2

    let localVerts = []
    let faces = []

    // ==========================================================
    // ★ 异形方块逻辑：斜坡(Ramp) & 楔形(Wedge) 共享五面切割算法
    // ==========================================================
    if (type === 'ramp' || type === 'wedge') {

      // 核心差异：斜坡的尖端靠右侧，楔形的尖端居中
      const topX = (type === 'ramp') ? hx : 0;

      // 定义 6 个核心控制点 (Three.js 本地轴)
      localVerts = [
        new THREE.Vector3(-hx, -hy, -hz), // 0: 底-左-后
        new THREE.Vector3( hx, -hy, -hz), // 1: 底-右-后
        new THREE.Vector3(topX,  hy, -hz), // 2: 顶-脊-后
        new THREE.Vector3(-hx, -hy,  hz), // 3: 底-左-前
        new THREE.Vector3( hx, -hy,  hz), // 4: 底-右-前
        new THREE.Vector3(topX,  hy,  hz), // 5: 顶-脊-前
      ]

      // 精确的 5 面索引 (基于 J.A.C.K. 逆向推导，绝对向外不交叉)
      faces = [
        { name: 'Front (-Y)',   i: [1, 0, 2], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Back (+Y)',    i: [3, 4, 5], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Bottom (-Z)',  i: [4, 3, 1], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
        { name: 'Right Slant',  i: [5, 4, 2], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Left Slant',   i: [2, 0, 5], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
      ]
    }
    // ==========================================================
    // ★ 基础方块逻辑：立方体(Cube) 标准六面切割算法
    // ==========================================================
    else {
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

    // 2. 映射到 GoldSrc 坐标系 (Y/Z 互换)
    const v = localVerts.map(vert => {
      const w = vert.clone().applyMatrix4(dummy.matrix)
      return {
        x: Math.round(w.x),
        y: Math.round(w.z),
        z: Math.round(w.y)
      }
    })

    const textureName = block.texture || 'AAATRIGGER'
    const lines = ['{']

    // 3. 写入面数据
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

  static download(content, filename = 'map.map') {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}