import { buildHarnessContext } from "../context";
import { buildSpeakingOrderHint } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildDaySpeechPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 16,
  });
  const system = [
    `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: ${roleText(input.state.role)}

【场景】
这是一个线上狼人杀游戏，玩家通过打字交流。

${winCondition(input.state.role)}`,
    `【任务】
白天讨论环节，表达你对场上局势的独立判断和投票意向。`,
    speechGuidelines(input.state.role),
  ].join("\n\n");
  const user = [
    context.text,
    "【本日讨论记录】",
    context.timelineText || "（暂无）",
    "",
    "【你本日已说过的话】",
    context.selfSpeechText || "（无）",
    "",
    "【发言顺序】",
    buildSpeakingOrderHint(input.room, input.player.id),
    "",
    "轮到你发言，返回JSON数组：",
  ].join("\n");
  return finishPrompt(system, user);
}

function speechGuidelines(role: string): string {
  const roleHintLine =
    role === "werewolf"
      ? "你是狼人，要伪装成好人，可以适当甩锅但不要太刻意"
      : role === "seer"
        ? "你是预言家，可以选择跳身份或先潜水观察"
        : "";
  return `【核心原则】
1. **局内优先**：发言必须基于本局实际信息，严禁编造不存在的场上信息。
2. **仅限存活玩家**：只讨论当前存活玩家。

【说话指南】
- 严禁编造场上没有发生的发言！第一个发言不要引用"前面"的话。
- 严禁任何职业相关表达！包括类比（如：像卖保险一样）、术语（如：从报表来看）、经历（如：我做销售时）。只用纯粹的狼人杀术语。
- 时间线约束：昨夜刀口在今天白天发言前已确定，禁止把今天的上警/跳身份/发言当作昨夜被刀的直接原因。
- 4-6 句，单条 1-2 句，分成 2-5 条消息气泡。
- 用"X号"称呼玩家。严禁剧本动作（如：*推眼镜*）。
- 必须表达你今天的归票方向和理由，不能「暂时不站边」或「等别人发言再决定」。
${roleHintLine}

【输出格式】
返回 JSON 字符串数组。`;
}

function roleText(role: string): string {
  const labels: Record<string, string> = {
    werewolf: "狼人",
    villager: "村民",
    seer: "预言家",
    witch: "女巫",
    guard: "守卫",
  };
  return labels[role] ?? role;
}

function winCondition(role: string): string {
  return role === "werewolf"
    ? "【胜利条件】狼人阵营获胜：狼人数量达到或超过好人数量。"
    : "【胜利条件】好人阵营获胜：找出并放逐所有狼人。";
}

function finishPrompt(system: string, user: string): AgentPromptResult {
  return {
    system,
    user,
    textPrompt: `${system}\n---\n${user}`,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
