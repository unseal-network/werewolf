export const DEMO_TOKEN = "syt_a2ltaWdhbWUx_WEnXKgiFtirbEiSPTMwU_2p1YIY";
export const DEMO_USER_ID = "@kimigame1:keepsecret.io";
export const DEMO_DISPLAY_NAME = "kimi game 1";
export const DEFAULT_SOURCE_ROOM_ID = "!FWTlpFYoOXfndnfReT:keepsecret.io";

export const MATRIX_TOKEN_STORAGE_KEY = "matrixAccessToken";
export const MATRIX_USER_ID_STORAGE_KEY = "matrixUserId";
export const MATRIX_DISPLAY_NAME_STORAGE_KEY = "matrixDisplayName";
export const SOURCE_ROOM_STORAGE_KEY = "lastSourceMatrixRoomId";
const MATRIX_TOKEN_COOKIE_KEY = "werewolf_matrix_access_token";
const MATRIX_USER_ID_COOKIE_KEY = "werewolf_matrix_user_id";
const MATRIX_DISPLAY_NAME_COOKIE_KEY = "werewolf_matrix_display_name";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface MatrixSessionProfile {
  accessToken: string;
  userId: string;
  displayName: string;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split("; ")
    .find((chunk) => chunk.startsWith(encodedName));
  if (!match) return null;
  return decodeURIComponent(match.slice(encodedName.length));
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ` +
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function readStoredValue(storageKey: string, cookieKey: string): string | null {
  const cookieValue = readCookie(cookieKey);
  if (cookieValue) return cookieValue;
  return localStorage.getItem(storageKey);
}

export function readMatrixToken(): string {
  return readStoredValue(MATRIX_TOKEN_STORAGE_KEY, MATRIX_TOKEN_COOKIE_KEY) ?? DEMO_TOKEN;
}

export function writeMatrixToken(token: string): void {
  writeCookie(MATRIX_TOKEN_COOKIE_KEY, token);
  localStorage.setItem(MATRIX_TOKEN_STORAGE_KEY, token);
}

export function writeMatrixIdentity(userId: string, displayName: string): void {
  writeCookie(MATRIX_USER_ID_COOKIE_KEY, userId);
  writeCookie(MATRIX_DISPLAY_NAME_COOKIE_KEY, displayName);
  localStorage.setItem(MATRIX_USER_ID_STORAGE_KEY, userId);
  localStorage.setItem(MATRIX_DISPLAY_NAME_STORAGE_KEY, displayName);
}

export function writeMatrixSession(profile: MatrixSessionProfile): void {
  writeMatrixToken(profile.accessToken);
  writeMatrixIdentity(profile.userId, profile.displayName);
}

export function readStoredMatrixUserId(): string | null {
  return readStoredValue(MATRIX_USER_ID_STORAGE_KEY, MATRIX_USER_ID_COOKIE_KEY);
}

export function readStoredMatrixDisplayName(): string | null {
  return readStoredValue(
    MATRIX_DISPLAY_NAME_STORAGE_KEY,
    MATRIX_DISPLAY_NAME_COOKIE_KEY
  );
}

export function readStoredMatrixSession(): MatrixSessionProfile | null {
  const accessToken = readStoredValue(
    MATRIX_TOKEN_STORAGE_KEY,
    MATRIX_TOKEN_COOKIE_KEY
  );
  const userId = readStoredMatrixUserId();
  const displayName = readStoredMatrixDisplayName();
  if (!accessToken || !userId || !displayName) return null;
  return { accessToken, userId, displayName };
}

export function hasStoredMatrixSession(): boolean {
  return Boolean(readStoredMatrixSession());
}

export function clearMatrixSession(): void {
  clearCookie(MATRIX_TOKEN_COOKIE_KEY);
  clearCookie(MATRIX_USER_ID_COOKIE_KEY);
  clearCookie(MATRIX_DISPLAY_NAME_COOKIE_KEY);
  localStorage.removeItem(MATRIX_TOKEN_STORAGE_KEY);
  localStorage.removeItem(MATRIX_USER_ID_STORAGE_KEY);
  localStorage.removeItem(MATRIX_DISPLAY_NAME_STORAGE_KEY);
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
