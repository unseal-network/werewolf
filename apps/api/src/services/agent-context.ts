import type { GameEvent } from "@werewolf/shared";
import type { PlayerPrivateState } from "@werewolf/engine";
import type {
  StoredGameRoom,
  StoredPlayer,
} from "./game-service";

export interface BuildAgentContextOptions {
  maxSpeechHistory?: number;
  includeVotes?: boolean;
}

/**
 * Build a rich game-context string to prepend to every agent prompt.
 * The context includes the player roster, alive/dead status,
 * relevant event history, and role-specific information.
 */
export function buildAgentContext(
  room: StoredGameRoom,
  playerId: string,
  state: PlayerPrivateState,
  opts: BuildAgentContextOptions = {}
): string {
  const { maxSpeechHistory = 8, includeVotes = true } = opts;
  const projection = room.projection;
  if (!projection) return "";

  const isWolf = state.team === "wolf";
  const day = projection.day;
  const phase = projection.phase;

  // --- player roster ---
  const aliveSet = new Set(projection.alivePlayerIds);
  const playersById = new Map<string, StoredPlayer>();
  for (const p of room.players) {
    if (!p.leftAt) playersById.set(p.id, p);
  }

  const sortedPlayers = Array.from(playersById.values()).sort(
    (a, b) => a.seatNo - b.seatNo
  );

  const playerLines = sortedPlayers.map((p) => {
    const alive = aliveSet.has(p.id) ? "存活" : "死亡";
    const me = p.id === playerId ? " (你)" : "";
    return `  座位${p.seatNo}: ${p.displayName}${me} [id=${p.id}] — ${alive}`;
  });

  // --- filter events this agent can see ---
  const visibleEvents = room.events.filter((e) => {
    if (e.visibility === "public") return true;
    if (e.visibility === "runtime") return false;
    if (e.visibility === `private:user:${playerId}`) return true;
    if (e.visibility === "private:team:wolf" && isWolf) return true;
    return false;
  });

  // --- speech history ---
  const speeches = visibleEvents
    .filter((e) => e.type === "speech_submitted" && e.actorId && e.actorId !== "runtime")
    .slice(-maxSpeechHistory);

  const speechLines = speeches.map((e) => {
    const speaker = playersById.get(e.actorId!);
    const name = speaker?.displayName ?? e.actorId!;
    const seat = speaker ? `座位${speaker.seatNo}` : "";
    const text = String(e.payload?.speech ?? "");
    const speechDay = Number(e.payload?.day ?? 1);
    return `  [第${speechDay}天] ${name}${seat ? `(${seat})` : ""}: "${text}"`;
  });

  // --- vote history ---
  let voteLines: string[] = [];
  if (includeVotes) {
    const votes = visibleEvents.filter(
      (e) => e.type === "vote_submitted" && e.actorId
    );
    // Group by day
    const byDay = new Map<number, Array<{ actor: string; target: string; empty: boolean }>>();
    for (const v of votes) {
      const d = Number(v.payload?.day ?? 1);
      if (!byDay.has(d)) byDay.set(d, []);
      const actorPlayer = playersById.get(v.actorId!);
      const targetPlayer = v.subjectId ? playersById.get(v.subjectId) : undefined;
      byDay.get(d)!.push({
        actor: actorPlayer?.displayName ?? v.actorId!,
        target: targetPlayer?.displayName ?? v.subjectId ?? "弃权",
        empty: !v.subjectId,
      });
    }
    for (const [d, list] of byDay) {
      voteLines.push(`  第${d}天白天投票：`);
      for (const v of list) {
        voteLines.push(`    ${v.actor} → ${v.target}${v.empty ? " (弃权)" : ""}`);
      }
    }
  }

  // --- wolf vote history (for wolves only) ---
  let wolfVoteLines: string[] = [];
  if (isWolf) {
    const wolfVotes = room.events.filter(
      (e) => e.visibility === "private:team:wolf" && e.type === "wolf_vote_submitted" && e.actorId
    );
    if (wolfVotes.length > 0) {
      wolfVoteLines.push("  狼人夜间投票：");
      for (const v of wolfVotes) {
        const actor = playersById.get(v.actorId!)?.displayName ?? v.actorId!;
        const target = v.subjectId ? playersById.get(v.subjectId)?.displayName ?? v.subjectId : "弃权";
        wolfVoteLines.push(`    ${actor} → ${target}`);
      }
    }
    const wolfResolutions = room.events.filter(
      (e) => e.visibility === "private:team:wolf" && e.type === "wolf_vote_resolved"
    );
    for (const r of wolfResolutions) {
      const targetId = String(r.payload?.targetPlayerId ?? "");
      if (targetId) {
        const targetName = playersById.get(targetId)?.displayName ?? targetId;
        wolfVoteLines.push(`    决议：击杀 ${targetName}`);
      } else {
        wolfVoteLines.push(`    决议：平票，无击杀`);
      }
    }
  }

  // --- seer results (for seer only) ---
  let seerLines: string[] = [];
  if (state.role === "seer") {
    const seerResults = visibleEvents.filter(
      (e) => e.type === "seer_result_revealed" && e.payload?.seerPlayerId === playerId
    );
    if (seerResults.length > 0) {
      seerLines.push("  预言家查验记录：");
      for (const r of seerResults) {
        const inspectedId = String(r.payload?.inspectedPlayerId ?? "");
        const inspected = playersById.get(inspectedId);
        const name = inspected?.displayName ?? inspectedId;
        const seat = inspected ? `座位${inspected.seatNo}` : "";
        const alignment = String(r.payload?.alignment ?? "unknown");
        const alignText = alignment === "wolf" ? "狼人" : "好人";
        seerLines.push(`    ${name}${seat ? `(${seat})` : ""} — ${alignText}`);
      }
    }
  }

  // --- witch info ---
  let witchLines: string[] = [];
  if (state.role === "witch" && state.witchItems) {
    witchLines.push("  女巫道具：");
    witchLines.push(`    解药：${state.witchItems.healAvailable ? "未使用" : "已使用"}`);
    witchLines.push(`    毒药：${state.witchItems.poisonAvailable ? "未使用" : "已使用"}`);
  }

  // --- elimination history ---
  const eliminations = room.events.filter(
    (e) => e.type === "player_eliminated" && e.subjectId
  );
  const eliminationLines = eliminations.map((e) => {
    const p = playersById.get(e.subjectId!);
    return `  ${p?.displayName ?? e.subjectId!}${p ? `(座位${p.seatNo})` : ""}`;
  });

  // --- current action / turn info ---
  const actionInfo = buildActionInfo(room, playerId, state, playersById);

  // --- assemble context ---
  const lines: string[] = [];
  lines.push("## 游戏信息");
  lines.push(`- 当前：第 ${day} 天 / ${phaseLabel(phase)}`);
  lines.push(`- 存活玩家：${projection.alivePlayerIds.length} 人`);
  if (eliminationLines.length > 0) {
    lines.push(`- 死亡玩家：${eliminationLines.join("、")}`);
  }
  lines.push("");

  lines.push("## 当前行动");
  lines.push(...actionInfo);
  lines.push("");

  lines.push("## 玩家列表");
  lines.push(...playerLines);
  lines.push("");

  if (speechLines.length > 0) {
    lines.push(`## 历史发言（最近${speechLines.length}条）`);
    lines.push(...speechLines);
    lines.push("");
  }

  if (voteLines.length > 0) {
    lines.push("## 投票记录");
    lines.push(...voteLines);
    lines.push("");
  }

  if (wolfVoteLines.length > 0) {
    lines.push("## 狼人团队记录");
    lines.push(...wolfVoteLines);
    lines.push("");
  }

  if (seerLines.length > 0) {
    lines.push(...seerLines);
    lines.push("");
  }

  if (witchLines.length > 0) {
    lines.push(...witchLines);
    lines.push("");
  }

  lines.push("## 你的信息");
  lines.push(`- 角色：${roleLabel(state.role)}`);
  if (isWolf && state.knownTeammatePlayerIds.length > 0) {
    const teammates = state.knownTeammatePlayerIds
      .map((id: string) => {
        const p = playersById.get(id);
        return p ? `${p.displayName}(座位${p.seatNo})` : id;
      })
      .join("、");
    lines.push(`- 狼人队友：${teammates}`);
  }
  lines.push(`- 你的名字：${playersById.get(playerId)?.displayName ?? playerId}`);
  lines.push(`- 你的座位：${playersById.get(playerId)?.seatNo ?? "?"}`);
  lines.push("");

  // --- role strategy ---
  const strategy = roleStrategy(state.role, isWolf);
  if (strategy) {
    lines.push("## 角色玩法指引");
    lines.push(strategy);
    lines.push("");
  }

  return lines.join("\n");
}

function phaseLabel(phase: string | null): string {
  const labels: Record<string, string> = {
    night_guard: "守卫阶段（夜间）",
    night_wolf: "狼人阶段（夜间）",
    night_witch_heal: "女巫解药阶段（夜间）",
    night_witch_poison: "女巫毒药阶段（夜间）",
    night_seer: "预言家阶段（夜间）",
    night_resolution: "夜间结算",
    day_speak: "白天发言阶段",
    day_vote: "白天投票阶段",
    day_resolution: "白天结算",
    tie_speech: "平票发言阶段",
    tie_vote: "平票投票阶段",
    post_game: "游戏结束",
  };
  return labels[phase ?? ""] ?? phase ?? "未知阶段";
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

function roleStrategy(role: string, _isWolf: boolean): string {
  const strategies: Record<string, string> = {
    werewolf:
      "  你是狼人，目标是杀光所有好人阵营玩家。\\n" +
      "  夜间与狼队友讨论并投票选择击杀目标。\\n" +
      "  白天要伪装成好人，通过发言转移怀疑，保护队友。\\n" +
      "  不要暴露自己是狼人，也不要暴露队友身份。",
    villager:
      "  你是村民，属于好人阵营。\\n" +
      "  白天通过发言分析其他玩家的逻辑漏洞，找出狼人。\\n" +
      "  投票时要根据发言和行为判断，优先投给最像狼人的玩家。\\n" +
      "  不要轻信自称神职的玩家。",
    seer:
      "  你是预言家，属于好人阵营。\\n" +
      "  每晚可以查验一名玩家是狼人还是好人。\\n" +
      "  尽量活到后期，积累查验信息。\\n" +
      "  白天可以适时跳身份公布查验结果，但要小心被狼人针对。",
    witch:
      "  你是女巫，属于好人阵营。\\n" +
      "  你有一瓶解药（救人）和一瓶毒药（毒人）。\\n" +
      "  解药尽量留到关键回合使用，毒药用来毒杀你确认的狼人。\\n" +
      "  注意：女巫可以自救（第一晚）。",
    guard:
      "  你是守卫，属于好人阵营。\\n" +
      "  每晚可以守护一名玩家，使其免受狼人击杀。\\n" +
      "  不能连续两晚守护同一个人。\\n" +
      "  尽量守护重要的神职玩家或你自己。",
  };
  return strategies[role] ?? "";
}

function buildActionInfo(
  room: StoredGameRoom,
  playerId: string,
  state: PlayerPrivateState,
  playersById: Map<string, StoredPlayer>
): string[] {
  const phase = room.projection?.phase ?? "";
  const result: string[] = [];

  // Pre-compute legal targetPlayerId values so the LLM doesn't have to
  // guess. We always exclude the actor themselves; specific phases may
  // narrow it further (e.g. seer skips already-inspected players), but
  // that filtering happens in the engine — surfacing the full alive
  // roster here is enough for the LLM to make a tool call that will pass
  // validation.
  const aliveIds = room.projection?.alivePlayerIds ?? [];
  const targetIds = aliveIds.filter((id) => id !== playerId);
  const targetList = targetIds
    .map((id) => {
      const p = playersById.get(id);
      return p ? `${id}(座位${p.seatNo} ${p.displayName})` : id;
    })
    .join("、");
  const targetHint = targetList
    ? `- 合法 targetPlayerId 取值（必须从中选一个）：${targetList}`
    : "";

  switch (phase) {
    case "day_speak":
    case "tie_speech": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      result.push(
        "- 说明：现在轮到你发言。你接下来输出的内容会直接作为你的公开发言，所有玩家都能看到。请分析当前局势，分享你的推理，指出你认为可疑的玩家。"
      );
      // Build speech queue info
      const spokenIds = new Set<string>();
      for (const e of room.events) {
        if (
          e.type === "speech_submitted" &&
          e.visibility === "public" &&
          e.actorId &&
          e.actorId !== "runtime" &&
          Number(e.payload?.day) === room.projection?.day
        ) {
          spokenIds.add(e.actorId);
        }
      }
      const allAlive = room.projection?.alivePlayerIds ?? [];
      const spoken: string[] = [];
      const notSpoken: string[] = [];
      for (const id of allAlive) {
        const p = playersById.get(id);
        const label = p ? `${p.displayName}(座位${p.seatNo})` : id;
        if (spokenIds.has(id)) {
          spoken.push(label);
        } else {
          notSpoken.push(label + (id === playerId ? " — 你" : ""));
        }
      }
      if (spoken.length > 0) {
        result.push(`- 已发言：${spoken.join("、")}`);
      }
      if (notSpoken.length > 0) {
        result.push(`- 未发言：${notSpoken.join("、")}`);
      }
      break;
    }
    case "day_vote":
    case "tie_vote": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      result.push(
        "- 说明：现在是你的行动回合。你必须调用工具完成投票，你的文字输出不会被记录。请使用 submitVote 工具选择你要放逐的玩家，或使用 abstain 弃权。"
      );
      if (targetHint) result.push(targetHint);
      break;
    }
    case "night_guard": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      result.push(
        "- 说明：现在是你的行动回合。你必须调用工具完成行动，你的文字输出不会被记录。请使用 guardProtect 工具选择一名玩家守护，或使用 passAction 跳过。"
      );
      if (targetHint) result.push(targetHint);
      break;
    }
    case "night_wolf": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      if (state.role === "werewolf") {
        result.push(
          "- 说明：现在是你的行动回合。你必须调用工具完成行动，你的文字输出不会被记录。请使用 wolfKill 工具投票选择今晚的击杀目标。"
        );
        if (targetHint) result.push(targetHint);
      } else {
        result.push("- 说明：当前是狼人行动阶段，你无法行动，请等待。");
      }
      break;
    }
    case "night_witch_heal": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      if (state.role === "witch") {
        result.push(
          "- 说明：现在是你的行动回合。你必须调用工具完成行动，你的文字输出不会被记录。请使用 witchHeal 工具选择要救的玩家，或使用 passAction 跳过。"
        );
        if (targetHint) result.push(targetHint);
      } else {
        result.push("- 说明：当前是女巫解药阶段，你无法行动，请等待。");
      }
      break;
    }
    case "night_witch_poison": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      if (state.role === "witch") {
        result.push(
          "- 说明：现在是你的行动回合。你必须调用工具完成行动，你的文字输出不会被记录。请使用 witchPoison 工具选择要毒杀的玩家，或使用 passAction 跳过。"
        );
        if (targetHint) result.push(targetHint);
      } else {
        result.push("- 说明：当前是女巫毒药阶段，你无法行动，请等待。");
      }
      break;
    }
    case "night_seer": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      if (state.role === "seer") {
        result.push(
          "- 说明：现在是你的行动回合。你必须调用工具完成行动，你的文字输出不会被记录。请使用 seerInspect 工具选择要查验的玩家，或使用 passAction 跳过。"
        );
        if (targetHint) result.push(targetHint);
      } else {
        result.push("- 说明：当前是预言家查验阶段，你无法行动，请等待。");
      }
      break;
    }
    case "night_resolution":
    case "day_resolution":
    case "post_game": {
      result.push(`- 阶段：${phaseLabel(phase)}`);
      result.push("- 说明：当前是结算阶段，无需你行动，请等待。");
      break;
    }
    default:
      result.push(`- 阶段：${phaseLabel(phase)}`);
      result.push("- 说明：等待下一步行动。");
  }

  return result;
}
