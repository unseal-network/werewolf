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
  matrix: MatrixAuthClient
): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  const token = match?.[1];
  if (!token) {
    throw new AppError("unauthorized", "Matrix bearer token is required", 401);
  }
  const whoami = await matrix.whoami(token);
  return {
    id: whoami.user_id,
    matrixUserId: whoami.user_id,
    displayName: whoami.user_id,
  };
}
