# Werewolf Art Assets Checklist

Status date: 2026-05-14

This checklist tracks generated image assets for the PixiJS Werewolf UI direction: modern medieval gothic, black-silver manuscript, low saturation, moonlit tribunal mood.

## Generated

- [x] Night village background, mobile: `apps/web/public/assets/world/backgrounds/moonlit-village-mobile.png`
- [x] Night village background, desktop: `apps/web/public/assets/world/backgrounds/moonlit-village-desktop.png`
- [x] Day discussion background: `apps/web/public/assets/world/backgrounds/moonlit-village-day.png`
- [x] Vote/tension background: `apps/web/public/assets/world/backgrounds/moonlit-village-vote.png`
- [x] Good-team victory background: `apps/web/public/assets/world/backgrounds/moonlit-village-good-victory.png`
- [x] Werewolf victory background: `apps/web/public/assets/world/backgrounds/moonlit-village-wolf-victory.png`
- [x] World icons atlas: `apps/web/public/assets/world/alpha/world-icons-atlas.png`
- [x] World decals atlas: `apps/web/public/assets/world/alpha/world-decals-atlas.png`
- [x] Phase overlays atlas: `apps/web/public/assets/world/overlays/alpha/phase-overlays-atlas.png`
- [x] Dynamic selector production atlas: `apps/web/public/assets/selector/alpha/dynamic-selector-production-atlas.png`
- [x] Dynamic selector selected-target effects atlas: `apps/web/public/assets/selector/effects/alpha/selected-target-effects-atlas.png`
- [x] Final HUD and panel atlas: `apps/web/public/assets/ui/final/alpha/hud-panels-atlas.png`
- [x] Final button atlas: `apps/web/public/assets/ui/final/alpha/buttons-atlas.png`
- [x] Final feedback, progress, loading, chip atlas: `apps/web/public/assets/ui/final/alpha/feedback-progress-atlas.png`
- [x] Final seat ring and status badge atlas: `apps/web/public/assets/ui/final/alpha/seat-rings-status-atlas.png`
- [x] Final card reveal and result effects atlas: `apps/web/public/assets/cards/final/alpha/card-result-fx-atlas.png`
- [x] Final unified role-card fronts atlas: `apps/web/public/assets/cards/final/alpha/unified-role-fronts-atlas.png`
- [x] Existing role-card set retained for compatibility: `apps/web/public/assets/role-cards/`
- [x] Particle and light sprite atlas: `apps/web/public/assets/effects/final/alpha/particles-light-atlas.png`

## Source Files

- [x] Chroma-key source atlases preserved under `source/` next to the alpha outputs.
- [x] Generated originals preserved under `/Users/Ruihan/.codex/generated_images/019e22a3-c957-7442-8367-4e42ebfabfbc/`.

## Next Engineering Tasks

- [ ] Slice final atlases into named runtime sprites.
- [ ] Update `apps/web/public/assets/ui/manifest.json` with final stable keys.
- [ ] Replace rejected old `apps/web/public/assets/ui/generated/*` usage with `apps/web/public/assets/ui/final/*`, `apps/web/public/assets/cards/final/*`, and `apps/web/public/assets/effects/final/*`.
- [ ] Re-run Pixi composition prototype with the final atlases layered together.
- [ ] Tune the radial selector shader/geometry so selected sector coverage matches the approved reference.
