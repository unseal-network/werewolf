import { eq } from "drizzle-orm";
import { type DbClient, gameUsers } from "@werewolf/db";
import type {
  CachedMatrixProfile,
  MatrixProfileCache,
} from "../context/auth";

export class DbMatrixProfileCache implements MatrixProfileCache {
  constructor(private readonly db: DbClient) {}

  async get(matrixUserId: string): Promise<CachedMatrixProfile | null> {
    const rows = await this.db
      .select()
      .from(gameUsers)
      .where(eq(gameUsers.matrixUserId, matrixUserId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      matrixUserId: row.matrixUserId,
      displayName: row.displayName,
      ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
      ...(row.profileSyncedAt
        ? { profileSyncedAt: row.profileSyncedAt }
        : {}),
    };
  }

  async upsert(profile: CachedMatrixProfile): Promise<void> {
    const now = new Date();
    await this.db
      .insert(gameUsers)
      .values({
        id: profile.matrixUserId,
        matrixUserId: profile.matrixUserId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        profileSyncedAt: profile.profileSyncedAt ?? now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: gameUsers.matrixUserId,
        set: {
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl ?? null,
          profileSyncedAt: profile.profileSyncedAt ?? now,
          lastSeenAt: now,
        },
      });
  }

  async touch(matrixUserId: string): Promise<void> {
    await this.db
      .update(gameUsers)
      .set({ lastSeenAt: new Date() })
      .where(eq(gameUsers.matrixUserId, matrixUserId));
  }
}
