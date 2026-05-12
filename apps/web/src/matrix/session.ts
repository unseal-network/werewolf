export const DEMO_TOKEN = "syt_a2ltaWdhbWUx_WEnXKgiFtirbEiSPTMwU_2p1YIY";
export const DEMO_USER_ID = "@kimigame1:keepsecret.io";
export const DEMO_DISPLAY_NAME = "kimi game 1";
export const DEFAULT_SOURCE_ROOM_ID = "!FWTlpFYoOXfndnfReT:keepsecret.io";

export const MATRIX_TOKEN_STORAGE_KEY = "matrixAccessToken";
export const MATRIX_USER_ID_STORAGE_KEY = "matrixUserId";
export const SOURCE_ROOM_STORAGE_KEY = "lastSourceMatrixRoomId";

export function readMatrixToken(): string {
  return localStorage.getItem(MATRIX_TOKEN_STORAGE_KEY) ?? DEMO_TOKEN;
}

export function writeMatrixToken(token: string): void {
  localStorage.setItem(MATRIX_TOKEN_STORAGE_KEY, token);
}

export function matrixServerBaseFromToken(token: string): string {
  if (token.includes(":")) {
    const atMatch = token.match(/@[^:]+:([^:]+)$/);
    if (atMatch) {
      return `https://${atMatch[1]}`;
    }
  }
  const mxMatch = token.match(/\.([A-Za-z0-9.-]+)(?::\w+)?$/);
  if (mxMatch) {
    return `https://${mxMatch[1]}`;
  }
  return "https://keepsecret.io";
}
