// ============================================================
// SaveManager — 保存/读取 .csmap 文件
// 职责: 方块序列化、JSON 解析、本地下载、服务端上传
// ============================================================

export class SaveManager {

  /**
   * 序列化方块为 .csmap JSON
   * @param {Array} blocks - 方块数据数组
   * @param {string} mapName - 地图名称
   * @param {string} roomId - 房间号
   * @param {number} gridSize - 网格大小
   * @returns {string} JSON 字符串
   */
  static serialize(blocks, mapName, roomId, gridSize = 16) {
    const now = new Date().toISOString()
    const data = {
      version: '2.2',
      mapName: mapName || '未命名地图',
      roomId: roomId || '',
      createdAt: now,
      updatedAt: now,
      gridSize,
      blocks: blocks.map(b => ({
        id: b.id,
        type: b.type || 'cube',
        position: b.position,
        scale: b.scale,
        rotation: b.rotation || { x: 0, y: 0, z: 0 },
        color: b.color,
        texture: b.texture || 'AAATRIGGER',
        tags: b.tags || []
      }))
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * 反序列化 .csmap JSON
   * @param {string} jsonString
   * @returns {{ mapName: string, roomId: string, gridSize: number, blocks: Array }}
   */
  static deserialize(jsonString) {
    const data = JSON.parse(jsonString)
    if (!data.blocks || !Array.isArray(data.blocks)) {
      throw new Error('无效的 .csmap 文件格式')
    }
    return {
      mapName: data.mapName || '未命名地图',
      roomId: data.roomId || '',
      gridSize: data.gridSize || 16,
      version: data.version || '2.0',
      blocks: data.blocks
    }
  }

  /**
   * 浏览器下载 .csmap 文件
   * @param {string} jsonString - JSON 内容
   * @param {string} filename - 文件名
   */
  static downloadFile(jsonString, filename = 'map.csmap') {
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csmap') ? filename : filename + '.csmap'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * 从浏览器文件选择器读取 .csmap
   * @param {File} file
   * @returns {Promise<object>}
   */
  static readFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = SaveManager.deserialize(e.target.result)
          resolve(data)
        } catch (err) {
          reject(new Error('文件解析失败: ' + err.message))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }

  /**
   * 从服务器保存/读取
   */
  static async saveToServer(mapName, roomId, blocks, gridSize) {
    const json = SaveManager.serialize(blocks, mapName, roomId, gridSize)
    const resp = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const resp = await fetch('/api/files/' + encodeURIComponent(filename), {
      method: 'DELETE'
    })
    if (!resp.ok) throw new Error('删除失败')
    return resp.json()
  }
}
