/**
 * 非 iframe 环境下的 iframeMessage mock 实现
 * 读取 .env.development.local 中的配置返回测试数据
 */

import type { IFrameMessageType } from '@unseal-network/game-sdk'

const env = import.meta.env
console.log(env)
export function createIframeMessageMock(): IFrameMessageType {
  const mockInfo = {
    roomId: env.VITE_MOCK_ROOM_ID ?? '!dev_room:local',
    userId: env.VITE_MOCK_USER_ID ?? '@dev_user:local',
    displayName: env.VITE_MOCK_DISPLAY_NAME ?? 'Dev Player',
    powerLevel: Number(env.VITE_MOCK_POWER_LEVEL ?? 100),
    config: { streamURL: '' },
    gameRoomId: '',   // 游戏房间 ID，初始为空，创建/加入后由 App 管理
  }

  const mockToken: string = env.VITE_MOCK_TOKEN ?? ''

  return {
    getInfo: () => {
      console.info('[mock] iframeMessage.getInfo()', mockInfo)
      return Promise.resolve(mockInfo)
    },
    getToken: () => {
      console.info('[mock] iframeMessage.getToken()', mockToken)
      return Promise.resolve(mockToken)
    },
    send: (msg) => {
      console.info('[mock] iframeMessage.send()', msg)
    },
    sendSync: (msg) => {
      console.info('[mock] iframeMessage.sendSync()', msg)
      return Promise.resolve(undefined)
    },
    on: (op, cbk) => {
      console.info('[mock] iframeMessage.on()', op, cbk)
    },
    once: (op, cbk) => {
      console.info('[mock] iframeMessage.once()', op, cbk)
    },
    off: (op) => {
      console.info('[mock] iframeMessage.off()', op)
    },
    call: {
      join: () => { console.info('[mock] call.join'); return Promise.resolve() },
      leave: () => { console.info('[mock] call.leave'); return Promise.resolve() },
      mute: () => { console.info('[mock] call.mute'); return Promise.resolve() },
      unmute: () => { console.info('[mock] call.unmute'); return Promise.resolve() },
    },
    getMembers: () => Promise.resolve([]),
    getMember: () => Promise.resolve(undefined),
    getRoom: () => Promise.resolve({ roomId: mockInfo.roomId, name: 'Dev Room' }),
    closeApp: () => { console.info('[mock] closeApp') },
    hideApp: () => { console.info('[mock] hideApp') },
    updateApp: (data) => { console.info('[mock] updateApp', data) },
  }
}

/** 检测当前是否运行在 iframe 内 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // 跨域时访问 window.top 会抛异常，说明一定在 iframe 内
    return true
  }
}
