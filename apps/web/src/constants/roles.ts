import civilianImg from "../assets/civilian.jpeg";
import guardImg from "../assets/guard.jpeg";
import hunterImg from "../assets/hunter.jpeg";
import prophetImg from "../assets/prophet.jpeg";
import werewolfImg from "../assets/werewolf.jpeg";
import witchImg from "../assets/witch.jpeg";
import logoImg from "../assets/logo.jpeg";

export type DisplayRole = "villager" | "guard" | "hunter" | "seer" | "werewolf" | "witch";
export type DisplayPhase =
  | "lobby"
  | "deal"
  | "guard"
  | "wolf"
  | "witch-save"
  | "witch-poison"
  | "seer"
  | "night"
  | "day"
  | "dayResolution"
  | "vote"
  | "tie"
  | "end";

export const ROLE_IMG: Record<DisplayRole, string> = {
  villager: civilianImg,
  guard: guardImg,
  hunter: hunterImg,
  seer: prophetImg,
  werewolf: werewolfImg,
  witch: witchImg,
};

export const ROLE_LABEL: Record<DisplayRole, string> = {
  villager: "村民",
  guard: "守卫",
  hunter: "猎人",
  seer: "预言家",
  werewolf: "狼人",
  witch: "女巫",
};

export const ROLE_COLOR: Record<DisplayRole, string> = {
  villager: "#60a5fa",
  guard: "#34d399",
  hunter: "#f59e0b",
  seer: "#c084fc",
  werewolf: "#f87171",
  witch: "#a78bfa",
};

export const LOGO_IMG = logoImg;

export function normalizeDisplayRole(roleId: string | undefined): DisplayRole {
  switch (roleId) {
    case "civilian":
    case "villager":
      return "villager";
    case "prophet":
    case "seer":
      return "seer";
    case "guard":
    case "hunter":
    case "werewolf":
    case "witch":
      return roleId;
    default:
      return "villager";
  }
}

export function serverPhaseToDisplayPhase(phase: string | null | undefined): DisplayPhase {
  switch (phase) {
    case "role_assignment":
      return "deal";
    case "night_guard":
      return "guard";
    case "night_wolf":
      return "wolf";
    case "night_witch_heal":
      return "witch-save";
    case "night_witch_poison":
      return "witch-poison";
    case "night_seer":
      return "seer";
    case "night_resolution":
      return "night";
    case "day_speak":
    case "tie_speech":
      return "day";
    case "day_vote":
      return "vote";
    case "tie_vote":
      return "tie";
    case "day_resolution":
      return "dayResolution";
    case "post_game":
      return "end";
    case "lobby":
    case "deal":
    case "guard":
    case "wolf":
    case "witch-save":
    case "witch-poison":
    case "seer":
    case "night":
    case "day":
    case "dayResolution":
    case "vote":
    case "tie":
    case "end":
      return phase;
    default:
      return "lobby";
  }
}
