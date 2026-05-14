import { buildHarnessContext } from "../context";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildDayVotePrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 24,
  });
  const options = context.targetPlayerIds
    .map((id) => {
      const player = input.room.players.find((candidate) => candidate.id === id);
      return player ? `${player.seatNo}号(${player.displayName})` : id;
    })
    .join(", ");
  const system = [
    `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: ${roleText(input.state.role)}

${winCondition(input.state.role)}`,
    `【投票规则】
每位玩家投票选择一名嫌疑人处决。得票最多者出局。平票则进入 PK 发言后重新投票。

【投票策略】
- 尽量与自己本日发言保持一致
- 综合本日所有发言，不要只看最后几句
- 不要盲目跟随警长归票，保持独立判断
- 如果没有证据，可投发言模糊或立场反复的玩家

【任务】
选择一名玩家处决。只需给出座位数字。

可选: ${options}`,
  ].join("\n\n");
  const user = `${context.text}

【本日讨论记录】
${context.timelineText || "（无）"}

【你本日发言汇总】
"${context.selfSpeechText || "（你今天没有发言）"}"

你投几号？

【格式】
只回复座位数字，如: 3
不要解释，不要输出多余文字，不要代码块`;
  return finishPrompt(system, user);
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
