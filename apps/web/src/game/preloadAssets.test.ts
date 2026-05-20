import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_ASSET_URLS } from "./preloadAssets";

describe("game asset preloading", () => {
  it("preloads shared game UI, button, and role card assets before entering a room", () => {
    expect(GAME_ASSET_URLS).toContain("/assets/werewolf-ui/final/background/night-village.avif");
    expect(GAME_ASSET_URLS).toContain("/assets/werewolf-ui/final/button/art/primary-button.png");
    expect(GAME_ASSET_URLS).toContain("/assets/werewolf-ui/final/panel-9slice/fill.webp");
    expect(GAME_ASSET_URLS).toContain("/assets/role-cards/werewolf.avif");
    expect(new Set(GAME_ASSET_URLS).size).toBe(GAME_ASSET_URLS.length);
  });

  it("keeps the room route behind a reusable preload gate", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/web/src/main.tsx"), "utf8");

    expect(source).toContain('import { GameAssetPreloadGate } from "./components/GameAssetPreloadGate";');
    expect(source).toContain("<GameAssetPreloadGate");
    expect(source).toContain("<GameRoomPage");
  });
});

