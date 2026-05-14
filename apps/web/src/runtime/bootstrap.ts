export type RuntimeBootstrapDecision =
  | { kind: "resume"; gameRoomId: string; source: "url" | "host-link" }
  | { kind: "create"; hostRoomId?: string | undefined }
  | { kind: "wait-for-host-link"; hostRoomId: string };

export interface RuntimeBootstrapInput {
  urlGameRoomId: string | null | undefined;
  hostRoomId: string | null | undefined;
  hostLinkRoomId: string | null | undefined;
  isHostRuntime: boolean;
  isAdmin: boolean;
}

export function resolveRuntimeBootstrap({
  urlGameRoomId,
  hostRoomId,
  hostLinkRoomId,
  isHostRuntime,
  isAdmin,
}: RuntimeBootstrapInput): RuntimeBootstrapDecision {
  const urlRoom = urlGameRoomId?.trim();
  if (urlRoom) {
    return { kind: "resume", gameRoomId: urlRoom, source: "url" };
  }

  const linkedRoom = hostLinkRoomId?.trim();
  if (isHostRuntime && linkedRoom) {
    return { kind: "resume", gameRoomId: linkedRoom, source: "host-link" };
  }

  const hostRoom = hostRoomId?.trim();
  if (isHostRuntime && hostRoom && !isAdmin) {
    return { kind: "wait-for-host-link", hostRoomId: hostRoom };
  }

  return { kind: "create", hostRoomId: hostRoom || undefined };
}

export function gameRoomIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("gameRoomId");
}

export function updateGameRoomIdParam(search: string, gameRoomId: string): string {
  const params = new URLSearchParams(search);
  params.set("gameRoomId", gameRoomId);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function clearGameRoomIdParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("gameRoomId");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function buildGameRoomUrl(pathname: string, search: string, gameRoomId: string) {
  return `${pathname}${updateGameRoomIdParam(search, gameRoomId)}`;
}
