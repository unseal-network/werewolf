import type { StoredGameRoom, StoredPlayer } from "../game-service";

export function buildSpeakingOrderHint(
  room: StoredGameRoom,
  playerId: string
): string {
  const projection = room.projection;
  if (
    !projection ||
    (projection.phase !== "day_speak" && projection.phase !== "tie_speech")
  ) {
    return "";
  }
  const order = room.speechQueue.length > 0 ? room.speechQueue : projection.alivePlayerIds;
  const index = order.indexOf(playerId);
  if (index < 0) return "<speaking_order>当前发言顺序未知。</speaking_order>";
  const total = order.length;
  const spoken = order.slice(0, index).map((id) => labelById(room.players, id)).join("、") || "无";
  const unspoken = order.slice(index + 1).map((id) => labelById(room.players, id)).join("、") || "无";
  const position =
    index === 0
      ? "你是第1个发言，不要引用前面不存在的发言。"
      : index === total - 1
        ? `你是第${index + 1}/${total}个发言，前面大多数信息已经出现，请总结矛盾并给出方向。`
        : `你是第${index + 1}/${total}个发言。`;
  return [
    "<speaking_order>",
    position,
    `已发言：${spoken}`,
    `未发言：${unspoken}`,
    "</speaking_order>",
  ].join("\n");
}

function labelById(players: StoredPlayer[], playerId: string): string {
  const player = players.find((candidate) => candidate.id === playerId);
  return player ? `${player.displayName}` : playerId;
}
