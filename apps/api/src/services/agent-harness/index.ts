import { buildDaySpeechPrompt } from "./phases/day-speech";
import { buildDayVotePrompt } from "./phases/day-vote";
import { buildNightWolfPrompt } from "./phases/night-wolf";
import { buildNightRolePrompt } from "./phases/night-role";
import type { AgentPromptResult, BuildAgentPromptInput } from "./types";

export type {
  AgentPromptMessage,
  AgentPromptPart,
  AgentPromptResult,
  AgentTurnKind,
  BuildAgentPromptInput,
} from "./types";

export function buildAgentPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const phase = input.room.projection?.phase;
  if (phase === "day_speak" || phase === "tie_speech") {
    return buildDaySpeechPrompt(input);
  }
  if (phase === "day_vote" || phase === "tie_vote") {
    return buildDayVotePrompt(input);
  }
  if (phase === "night_wolf") {
    return buildNightWolfPrompt(input);
  }
  return buildNightRolePrompt(input);
}
