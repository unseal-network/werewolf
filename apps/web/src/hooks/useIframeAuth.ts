import { useCallback, useMemo, useRef, useState } from "react";
import { useIFrameMessage, type GameInfo } from "@unseal-network/game-sdk";
import { co } from "@unseal-network/mobile-sdk";
import { createIframeMessageMock, isInIframe } from "../mocks/iframeMessageMock";

export type { GameInfo };

export function useIframeAuth() {
  // 真实 SDK hook（绑定 window.iframeMessage）
  const realMessage = useIFrameMessage();
  // 本地开发 mock（实现完整 IFrameMessageType）
  const mockMessage = useMemo(() => createIframeMessageMock(), []);

  // 在 iframe 内 或 移动端小程序 → 使用真实 SDK；否则 → 使用 mock
  const iframeMessage =
    isInIframe() || co.isMobile ? realMessage : mockMessage;

  const [info, setInfo] = useState<GameInfo | null>(null);
  const tokenRef = useRef<string>("");

  /**
   * 一次性初始化：获取 GameInfo 和 Token。
   * 在 main.tsx 的 bootstrap useEffect 中调用一次。
   */
  const init = useCallback(async (): Promise<GameInfo> => {
    const gameInfo = await iframeMessage.getInfo();
    const token = (await iframeMessage.getToken()) ?? "";
    tokenRef.current = token;
    setInfo(gameInfo);
    return gameInfo;
  }, [iframeMessage]);

  /** 异步刷新 token（token 过期时使用） */
  const getToken = useCallback(async (): Promise<string> => {
    const fresh = (await iframeMessage.getToken()) ?? "";
    tokenRef.current = fresh;
    return fresh;
  }, [iframeMessage]);

  /** 同步读取最近一次缓存的 token */
  const getTokenSync = useCallback((): string => {
    return tokenRef.current;
  }, []);

  return {
    info,
    setInfo,
    getToken,
    getTokenSync,
    /** 完整 IFrameMessageType 对象（hideApp / closeApp / send / on 等） */
    iframeMessage,
    init,
  };
}
