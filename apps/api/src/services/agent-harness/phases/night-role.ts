import { buildHarnessContext } from "../context";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildNightRolePrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 24,
  });
  if (input.state.role === "seer") return buildSeerPrompt(input, context);
  if (input.state.role === "guard") return buildGuardPrompt(input, context);
  return buildGenericNightPrompt(input, context);
}

function buildSeerPrompt(
  input: BuildAgentPromptInput,
  context: ReturnType<typeof buildHarnessContext>
): AgentPromptResult {
  const options = actionOptions(input, context.targetPlayerIds);
  const system = `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: 预言家

${winCondition("seer")}

【预言家技能】
每晚可查验一名玩家的身份（狼人/好人）。查验结果只有你知道，可选择公开或隐藏。

【查验策略】
- 首夜可验边缘位或中间位，获取基础信息
- 后续可验发言可疑的玩家

【任务】
选择一名玩家查验身份。只需给出座位数字。

可选: ${options}`;
  const user = `${context.text}

${context.timelineText ? `【今日讨论】\n${context.timelineText}\n\n` : ""}${context.selfSpeechText ? `【你今天的发言】\n${context.selfSpeechText}\n\n` : ""}你要查验几号？

【格式】
只回复座位数字，如: 5
不要解释，不要输出多余文字，不要代码块`;
  return finishPrompt(system, user);
}

function buildGuardPrompt(
  input: BuildAgentPromptInput,
  context: ReturnType<typeof buildHarnessContext>
): AgentPromptResult {
  const options = actionOptions(input, context.targetPlayerIds);
  const system = `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: 守卫

${winCondition("guard")}

【守卫技能】
每晚可保护一名玩家不被狼人杀害。守护成功则刀口存活。

【重要规则】
- 不能连续两晚保护同一人
- 可以保护自己
- 若守卫和女巫同时救同一人（毒奶），该玩家仍会死亡

【守护策略】
- 优先保护跳出的神职（预言家、女巫等）
- 也可保护发言强势的好人

【任务】
选择一名玩家保护。只需给出座位数字。

可选: ${options}`;
  const user = `${context.text}

${context.timelineText ? `【今日讨论】\n${context.timelineText}\n\n` : ""}${context.selfSpeechText ? `【你今天的发言】\n${context.selfSpeechText}\n\n` : ""}你要保护几号？

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;
  return finishPrompt(system, user);
}

function buildGenericNightPrompt(
  input: BuildAgentPromptInput,
  context: ReturnType<typeof buildHarnessContext>
): AgentPromptResult {
  const system = `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: ${roleText(input.state.role)}

${winCondition(input.state.role)}`;
  const user = `${context.text}

${context.timelineText || ""}

你要怎么做？`;
  return finishPrompt(system, user);
}

function actionOptions(input: BuildAgentPromptInput, targetPlayerIds: string[]): string {
  return targetPlayerIds
    .map((id) => {
      const player = input.room.players.find((candidate) => candidate.id === id);
      return player ? `${player.seatNo}号(${player.displayName})` : id;
    })
    .join("、");
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
