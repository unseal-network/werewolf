import type { GameEvent } from "@werewolf/shared";
import type { HarnessContextInput, HarnessContextResult } from "./types";
import type { StoredPlayer } from "../game-service";

export function buildHarnessContext(
  input: HarnessContextInput
): HarnessContextResult {
  const { room, player, state, maxSpeechHistory = 10 } = input;
  if (!room.projection) {
    return {
      text: "",
      timelineText: "",
      selfSpeechText: "",
      phase: "role_assignment",
      role: state.role,
      alivePlayerIds: [],
      targetPlayerIds: [],
    };
  }

  const playersById = new Map<string, StoredPlayer>();
  for (const candidate of room.players) {
    if (!candidate.leftAt) playersById.set(candidate.id, candidate);
  }
  const aliveSet = new Set(room.projection.alivePlayerIds);
  const isWolf = state.team === "wolf";
  const includeWolfPrivate = isWolf && room.projection.phase === "night_wolf";
  const visibleEvents = room.events.filter((event) =>
    canSeeEvent(event, player.id, isWolf, includeWolfPrivate)
  );

  const targetPlayerIds = room.projection.alivePlayerIds.filter(
    (id) => id !== player.id
  );

  const sections = [
    buildPrivateInfoSection(room, player, state, playersById),
    buildCurrentStatusSection(room, player, state),
    buildGameStateSection(room, player, playersById, aliveSet),
    buildHistorySection(
      visibleEvents,
      playersById,
      maxSpeechHistory,
      includeWolfPrivate
    ),
    buildVotesSection(visibleEvents, playersById),
    includeWolfPrivate ? buildWolfTeamHistorySection(room.events, playersById) : "",
    buildActionOptionsSection(targetPlayerIds, playersById),
  ].filter(Boolean);

  return {
    text: sections.join("\n\n"),
    timelineText: buildTimelineText(visibleEvents, playersById, player.id, maxSpeechHistory),
    selfSpeechText: buildSelfSpeechText(visibleEvents, player.id, maxSpeechHistory),
    phase: room.projection.phase,
    role: state.role,
    alivePlayerIds: room.projection.alivePlayerIds,
    targetPlayerIds,
  };
}

function buildTimelineText(
  visibleEvents: GameEvent[],
  playersById: Map<string, StoredPlayer>,
  selfPlayerId: string,
  maxLines: number
): string {
  return visibleEvents
    .filter((event) => event.visibility !== "runtime")
    .slice(-maxLines)
    .map((event) => formatTimelineEvent(event, playersById, selfPlayerId))
    .filter(Boolean)
    .join("\n");
}

function buildSelfSpeechText(
  visibleEvents: GameEvent[],
  selfPlayerId: string,
  maxLines: number
): string {
  return visibleEvents
    .filter(
      (event) =>
        event.type === "speech_submitted" &&
        event.actorId === selfPlayerId &&
        event.visibility === "public"
    )
    .slice(-maxLines)
    .map((event) => String(event.payload?.speech ?? ""))
    .filter(Boolean)
    .join("\n");
}

function formatTimelineEvent(
  event: GameEvent,
  playersById: Map<string, StoredPlayer>,
  _selfPlayerId: string
): string {
  const actor = event.actorId ? playersById.get(event.actorId) : undefined;
  const actorLabel = actor ? labelPlayer(actor) : event.actorId ?? "系统";
  if (event.type === "speech_submitted") {
    return `${actorLabel}: ${String(event.payload?.speech ?? "")}`;
  }
  if (event.type === "vote_submitted") {
    const target = event.subjectId ? playersById.get(event.subjectId) : undefined;
    return `${actorLabel} 投票给 ${target ? labelPlayer(target) : "弃权"}`;
  }
  if (event.type === "turn_started") {
    const subject = event.subjectId ? playersById.get(event.subjectId) : undefined;
    return `轮到 ${subject ? labelPlayer(subject) : event.subjectId ?? "未知玩家"} 行动`;
  }
  if (event.type === "phase_started") {
    return `进入阶段 ${String(event.payload?.phase ?? "")}`;
  }
  if (event.type === "seer_result_revealed") {
    const inspectedId = String(event.payload?.inspectedPlayerId ?? "");
    const inspected = playersById.get(inspectedId);
    const alignment = event.payload?.alignment === "wolf" ? "狼人" : "好人";
    return `查验结果：${inspected ? labelPlayer(inspected) : inspectedId} 是 ${alignment}`;
  }
  return "";
}

function canSeeEvent(
  event: GameEvent,
  playerId: string,
  isWolf: boolean,
  includeWolfPrivate: boolean
): boolean {
  if (event.visibility === "public") return true;
  if (event.visibility === "runtime") return false;
  if (event.visibility === `private:user:${playerId}`) return true;
  if (event.visibility === "private:team:wolf") return isWolf && includeWolfPrivate;
  return false;
}

function buildPrivateInfoSection(
  room: HarnessContextInput["room"],
  player: StoredPlayer,
  state: HarnessContextInput["state"],
  playersById: Map<string, StoredPlayer>
): string {
  const lines = [
    "<your_private_info>",
    `你是：${labelPlayer(player)}`,
    `角色：${roleLabel(state.role)}`,
  ];

  if (state.team === "wolf") {
    const teammates = state.knownTeammatePlayerIds
      .map((id) => playersById.get(id))
      .filter((candidate): candidate is StoredPlayer => Boolean(candidate))
      .map(labelPlayer);
    lines.push(`狼队友：${teammates.length > 0 ? teammates.join("、") : "无存活队友"}`);
  }

  if (state.role === "seer") {
    const results = room.events.filter(
      (event) =>
        event.type === "seer_result_revealed" &&
        event.payload?.seerPlayerId === player.id
    );
    if (results.length > 0) {
      lines.push("预言家查验记录：");
      for (const result of results) {
        const inspectedId = String(result.payload?.inspectedPlayerId ?? "");
        const inspected = playersById.get(inspectedId);
        const alignment = result.payload?.alignment === "wolf" ? "狼人" : "好人";
        lines.push(`- ${inspected ? labelPlayer(inspected) : inspectedId}：${alignment}`);
      }
    }
  }

  if (state.role === "witch" && state.witchItems) {
    lines.push(
      `女巫药水：解药${state.witchItems.healAvailable ? "可用" : "已用"}，毒药${state.witchItems.poisonAvailable ? "可用" : "已用"}`
    );
  }

  if (state.role === "guard") {
    const previousGuard = [...room.events]
      .reverse()
      .find((event) => {
        const action = event.payload?.action;
        return (
          event.type === "night_action_submitted" &&
          event.actorId === player.id &&
          Boolean(action) &&
          typeof action === "object" &&
          (action as { kind?: unknown }).kind === "guardProtect"
        );
      });
    const guardedId =
      previousGuard?.subjectId ??
      (previousGuard?.payload?.action as { targetPlayerId?: string } | undefined)
        ?.targetPlayerId;
    if (guardedId) {
      const guarded = playersById.get(guardedId);
      lines.push(`上次守护：${guarded ? labelPlayer(guarded) : guardedId}`);
    }
  }

  lines.push("</your_private_info>");
  return lines.join("\n");
}

function buildCurrentStatusSection(
  room: HarnessContextInput["room"],
  player: StoredPlayer,
  state: HarnessContextInput["state"]
): string {
  const projection = room.projection!;
  return [
    "<current_status>",
    `第 ${projection.day} 天 / ${projection.phase}`,
    `当前玩家：${labelPlayer(player)}`,
    `当前角色：${roleLabel(state.role)}`,
    `当前发言者：${projection.currentSpeakerPlayerId ?? "无"}`,
    "</current_status>",
  ].join("\n");
}

function buildGameStateSection(
  room: HarnessContextInput["room"],
  player: StoredPlayer,
  playersById: Map<string, StoredPlayer>,
  aliveSet: Set<string>
): string {
  const players = Array.from(playersById.values()).sort(
    (a, b) => a.seatNo - b.seatNo
  );
  return [
    "<game_state>",
    `alive_count: ${room.projection!.alivePlayerIds.length}`,
    ...players.map((candidate) => {
      const status = aliveSet.has(candidate.id) ? "存活" : "死亡";
      const self = candidate.id === player.id ? " (你)" : "";
      return `- ${labelPlayer(candidate)}${self}: ${status}`;
    }),
    "</game_state>",
  ].join("\n");
}

function buildHistorySection(
  visibleEvents: GameEvent[],
  playersById: Map<string, StoredPlayer>,
  maxSpeechHistory: number,
  includeWolfPrivate: boolean
): string {
  const speeches = visibleEvents
    .filter(
      (event) =>
        event.type === "speech_submitted" &&
        event.actorId &&
        event.actorId !== "runtime" &&
        (event.visibility === "public" ||
          (includeWolfPrivate && event.visibility === "private:team:wolf"))
    )
    .slice(-maxSpeechHistory);
  if (speeches.length === 0) return "";
  return [
    "<history>",
    ...speeches.map((event) => {
      const actor = event.actorId ? playersById.get(event.actorId) : undefined;
      return `${actor ? labelPlayer(actor) : event.actorId}: ${String(event.payload?.speech ?? "")}`;
    }),
    "</history>",
  ].join("\n");
}

function buildVotesSection(
  visibleEvents: GameEvent[],
  playersById: Map<string, StoredPlayer>
): string {
  const votes = visibleEvents.filter(
    (event) => event.type === "vote_submitted" && event.actorId
  );
  if (votes.length === 0) return "";
  return [
    "<votes>",
    ...votes.map((event) => {
      const actor = event.actorId ? playersById.get(event.actorId) : undefined;
      const target = event.subjectId ? playersById.get(event.subjectId) : undefined;
      return `${actor ? actor.displayName : event.actorId} -> ${target ? target.displayName : "弃权"}`;
    }),
    "</votes>",
  ].join("\n");
}

function buildWolfTeamHistorySection(
  events: GameEvent[],
  playersById: Map<string, StoredPlayer>
): string {
  const wolfEvents = events.filter(
    (event) =>
      event.visibility === "private:team:wolf" &&
      (event.type === "speech_submitted" || event.type === "wolf_vote_submitted")
  );
  if (wolfEvents.length === 0) return "";
  return [
    "<wolf_team_history>",
    ...wolfEvents.map((event) => {
      const actor = event.actorId ? playersById.get(event.actorId) : undefined;
      if (event.type === "wolf_vote_submitted") {
        const target = event.subjectId ? playersById.get(event.subjectId) : undefined;
        return `${actor ? labelPlayer(actor) : event.actorId} 投票击杀 ${target ? labelPlayer(target) : event.subjectId}`;
      }
      return `${actor ? labelPlayer(actor) : event.actorId}: ${String(event.payload?.speech ?? "")}`;
    }),
    "</wolf_team_history>",
  ].join("\n");
}

function buildActionOptionsSection(
  targetPlayerIds: string[],
  playersById: Map<string, StoredPlayer>
): string {
  return [
    "<action_options>",
    ...targetPlayerIds.map((id) => {
      const player = playersById.get(id);
      return player ? `${id}(座位${player.seatNo} ${player.displayName})` : id;
    }),
    "</action_options>",
  ].join("\n");
}

function labelPlayer(player: StoredPlayer): string {
  return `${player.displayName}(座位${player.seatNo})`;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    werewolf: "狼人",
    villager: "村民",
    seer: "预言家",
    witch: "女巫",
    guard: "守卫",
  };
  return labels[role] ?? role;
}
