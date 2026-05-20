import { and, eq, gt } from "drizzle-orm";
import { type DbClient, roomOwnership } from "@werewolf/db";

export type RoomLease =
  | {
      acquired: true;
      gameRoomId: string;
      ownerId: string;
      fencingToken: bigint;
      leaseExpiresAt: Date;
    }
  | {
      acquired: false;
      gameRoomId: string;
      ownerId: string;
      currentOwnerId: string;
      leaseExpiresAt: Date;
    };

export interface RoomOwnership {
  acquire(
    gameRoomId: string,
    ownerId: string,
    ttlMs: number
  ): Promise<RoomLease>;
  renew(
    gameRoomId: string,
    ownerId: string,
    fencingToken: bigint,
    ttlMs: number
  ): Promise<boolean>;
  release(
    gameRoomId: string,
    ownerId: string,
    fencingToken: bigint
  ): Promise<void>;
}

interface StoredLease {
  ownerId: string;
  fencingToken: bigint;
  leaseExpiresAt: Date;
}

export class InMemoryRoomOwnership implements RoomOwnership {
  private readonly owners = new Map<string, StoredLease>();

  async acquire(
    gameRoomId: string,
    ownerId: string,
    ttlMs: number
  ): Promise<RoomLease> {
    assertPositiveIntegerTtl(ttlMs);

    const now = Date.now();
    const current = this.owners.get(gameRoomId);
    if (current && current.leaseExpiresAt.getTime() > now) {
      if (current.ownerId !== ownerId) {
        return {
          acquired: false,
          gameRoomId,
          ownerId,
          currentOwnerId: current.ownerId,
          leaseExpiresAt: copyDate(current.leaseExpiresAt),
        };
      }

      current.leaseExpiresAt = new Date(now + ttlMs);
      return acquiredLease(gameRoomId, current);
    }

    const next: StoredLease = {
      ownerId,
      fencingToken: current ? current.fencingToken + 1n : 1n,
      leaseExpiresAt: new Date(now + ttlMs),
    };
    this.owners.set(gameRoomId, next);
    return acquiredLease(gameRoomId, next);
  }

  async renew(
    gameRoomId: string,
    ownerId: string,
    fencingToken: bigint,
    ttlMs: number
  ): Promise<boolean> {
    assertPositiveIntegerTtl(ttlMs);

    const current = this.owners.get(gameRoomId);
    if (
      !current ||
      current.ownerId !== ownerId ||
      current.fencingToken !== fencingToken ||
      current.leaseExpiresAt.getTime() <= Date.now()
    ) {
      return false;
    }

    current.leaseExpiresAt = new Date(Date.now() + ttlMs);
    return true;
  }

  async release(
    gameRoomId: string,
    ownerId: string,
    fencingToken: bigint
  ): Promise<void> {
    const current = this.owners.get(gameRoomId);
    if (current?.ownerId === ownerId && current.fencingToken === fencingToken) {
      current.leaseExpiresAt = new Date(0);
    }
  }

  expire(gameRoomId: string): void {
    const current = this.owners.get(gameRoomId);
    if (current) current.leaseExpiresAt = new Date(0);
  }
}

export class PostgresRoomOwnership implements RoomOwnership {
  constructor(private readonly db: DbClient) {}

  async acquire(
    gameRoomId: string,
    ownerId: string,
    ttlMs: number
  ): Promise<RoomLease> {
    assertPositiveIntegerTtl(ttlMs);

    return this.db.transaction(async (tx) => {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + ttlMs);
      const inserted = await tx
        .insert(roomOwnership)
        .values({
          gameRoomId,
          ownerId,
          fencingToken: 1n,
          leaseExpiresAt,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: roomOwnership.gameRoomId })
        .returning();

      if (inserted[0]) {
        return acquiredLease(gameRoomId, inserted[0]);
      }

      const rows = await tx
        .select()
        .from(roomOwnership)
        .where(eq(roomOwnership.gameRoomId, gameRoomId))
        .limit(1)
        .for("update");
      const current = rows[0];
      if (!current) {
        throw new Error("room ownership insert conflict did not yield a row");
      }

      if (current.leaseExpiresAt > now && current.ownerId !== ownerId) {
        return {
          acquired: false,
          gameRoomId,
          ownerId,
          currentOwnerId: current.ownerId,
          leaseExpiresAt: copyDate(current.leaseExpiresAt),
        };
      }

      const fencingToken =
        current.leaseExpiresAt > now ? current.fencingToken : current.fencingToken + 1n;
      const updatedRows = await tx
        .update(roomOwnership)
        .set({
          ownerId,
          fencingToken,
          leaseExpiresAt,
          updatedAt: now,
        })
        .where(eq(roomOwnership.gameRoomId, gameRoomId))
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        throw new Error("room ownership update did not yield a row");
      }

      return acquiredLease(gameRoomId, updated);
    });
  }

  async renew(
    gameRoomId: string,
    ownerId: string,
    fencingToken: bigint,
    ttlMs: number
  ): Promise<boolean> {
    assertPositiveIntegerTtl(ttlMs);

    const now = new Date();
    const updatedRows = await this.db
      .update(roomOwnership)
      .set({
        leaseExpiresAt: new Date(now.getTime() + ttlMs),
        updatedAt: now,
      })
      .where(
        and(
          eq(roomOwnership.gameRoomId, gameRoomId),
          eq(roomOwnership.ownerId, ownerId),
          eq(roomOwnership.fencingToken, fencingToken),
          gt(roomOwnership.leaseExpiresAt, now)
        )
      )
      .returning({ gameRoomId: roomOwnership.gameRoomId });

    return updatedRows.length > 0;
  }

  async release(
    gameRoomId: string,
    ownerId: string,
    fencingToken: bigint
  ): Promise<void> {
    const now = new Date();
    await this.db
      .update(roomOwnership)
      .set({
        leaseExpiresAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(roomOwnership.gameRoomId, gameRoomId),
          eq(roomOwnership.ownerId, ownerId),
          eq(roomOwnership.fencingToken, fencingToken)
        )
      );
  }
}

function assertPositiveIntegerTtl(ttlMs: number): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("ttlMs must be a positive integer");
  }
}

function copyDate(date: Date): Date {
  return new Date(date.getTime());
}

function acquiredLease(gameRoomId: string, lease: StoredLease): RoomLease {
  return {
    acquired: true,
    gameRoomId,
    ownerId: lease.ownerId,
    fencingToken: lease.fencingToken,
    leaseExpiresAt: copyDate(lease.leaseExpiresAt),
  };
}
