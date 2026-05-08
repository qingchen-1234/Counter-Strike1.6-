// ============================================================
// MapExporter — .map 文件导出器
// 将网页方块数据转换为 GoldSrc (CS 1.6) .map 格式
// ============================================================

import * as THREE from 'three'

export class MapExporter {

  /**
   * 导出所有方块为 .map 文件内容
   */
  static export(blocks) {
    const lines = []

    // 1. 极简的 worldspawn 头部 (完全向 J.A.C.K 靠齐)
    lines.push('{')
    lines.push('"classname" "worldspawn"')
    lines.push('"mapversion" "220"')
    lines.push('"wad" ""')
    lines.push('"_generator" "CSMapCollab v2.5 (J.A.C.K Standard)"')

    for (const block of blocks) {
      const solidLines = this._blockToSolid(block)
      lines.push(...solidLines)
    }

    lines.push('}')
    return lines.join('\n')
  }

  /**
   * 将单个方块转换为 solid 定义
   * 严格复刻 J.A.C.K. 的 "L型边缘取点法"，彻底杜绝对角线拉伸错误
   */
  static _blockToSolid(block) {
    const { position, scale, rotation } = block

    // 创建虚拟对象同步空间变换
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

    // 获取局部半尺寸 (Three.js 本地轴)
    const hx = scale.x / 2
    const hy = scale.y / 2
    const hz = scale.z / 2

    // 严密的 8 个基准顶点 (Three.js 坐标系)
    const localVerts = [
      new THREE.Vector3(-hx, -hy, -hz), // 0
      new THREE.Vector3( hx, -hy, -hz), // 1
      new THREE.Vector3(-hx,  hy, -hz), // 2
      new THREE.Vector3( hx,  hy, -hz), // 3
      new THREE.Vector3(-hx, -hy,  hz), // 4
      new THREE.Vector3( hx, -hy,  hz), // 5
      new THREE.Vector3(-hx,  hy,  hz), // 6
      new THREE.Vector3( hx,  hy,  hz), // 7
    ]

    // 变换到世界坐标并转为 GoldSrc 坐标系 (Three.Y 变 Gold.Z, Three.Z 变 Gold.Y)
    const v = localVerts.map(vert => {
      const w = vert.clone().applyMatrix4(dummy.matrix)
      return {
        x: Math.round(w.x),
        y: Math.round(w.z),
        z: Math.round(w.y)
      }
    })

    // 🔥 核心奥秘：这完全是 J.A.C.K 的原生取点逻辑！
    // 不跨对角线，沿着两条相邻边走，且保证法线朝外。
    // v 的索引映射关系已经通过坐标系反推精确对齐。
    const faces = [
      { name: 'Left (-X)',   i: [2, 0, 6], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
      { name: 'Right (+X)',  i: [7, 5, 3], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
      { name: 'Back (+Y)',   i: [6, 4, 7], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
      { name: 'Front (-Y)',  i: [3, 1, 2], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
      { name: 'Top (+Z)',    i: [3, 2, 7], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
      { name: 'Bottom (-Z)', i: [4, 0, 5], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
    ]

    const textureName = block.texture || 'AAATRIGGER'
    const lines = ['{']

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