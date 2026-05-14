export interface HostGameInfo {
  roomId?: string | undefined;
  gameRoomId?: string | undefined;
  linkRoomId?: string | undefined;
  userId?: string | undefined;
  displayName?: string | undefined;
  powerLevel?: number | undefined;
  config?: {
    streamURL?: string | undefined;
  } | undefined;
  [key: string]: unknown;
}

export interface HostBridge {
  getInfo(): Promise<HostGameInfo>;
  getToken(): Promise<string>;
  closeApp?(): void;
  hideApp?(): void;
}

declare global {
  interface Window {
    __WEREWOLF_HOST_BRIDGE__?: HostBridge | undefined;
    iframeMessage?: HostBridge | undefined;
  }
}

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isHostRuntime(): boolean {
  return Boolean(
    window.__WEREWOLF_HOST_BRIDGE__ ||
      window.iframeMessage ||
      isInIframe() ||
      import.meta.env.VITE_HOST_RUNTIME === "1"
  );
}

export function createHostBridge(): HostBridge {
  const realBridge = window.__WEREWOLF_HOST_BRIDGE__ ?? window.iframeMessage;
  if (realBridge) return realBridge;
  return createMockHostBridge();
}

export function createMockHostBridge(): HostBridge {
  const mockInfo: HostGameInfo = {
    roomId: import.meta.env.VITE_MOCK_ROOM_ID ?? "!dev_room:local",
    userId: import.meta.env.VITE_MOCK_USER_ID ?? "@dev_user:local",
    displayName: import.meta.env.VITE_MOCK_DISPLAY_NAME ?? "Dev Player",
    powerLevel: Number(import.meta.env.VITE_MOCK_POWER_LEVEL ?? 100),
    config: {
      streamURL:
        import.meta.env.VITE_UNSEAL_API_BASE_URL ??
        import.meta.env.VITE_MOCK_UNSEAL_STREAM_URL ??
        "",
    },
    linkRoomId: import.meta.env.VITE_MOCK_LINK_ROOM_ID ?? "",
  };
  const mockToken = import.meta.env.VITE_MOCK_TOKEN ?? "";
  return {
    getInfo: async () => mockInfo,
    getToken: async () => mockToken,
    closeApp: () => undefined,
    hideApp: () => undefined,
  };
}
