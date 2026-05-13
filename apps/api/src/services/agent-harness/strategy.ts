import type { CreateGameRequest, Role } from "@werewolf/shared";
import type { StoredGameRoom, StoredPlayer } from "../game-service";

export function buildRoleStrategy(role: Role): string {
  const strategies: Record<Role, string> = {
    werewolf: [
      "<role_strategy>",
      "【狼人策略库】",
      "- 白天要伪装成好人，用公开信息推理，不要暴露狼队友。",
      "- 可以质疑发言摇摆、信息来源不清、投票理由薄弱的玩家。",
      "- 避免狼视角：不要说只有狼人阵营才知道的信息。",
      "- 如果队友被怀疑，可以轻微转移焦点，但不要无条件硬保。",
      "</role_strategy>",
    ].join("\n"),
    villager: [
      "<role_strategy>",
      "【村民策略库】",
      "- 你没有夜间信息，要依靠发言矛盾、票型和行为判断。",
      "- 给出明确怀疑对象，不要长期只说观察。",
      "</role_strategy>",
    ].join("\n"),
    seer: [
      "<role_strategy>",
      "【预言家策略库】",
      "- 查验结果是强信息，但是否公开身份取决于局势。",
      "- 如果公开查验，要给出清晰查验链和今日归票建议。",
      "</role_strategy>",
    ].join("\n"),
    witch: [
      "<role_strategy>",
      "【女巫策略库】",
      "- 药水信息是强私有信息，公开时要考虑是否会暴露身份。",
      "- 毒药优先用于你高度确认的狼人。",
      "</role_strategy>",
    ].join("\n"),
    guard: [
      "<role_strategy>",
      "【守卫策略库】",
      "- 守护目标要结合神职可信度、狼刀倾向和不能连续守护限制。",
      "- 白天发言不要轻易暴露守护身份。",
      "</role_strategy>",
    ].join("\n"),
  };
  return strategies[role];
}

export function buildSpeakingOrderHint(
  room: StoredGameRoom,
  playerId: string
): string {
  const projection = room.projection;
  if (
    !projection ||
    (projection.phase !== "day_speak" && projection.phase !== "tie_speech")
  ) {
    return "";
  }
  const order = room.speechQueue.length > 0 ? room.speechQueue : projection.alivePlayerIds;
  const index = order.indexOf(playerId);
  if (index < 0) return "<speaking_order>当前发言顺序未知。</speaking_order>";
  const total = order.length;
  const spoken = order.slice(0, index).map((id) => labelById(room.players, id)).join("、") || "无";
  const unspoken = order.slice(index + 1).map((id) => labelById(room.players, id)).join("、") || "无";
  const position =
    index === 0
      ? "你是第1个发言，不要引用前面不存在的发言。"
      : index === total - 1
        ? `你是第${index + 1}/${total}个发言，前面大多数信息已经出现，请总结矛盾并给出方向。`
        : `你是第${index + 1}/${total}个发言。`;
  return [
    "<speaking_order>",
    position,
    `已发言：${spoken}`,
    `未发言：${unspoken}`,
    "</speaking_order>",
  ].join("\n");
}

export function buildFocusAngle(room: StoredGameRoom, playerId: string): string {
  const projection = room.projection;
  if (!projection) return "";
  const self = room.players.find((player) => player.id === playerId);
  if (!self) return "";
  const hints: string[] = [];
  const seatPattern = new RegExp(`${self.seatNo}\\s*号`);
  const mentionedBy = room.events
    .filter(
      (event) =>
        event.type === "speech_submitted" &&
        event.visibility === "public" &&
        event.actorId &&
        event.actorId !== playerId &&
        seatPattern.test(String(event.payload?.speech ?? ""))
    )
    .map((event) => labelById(room.players, event.actorId!));
  if (mentionedBy.length > 0) {
    hints.push(`你被${[...new Set(mentionedBy)].join("、")}点名，优先回应或重新框定这个质疑。`);
  }
  const order = room.speechQueue.length > 0 ? room.speechQueue : projection.alivePlayerIds;
  const index = order.indexOf(playerId);
  if (index === 0) hints.push("你是首个发言者，直接给出一个初步判断，不要假装听过前置发言。");
  if (index >= 0 && index >= Math.max(1, Math.floor(order.length * 0.7))) {
    hints.push("你发言靠后，可以对比前面玩家的矛盾、站边和投票意向。");
  }
  if (room.events.some((event) => event.type === "vote_submitted")) {
    hints.push("结合已有票型，说明哪些玩家的投票关系值得关注。");
  }
  if (hints.length === 0) return "";
  return ["<focus_angle>", ...hints.slice(0, 2).map((hint) => `- ${hint}`), "</focus_angle>"].join("\n");
}

export function buildSpeechRules(language: CreateGameRequest["language"]): string {
  const languageLine = language === "zh-CN" ? "使用简体中文。" : "Use English.";
  return [
    "<speech_rules>",
    languageLine,
    "必须调用 saySpeech 工具提交发言。",
    "把要播报的内容放在 saySpeech 的 speech 字段里。",
    "</speech_rules>",
  ].join("\n");
}

export function buildToolOnlyRules(toolNames: string[]): string {
  return [
    "<tool_rules>",
    `必须调用且只调用一个工具：${toolNames.join("、") || "无可用工具"}`,
    "行动阶段不要输出解释性文本作为结果。",
    "targetPlayerId 必须来自 <action_options>。",
    "</tool_rules>",
  ].join("\n");
}

function labelById(players: StoredPlayer[], playerId: string): string {
  const player = players.find((candidate) => candidate.id === playerId);
  return player ? `${player.displayName}` : playerId;
}
