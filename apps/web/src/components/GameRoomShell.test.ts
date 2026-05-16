import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeVisibleSeatCount, splitSeatsIntoRails, visibleSeatNumbersForRoom } from "../game/seatLayout";

function jsonFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return jsonFilesUnder(path);
    return entry.name.endsWith(".json") ? [path] : [];
  });
}

function publicWerewolfAssetRefs(value: unknown): string[] {
  if (typeof value === "string") {
    return value.startsWith("public/assets/werewolf-ui/final/") ? [value] : [];
  }
  if (Array.isArray(value)) return value.flatMap(publicWerewolfAssetRefs);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(publicWerewolfAssetRefs);
  }
  return [];
}

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

  it("drives responsive sizing through layout variables instead of a fixed mobile canvas", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/GameRoomShell.tsx"),
      "utf8"
    );
    const responsive = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/responsive.css"),
      "utf8"
    );

    expect(shell).toContain("useResponsiveGameLayoutVars");
    expect(shell).toContain("--layout-seat");
    expect(shell).toContain("--layout-rail-width");
    expect(shell).toContain("--layout-rail-height");
    expect(shell).toContain("--layout-hud-scale");
    expect(shell).toContain("--layout-action-scale");
    expect(responsive).toContain("var(--layout-hud-scale");
    expect(shell).not.toContain("--mobile-layout-scale");
    expect(responsive).not.toContain("390px");
    expect(responsive).not.toContain("844px");
    expect(responsive).not.toContain("scale(var(--mobile-layout-scale");
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

    expect(layoutCss).toContain("werewolf-ui/final/avatar/frame-default.png");
    expect(layoutCss).toContain("werewolf-ui/final/avatar/frame-dead.png");
    expect(layoutCss).toContain("werewolf-ui/final/avatar/frame-selected.png");
    expect(layoutCss).toContain("werewolf-ui/final/avatar/frame-speaking.png");
    expect(layoutCss).not.toContain("avatar-rings-atlas");
    expect(seatCss).toContain("seat-state-ready");
    expect(seatCss).toContain("seat-state-alive");
    expect(seatCss).toContain("seat-state-dead");
    expect(seatAvatar).toContain("seat-state-ready");
    expect(seatAvatar).toContain("seat-state-alive");
    expect(seatAvatar).toContain("seat-state-dead");
    expect(seatAvatar).toContain("seat-state-selected");
    expect(seatAvatar).toContain("seat-state-speaking");
    expect(seatAvatar).toContain('avatarMode: "identity" | "hooded"');
    expect(seatAvatar).toContain('avatar-mode-hooded');
    expect(seatAvatar).not.toContain("has-role-avatar");
    expect(seatAvatar).not.toContain("has-image-avatar");
    expect(seatAvatar).not.toContain("has-letter-avatar");
    expect(seatAvatar).not.toContain("ROLE_IMG");
    expect(seatAvatar).not.toContain("role-avatar-img");
    expect(seatAvatar).not.toContain('seat.isEmpty ? "empty"');
    expect(seatAvatar).not.toContain('seat.isDead ? "dead"');
    expect(seatAvatar).not.toContain("seat-selected-mark");
    expect(seatAvatar).not.toContain("seat-speaking-mark");
    expect(seatAvatar).not.toContain("seat-wolf-tag");
    expect(seatAvatar).not.toContain("seat-tooltip");
    expect(seatAvatar).not.toContain("seat-name");
    expect(seatCss).not.toContain(".seat-name");
    expect(layoutCss).not.toContain("avatar/name-line.png");
    expect(layoutCss).not.toContain("avatar/status-dot.png");
    expect(seatAvatar).toContain("avatarInitial(seat, fullName)");
    expect(seatAvatar).toContain("firstReadableInitial(seat.userId)");
    expect(seatAvatar).not.toContain("fullName.charAt(0)");
    expect(layoutCss).toContain("--layout-seat-slot");
    expect(layoutCss).toContain("--layout-rail-width");
    expect(layoutCss).toContain("--layout-table-top-gap");
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
        '@import "./game-room/components/ui-panel.css";',
        '@import "./game-room/components/center-info.css";',
        '@import "./game-room/components/seat-avatar.css";',
        '@import "./game-room/components/action-region.css";',
        '@import "./game-room/components/utility-region.css";',
        '@import "./game-room/components/modal-layer.css";',
        '@import "./game-room/responsive.css";',
      ].join("\n")
    );
  });

  it("uses the shared ui-panel primitive for panel-backed UI surfaces", () => {
    const entry = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room.css"),
      "utf8"
    );
    const panelCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-panel.css"),
      "utf8"
    );
    const layoutCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/layout.css"),
      "utf8"
    );
    const shell = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/GameRoomShell.tsx"),
      "utf8"
    );
    const centerInfo = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/CenterInfoPanel.tsx"),
      "utf8"
    );
    const timeline = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/TimelineCapsule.tsx"),
      "utf8"
    );

    expect(entry).toContain('components/ui-panel.css');
    expect(panelCss).toContain(".game-layout-root .ui-panel");
    expect(panelCss).toContain("--ui-panel-corner: calc(192px * var(--ui-panel-scale))");
    expect(panelCss).toContain("panel-9slice/fill.png");
    expect(shell).toContain("center-info-region");
    expect(shell).toContain("{centerInfo}");
    expect(shell).not.toContain("{rawPhase ?? scene}");
    expect(shell).not.toContain("{living}/{targetPlayerCount || playerCount} 存活");
    expect(centerInfo).toContain("center-info-panel ui-panel");
    expect(timeline).toContain("log-sheet ui-panel");
    expect(layoutCss).not.toContain("panel-9slice/corner-tl.png");
  });

  it("keeps the top HUD free of side socket frames", () => {
    const hudCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/hud.css"),
      "utf8"
    );

    expect(hudCss).not.toContain("socket-left.png");
    expect(hudCss).not.toContain("socket-right.png");
  });

  it("wires the remaining usable werewolf-ui final assets into runtime surfaces", () => {
    const layoutCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/layout.css"),
      "utf8"
    );
    const seatCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/seat-avatar.css"),
      "utf8"
    );
    const centerInfoCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/center-info.css"),
      "utf8"
    );
    const legacyCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/legacy.css"),
      "utf8"
    );
    const panelCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-panel.css"),
      "utf8"
    );
    const seatAvatar = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/SeatAvatar.tsx"),
      "utf8"
    );
    const agentPicker = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/AgentPicker.tsx"),
      "utf8"
    );
    const userInfoPanel = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/UserInfoPanel.tsx"),
      "utf8"
    );
    const seerResultDialog = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/SeerResultDialog.tsx"),
      "utf8"
    );
    const manifest = readFileSync(
      resolve(process.cwd(), "apps/web/public/assets/werewolf-ui/final/asset-manifest.json"),
      "utf8"
    );
    const componentMap = readFileSync(
      resolve(process.cwd(), "apps/web/public/assets/werewolf-ui/final/component-map.json"),
      "utf8"
    );

    for (const asset of [
      "avatar/portrait-hooded.png",
      "badge/blade.png",
      "badge/eye.png",
      "badge/moon.png",
      "badge/people.png",
      "badge/shield.png",
      "badge/star.png",
      "effect/avatar-selected-glow.png",
    ]) {
      expect(`${layoutCss}\n${seatCss}`).toContain(`werewolf-ui/final/${asset}`);
    }

    expect(centerInfoCss).not.toContain("panel-9slice/arrow-point");

    expect(legacyCss).toContain("werewolf-ui/final/effect/radial-picker-ring.png");
    expect(panelCss).toContain("--ui-panel-skin");
    expect(seatAvatar).toContain("seatBadgeId");
    expect(seatAvatar).toContain("seat-hooded-portrait");
    expect(seatAvatar).toContain("hasHoodedAvatar");
    expect(seatAvatar).toContain("seat-role-badge");
    expect(agentPicker).toContain("agent-picker open ui-panel");
    expect(userInfoPanel).toContain("profile-dialog open ui-panel");
    expect(seerResultDialog).toContain("seer-result-dialog open ui-panel");
    expect(manifest).toContain('"id": "button/decision/confirm-button-9slice"');
    expect(componentMap).toContain('"button/decision/confirm-button-9slice"');
  });

  it("keeps speech input owned by the bottom action region", () => {
    const actionCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );
    const voicePanel = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/VoicePanel.tsx"),
      "utf8"
    );

    expect(actionCss).toContain(".game-layout-root .action-region .voice-panel");
    expect(actionCss).toContain(".game-layout-root .action-region .voice-text-bubble .speech-textarea");
    expect(actionCss).toContain("calc(100% - (var(--layout-rail-width) * 2)");
    expect(voicePanel).not.toContain("autoFocus");
  });

  it("keeps werewolf-ui metadata references limited to copied final files", () => {
    const assetRoot = resolve(process.cwd(), "apps/web/public/assets/werewolf-ui/final");
    const refs = jsonFilesUnder(assetRoot).flatMap((file) => {
      const json = JSON.parse(readFileSync(file, "utf8")) as unknown;
      return publicWerewolfAssetRefs(json);
    });

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(existsSync(resolve(process.cwd(), "apps/web", ref)), ref).toBe(true);
    }
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
