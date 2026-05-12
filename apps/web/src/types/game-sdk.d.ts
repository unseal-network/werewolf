declare module '@unseal-network/game-sdk' {
  export interface IFrameMessageType {
    getToken(): Promise<string>
    getInfo(): Promise<unknown>
    closeApp(): void
    hideApp(): void
    send(msg: { op: string; data?: unknown }): void
    sendSync(msg: { op: string; data?: unknown }): Promise<unknown>
    on(op: string, cbk: (data?: unknown) => void): void
    once(op: string, cbk: (data?: unknown) => void): void
    off(op: string, cbk?: (data?: unknown) => void): void
    getMembers(): Promise<unknown[]>
    getMember(userId: string): Promise<unknown>
    getRoom(): Promise<unknown>
    updateApp(data: unknown): void
    call: {
      join(): Promise<unknown>
      leave(): Promise<unknown>
      mute(): Promise<unknown>
      unmute(): Promise<unknown>
    }
  }

  export function useIFrameMessage(): IFrameMessageType
}
