import { buildHarnessContext } from "../context";
import { buildRoleStrategy, buildToolOnlyRules } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildNightRolePrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 12,
  });
  const system = [
    "【夜间角色行动】你需要根据角色信息选择夜间行动。",
    `【身份】你是 ${input.player.seatNo}号「${input.player.displayName}」，身份是 ${input.state.role}。`,
    input.languageInstruction ?? "",
    buildRoleStrategy(input.state.role),
    buildToolOnlyRules(Object.keys(input.tools)),
    "【行动原则】优先使用 <action_options> 中的合法 targetPlayerId；无法形成有效行动时调用 passAction。",
  ].filter(Boolean).join("\n\n");
  const user = [
    context.text,
    "<current_task>",
    input.taskPrompt,
    "只通过工具完成行动。",
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
