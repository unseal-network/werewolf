import { buildHarnessContext } from "../context";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildNightWolfPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 24,
  });
  const toolNames = Object.keys(input.tools);
  if (toolNames.includes("saySpeech")) {
    return buildWolfDiscussionPrompt(input, context);
  }
  return buildWolfKillPrompt(input, context);
}

function buildWolfDiscussionPrompt(
  input: BuildAgentPromptInput,
  context: ReturnType<typeof buildHarnessContext>
): AgentPromptResult {
  const system = `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: 狼人

${winCondition("werewolf")}`;
  const user = `${context.text}

${context.timelineText || ""}

狼队夜间讨论，返回JSON数组：`;
  return finishPrompt(system, user);
}

function buildWolfKillPrompt(
  input: BuildAgentPromptInput,
  context: ReturnType<typeof buildHarnessContext>
): AgentPromptResult {
  const options = context.targetPlayerIds
    .map((id) => {
      const player = input.room.players.find((candidate) => candidate.id === id);
      return player ? `${player.seatNo}号(${player.displayName})` : id;
    })
    .join("、");
  const system = `【身份】
你是 ${input.player.seatNo}号「${input.player.displayName}」
身份: 狼人

${winCondition("werewolf")}

【狼人技能】
每晚狼人集体决定击杀一名玩家。可以选择击杀好人、队友（自刀）或不选（空刀）。

【击杀策略】
- 优先击杀神职：预言家 > 女巫 > 猎人 > 守卫
- 自刀：选择的狼人会死亡，可制造混乱
- 空刀：不杀人，制造平安夜迷惑好人

【任务】
选择一名玩家击杀。只需给出座位数字。

可选: ${options}`;
  const user = `${context.text}

${context.timelineText ? `【今日讨论】\n${context.timelineText}\n\n` : ""}${context.selfSpeechText ? `【你今天的发言】\n${context.selfSpeechText}\n\n` : ""}你们要杀几号？

【格式】
只回复座位数字，如: 2
不要解释，不要输出多余文字，不要代码块`;
  return finishPrompt(system, user);
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
