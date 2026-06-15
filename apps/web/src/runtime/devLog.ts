import { un as mobileLog } from "@unseal-network/mobile-log";
import { co } from "@unseal-network/mobile-sdk";

export const DEV_LOG_STORAGE_KEY = "werewolfDevLog";
export const DEV_LOG_QUERY_KEY = "devLog";

function readDevLogFlag(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get(DEV_LOG_QUERY_KEY);
  if (queryValue === "1" || queryValue === "true") return true;
  if (queryValue === "0" || queryValue === "false") return false;

  return co.storage.getItem(DEV_LOG_STORAGE_KEY) === "1";
}

export const un = {
  log(...args: unknown[]): void {
    if (!readDevLogFlag()) return;
    // mobileLog.log(...args);
  },
};

