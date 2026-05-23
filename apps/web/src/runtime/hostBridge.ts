import { co } from "@unseal-network/mobile-sdk";

export interface HostGameInfo {
  roomId?: string | undefined;
  gameRoomId?: string | undefined;
  linkRoomId?: string | undefined;
  userId?: string | undefined;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
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
      co.isMobile ||
      isInIframe() ||
      import.meta.env.VITE_HOST_RUNTIME === "1"
  );
}

export function createHostBridge(): HostBridge {
  const realBridge = window.__WEREWOLF_HOST_BRIDGE__ ?? window.iframeMessage;
  if (realBridge) return realBridge;
  if (co.isMobile) return createMobileHostBridge();
  if (isInIframe()) {
    return createIframeHostBridge();
  }
  return createMockHostBridge();
}

function normalizeHostToken(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const token = value as Record<string, unknown>;
  const accessToken = token.accessToken ?? token.access_token ?? token.token;
  return typeof accessToken === "string" ? accessToken : "";
}

function normalizeHostInfo(value: unknown): HostGameInfo {
  return value && typeof value === "object" ? (value as HostGameInfo) : {};
}

export function createMobileHostBridge(): HostBridge {
  return {
    getInfo: async () => normalizeHostInfo(await co.getGameInfo()),
    getToken: async () => normalizeHostToken(await co.getToken()),
    closeApp: () => {
      void co.back();
    },
    hideApp: () => {
      void co.back();
    },
  };
}

export interface IframeHostBridgeOptions {
  timeoutMs?: number;
}

let iframeRequestSeq = 0;

export function createIframeHostBridge(
  options: IframeHostBridgeOptions = {}
): HostBridge {
  return {
    getInfo: async () =>
      normalizeHostInfo(await requestIframeHost("game-info", options)),
    getToken: async () =>
      normalizeHostToken(await requestIframeHost("game-get-token", options)),
    closeApp: () => {
      void sendIframeHostCommand("game-minimize");
    },
    hideApp: () => {
      void sendIframeHostCommand("game-minimize");
    },
  };
}

function requestIframeHost(
  op: string,
  options: IframeHostBridgeOptions
): Promise<unknown> {
  const id = `werewolf_${Date.now()}_${++iframeRequestSeq}`;
  const timeoutMs = options.timeoutMs ?? 8000;
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;
      if (data.op !== op || data.id !== id) return;
      cleanup();
      resolve(data.data);
    };
    window.addEventListener("message", onMessage);
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Unseal iframe host did not respond to ${op}`));
    }, timeoutMs);
    window.parent?.postMessage({ op, id }, "*");
  });
}

function sendIframeHostCommand(op: string): void {
  window.parent?.postMessage(
    { op, id: `werewolf_${Date.now()}_${++iframeRequestSeq}` },
    "*"
  );
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
