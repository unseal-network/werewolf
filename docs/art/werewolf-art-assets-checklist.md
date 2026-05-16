# Werewolf Art Assets Checklist

Status date: 2026-05-16

This checklist tracks production image assets currently kept in the web runtime.

## Generated

- [x] Werewolf UI final manifest and component map: `apps/web/public/assets/werewolf-ui/final/`
- [x] Runtime role-card set retained for compatibility: `apps/web/public/assets/role-cards/`
- [x] Runtime phase backgrounds retained: `apps/web/public/assets/world/backgrounds/`
- [x] Animation lab assets retained: `apps/web/public/assets/animation-demo/`

## Source Files

- [x] Current runtime JSON metadata only references files copied under `apps/web/public/assets/werewolf-ui/final/`.
- [x] Historical generated originals may still exist outside the repo under `/Users/Ruihan/.codex/generated_images/`, but runtime code must not reference them directly.

## Next Engineering Tasks

- [ ] Keep `asset-manifest.json` and `component-map.json` in sync with any new copied `werewolf-ui/final` files.
- [ ] Run the static asset reference check before deleting or renaming runtime assets.
