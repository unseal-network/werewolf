export interface ProjectionRepository {
  getPublicProjection(gameRoomId: string): Promise<unknown | null>;
}
