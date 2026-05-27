/**
 * 非 iframe 环境下的 iframeMessage mock 实现。
 * 读取 .env.development.local 中的配置返回测试数据，
 * 实现完整的 IFrameMessageType 接口。
 */
import type { AgentUser, IFrameMessageType, RoomAuthResult, RoomInfo } from "@unseal-network/game-sdk";

const env = import.meta.env;

export function createIframeMessageMock(): IFrameMessageType {
  const mockInfo = {
    roomId: env.VITE_MOCK_ROOM_ID ?? "!dev_room:local",
    userId: env.VITE_MOCK_USER_ID ?? "@dev_user:local",
    displayName: env.VITE_MOCK_DISPLAY_NAME ?? "Dev Player",
    powerLevel: Number(env.VITE_MOCK_POWER_LEVEL ?? 100),
    config: {
      streamURL:
        env.VITE_UNSEAL_API_BASE_URL ??
        env.VITE_MOCK_UNSEAL_STREAM_URL ??
        "http://localhost:12018",
    },
    gameRoomId: env.VITE_MOCK_LINK_ROOM_ID ?? "",
    linkRoomId: env.VITE_MOCK_LINK_ROOM_ID ?? "",
  };

  const mockToken: string = env.VITE_MOCK_TOKEN ?? "";

  return {
    getInfo: () => {
      console.info("[mock] iframeMessage.getInfo()", mockInfo);
      return Promise.resolve(mockInfo);
    },
    getToken: () => {
      console.info("[mock] iframeMessage.getToken()", mockToken);
      return Promise.resolve(mockToken);
    },
    send: (msg) => {
      console.info("[mock] iframeMessage.send()", msg);
    },
    sendSync: (msg) => {
      console.info("[mock] iframeMessage.sendSync()", msg);
      return Promise.resolve(undefined);
    },
    on: (op, cbk) => {
      console.info("[mock] iframeMessage.on()", op, cbk);
    },
    once: (op, cbk) => {
      console.info("[mock] iframeMessage.once()", op, cbk);
    },
    off: (op, cbk) => {
      console.info("[mock] iframeMessage.off()", op, cbk);
    },
    call: {
      join: () => {
        console.info("[mock] call.join");
        return Promise.resolve();
      },
      leave: () => {
        console.info("[mock] call.leave");
        return Promise.resolve();
      },
      mute: () => {
        console.info("[mock] call.mute");
        return Promise.resolve();
      },
      unmute: () => {
        console.info("[mock] call.unmute");
        return Promise.resolve();
      },
    },
    getMembers: () => Promise.resolve([]),
    getMember: () => Promise.resolve(undefined),
    getRoom: () =>
      Promise.resolve({ roomId: mockInfo.roomId, name: "Dev Room" }),
    closeApp: () => {
      console.info("[mock] closeApp");
    },
    hideApp: () => {
      console.info("[mock] hideApp");
    },
    updateApp: (data) => {
      console.info("[mock] updateApp", data);
    },
    room: {
      enter: (roomId?: string) => {
        const result: RoomAuthResult = {
          user: {
            userId: mockInfo.userId,
            displayName: mockInfo.displayName,
            avatarUrl: "",
          },
          token: mockToken,
        };
        console.info("[mock] room.enter()", roomId, result);
        return Promise.resolve(result);
      },
      query: (roomId?: string) => {
        const result: RoomInfo = {
          roomId: mockInfo.roomId,
          meetId: mockInfo.roomId,
          status: "active",
          playerCount: null,
          currentPlayers: 0,
          mode: "werewolf",
          lang: "zh",
          adminId: mockInfo.userId,
          creatorId: mockInfo.userId,
          refereeId: null,
          gameAppId: 1,
          linkRoomId: mockInfo.linkRoomId ?? "",
          isMine: true,
          players: [],
        };
        console.info("[mock] room.query()", roomId, result);
        return Promise.resolve(result);
      },
      link: (gameRoomId: string) => {
        console.info("[mock] room.link()", gameRoomId);
        return Promise.resolve();
      },
      getAgents: (roomId: string): Promise<AgentUser[]> => {
        console.info("[mock] room.getAgents()", roomId);
        return Promise.resolve([]);
      },
    },
  };
}

/** 检测当前是否运行在 iframe 内 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // 跨域时访问 window.top 会抛异常，说明一定在 iframe 内
    return true;
  }
}
