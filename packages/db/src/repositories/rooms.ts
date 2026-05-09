export interface RoomRepository {
  getById(gameRoomId: string): Promise<unknown | null>;
}
