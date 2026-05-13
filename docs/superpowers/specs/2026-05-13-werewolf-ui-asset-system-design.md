# Werewolf UI Asset System Design

Date: 2026-05-13

## Goal

Design a unified image asset system for the Werewolf game room UI. The asset set must be generated as one coherent visual system for the existing game layout, not as independent decorative images.

The final interface should feel like an immersive village-theater Werewolf game with premium board-game UI materials. It must keep the current gameplay information, player state, and action controls more visible than the background art.

## Approved Direction

Use a custom vertical game-room art direction built for the current layout:

- Background: a dark fairy-tale village square built around the UI layout, not a generic village illustration.
- UI material: obsidian dark surfaces, antique-gold or old-copper edges, restrained teal moonlight highlights, and crimson only for voting danger.
- Texture: subtle board-game craftsmanship, not heavy parchment clutter.
- Mood: mysterious and premium, but not horror, gore, or over-dark fantasy.
- Text: all real Chinese labels, numbers, player names, timers, and button copy remain frontend-rendered.

The visual system should blend "immersive village theater" with "premium board-game interface." The background provides the world; the UI assets provide control, readability, and hierarchy.

## Current Layout Reference

The asset system should fit the existing game-room structure shown in the current screenshot:

- Top HUD: back button, phase/day/vote summary, alive count, and countdown badge.
- Left and right player avatar tracks: circular avatars with number badges and status states.
- Central information area: recent speaker, public phase message, vote progress, and short system text.
- Bottom action area: current action controls, target selection affordance, role card entry, and timeline entry.
- Full-screen background: village scene with stage depth and edge darkening.

This layout should remain the baseline. The asset system may improve spacing, visual grouping, and polish, but should not require a fundamentally different information architecture.

## Visual Priority

Every asset must obey this visual priority order:

1. Current phase, countdown, primary action button, and active target selection.
2. Central message panel, latest speaker, player speaking state, alive/dead state.
3. Player avatars, role card entry, timeline entry, secondary controls.
4. Background village, fog, ambient light, decorative texture.

If an asset makes the background, decorative glow, or frame more eye-catching than the active action area, it fails the design.

## Layer Model

The final screen should be composited in this order:

1. `background-village-stage`: full-screen village background, opaque.
2. `ambient-depth-fog`: low-opacity depth/fog layer, transparent.
3. `phase-color-overlay`: night/day/vote/end tint, transparent.
4. `top-hud-frame` and `timer-badge-frame`: lightweight HUD surfaces.
5. `central-notice-frame` and `central-notice-fill`: message panel shell.
6. `seat-status-rings`: avatar state rings and badges.
7. `bottom-action-dock`: action area base.
8. `button-skins`: primary, secondary, danger, disabled, pressed, and circular action buttons.
9. `role-card-assets` and modal/card frames.
10. Frontend-rendered text, icons, focus states, and interaction affordances.

The frontend should control layout, text, button labels, hover/focus states, and legal action visibility. Image assets provide background, material, edge treatment, glow, and state emphasis.

## Background Requirements

Generate a new background rather than reusing the current image. It should be designed around the UI layout from the start.

Composition requirements:

- Portrait-first composition for the current phone-like game-room view.
- Top area has a naturally dark band behind the HUD.
- Left and right edges reserve readable space for avatar tracks.
- Central message area has lower texture density and no high-contrast objects behind text.
- Bottom action area has a darker, cleaner ground plane for controls.
- Village detail lives mostly in the middle distance and edges.
- A subtle central village-square focal point is allowed, but it must not compete with the central message panel.

Avoid:

- Bright windows directly behind text.
- High-contrast faces, characters, signs, or symbols in the background.
- A large realistic table inserted into the scene.
- Strong perspective objects that make the UI feel pasted on.
- Overly busy cobblestone texture behind the bottom action area.

Preferred background assets:

- `background-village-night.webp`
- `background-village-day.webp`
- `background-village-vote.webp`

These should share the same composition so phase changes feel like lighting changes, not scene jumps.

## Phase Overlays

Phase overlays should change mood without changing layout or stealing focus.

Assets:

- `overlay-night.png`: blue-black edge darkness, soft moonlight, readable center.
- `overlay-day.png`: cool morning mist with restrained warm lift, higher readability.
- `overlay-vote.png`: dark crimson edge tension, central content and bottom action preserved.
- `overlay-end.png`: subdued gold or shadow treatment depending on winner state.

Rules:

- Transparent PNG or WebP with alpha.
- No complex objects, figures, readable symbols, or fake text.
- Edges can be stronger than center.
- The central message panel and bottom action area must remain clear.

## Central Information Area

The center should remain a message/notice panel, not a table.

Assets:

- `central-notice-frame.png`: scalable frame or 9-slice source.
- `central-notice-fill.png`: subtle dark obsidian/glass fill texture.
- `central-notice-glow.png`: optional low-opacity focus glow.

Design requirements:

- Reads as a village council notice, not a heavy modal.
- Obsidian or smoky glass surface with antique-gold edge detail.
- Interior is quiet and low texture for text.
- Edge highlights are visible but not brighter than the primary action button.
- The panel can support recent speaker, public message, vote progress, and short chips.

The central notice should be visually important, but less forceful than the current actionable bottom control when the player can act.

## Top HUD Assets

The top HUD is functional and text-heavy, so the image asset should be restrained.

Assets:

- `top-hud-frame.png`
- `hud-back-button-frame.png`
- `timer-badge-frame.png`
- `hud-subtle-edge-glow.png`

Rules:

- Do not bake text, numbers, arrows, or icons into the image.
- Support changing timer length and phase labels.
- Keep the HUD darker than action controls.
- Use antique-gold or old-copper trim sparingly.

The HUD should feel like a game interface, not a webpage navbar, but it must remain compact and readable.

## Player Seat Assets

Player identity remains frontend/user-provided. Generated assets should unify the state system around avatars.

Assets:

- `seat-ring-normal.png`
- `seat-ring-speaking.png`
- `seat-ring-action.png`
- `seat-ring-selected.png`
- `seat-ring-voted.png`
- `seat-ring-dead.png`
- `seat-ring-offline.png`
- `seat-number-badge.png`

State treatment:

- Normal: low-brightness antique-gold or muted metal ring.
- Speaking: teal moonlight pulse or glow.
- Current action: stronger teal-gold double ring.
- Selected: clear gold outer ring.
- Voted: small badge treatment, not a huge glow.
- Dead: desaturated, low brightness, gray veil or cracked ring.
- Offline/left: subdued marker that does not dominate the seat.

Rules:

- The ring system must look unified across all states.
- Status effects should not hide the avatar or player number.
- Default seats should stay quiet so active seats stand out.

## Bottom Action Area

The bottom action area should become the clearest action surface on screen when the player can act.

Assets:

- `bottom-action-dock.png`
- `bottom-action-dock-active-glow.png`
- `button-primary-frame.png`
- `button-primary-fill.png`
- `button-primary-pressed.png`
- `button-primary-disabled.png`
- `button-secondary-frame.png`
- `button-danger-frame.png`
- `button-danger-glow.png`
- `button-circular-action-frame.png`
- `button-circular-action-active.png`

Design requirements:

- Button text remains frontend-rendered.
- Buttons use dark obsidian interiors, old-gold trim, and restrained teal inner glow.
- Primary/action-ready state is the highest visual weight in the UI.
- Danger/vote confirmation can use crimson edge glow, but not full bright red fill.
- Disabled state is desaturated, low-contrast, and clearly inactive.
- Pressed state feels physically lower or dimmer.
- Circular action button should match the same material system as rectangular buttons.

The bottom action dock should visually group target selection, plus/skill action, and the main action button so they feel like one interaction flow.

## Role And Modal Assets

Existing role-card art direction remains valid: premium illustrated board-game cards with dark fantasy, parchment-gold borders, and no readable text.

Assets:

- `role-card-back.png`
- `role-card-frame.png`
- `role-card-glow.png`
- `modal-frame.png`
- `result-frame-victory.png`
- `result-frame-defeat.png`

Rules:

- Role cards may be more illustrative than other UI assets because they are ritual moments.
- Modal frames should still match the obsidian/gold material system.
- Role reveal and result overlays can temporarily take focus, but should dim the rest of the UI rather than add visual clutter.

## Asset Generation Order

Do not generate isolated production assets first. Use this order:

1. Generate one full-screen visual master mockup using the current layout.
2. Validate that HUD, central message, player seats, and bottom action area have the correct visual priority.
3. Adjust the master mockup until background and UI materials feel integrated.
4. Derive the asset layer list from the approved master mockup.
5. Generate background and phase variants with the same composition.
6. Generate frame, ring, button, and dock assets using the same material references.
7. Composite all assets in a browser test page over representative frontend text.
8. Tune opacity, contrast, and state emphasis before integrating into production.

## Prompting Constraints

Every generated asset prompt should include the shared context:

```text
This asset belongs to a unified dark fairy-tale Werewolf browser-game interface.
It will be layered over a portrait village game room with top HUD, side player seats, central message panel, and bottom action controls.
Use obsidian dark surfaces, antique-gold or old-copper trim, restrained teal moonlight highlights, and crimson only for vote danger.
Do not include readable text, numbers, player names, logos, watermarks, or standalone symbols unless explicitly requested.
The asset must support frontend-rendered text and must not dominate the central message panel or primary action button.
```

For the full master mockup, the prompt should also specify:

- Portrait composition around 768 by 1600.
- Placeholder UI shapes only, no real copy.
- The primary action area should be visually clearest.
- The background should be lower contrast than the HUD, central panel, and button controls.

## Implementation Notes

Preferred final asset location:

- `apps/web/public/assets/ui/`

Suggested subdirectories:

- `backgrounds/`
- `overlays/`
- `frames/`
- `buttons/`
- `seats/`
- `cards/`

Use WebP for opaque full-screen backgrounds and PNG/WebP with alpha for overlays, frames, buttons, rings, and glows.

Do not reference generated files directly from `$CODEX_HOME/generated_images`. Project-bound assets must be copied into the workspace and referenced from `apps/web/public/assets/ui/`.

## Browser Composition Test

Before integrating assets into the production game room, create a local composition test that stacks the assets in the intended DOM order and verifies:

- Night, day, vote, and end visual states.
- 6, 8, 10, and 12 player layouts.
- Normal, speaking, selected, voted, dead, and offline seat states.
- Primary, secondary, danger, disabled, and pressed button states.
- Central panel readability with English and Chinese text.
- Top HUD readability with long phase labels and two-digit countdown.
- Mobile portrait and desktop/narrow responsive previews.

This test should catch asset conflicts before implementation work starts.

## Non-Goals

- Do not redesign the game rules, backend events, action legality, or audio system.
- Do not bake real UI text into generated images.
- Do not generate a complete static screenshot and use it as the app UI.
- Do not make the background the main attraction during active gameplay.
- Do not introduce a large central table unless a later validated mockup proves it improves readability.
- Do not replace all CSS with images. CSS and React still own text, layout, accessibility, and interaction states.

## Success Criteria

- The final composed UI reads as one coherent art-directed system.
- The primary action area is the strongest visual target whenever the current player can act.
- The central message area remains readable across phase overlays.
- Player seat status is scannable without overwhelming the background.
- Phase changes feel like lighting and mood changes, not unrelated scenes.
- Buttons feel like premium game assets while keeping frontend-rendered text crisp.
- Generated assets can be recomposed in the app without looking pasted together.
- The background supports the layout instead of competing with it.
