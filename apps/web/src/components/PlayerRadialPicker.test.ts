import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerRadialPicker, type PlayerRadialTarget } from "./PlayerRadialPicker";

const targets: PlayerRadialTarget[] = [
  { seatNo: 1, playerId: "player-1", displayName: "game-1" },
  { seatNo: 2, playerId: "player-2", displayName: "game-2" },
  { seatNo: 3, playerId: "player-3", displayName: "game-3" },
];

const noop = () => {};

describe("PlayerRadialPicker", () => {
  it("keeps the action slot mounted while reopening a selected wheel", () => {
    const html = renderToStaticMarkup(
      createElement(PlayerRadialPicker, {
        targets,
        selectedTargetId: "player-2",
        confirmLabel: "确认投票",
        defaultOpen: true,
        onSelect: noop,
        onClear: noop,
        onConfirm: noop,
      })
    );

    expect(html).toContain("player-picker selected");
    expect(html).toContain("player-picker-wheel open");
    expect(html).toContain("player-picker-action-slot is-placeholder");
    expect(html).not.toContain("确认投票");
  });
});
