/**
 * hostBridge.ts — 运行环境检测工具。
 *
 * 只负责判断当前是否运行在 host runtime（iframe / 小程序）中。
 * 实际的 iframeMessage 获取和 mock 切换由 useIframeAuth hook 统一处理。
 */
import { co } from "@unseal-network/mobile-sdk";

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
      co.isMobile ||
      isInIframe() ||
      import.meta.env.VITE_HOST_RUNTIME === "1"
  );
}

// 保留 window 类型声明，供 isHostRuntime 的条件检测使用
declare global {
  interface Window {
    __WEREWOLF_HOST_BRIDGE__?: unknown;
    iframeMessage?: unknown;
  }
}
