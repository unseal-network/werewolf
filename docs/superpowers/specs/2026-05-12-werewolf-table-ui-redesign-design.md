# Werewolf Table UI Redesign Design

Date: 2026-05-12

## Goal

Redesign the Werewolf web client so the primary experience feels like a tabletop social deduction game: players around the table, current phase/action in the center, and private identity handled as a real card. The redesign must preserve the existing game flow and server contract while improving readability, visual quality, and interaction priority.

## Approved Direction

Use a restrained "misty night forest" visual language:

- Backgrounds are lightweight atmosphere only: fog, distant tree silhouettes, weak moonlight, and subtle phase tint.
- Role art appears only in role cards, never as page background decoration.
- UI uses dark translucent surfaces, parchment-gold accents, moonlit teal highlights, and restrained crimson for voting danger.
- Avoid white text on light backgrounds, black text on dark backgrounds, decorative clutter, and mobile-first bottom-heavy interaction placement.

The current brainstorming previews live under `.superpowers/brainstorm/...` and are references only. They are not production assets or implementation files.

## Layout

The page should prioritize player seats and table state.

- Top status bar: room/phase/day/deadline summary.
- Main table: 12 player seats arranged around a central table or ritual surface.
- Center stage: current phase prompt, selected target, live speaker, vote state, and primary action buttons.
- Bottom/side utility area: compact identity-card entry, voice status, and timeline trigger.
- Timeline: collapsed by default. Open as a right-side drawer or overlay when the user clicks the event button.

Timeline must not occupy a permanent large column during normal play. New events can appear as compact toasts or a badge count on the event button.

## Web Interaction Placement

Primary action buttons belong near the center-stage decision, not in a mobile-style bottom dock.

Examples:

- Speech phase: "Start speaking", "Skip", and speech controls appear in the center stage.
- Vote phase: candidate choices and confirm/pass actions appear in the center stage.
- Witch/seer/guard/wolf phases: targets and confirm actions appear in the center stage.

The bottom area may contain utility affordances such as identity-card entry, timeline trigger, audio connection state, or room status.

## Role Card Model

Identity cards are split into real front and back resources.

- Card back: a shared hidden-role card-back image used before reveal and for the collapsed identity entry.
- Card fronts: one vertical character portrait card per role.
- Front cards must feature people/characters, not props, symbolic objects, or scenery.
- Villager card must be a grounded human villager: simple, dignified, ordinary, and trustworthy.

Runtime states:

- Hidden: collapsed card back is visible near the lower-left or utility area.
- Revealing: the card back animates from its collapsed position to the center, flips, and shows the role front.
- Visible: a large central card displays the role art and concise role instructions.
- Dismissing: the large card flips/scales back to the collapsed card-back entry.

The collapsed identity entry should look like a face-down card, not a labeled text widget. Identity text is shown only after reveal or inside the large card view.

## Animation Ownership

Strong game-feel animation must be implemented in the Phaser game engine layer, not as CSS-driven DOM animation.

Phaser owns:

- Card fly-in and fly-out.
- 3D-like card flip tween.
- Reveal glow, moonlight, particles, and ritual-circle effects.
- Phase transition atmosphere.
- Table/player highlight effects.

React/DOM owns:

- Buttons, form fields, accessible text, drawer controls, and timeline content.
- Passing animation state and asset URLs into the engine.
- Opening/closing non-game UI such as timeline drawer and settings.

CSS owns:

- Static layout.
- Panel surface styling.
- Typography and basic hover/focus states.

This boundary prevents duplicate animation systems and keeps role reveal aligned with the existing `GameEngine` / Phaser scenes.

## Existing Code Integration

The redesign should build on the current structure:

- `apps/web/src/components/GameRoomShell.tsx` remains the high-level layout container.
- `apps/web/src/engine/GameEngine.tsx` remains the Phaser bridge.
- Existing scenes under `apps/web/src/engine/scenes/` should receive new role-card animation capability rather than creating a parallel canvas.
- Current phase mapping in `apps/web/src/routes/game.$gameRoomId.tsx` should continue to drive scene/state selection.
- `RoleCardLayer` should be redesigned or replaced so it no longer renders a DOM modal as the primary reveal.

The implementation should avoid a broad unrelated rewrite of game runtime logic.

## Assets

Initial production asset set:

- `role-card-back`: shared vertical card-back art.
- `role-villager-front`
- `role-werewolf-front`
- `role-witch-front`
- `role-seer-front`
- `role-guard-front`
- Optional later role fronts only if those roles are actively used.

Background assets should be either very light atmospheric textures or CSS/canvas/Phaser effects. Do not use a busy concept-art sheet as the page background.

## Timeline Interaction

Timeline data remains important, but its UI priority is secondary.

- Default state: collapsed event button with unread/new count.
- New events: compact toast or subtle pulse.
- Expanded state: right-side drawer with full visible timeline.
- Endgame: timeline can become more prominent, because secrecy is removed and users may want to review the full game.

The visibility filtering rules from the runtime remain unchanged: private events are only visible to allowed players until game end.

## Accessibility And Readability

- Every interactive DOM control must remain keyboard focusable.
- Card reveal should have a non-animated fallback for reduced-motion users.
- Text contrast must be checked against all phase backgrounds.
- Role card art must not be the only source of information; revealed card state should include readable role name and role instructions.

## Non-Goals

- Do not change server game-flow rules as part of this UI redesign.
- Do not make timeline reconstruct game state on the client.
- Do not replace LiveKit/audio integration.
- Do not rebuild the app as mobile-first.
- Do not commit brainstorm preview artifacts as production files.

## Success Criteria

- In a 6-12 player room, the main view is dominated by table/player/phase information rather than timeline.
- Primary actions are reachable and visually obvious in the center of the web layout.
- Identity card is normally hidden as a face-down card and reveals as a large central card.
- Role reveal animation is driven by Phaser.
- UI text remains readable across lobby, deal, night, day, vote, tie, and end states.
- Existing game flow, SSE event handling, WSS audio behavior, and action semantics keep working.
