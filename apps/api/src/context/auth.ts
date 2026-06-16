import { AppError } from "@werewolf/shared";

export interface MatrixWhoami {
  user_id: string;
  device_id?: string;
  displayname?: string;
  display_name?: string;
  avatar_url?: string;
  avatarUrl?: string;
}

export interface MatrixProfile {
  displayname?: string;
  display_name?: string;
  avatar_url?: string;
  avatarUrl?: string;
}

export interface MatrixAuthClient {
  whoami(token: string): Promise<MatrixWhoami>;
  profile?(userId: string, token: string): Promise<MatrixProfile>;
}

export interface AuthenticatedUser {
  id: string;
  matrixUserId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface CachedMatrixProfile {
  matrixUserId: string;
  displayName: string;
  avatarUrl?: string;
  profileSyncedAt?: Date;
}

export interface MatrixProfileCache {
  get(matrixUserId: string): Promise<CachedMatrixProfile | null>;
  upsert(profile: CachedMatrixProfile): Promise<void>;
  touch?(matrixUserId: string): Promise<void>;
}

// 内存缓存延长到 5 分钟，减少 whoami 调用频率
const authTokenCacheTtlMs = 5 * 60 * 1000;

const authTokenCache = new Map<
  string,
  { expiresAt: number; user: AuthenticatedUser }
>();

export function clearAuthTokenCacheForTests(): void {
  authTokenCache.clear();
}

export async function authenticateFromBody(
  request: Request,
  _matrix: MatrixAuthClient,
  bodyIdentity: { userId?: string | undefined; displayName?: string | undefined; avatarUrl?: string | undefined },
  profileCache?: MatrixProfileCache
): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  const token = match?.[1];
  if (!token) {
    throw new AppError("unauthorized", "Matrix bearer token is required", 401);
  }

  const demoToken = process.env.DEMO_USER_TOKEN;
  if (demoToken && token === demoToken) {
    const demoUserId = process.env.DEMO_USER_ID ?? "@kimigame1:keepsecret.io";
    return {
      id: demoUserId,
      matrixUserId: demoUserId,
      displayName: "kimi game 1",
      ...(process.env.DEMO_USER_AVATAR_URL
        ? { avatarUrl: process.env.DEMO_USER_AVATAR_URL }
        : {}),
    };
  }

  const cachedAuth = authTokenCache.get(token);
  if (cachedAuth && cachedAuth.expiresAt > Date.now()) {
    return cachedAuth.user;
  }

  const cacheAndReturn = (user: AuthenticatedUser): AuthenticatedUser => {
    authTokenCache.set(token, { user, expiresAt: Date.now() + authTokenCacheTtlMs });
    return user;
  };

  // Body has userId — skip whoami, trust the SDK-provided identity.
  const { userId, displayName, avatarUrl } = bodyIdentity;
  if (userId) {
    const resolvedDisplayName = displayName ?? userId;
    const user: AuthenticatedUser = {
      id: userId,
      matrixUserId: userId,
      displayName: resolvedDisplayName,
      ...(avatarUrl ? { avatarUrl } : {}),
    };
    if (profileCache && displayName) {
      void profileCache
        .upsert({ matrixUserId: userId, displayName: resolvedDisplayName, ...(avatarUrl ? { avatarUrl } : {}), profileSyncedAt: new Date() })
        .catch(() => undefined);
    }
    return cacheAndReturn(user);
  }

  // Fallback: no body identity, call whoami as usual.
  try {
    const whoami = await _matrix.whoami(token);
    const cached = profileCache
      ? await profileCache.get(whoami.user_id).catch(() => null)
      : null;
    if (cached) {
      void Promise.resolve(profileCache?.touch?.(whoami.user_id)).catch(() => undefined);
      return cacheAndReturn({
        id: whoami.user_id,
        matrixUserId: whoami.user_id,
        displayName: cached.displayName,
        ...(cached.avatarUrl ? { avatarUrl: cached.avatarUrl } : {}),
      });
    }
    const fallbackDisplayName = whoami.displayname ?? whoami.display_name ?? whoami.user_id;
    const fallbackAvatarUrl = whoami.avatarUrl ?? whoami.avatar_url;
    return cacheAndReturn({
      id: whoami.user_id,
      matrixUserId: whoami.user_id,
      displayName: fallbackDisplayName,
      ...(fallbackAvatarUrl ? { avatarUrl: fallbackAvatarUrl } : {}),
    });
  } catch {
    throw new AppError("unauthorized", "Invalid Matrix bearer token", 401);
  }
}

export async function authenticateRequest(
  request: Request,
  _matrix: MatrixAuthClient,
  profileCache?: MatrixProfileCache
): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("access_token") ?? undefined;
  const token = match?.[1] ?? queryToken;
  if (!token) {
    throw new AppError("unauthorized", "Matrix bearer token is required", 401);
  }

  const demoToken = process.env.DEMO_USER_TOKEN;
  if (demoToken && token === demoToken) {
    const demoUserId = process.env.DEMO_USER_ID ?? "@kimigame1:keepsecret.io";
    return {
      id: demoUserId,
      matrixUserId: demoUserId,
      displayName: "kimi game 1",
      ...(process.env.DEMO_USER_AVATAR_URL
        ? { avatarUrl: process.env.DEMO_USER_AVATAR_URL }
        : {}),
    };
  }

  const cachedAuth = authTokenCache.get(token);
  if (cachedAuth && cachedAuth.expiresAt > Date.now()) {
    return cachedAuth.user;
  }

  const cacheAndReturn = (user: AuthenticatedUser): AuthenticatedUser => {
    authTokenCache.set(token, {
      user,
      expiresAt: Date.now() + authTokenCacheTtlMs,
    });
    return user;
  };

  try {
    const whoami = await _matrix.whoami(token);

    // DB 有行（不论 profileSyncedAt 是否存在）→ 直接用，不调 /profile
    const cached = profileCache
      ? await profileCache.get(whoami.user_id).catch(() => null)
      : null;
    if (cached) {
      void Promise.resolve(profileCache?.touch?.(whoami.user_id)).catch(
        () => undefined
      );
      return cacheAndReturn({
        id: whoami.user_id,
        matrixUserId: whoami.user_id,
        displayName: cached.displayName,
        ...(cached.avatarUrl ? { avatarUrl: cached.avatarUrl } : {}),
      });
    }

    // DB 无行：用 whoami 自带的信息兜底，不发起 /profile 请求。
    // displayName/avatarUrl 会在用户 join 游戏时由前端传入并写入 DB，
    // 之后的所有请求都走上面的 DB 缓存路径。
    const displayName =
      whoami.displayname ??
      whoami.display_name ??
      whoami.user_id;
    const avatarUrl = whoami.avatarUrl ?? whoami.avatar_url;
    return cacheAndReturn({
      id: whoami.user_id,
      matrixUserId: whoami.user_id,
      displayName,
      ...(avatarUrl ? { avatarUrl } : {}),
    });
  } catch {
    throw new AppError("unauthorized", "Invalid Matrix bearer token", 401);
  }
}
