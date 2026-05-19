import type { GamePhase } from "@werewolf/shared";

export type PhaseAdvanceHandler<TResult> = () => Promise<TResult | undefined>;

export type PhaseAdvanceHandlers<TResult> = Partial<
  Record<GamePhase, PhaseAdvanceHandler<TResult>>
>;

export async function runGamePhaseFlow<TResult>(
  phase: GamePhase,
  handlers: PhaseAdvanceHandlers<TResult>
): Promise<TResult | undefined> {
  const handler = handlers[phase];
  if (!handler) {
    return undefined;
  }
  return handler();
}
