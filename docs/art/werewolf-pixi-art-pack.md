# Werewolf PixiJS Art Pack

Date: 2026-05-13

## Purpose

This document defines the production art pack needed for the PixiJS renderer path. The assets are designed for a hybrid UI:

- React/DOM owns text, accessibility, routing, SSE state, LiveKit state, and real buttons.
- PixiJS owns background composition, lighting, particles, state rings, button skins, radial picker visuals, card reveal effects, and phase transitions.
- CSS owns layout fallback and basic responsive structure.

The pack must be generated as one coherent system. Do not make isolated pretty assets that fight each other when layered.

## Art Direction

Use the approved Werewolf UI material system:

- Approved master direction: Moonlit Tribunal with a small Black Silver Manuscript influence.
- Medieval gothic, but modern and restrained rather than ornate fantasy.
- Smoked obsidian glass, black enamel, dark iron, muted silver, and cold moonlight.
- Antique gold is allowed only as very thin hairline accents.
- Crimson is reserved for voting danger or werewolf threat.
- Default room state is listening/observing. Action panels and target controls appear only when the player can act.
- No gore, no horror-poster contrast, no readable text baked into images.

The primary action area and central message area must remain more visible than the background art.

Approved master mockup reference:

- `mockup.pixi.master`: `/Users/Ruihan/.codex/generated_images/019e22a3-c957-7442-8367-4e42ebfabfbc/ig_0fa7feed80a2b98f016a04db2b38d08191a680d47c56a83a89.png`

## Pixi Loading Model

The Pixi renderer should load assets through stable manifest keys, not raw filenames scattered through code.

Preferred runtime layout:

```text
apps/web/public/assets/ui/
  manifest.json
  backgrounds/
  overlays/
  frames/
  buttons/
  seats/
  radial/
  cards/
  particles/
  panels/
```

Use WebP for opaque backgrounds. Use PNG or WebP with alpha for frames, rings, glows, particles, card effects, and radial picker pieces.

## Priority 0: Master Mockup

Before generating individual production assets, create one full-screen master mockup.

Asset key:

- `mockup.pixi.master`

Target:

- `768x1600` portrait mockup.
- Shows the current game layout: top HUD, side player seats, central message panel, role-card entry, timeline entry, and an optional action panel state.
- Uses placeholder shapes only for text areas.
- Establishes final lighting, material system, visual hierarchy, and spacing.

Prompt:

```text
Use case: ui-mockup
Asset type: Werewolf PixiJS renderer master mockup
Primary request: Create a portrait 768x1600 game UI master mockup for a Werewolf browser game, built around a moonlit medieval tribunal layout.
Scene/backdrop: distant gothic village square at night, rooftops and chapel silhouettes in the background, soft mist, low-detail central area for UI readability.
Style/medium: premium 2D game UI concept art, smoked obsidian glass, black enamel, dark iron, muted silver, cold moonlight, tiny antique-gold hairline accents.
Composition/framing: top HUD area, left and right player avatar tracks, central message panel, small role-card entry, compact timeline/event entry, no real text.
Lighting/mood: mysterious, refined, readable, not horror, not gore.
Text (verbatim): none.
Constraints: all text areas must be blank placeholder shapes; background must not compete with the central message or temporary action panel; no logos, no watermark.
Avoid: readable text, busy central texture, characters, blood, high-contrast symbols, large physical table, giant gate, central iron door, permanent bottom HUD bubble.
```

## Priority 1: Backgrounds And Phase Mood

These are full-screen or near-full-screen assets. They should share the same composition.

| Key | File | Size | Alpha | Use |
| --- | --- | ---: | --- | --- |
| `bg.village.night` | `backgrounds/village-night.webp` | 768x1600 | no | Default night village stage |
| `bg.village.day` | `backgrounds/village-day.webp` | 768x1600 | no | Day discussion lighting |
| `bg.village.vote` | `backgrounds/village-vote.webp` | 768x1600 | no | Vote/tension lighting |
| `overlay.night` | `overlays/night-vignette.png` | 768x1600 | yes | Blue-black edge darkening |
| `overlay.day` | `overlays/day-mist.png` | 768x1600 | yes | Morning mist/light lift |
| `overlay.vote` | `overlays/vote-crimson.png` | 768x1600 | yes | Crimson edge pressure |
| `overlay.end.good` | `overlays/end-good-light.png` | 768x1600 | yes | Good-team victory lift |
| `overlay.end.wolf` | `overlays/end-wolf-shadow.png` | 768x1600 | yes | Werewolf victory shadow |

Prompt notes:

- Backgrounds are opaque and UI-aware.
- Overlays are transparent, object-free, and only change color/emotion.
- The central message panel and temporary action-panel area must remain readable.

## Priority 2: Pixi UI Frames

These assets replace rough `Graphics` rectangles with reusable frame materials.

| Key | File | Size | Alpha | Pixi Use |
| --- | --- | ---: | --- | --- |
| `frame.hud.top` | `frames/top-hud-frame.png` | 640x128 | yes | `NineSliceSprite` |
| `frame.hud.timer` | `frames/timer-badge-frame.png` | 128x128 | yes | `Sprite` or `NineSliceSprite` |
| `frame.notice` | `frames/central-notice-frame.png` | 512x256 | yes | `NineSliceSprite` |
| `frame.notice.fill` | `frames/central-notice-fill.webp` | 512x256 | no | masked/tinted fill |
| `frame.notice.glow` | `frames/central-notice-glow.png` | 512x256 | yes | additive glow |
| `frame.modal` | `frames/modal-frame.png` | 640x760 | yes | `NineSliceSprite` |
| `frame.timeline` | `frames/timeline-entry-frame.png` | 192x96 | yes | small secondary control |
| `frame.popup.compact` | `frames/popup-compact-frame.png` | 480x320 | yes | confirmation/cancel popup |
| `frame.speech.bubble` | `frames/speech-bubble-frame.png` | 520x220 | yes | active speech/current speaker |
| `frame.log.panel` | `frames/log-panel-frame.png` | 640x900 | yes | timeline/log drawer |
| `frame.notice.board` | `frames/notice-board-frame.png` | 600x360 | yes | public announcement/phase notice |
| `frame.event.bar` | `frames/event-bar-frame.png` | 560x112 | yes | recent event toast/bar |
| `frame.hud.nav` | `frames/hud-nav-button-frame.png` | 112x112 | yes | top-left back/navigation button |
| `frame.hud.phase` | `frames/phase-badge-frame.png` | 112x112 | yes | compact phase mark badge |
| `frame.toast.error` | `frames/error-toast-frame.png` | 560x120 | yes | error/toast message |
| `frame.loading.track` | `frames/loading-track.png` | 520x40 | yes | runtime loading bar track |
| `frame.loading.thumb` | `frames/loading-thumb.png` | 180x40 | yes | runtime loading bar animated thumb |

Generation prompt:

```text
Use case: ui-mockup
Asset type: transparent PixiJS UI frame asset
Primary request: Create a reusable blank UI frame for a Werewolf browser game, no text.
Style/medium: premium 2D game UI asset, smoked obsidian glass interior, dark iron and muted silver trim, cold moonlight edge glow, very thin antique-gold hairline accents only.
Composition/framing: centered isolated asset on a perfectly flat solid #00ff00 chroma-key background for background removal, generous padding.
Constraints: no text, no icons, no symbols, no watermark; clear transparent-friendly edges; designed for PixiJS NineSliceSprite scaling.
Avoid: bright busy texture inside the text area, large decorative ornaments, thick unreadable borders.
```

Use the built-in image generation chroma-key workflow first, then remove the key locally to produce alpha PNGs.

## Priority 3: Button Skins

Buttons must feel like game assets while leaving labels to DOM or Pixi text.

| Key | File | Size | Alpha | State |
| --- | --- | ---: | --- | --- |
| `button.primary.frame` | `buttons/primary-frame.png` | 360x104 | yes | active/default |
| `button.primary.fill` | `buttons/primary-fill.webp` | 360x104 | no | fill texture |
| `button.primary.pressed` | `buttons/primary-pressed.png` | 360x104 | yes | pressed |
| `button.primary.disabled` | `buttons/primary-disabled.png` | 360x104 | yes | disabled |
| `button.confirm.frame` | `buttons/confirm-frame.png` | 360x104 | yes | confirm action |
| `button.confirm.glow` | `buttons/confirm-glow.png` | 420x140 | yes | confirm emphasis |
| `button.cancel.frame` | `buttons/cancel-frame.png` | 280x96 | yes | cancel/back out |
| `button.cancel.pressed` | `buttons/cancel-pressed.png` | 280x96 | yes | cancel pressed |
| `button.secondary.frame` | `buttons/secondary-frame.png` | 360x104 | yes | secondary |
| `button.danger.frame` | `buttons/danger-frame.png` | 360x104 | yes | vote/kill confirm |
| `button.danger.glow` | `buttons/danger-glow.png` | 420x140 | yes | additive crimson glow |
| `button.rect.small` | `buttons/rect-small-frame.png` | 240x88 | yes | short rectangular control |
| `button.square.frame` | `buttons/square-frame.png` | 128x128 | yes | square icon/control |
| `button.square.active` | `buttons/square-active.png` | 144x144 | yes | active square control |
| `button.square.disabled` | `buttons/square-disabled.png` | 128x128 | yes | disabled square control |
| `button.circular.frame` | `buttons/circular-frame.png` | 160x160 | yes | skill/plus action |
| `button.circular.active` | `buttons/circular-active.png` | 180x180 | yes | active skill/plus action |

Rules:

- No labels or icons baked into button art.
- Primary button has the highest steady-state visual weight in normal play.
- Danger glow is additive and temporary, not a solid red button.
- Disabled button must be clearly inactive and low contrast.
- Cancel buttons are cooler, quieter, and lower priority than confirm buttons.
- Square buttons are for icon-only affordances such as close, log, settings, or compact utility controls.

## Priority 4: Seat Rings And Status Badges

These assets wrap player avatars. Avatar photos/letters remain dynamic.

| Key | File | Size | Alpha | Meaning |
| --- | --- | ---: | --- | --- |
| `seat.ring.normal` | `seats/ring-normal.png` | 144x144 | yes | default alive |
| `seat.ring.idle` | `seats/ring-idle.png` | 144x144 | yes | waiting/standby avatar frame |
| `seat.ring.speaking` | `seats/ring-speaking.png` | 160x160 | yes | teal animated speaking |
| `seat.ring.action` | `seats/ring-action.png` | 168x168 | yes | current action needed |
| `seat.ring.selected` | `seats/ring-selected.png` | 168x168 | yes | chosen target |
| `seat.ring.voted` | `seats/ring-voted.png` | 144x144 | yes | has voted |
| `seat.ring.dead` | `seats/ring-dead.png` | 144x144 | yes | dead/out |
| `seat.ring.offline` | `seats/ring-offline.png` | 144x144 | yes | left/offline |
| `seat.ring.empty` | `seats/ring-empty.png` | 144x144 | yes | empty/pre-game seat |
| `seat.ring.hover` | `seats/ring-hover.png` | 160x160 | yes | hover/selectable feedback |
| `seat.badge.number` | `seats/number-badge.png` | 56x40 | yes | seat number badge |
| `seat.badge.dead` | `seats/dead-badge.png` | 64x96 | yes | vertical dead/left marker |
| `seat.badge.offline` | `seats/offline-badge.png` | 64x96 | yes | vertical offline marker |

Animation policy:

- Pixi scales, fades, rotates, and tints these assets.
- Do not generate full animation strips unless a single static asset cannot carry the state.
- Speaking/action states can use one ring asset plus Pixi pulse/tint.
- Idle/standby rings should be visually quieter than normal alive rings, so waiting players do not compete with actionable players.

## Priority 4.5: Text-Heavy Panels

These are not text images. They are blank panel skins behind DOM or Pixi-rendered text.

| Key | File | Size | Alpha | Use |
| --- | --- | ---: | --- | --- |
| `panel.speech.current` | `panels/speech-current-panel.png` | 560x240 | yes | current speaker card |
| `panel.speech.history` | `panels/speech-history-panel.png` | 560x220 | yes | last speech/recent message |
| `panel.log.drawer` | `panels/log-drawer-panel.png` | 640x1000 | yes | full phase/event log drawer |
| `panel.log.item` | `panels/log-item-frame.png` | 560x112 | yes | one log row |
| `panel.announcement` | `panels/announcement-panel.png` | 600x320 | yes | phase announcement |
| `panel.event.toast` | `panels/event-toast-frame.png` | 560x128 | yes | transient event bar |
| `panel.phase.banner` | `panels/phase-banner-frame.png` | 620x160 | yes | major phase transition banner |
| `panel.choice.row` | `panels/choice-row-frame.png` | 520x104 | yes | compact target/choice row |
| `panel.voice.container` | `panels/voice-container-panel.png` | 600x300 | yes | voice/text speaking control surface |
| `panel.voice.bubble` | `panels/voice-bubble-frame.png` | 240x160 | yes | mic/text mode bubble |
| `panel.voice.recording` | `panels/voice-recording-glow.png` | 280x200 | yes | active recording pulse/glow |
| `panel.voice.text` | `panels/voice-text-input-frame.png` | 560x180 | yes | speech textarea/input backing |
| `panel.vote.progress` | `panels/vote-progress-frame.png` | 520x64 | yes | vote progress meter frame |
| `panel.target.chip` | `panels/target-chip-frame.png` | 160x64 | yes | selected target / missing voter chip |
| `panel.user.info` | `panels/user-info-panel.png` | 560x420 | yes | player detail popover |
| `panel.agent.picker` | `panels/agent-picker-panel.png` | 620x760 | yes | AI/player picker modal body |
| `panel.agent.row` | `panels/agent-row-frame.png` | 560x104 | yes | one AI/player picker row |
| `panel.private.result` | `panels/private-result-panel.png` | 560x260 | yes | private skill result feedback |
| `panel.seer.result` | `panels/seer-result-panel.png` | 560x360 | yes | seer result dialog body |

Rules:

- All panel interiors must be dark, quiet, and low texture.
- Announcement and event panels can have slightly more edge glow than log rows.
- Log rows must be very scannable and should not look like primary action buttons.
- Speech panels use teal accent; vote/kill events can overlay a crimson glow separately.

## Priority 5: Radial Picker Art

The radial picker is custom. No Phaser/Pixi component library provides the exact Werewolf target selector we need.

The selected/hover target shape must be **runtime geometry**, not a fixed sector image. The selector must support 2 to 12 players, so Pixi calculates each sector's start angle, end angle, area, border length, avatar position, and hit area from the current player count. Art assets only provide reusable material, line, cap, and glow pieces that can be tiled, masked, or drawn along dynamically calculated geometry.

| Key | File | Size | Alpha | Use |
| --- | --- | ---: | --- | --- |
| `radial.base` | `radial/wheel-base.png` | 640x640 | yes | circular idle base ring, not segmented |
| `radial.inner.hub` | `radial/hub-button.png` | 180x180 | yes | center drag/select button |
| `radial.inner.hub.active` | `radial/hub-button-active.png` | 196x196 | yes | active/pressed hub |
| `radial.sector.fill` | `radial/sector-fill-tile.png` | 256x256 | yes | tileable selected-sector material, masked by Pixi geometry |
| `radial.sector.fill.danger` | `radial/sector-fill-danger-tile.png` | 256x256 | yes | tileable danger/vote material, masked by Pixi geometry |
| `radial.edge.stroke` | `radial/sector-edge-stroke.png` | 32x256 | yes | tileable radial border strip drawn along start/end edges |
| `radial.edge.glow` | `radial/sector-edge-glow.png` | 48x256 | yes | additive radial edge glow strip |
| `radial.arc.stroke` | `radial/arc-stroke-tile.png` | 256x32 | yes | tileable outer arc border rendered along dynamic arc length |
| `radial.arc.glow` | `radial/arc-glow-tile.png` | 256x48 | yes | additive hover/selected arc glow rendered along dynamic arc length |
| `radial.cap.node` | `radial/sector-cap-node.png` | 64x64 | yes | optional node/cap at sector endpoints |
| `radial.outer.glow` | `radial/wheel-outer-glow.png` | 720x720 | yes | additive outer glow |
| `radial.target.snap` | `radial/target-snap-glow.png` | 180x180 | yes | selection pulse near avatar |

Implementation notes:

- Do not use a fixed wedge image for hover/selected state.
- Pixi owns sector geometry, hit testing, and all angle/radius calculations.
- For `playerCount` 2 to 12, compute `sliceAngle = TAU / playerCount`, then draw a `Graphics` sector or mesh mask for the selected index.
- Apply `radial.sector.fill` as a tiled texture inside the runtime sector mask.
- Draw start/end borders with `radial.edge.stroke` or procedural Pixi lines tinted to match the art.
- Draw the outer selected/hover border with `radial.arc.stroke` or a mesh/rope that repeats the arc tile along the calculated arc length.
- Use `radial.cap.node` only at calculated endpoints if it helps readability; hide it for very small 10-12 player sectors if it creates clutter.
- The image assets provide material and glow, not logic.
- Keep the middle clear for the hub button and keep avatar positions readable.

Radial prompt:

```text
Use case: ui-mockup
Asset type: transparent PixiJS radial target selector material parts
Primary request: Create reusable material parts for a dynamic Werewolf target picker, no fixed sector shape, no text.
Style/medium: smoked obsidian glass, dark iron, muted silver, cold moonlight edge glints, tiny antique-gold hairline accents, premium modern gothic UI.
Composition/framing: isolated tileable fill textures, straight border strips, arc glow strips, endpoint cap nodes, hub button, and idle base ring on transparent-friendly background.
Constraints: no readable text, no icons, no player portraits, no numbers; designed for PixiJS geometry masks, tiling, mesh/rope arcs, and additive glows; supports 2 to 12 dynamically calculated sectors.
Avoid: pre-baked full fan selector, fixed wedge angle, 12 baked sectors, bright center, overly complex symbols, high-contrast runes, horror blood effects.
```

## Priority 6: Card Reveal And Results

Existing role-card front/back art can remain, but Pixi needs extra reveal FX assets.

| Key | File | Size | Alpha | Use |
| --- | --- | ---: | --- | --- |
| `card.back` | `../role-cards/card-back.png` | existing | yes/no | face-down role card |
| `card.frame` | `cards/card-frame.png` | 384x576 | yes | overlay frame |
| `card.reveal.glow` | `cards/reveal-glow.png` | 640x640 | yes | additive reveal burst |
| `card.flip.streak` | `cards/flip-streak.png` | 512x192 | yes | horizontal flip light |
| `result.good.frame` | `cards/result-good-frame.png` | 640x520 | yes | good-team result |
| `result.wolf.frame` | `cards/result-wolf-frame.png` | 640x520 | yes | werewolf result |
| `card.entry.frame` | `cards/role-entry-frame.png` | 160x240 | yes | collapsed role-card entry |
| `card.role.villager` | `../role-cards/villager.png` | existing | no/yes | existing villager front |
| `card.role.werewolf` | `../role-cards/werewolf.png` | existing | no/yes | existing werewolf front |
| `card.role.witch` | `../role-cards/witch.png` | existing | no/yes | existing witch front |
| `card.role.seer` | `../role-cards/seer.png` | existing | no/yes | existing seer front |
| `card.role.guard` | `../role-cards/guard.png` | existing | no/yes | existing guard front |

Rules:

- Card reveal can briefly take visual focus.
- The rest of UI should dim behind it.
- Result frames should leave large blank text space.

## Priority 7: Particles And Light Sprites

Small alpha sprites let Pixi produce good effects cheaply.

| Key | File | Size | Alpha | Use |
| --- | --- | ---: | --- | --- |
| `particle.fog` | `particles/fog-puff.png` | 256x128 | yes | slow village mist |
| `particle.ember` | `particles/ember-dot.png` | 32x32 | yes | warm sparks |
| `particle.moon` | `particles/moon-dust.png` | 32x32 | yes | teal/white dust |
| `particle.crimson` | `particles/crimson-spark.png` | 32x32 | yes | vote/kill tension |
| `light.moonbeam` | `particles/moonbeam.png` | 384x1024 | yes | subtle top-down light |
| `light.button.active` | `particles/button-active-glow.png` | 512x180 | yes | bottom action emphasis |

Particles should be soft, low-detail, and suitable for additive blending.

## Component Coverage Map

Use this mapping when implementing Pixi components:

| UI Component | Required Art Keys |
| --- | --- |
| Confirm button | `button.confirm.frame`, `button.confirm.glow`, `button.primary.pressed`, `button.primary.disabled` |
| Cancel button | `button.cancel.frame`, `button.cancel.pressed`, `button.primary.disabled` |
| Long rectangular button | `button.primary.frame`, `button.secondary.frame`, `button.danger.frame`, `button.rect.small` |
| Square utility button | `button.square.frame`, `button.square.active`, `button.square.disabled` |
| Circular skill/plus button | `button.circular.frame`, `button.circular.active`, `light.button.active` |
| Top HUD navigation/status | `frame.hud.top`, `frame.hud.nav`, `frame.hud.phase`, `frame.hud.timer` |
| Loading/error feedback | `frame.loading.track`, `frame.loading.thumb`, `frame.toast.error` |
| Normal avatar frame | `seat.ring.normal`, `seat.badge.number` |
| Standby/waiting avatar frame | `seat.ring.idle`, `seat.ring.empty`, `seat.badge.number` |
| Speaking avatar frame | `seat.ring.speaking`, `panel.speech.current` |
| Selectable/selected avatar frame | `seat.ring.hover`, `seat.ring.selected`, `radial.target.snap` |
| Dead/offline avatar frame | `seat.ring.dead`, `seat.ring.offline`, `seat.badge.dead`, `seat.badge.offline` |
| Modal popup | `frame.modal`, `frame.popup.compact`, `button.confirm.frame`, `button.cancel.frame` |
| Speech/current speaker panel | `panel.speech.current`, `frame.speech.bubble` |
| Voice/text speaking controls | `panel.voice.container`, `panel.voice.bubble`, `panel.voice.recording`, `panel.voice.text` |
| Target selector | `radial.base`, `radial.inner.hub`, `radial.inner.hub.active`, `radial.sector.fill`, `radial.edge.stroke`, `radial.arc.stroke`, `radial.arc.glow`, `radial.cap.node`, `radial.outer.glow` |
| Vote progress and target chips | `panel.vote.progress`, `panel.target.chip`, `panel.choice.row` |
| Timeline/log drawer | `panel.log.drawer`, `panel.log.item`, `frame.log.panel` |
| Public announcement | `panel.announcement`, `frame.notice.board`, `panel.phase.banner` |
| Event bar/toast | `panel.event.toast`, `frame.event.bar` |
| User info / AI picker | `panel.user.info`, `panel.agent.picker`, `panel.agent.row` |
| Private skill result / seer result | `panel.private.result`, `panel.seer.result`, `frame.popup.compact` |
| Role card entry/reveal | `card.entry.frame`, `card.back`, `card.frame`, `card.reveal.glow`, `card.flip.streak`, `card.role.*` |

## Generation Order

Generate in this order:

1. `mockup.pixi.master`
2. `bg.village.night`, then derive day/vote variants
3. `overlay.night`, `overlay.day`, `overlay.vote`
4. `frame.notice`, `button.primary.frame`, `seat.ring.selected`, `radial.base`
5. Put those first assets into a Pixi composition test
6. Only then generate the remaining frames, buttons, rings, particles, and result art

This prevents making a large asset pack that does not compose well.

## Acceptance Checklist

Before integrating assets into production:

- The central message area remains readable over all backgrounds and overlays.
- The bottom action area is the strongest visual target when actionable.
- The radial picker does not cover essential message text in the open state.
- Default seat rings stay quiet; speaking/action/selected states stand out.
- Button labels remain crisp because text is rendered separately.
- Repeated card reveal does not increase JS heap steadily.
- Pixi renderer maintains roughly 60 FPS in the current browser with two canvases during the demo.
- Assets can be loaded from `manifest.json` by stable keys.
