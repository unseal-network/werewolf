# Werewolf Art Documentation

Date: 2026-05-16

## Current Direction

The production game-room UI now uses React/DOM with CSS-backed art assets copied from the werewolf demo pipeline. The runtime asset source of truth is:

- `apps/web/public/assets/werewolf-ui/final/asset-manifest.json`
- `apps/web/public/assets/werewolf-ui/final/component-map.json`

Legacy Pixi atlas packs under `apps/web/public/assets/ui/`, `selector/`, `cards/`, `effects/`, and `world/{alpha,overlays,source}/` were removed after runtime reference checks.

## Documents

- `docs/superpowers/specs/2026-05-13-werewolf-ui-asset-system-design.md`
  - High-level art direction, visual hierarchy, generation workflow, non-goals, and success criteria.
  - Use this to judge whether an asset belongs in the system and whether it preserves readability.

- `docs/art/werewolf-pixi-art-pack.md`
  - Historical PixiJS art-pack specification.
  - Use this for prompt language and visual intent only; do not use its old runtime path recommendations over the current `werewolf-ui/final` manifest.

- `apps/web/public/assets/werewolf-ui/final/asset-manifest.json`
  - Runtime-facing asset manifest.
  - Use this for stable asset keys, file paths, sizes, alpha requirements, NineSlice metadata, and implementation lookup.

## Conflict Rules

- For concrete asset keys, paths, sizes, alpha, and NineSlice metadata, `asset-manifest.json` wins.
- For generation prompts and visual intent, the historical Pixi docs can still provide context.
- For visual priority, readability, UI/DOM ownership, and non-goals, the high-level asset-system spec remains useful background.

## Generation Workflow

1. Generate the Pixi master mockup first.
2. Validate visual hierarchy against the high-level spec.
3. Generate the first core slice: background, overlays, central notice, primary button, selected seat ring, radial base.
4. Compose those in the Pixi comparison/demo page.
5. Only then generate the rest of the controls and effect sprites from the manifest.

Do not generate isolated final assets without checking them in a composed Pixi scene.
