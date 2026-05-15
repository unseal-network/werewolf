import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeVisibleSeatCount, splitSeatsIntoRails, visibleSeatNumbersForRoom } from "../game/seatLayout";

describe("game room seat layout", () => {
  it("keeps one open seat visible until the room reaches twelve players", () => {
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 5, occupiedSeatCount: 5 })).toBe(6);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 6, occupiedSeatCount: 6 })).toBe(7);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 7, occupiedSeatCount: 7 })).toBe(8);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 11, occupiedSeatCount: 11 })).toBe(12);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 12, occupiedSeatCount: 12 })).toBe(12);
  });

  it("hides join seats after the game starts while preserving occupied seat numbers", () => {
    expect(
      visibleSeatNumbersForRoom({
        targetPlayerCount: 12,
        occupiedSeatNos: [1, 3, 5, 7, 9, 12],
        isGameStarted: true,
      })
    ).toEqual([1, 3, 5, 7, 9, 12]);
  });

  it("splits visible seats into left and right player rails by visual order", () => {
    const rails = splitSeatsIntoRails([1, 2, 3, 4, 5, 6, 7]);

    expect(rails.left).toEqual([1, 3, 5, 7]);
    expect(rails.right).toEqual([2, 4, 6]);
  });

  it("uses the region-based game room shell instead of the legacy visual layout", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/GameRoomShell.tsx"),
      "utf8"
    );

    expect(shell).toContain("scene-layer");
    expect(shell).toContain("game-ui-layout");
    expect(shell).toContain("hud-region");
    expect(shell).toContain("table-region");
    expect(shell).toContain("player-rail player-rail-left");
    expect(shell).toContain("center-info-region");
    expect(shell).toContain("action-region");
    expect(shell).toContain("utility-region");
    expect(shell).toContain("modal-layer");

    expect(shell).not.toContain("visual-runtime-root");
    expect(shell).not.toContain("data-visual-runtime");
    expect(shell).not.toContain("visual-topbar");
    expect(shell).not.toContain("visual-room");
    expect(shell).not.toContain("visual-center");
    expect(shell).not.toContain("visual-bottom-dock");
    expect(shell).not.toContain("visual-error-toast");
  });

  it("keeps rail seat containers from adding glass panels over the scene", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/seat-avatar.css"),
      "utf8"
    );
    const guard = css.slice(css.indexOf(".game-layout-root .player-rail .seat {"));

    expect(guard).toContain("background: transparent !important");
    expect(guard).toContain("box-shadow: none !important");
    expect(guard).toContain("backdrop-filter: none !important");
    expect(guard).toContain("-webkit-backdrop-filter: none !important");
  });

  it("keeps rail avatar frames to ready/alive and dead states only", () => {
    const layoutCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/layout.css"),
      "utf8"
    );
    const seatCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/seat-avatar.css"),
      "utf8"
    );
    const seatAvatar = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/SeatAvatar.tsx"),
      "utf8"
    );

    expect(layoutCss).toContain("avatar-rings-atlas-02.png");
    expect(layoutCss).toContain("avatar-rings-atlas-18.png");
    expect(layoutCss).not.toContain("avatar-rings-atlas-11.png");
    expect(layoutCss).not.toContain("avatar-rings-atlas-12.png");
    expect(layoutCss).not.toContain("avatar-rings-atlas-19.png");
    expect(seatCss).toContain("seat-state-ready");
    expect(seatCss).toContain("seat-state-alive");
    expect(seatCss).toContain("seat-state-dead");
    expect(seatAvatar).toContain("seat-state-ready");
    expect(seatAvatar).toContain("seat-state-alive");
    expect(seatAvatar).toContain("seat-state-dead");
    expect(seatAvatar).not.toContain("has-role-avatar");
    expect(seatAvatar).not.toContain("has-image-avatar");
    expect(seatAvatar).not.toContain("has-letter-avatar");
    expect(seatAvatar).not.toContain('seat.isEmpty ? "empty"');
    expect(seatAvatar).not.toContain('seat.isDead ? "dead"');
    expect(seatAvatar).not.toContain("seat-selected-mark");
    expect(seatAvatar).not.toContain("seat-speaking-mark");
    expect(seatAvatar).not.toContain("seat-wolf-tag");
    expect(seatAvatar).not.toContain("seat-tooltip");
    expect(seatAvatar).toContain("avatarInitial(seat, fullName)");
    expect(seatAvatar).toContain("firstReadableInitial(seat.userId)");
    expect(seatAvatar).not.toContain("fullName.charAt(0)");
    expect(layoutCss).toContain("--layout-seat-slot");
  });

  it("keeps game-room.css as an ordered stylesheet entrypoint", () => {
    const entry = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room.css"),
      "utf8"
    ).trim();

    expect(entry).toBe(
      [
        '@import "./game-room/legacy.css";',
        '@import "./game-room/layout.css";',
        '@import "./game-room/components/hud.css";',
        '@import "./game-room/components/center-info.css";',
        '@import "./game-room/components/seat-avatar.css";',
        '@import "./game-room/components/action-region.css";',
        '@import "./game-room/components/utility-region.css";',
        '@import "./game-room/components/modal-layer.css";',
        '@import "./game-room/responsive.css";',
      ].join("\n")
    );
  });

  it("removes obsolete visual and table layout selectors from shared styles", () => {
    const legacy = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/legacy.css"),
      "utf8"
    );

    expect(legacy).not.toMatch(/visual-runtime-root|data-visual-runtime|visual-topbar|visual-room|visual-center/);
    expect(legacy).not.toMatch(/\.room\b|\.table\b|\.seat\b|\.avatar\b|\.seat-name\b|\.seat-tooltip\b/);
    expect(legacy).not.toMatch(/dom-ui-layer|game-engine-layer/);
  });
});
