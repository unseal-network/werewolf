import { buildHarnessContext } from "../context";
import { buildRoleStrategy, buildSpeechRules, buildToolOnlyRules } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildNightWolfPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 12,
  });
  const toolNames = Object.keys(input.tools);
  const isDiscussion = toolNames.includes("saySpeech");
  const system = [
    "【狼人夜间】你在狼人团队的私密阶段行动。",
    `【身份】你是 ${input.player.seatNo}号「${input.player.displayName}」，身份是狼人。`,
    input.languageInstruction ?? "",
    buildRoleStrategy("werewolf"),
    isDiscussion ? buildSpeechRules(input.room.language) : buildToolOnlyRules(toolNames),
    "【击杀策略】优先结合公开发言推断神职、强好人和带队者；协调队友，但不要机械跟随建议目标。",
  ].filter(Boolean).join("\n\n");
  const user = [
    context.text,
    "<current_task>",
    input.taskPrompt,
    isDiscussion
      ? "这是狼队私聊发言。调用 saySpeech，简短说明你建议的击杀方向和理由。"
      : "这是狼队击杀投票。调用 wolfKill 或 passAction。",
    "</current_task>",
  ].filter(Boolean).join("\n\n");
  return finishPrompt(system, user);
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
