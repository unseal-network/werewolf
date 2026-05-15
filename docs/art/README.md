# Werewolf Art Documentation

Date: 2026-05-13

## Current Direction

The current renderer direction is PixiJS for the game visual layer, with React/DOM retaining real text, stateful controls, accessibility, routing, SSE state, and LiveKit state.

## Documents

- `docs/superpowers/specs/2026-05-13-werewolf-ui-asset-system-design.md`
  - High-level art direction, visual hierarchy, generation workflow, non-goals, and success criteria.
  - Use this to judge whether an asset belongs in the system and whether it preserves readability.

- `docs/art/werewolf-pixi-art-pack.md`
  - Concrete PixiJS art-pack specification.
  - Use this for asset categories, sizes, prompts, component coverage, and generation order.

- `apps/web/public/assets/ui/manifest.json`
  - Runtime-facing asset manifest.
  - Use this for stable Pixi asset keys, file paths, sizes, alpha requirements, NineSlice metadata, blend modes, and implementation lookup.

## Conflict Rules

- For concrete asset keys, paths, sizes, Pixi usage, alpha, blend mode, and NineSlice metadata, `manifest.json` wins.
- For component coverage and generation prompts, `werewolf-pixi-art-pack.md` wins.
- For visual priority, readability, UI/DOM ownership, and non-goals, the high-level asset-system spec wins.

## Generation Workflow

1. Generate the Pixi master mockup first.
2. Validate visual hierarchy against the high-level spec.
3. Generate the first core slice: background, overlays, central notice, primary button, selected seat ring, radial base.
4. Compose those in the Pixi comparison/demo page.
5. Only then generate the rest of the controls and effect sprites from the manifest.

Do not generate isolated final assets without checking them in a composed Pixi scene.
