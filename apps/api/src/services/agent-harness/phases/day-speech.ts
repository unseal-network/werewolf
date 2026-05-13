import { buildHarnessContext } from "../context";
import {
  buildFocusAngle,
  buildRoleStrategy,
  buildSpeakingOrderHint,
  buildSpeechRules,
} from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildDaySpeechPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 10,
  });
  const system = [
    "【白天发言】你正在参与一局狼人杀。",
    `【身份】你是 ${input.player.seatNo}号「${input.player.displayName}」，身份是 ${input.state.role}。`,
    input.languageInstruction ?? "",
    buildRoleStrategy(input.state.role),
    buildSpeechRules(input.room.language),
    "【核心原则】局内优先，只基于本局已经发生的信息发言；必须给出当前轮次的判断和方向。",
  ].filter(Boolean).join("\n\n");
  const focusAngle =
    buildFocusAngle(input.room, input.player.id) ||
    "<focus_angle>\n- 给出你基于当前公开信息的独立判断。\n</focus_angle>";
  const user = [
    context.text,
    buildSpeakingOrderHint(input.room, input.player.id),
    focusAngle,
    "<current_task>",
    input.taskPrompt,
    "轮到你发言。调用 saySpeech，发言要有明确判断。",
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
