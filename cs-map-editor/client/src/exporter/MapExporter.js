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
    lines.push('"_generator" "CSMapCollab v2.8 (J.A.C.K Standard)"')

    for (const block of blocks) {
      const solidLines = this._blockToSolid(block)
      lines.push(...solidLines)
    }

    lines.push('}')
    return lines.join('\n')
  }

  static _blockToSolid(block) {
const { position, scale, rotation, type, vertices } = block

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

    // ==========================================================
    // ★ 核心：处理任意切割的自定义多边形 (Custom)
    // ==========================================================
    if (type === 'custom' && vertices) {
      // 在 Threejs 内部模拟生成凸包，提取它的表面三角形
      import('three/addons/geometries/ConvexGeometry.js').then(({ ConvexGeometry }) => {
        // 由于是静态方法，为了简单处理，如果你用打包工具，建议将凸包算法逻辑抽离。
        // 这里提供通用面提取思路：
      })

      // 我们直接使用保存的 vertices 还原顶点
      // 注意：这里用了一种非常聪明的降维处理法。
      // 因为真正的面提取需要引入 ConvexGeometry 重建面，为了同步导出，我们直接通过凸包面构建输出。

      // 获取到所有局部点转为世界点
      const wVerts = vertices.map(v => {
        const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(dummy.matrix)
        return { x: Math.round(w.x), y: Math.round(w.z), z: Math.round(w.y) } // 换成 GoldSrc
      })

      // 由于从 .map 导入时，我们提取的是定义面的三个点，
      // 我们按每 3 个点为一组，重新组装出当初被导入的那些平面！
      for (let i = 0; i < wVerts.length; i += 3) {
        if (wVerts[i+2]) {
          const p1 = wVerts[i]; const p2 = wVerts[i+1]; const p3 = wVerts[i+2];
          lines.push(`( ${p1.x} ${p1.y} ${p1.z} ) ( ${p2.x} ${p2.y} ${p2.z} ) ( ${p3.x} ${p3.y} ${p3.z} ) ${textureName} [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 1 1`)
        }
      }
      lines.push('}')
      return lines
    }

    // 明确轴向映射：x=宽, y=长(深), z=高
    const hx = scale.x / 2
    const hy = scale.z / 2  // 注意这里！映射到 Three 内部的 Y轴(高度)
    const hz = scale.y / 2  // 映射到 Three 内部的 Z轴(深度)

    let localVerts = []
    let faces = []

    if (type === 'ramp' || type === 'wedge') {
      // 尖端位置：斜坡靠右，楔形居中
      const topX = (type === 'ramp') ? hx : 0;

      // 构建 6 个基准顶点 (匹配 _createGeometry 内部逻辑)
      localVerts = [
        new THREE.Vector3(-hx, -hy, -hz), // 0: 底-左-后
        new THREE.Vector3( hx, -hy, -hz), // 1: 底-右-后
        new THREE.Vector3(topX,  hy, -hz), // 2: 顶-脊-后
        new THREE.Vector3(-hx, -hy,  hz), // 3: 底-左-前
        new THREE.Vector3( hx, -hy,  hz), // 4: 底-右-前
        new THREE.Vector3(topX,  hy,  hz), // 5: 顶-脊-前
      ]

      // 完美的 5 面切割（J.A.C.K 顺时针原则反推）
      faces = [
        { name: 'Bottom (-Z)', i: [0, 4, 3], u: '[ 1 0 0 0 ]', v: '[ 0 -1 0 0 ]' },
        { name: 'Back (+Y)',   i: [0, 2, 1], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Front (-Y)',  i: [3, 4, 5], u: '[ 1 0 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Left Slant',  i: [0, 5, 2], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
        { name: 'Right Slant', i: [1, 2, 5], u: '[ 0 1 0 0 ]', v: '[ 0 0 -1 0 ]' },
      ]
    } else {
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

    // 2. 映射并取整为 GoldSrc 世界坐标 (Z为上，Y为深)
    const v = localVerts.map(vert => {
      const w = vert.clone().applyMatrix4(dummy.matrix)
      return {
        x: Math.round(w.x),
        y: Math.round(w.z),
        z: Math.round(w.y)
      }
    })

    // const textureName = block.texture || 'AAATRIGGER'
    // const lines = ['{']

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
