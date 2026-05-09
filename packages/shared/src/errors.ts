export const errorCodes = {
  Unauthorized: "unauthorized",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Conflict: "conflict",
  InvalidPhase: "invalid_phase",
  InvalidAction: "invalid_action",
  MatrixUnavailable: "matrix_unavailable",
  AgentUnavailable: "agent_unavailable",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}
