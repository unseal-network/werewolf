import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_ASSET_URLS } from "./preloadAssets";

describe("game asset preloading", () => {
  function listFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const fullPath = join(dir, entry);
      return statSync(fullPath).isDirectory() ? listFiles(fullPath) : [fullPath];
    });
  }

  it("preloads shared game UI, button, and role card assets before entering a room", () => {
    expect(GAME_ASSET_URLS).toContain("/assets/werewolf-ui/final/background/night-village.avif");
    expect(GAME_ASSET_URLS).toContain("/assets/werewolf-ui/final/button/art/primary-button.png");
    expect(GAME_ASSET_URLS).toContain("/assets/werewolf-ui/final/panel-9slice/fill.webp");
    expect(GAME_ASSET_URLS).toContain("/assets/role-cards/werewolf.avif");
    expect(GAME_ASSET_URLS).toContain("/assets/world/backgrounds/moonlit-village-day.avif");
    expect(GAME_ASSET_URLS).toContain("/assets/world/backgrounds/moonlit-village-vote.avif");
    expect(new Set(GAME_ASSET_URLS).size).toBe(GAME_ASSET_URLS.length);
  });

  it("covers every optimized local game asset before entering a room", () => {
    const publicAssets = resolve(process.cwd(), "apps/web/public/assets");
    const optimizedGameAssets = [
      ...listFiles(resolve(publicAssets, "werewolf-ui/final")).filter((file) =>
        /\.(avif|webp)$/.test(file) || /\/button\/art\/[^/]+\.png$/.test(file)
      ),
      ...listFiles(resolve(publicAssets, "world/backgrounds")).filter((file) =>
        /\.avif$/.test(file)
      ),
      ...listFiles(resolve(publicAssets, "role-cards")).filter((file) =>
        /\.avif$/.test(file)
      ),
    ].map((file) => `/assets/${relative(publicAssets, file)}`);

    const missing = optimizedGameAssets.filter((url) => !GAME_ASSET_URLS.includes(url));
    expect(missing).toEqual([]);
  });

  it("covers every static CSS asset URL used by the game room styles", () => {
    const cssFiles = [
      "apps/web/src/styles/game-room/layout.css",
      "apps/web/src/styles/game-room/components/action-region.css",
      "apps/web/src/styles/game-room/components/hud.css",
      "apps/web/src/styles/game-room/components/ui-panel.css",
      "apps/web/src/styles/game-room/components/ui-primitives.css",
      "apps/web/src/styles/game-room/components/utility-region.css",
    ];
    const css = cssFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");
    const urls = Array.from(css.matchAll(/url\("?(\/assets\/[^")]+)"?\)/g)).map(
      (match) => match[1]!
    );

    const missing = urls.filter((url) => !GAME_ASSET_URLS.includes(url));
    expect(missing).toEqual([]);
  });

  it("keeps the room route behind a reusable preload gate", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/web/src/main.tsx"), "utf8");

    expect(source).toContain('import { GameAssetPreloadGate } from "./components/GameAssetPreloadGate";');
    expect(source).toContain("<GameAssetPreloadGate");
    expect(source).toContain("<GameRoomPage");
  });
});
