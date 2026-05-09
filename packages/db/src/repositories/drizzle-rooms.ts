export interface RuntimeLeaseResult {
  gameRoomId: string;
  leaseUntil: Date;
}

export interface DrizzleRoomRepository {
  acquireRuntimeLease(
    now: Date,
    leaseMs: number
  ): Promise<RuntimeLeaseResult[]>;
  releaseRuntimeLease(gameRoomId: string): Promise<void>;
}
