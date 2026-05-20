import type { RoomCommand } from "./room-actor/types";

export interface RoomCommandBus {
  forward(ownerId: string, command: RoomCommand): Promise<unknown>;
  register(
    ownerId: string,
    handler: (command: RoomCommand) => Promise<unknown> | unknown
  ): void;
}

export class InMemoryRoomCommandBus implements RoomCommandBus {
  private readonly handlers = new Map<
    string,
    (command: RoomCommand) => Promise<unknown> | unknown
  >();

  register(
    ownerId: string,
    handler: (command: RoomCommand) => Promise<unknown> | unknown
  ): void {
    this.handlers.set(ownerId, handler);
  }

  async forward(ownerId: string, command: RoomCommand): Promise<unknown> {
    const handler = this.handlers.get(ownerId);
    if (!handler) {
      throw new Error(`No room command handler registered for owner ${ownerId}`);
    }

    return handler(command);
  }
}
