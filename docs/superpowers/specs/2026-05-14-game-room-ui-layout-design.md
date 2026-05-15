# Game Room UI Layout Design

## Decision

Use layout option A as the structural base and apply option B's low-interference visual rules.

This means the room has stable, named regions for HUD, player rails, center info, actions, utility buttons, and modals, but the visual treatment must stay light. The UI should not feel like stacked cards and backgrounds sitting on top of the scene.

## Design Goals

- Keep the game scene readable as the primary visual surface.
- Make each region own one job.
- Avoid large persistent panels, heavy backdrop blur, and nested framed divs.
- Use existing art assets only after the spatial layout works.
- Preserve fast gameplay: current phase, countdown, alive count, current speaker, legal actions, and selected targets must be visible without opening a drawer.

## Regions

### Scene Layer

The scene layer is full-screen and visually dominant. It owns the village background and optional subtle phase atmosphere. It does not own HUD, seats, buttons, timeline, or modals.

The existing Phaser `GameEngine` should not drive the main composition. It can be hidden or reduced to subtle ambient effects later.

### HUD Region

The HUD is a compact top status cluster, not a full-width decorative panel.

It shows:

- phase label
- day number
- countdown
- alive count
- optional back control

The HUD should read as text and small tokens over the scene, with minimal backing only where contrast requires it.

### Player Rails

Players live in left and right rails.

Rules:

- rails sit near the physical screen edges
- rails occupy at most about two thirds of viewport height
- seats flow from top to bottom, paired left/right by speaking order
- seat size stays small; the avatar is the focal point
- seat state is expressed through avatar/ring treatment, not labels or overlay pills

Seat capabilities:

- avatar
- seat number
- alive/dead state
- current speaker state
- current user state
- selectable/selected target state

Dead players use grayscale/low brightness only. No "eliminated" badge.

### Center Info Region

The center info region is for concise live game information, not for all actions and not for modal content.

It shows:

- current speaker info
- public vote prompts/results
- seer/witch/guard public result copy when relevant
- death announcement copy
- short phase guidance

It should stay small during normal play. Long details belong in the timeline drawer.

### Action Region

The action region lives in the lower middle, separated from the center info region.

It owns:

- confirm action
- cancel/pass/skip action
- speech submit controls
- current radial picker entry/expanded state

The radial picker can temporarily expand into the lower-middle play area, but it must not resize player rails or hide the HUD.

### Utility Region

The utility region contains low-frequency controls.

Left:

- role card entry

Right:

- timeline/log entry

These are entry points only. They should not render large persistent surfaces.

### Timeline Drawer

Timeline is a drawer or sheet opened from the utility region. It may cover part of the scene while open, but it is not part of the default layout.

It is for:

- phase history
- vote history
- public announcements
- debugging/replay style detail if needed

### Modal Layer

The modal layer is independent from center info and actions.

It owns:

- role reveal
- game end
- seer result dialog
- profile/start dialogs

When a modal is open, center info and actions may hide. Modals must not be implemented as a special case of `visual-center`.

## Component Boundaries

The implementation should move toward these shell-level regions:

```tsx
<main className="game-room-root">
  <div className="scene-layer" />
  <div className="game-ui-layout">
    <header className="hud-region" />
    <section className="table-region">
      <aside className="player-rail player-rail-left" />
      <section className="center-info-region" />
      <aside className="player-rail player-rail-right" />
    </section>
    <section className="action-region" />
    <footer className="utility-region" />
  </div>
  <section className="modal-layer" />
</main>
```

The existing `center` React node may need to be split into `centerInfo`, `actions`, and `modal` in a later implementation step. If that is too large for one pass, the first pass can classify existing center content by CSS selectors.

## Visual Rules

- No persistent full-width ornate top bar.
- No nested UI cards.
- No large dark blur slabs behind normal gameplay.
- Use art assets for final frames and icons, but only after layout is stable.
- Keep typography bright and legible, with small local contrast backing if needed.
- Normal screenshots should read as a game scene with UI, not a UI comp over a dimmed background.

## Responsive Rules

Mobile:

- HUD compact at top.
- player rails left/right, max about two thirds viewport height.
- center info around upper-middle or middle, small.
- action region lower-middle.
- role card bottom-left, timeline bottom-right.

Desktop:

- same conceptual regions.
- rails may sit farther inward but should still frame the scene.
- center info can be wider, but not taller by default.
- timeline drawer can use a right-side panel.

## Testing And Verification

Use browser screenshots at mobile and desktop sizes to verify:

- no region overlaps incoherently
- player rails are actually at left/right edges
- rails stay under the height budget
- center info and action region are separate
- modals hide or supersede center/action regions
- no asset 404s
- text fits at mobile widths

Run:

```bash
pnpm --filter @werewolf/web typecheck
pnpm vitest run apps/web/src/components/GameRoomShell.test.ts apps/web/src/components/actionControlLogic.test.ts
```

## Open Follow-Up

The design does not require final art choices yet. After the layout reset is approved, choose a small set of existing assets for each region instead of reintroducing many overlapping decorative backgrounds.
