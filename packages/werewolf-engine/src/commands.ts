export type PlayerAction =
  | { kind: "saySpeech"; speech: string }
  | { kind: "submitVote"; targetPlayerId: string }
  | { kind: "abstain" }
  | { kind: "wolfKill"; targetPlayerId: string }
  | { kind: "seerInspect"; targetPlayerId: string }
  | { kind: "witchHeal"; targetPlayerId: string }
  | { kind: "witchPoison"; targetPlayerId: string }
  | { kind: "guardProtect"; targetPlayerId: string }
  | { kind: "passAction" };
