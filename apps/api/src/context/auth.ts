import { AppError } from "@werewolf/shared";

export interface MatrixWhoami {
  user_id: string;
  device_id?: string;
}

export interface MatrixAuthClient {
  whoami(token: string): Promise<MatrixWhoami>;
}

export interface AuthenticatedUser {
  id: string;
  matrixUserId: string;
  displayName: string;
}

export async function authenticateRequest(
  request: Request,
  _matrix: MatrixAuthClient
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
    };
  }

  try {
    const whoami = await _matrix.whoami(token);
    return {
      id: whoami.user_id,
      matrixUserId: whoami.user_id,
      displayName: whoami.user_id,
    };
  } catch {
    throw new AppError("unauthorized", "Invalid Matrix bearer token", 401);
  }
}
