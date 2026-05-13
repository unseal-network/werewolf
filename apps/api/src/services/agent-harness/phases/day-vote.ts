import { buildHarnessContext } from "../context";
import { buildRoleStrategy, buildToolOnlyRules } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildDayVotePrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 16,
  });
  const system = [
    "【白天投票】你需要基于公开发言和票型做出处决投票。",
    `【身份】你是 ${input.player.seatNo}号「${input.player.displayName}」，身份是 ${input.state.role}。`,
    input.languageInstruction ?? "",
    buildRoleStrategy(input.state.role),
    buildToolOnlyRules(Object.keys(input.tools)),
    "【投票策略】尽量与自己本日发言保持一致；综合本日所有发言，不要只看最后一句；平票重投时只能在允许目标中选择。",
  ].filter(Boolean).join("\n\n");
  const user = [
    context.text,
    "<current_task>",
    input.taskPrompt,
    "综合本日发言、历史票型和你的角色目标，调用 submitVote 或 abstain。",
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
