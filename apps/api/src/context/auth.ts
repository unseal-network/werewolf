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
  const token = match?.[1] ?? "demo";

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
    // Fallback to demo user when Matrix auth fails
    const demoUserId = process.env.DEMO_USER_ID ?? "@kimigame1:keepsecret.io";
    return {
      id: demoUserId,
      matrixUserId: demoUserId,
      displayName: "kimi game 1",
    };
  }
}
