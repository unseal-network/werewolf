const appBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}`;
const werewolfUiBase = `${appBase}assets/werewolf-ui/final`;
const roleCardBase = `${appBase}assets/role-cards`;
const worldBackgroundBase = `${appBase}assets/world/backgrounds`;

const WEREWOLF_UI_ASSET_PATHS = [
  "avatar/dead-overlay.webp",
  "avatar/frame-dead.webp",
  "avatar/frame-default.webp",
  "avatar/frame-selected.webp",
  "avatar/frame-speaking.webp",
  "avatar/glow-selected.webp",
  "avatar/name-line.webp",
  "avatar/portrait-hooded.webp",
  "avatar/status-dot.webp",
  "background/night-village.avif",
  "background/vignette-overlay.avif",
  "badge/blade.webp",
  "badge/eye.webp",
  "badge/moon.webp",
  "badge/people.webp",
  "badge/shield.webp",
  "badge/star.webp",
  "button/decision/cancel-button-9slice.webp",
  "button/decision/confirm-button-9slice.webp",
  "button/decision/submit-button-9slice.webp",
  "button/log-corner-bl.webp",
  "button/log-corner-br.webp",
  "button/log-corner-tl.webp",
  "button/log-corner-tr.webp",
  "button/log-edge-horizontal.webp",
  "button/log-edge-vertical.webp",
  "button/log-fill.webp",
  "card/role-card-back.avif",
  "effect/avatar-selected-glow.webp",
  "effect/avatar-speaking-pulse.webp",
  "effect/radial-picker-ring.webp",
  "effect/vote-target-ring.webp",
  "hud/icon-moon.webp",
  "hud/icon-people.webp",
  "hud/moon-medallion.webp",
  "hud/rail-bottom-line.webp",
  "hud/rail-fill.webp",
  "hud/rail-top-line.webp",
  "hud/socket-left.webp",
  "hud/socket-right.webp",
  "icon/book.webp",
  "panel-9slice/arrow-point-down.webp",
  "panel-9slice/arrow-point-left.webp",
  "panel-9slice/arrow-point-right.webp",
  "panel-9slice/arrow-point-up.webp",
  "panel-9slice/corner-bl.webp",
  "panel-9slice/corner-br.webp",
  "panel-9slice/corner-tl.webp",
  "panel-9slice/corner-tr.webp",
  "panel-9slice/divider.webp",
  "panel-9slice/edge-bottom.webp",
  "panel-9slice/edge-left.webp",
  "panel-9slice/edge-right.webp",
  "panel-9slice/edge-top.webp",
  "panel-9slice/fill.webp",
  "panel-9slice/ornament-bottom.webp",
  "panel-9slice/ornament-top.webp",
] as const;

const WORLD_BACKGROUND_ASSET_PATHS = [
  "moonlit-village-day.avif",
  "moonlit-village-desktop.avif",
  "moonlit-village-good-victory.avif",
  "moonlit-village-mobile.avif",
  "moonlit-village-vote.avif",
  "moonlit-village-wolf-victory.avif",
] as const;

const BUTTON_ART_ASSET_PATHS = [
  "button/art/danger-button.png",
  "button/art/disabled-button.png",
  "button/art/loading-button.png",
  "button/art/pressed-button.png",
  "button/art/primary-button.png",
  "button/art/secondary-button.png",
] as const;

const ROLE_CARD_ASSET_PATHS = [
  "card-back.avif",
  "guard.avif",
  "seer.avif",
  "villager.avif",
  "werewolf.avif",
  "witch.avif",
] as const;

export const GAME_BUTTON_ASSET_URLS = BUTTON_ART_ASSET_PATHS.map(
  (path) => `${werewolfUiBase}/${path}`
);

export const GAME_ASSET_URLS = Array.from(
  new Set([
    ...WEREWOLF_UI_ASSET_PATHS.map((path) => `${werewolfUiBase}/${path}`),
    ...GAME_BUTTON_ASSET_URLS,
    ...ROLE_CARD_ASSET_PATHS.map((path) => `${roleCardBase}/${path}`),
    ...WORLD_BACKGROUND_ASSET_PATHS.map((path) => `${worldBackgroundBase}/${path}`),
  ])
);

const preloadCache = new Map<string, Promise<void>>();

function preloadImageAsset(url: string): Promise<void> {
  const cached = preloadCache.get(url);
  if (cached) return cached;

  if (typeof Image === "undefined") {
    const resolved = Promise.resolve();
    preloadCache.set(url, resolved);
    return resolved;
  }

  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    image.onload = () => {
      const decode = image.decode?.();
      if (decode) {
        void decode.then(finish, finish);
        return;
      }
      finish();
    };
    image.onerror = finish;
    image.decoding = "async";
    image.src = url;

    if (image.complete) finish();
  });

  preloadCache.set(url, promise);
  return promise;
}

export async function preloadGameAssetUrls(
  urls: readonly string[],
  onProgress?: ((loaded: number, total: number) => void) | undefined
): Promise<void> {
  const uniqueUrls = Array.from(new Set(urls));
  const total = uniqueUrls.length;
  let loaded = 0;

  onProgress?.(loaded, total);

  await Promise.all(
    uniqueUrls.map((url) =>
      preloadImageAsset(url).then(() => {
        loaded += 1;
        onProgress?.(loaded, total);
      })
    )
  );
}

export async function preloadGameAssets(
  onProgress?: ((loaded: number, total: number) => void) | undefined
): Promise<void> {
  await preloadGameAssetUrls(GAME_ASSET_URLS, onProgress);
}
