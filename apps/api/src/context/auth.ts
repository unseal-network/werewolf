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

const profileRefreshMs = 3 * 24 * 60 * 60 * 1000;

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

  try {
    const whoami = await _matrix.whoami(token);
    const cached = profileCache
      ? await profileCache.get(whoami.user_id).catch(() => null)
      : null;
    if (
      cached?.profileSyncedAt &&
      Date.now() - cached.profileSyncedAt.getTime() < profileRefreshMs
    ) {
      void Promise.resolve(profileCache?.touch?.(whoami.user_id)).catch(
        () => undefined
      );
      return {
        id: whoami.user_id,
        matrixUserId: whoami.user_id,
        displayName: cached.displayName,
        ...(cached.avatarUrl ? { avatarUrl: cached.avatarUrl } : {}),
      };
    }
    const profile = _matrix.profile
      ? await _matrix.profile(whoami.user_id, token).catch(() => undefined)
      : undefined;
    const displayName =
      profile?.displayname ??
      profile?.display_name ??
      cached?.displayName ??
      whoami.displayname ??
      whoami.display_name ??
      whoami.user_id;
    const avatarUrl =
      profile?.avatarUrl ??
      profile?.avatar_url ??
      cached?.avatarUrl ??
      whoami.avatarUrl ??
      whoami.avatar_url;
    void Promise.resolve(
      profileCache?.upsert({
        matrixUserId: whoami.user_id,
        displayName,
        ...(avatarUrl ? { avatarUrl } : {}),
        profileSyncedAt: new Date(),
      })
    ).catch(() => undefined);
    return {
      id: whoami.user_id,
      matrixUserId: whoami.user_id,
      displayName,
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  } catch {
    throw new AppError("unauthorized", "Invalid Matrix bearer token", 401);
  }
}
