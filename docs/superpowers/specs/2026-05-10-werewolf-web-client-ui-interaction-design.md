# Werewolf Web Client UI Interaction Design

## Status

Draft for implementation.

## Source Of Truth

The current design reference is:

- `apps/web/public/layout-design-preview.html`

The production Web client should implement the UI structure and interaction rules from that demo, not the older `WaitingRoom`, `GameTable`, or validation-page style.

## Design Principles

- Keep player flow focused. Default UI should show only the information needed for the current moment.
- Use one consistent room layout before and after game start. The center stage may change content, but the page should not feel like two different products.
- Seats are the core organizing model. Do not group players by human vs AI in the in-game UI.
- Hide secondary information until requested. Timeline, user details, room controls, and preview/dev controls should not compete with the stage.
- Game runtime and server events decide state. The client renders state and legal actions; it must not infer game legality.
- Animation and audio will be added later through a PixiJS stage layer, but the DOM UI must already reserve the right visual structure.

## Page Structure

The game page has four persistent layers:

- `Room status`: a translucent floating card in the upper-left.
- `Seat tracks`: player avatars arranged on the left and right of the stage.
- `Center stage`: current phase, current action, target selection, confirmation, or waiting state.
- `Timeline entry`: a single floating button that opens timeline as a modal.

The layout must not use a separate lobby list view. Before game start and during game play, the same seat-track layout is used.

## Floating Room Status

The upper-left floating card shows:

- room display name, such as `月雾村`
- player count, such as `12人局`
- current phase, such as `准备`, `预言家`, `投票`
- secondary room metadata, such as `gameRoomId` and `sourceMatrixRoomId`

This is the only persistent room metadata in the main game view. It should be translucent, compact, and should not become a top navigation bar.

## Seat Tracks

Seats are displayed by seat number from `1` to `playerCount`.

Rules:

- Support `6-12` seats.
- Split seats into left and right tracks.
- Do not visually group human and AI players.
- In game phase, each seat is compact: circular avatar plus minimal seat label.
- Full player names are hidden by default.
- Hovering a seat shows the full player name.
- Clicking a seat opens the user info modal unless the current phase allows the current user to select that seat as an action target.
- Dead players are visually disabled and not selectable as action targets.
- Empty seats before game start show a `+` avatar and can be clicked to join or switch seat.

Responsive behavior:

- Desktop and medium-width Web should preserve left/right seat tracks.
- The center stage should shrink before the layout collapses.
- Seats should shrink before moving below the stage.
- Very narrow mobile widths may use a compact fallback, but the preferred layout is still stage-centered with side seat tracks.

## Pre-Game State

Pre-game uses the same room layout:

- left and right seat tracks show occupied and empty seats.
- empty seats are clickable.
- the center stage is minimal.
- the center stage shows only the primary `开始游戏` action.
- no timeline button is shown before game start.
- no bottom action bar is shown.

When creator clicks `开始游戏`:

- If the room is full, transition to the deal phase.
- If there are empty seats, show a modal asking whether to:
  - `补 AI 开始`
  - `继续等待`
- Choosing `补 AI 开始` fills available seats with AI players and then transitions to the deal phase.
- Choosing `继续等待` closes the modal and remains in pre-game.

## Deal Phase

The deal phase is a non-action phase.

Rules:

- No action buttons are shown.
- The center stage shows identity-card dealing state.
- The later PixiJS layer should play card distribution animation here.
- After the deal animation, the game proceeds to night phases based on runtime state.

## Center Stage

The center stage is the primary focus of every phase.

It should be compact and must not include decorative outer containers that do not carry information. The current HTML preview removed the extra background oval/frame; production should also avoid redundant stage frames.

The stage can render these states:

- `lobby`: start game button only.
- `public waiting`: phase title and waiting indicator, no actions.
- `target selection`: player selection input plus highlighted selectable avatars.
- `target confirmation`: selected avatar, confirmation copy, and confirm button.
- `non-target action`: phase-specific action buttons only when the current user can act.
- `game ended`: result state; no manual summary generation button.

## Action Visibility

Action controls are shown only when the current user has a legal action in the current phase.

Do not show controls merely because the phase has actions for some role.

Examples:

- Guard phase: only the guard sees guard action controls.
- Werewolf phase: only werewolves see wolf discussion/vote controls.
- Witch phases: only the witch sees heal or poison controls.
- Seer phase: only the seer sees inspect controls.
- Day speech: only the current speaker sees speech controls.
- Vote and tie revote: only living players see vote controls.
- Deal, night transition, waiting, and public animation phases show no action controls.

The server projection should provide whether the current user can act and which targets are legal. The frontend should not infer this from role alone in production.

## Target Selection

Target selection has two equivalent input paths:

- Click a selectable highlighted avatar.
- Use the player selection input in the center stage.

Rules:

- Only legal targets are highlighted.
- Highlight animation is derived from the server-provided target set.
- Dead players are never highlighted or listed.
- In seer phase, already inspected players are not highlighted or listed.
- In tie revote phase, only tied candidates are highlighted or listed.
- The selection input should be labeled as selecting a player. Avoid extra instructional text such as `可选择的头像已高亮` or `列表选择`.

After selecting a target:

- The stage changes to confirmation state.
- Hide the phase title and long phase explanation.
- Show the selected player avatar in the center.
- Show the selected seat label.
- Show one short confirmation sentence:
  - guard: `确认要守护 X号 玩家吗？`
  - werewolf: `确认将击杀票投给 X号 玩家吗？`
  - witch poison: `确认要对 X号 玩家使用毒药吗？`
  - seer: `确认要查验 X号 玩家吗？`
  - vote or tie: `确认投票驱逐 X号 玩家吗？`
- Show one confirm button.
- Clicking the selected avatar in the center clears the selection and returns to target selection state.

## Timeline

Timeline is not shown before the game starts.

After the game starts:

- Show one independent floating capsule: `日志 / 发言 / 事件`.
- The capsule should be implemented by the game-engine visual layer, preferably PixiJS, rather than as a plain fixed DOM button.
- The capsule is draggable. The player may move it away from the default bottom-center position.
- Do not show a bottom drawer handle.
- Do not show duplicate timeline icons in the action area.
- Clicking the capsule starts a morph animation:
  - capsule records its current dragged position.
  - capsule lifts above the game stage.
  - capsule moves toward screen center while simultaneously scaling up.
  - capsule width, height, position, border radius, and shadow interpolate in the same animation interval.
  - capsule continuously morphs into the timeline panel shell; it must not finish moving first and then resize.
  - timeline content fades/slides in only after the shell expansion begins.
- The timeline must not appear as a bottom drawer or as content sliding from the bottom edge.
- Closing the timeline reverses the morph animation back to the capsule's previous dragged position.
- If the player has never moved the capsule, it returns to the default bottom-center position.

Timeline content contains:

- system phase events
- speeches
- votes
- public runtime results
- GM summaries

Post-game summary is not manually generated by the player. The GM/runtime generates it automatically after game end and posts it as a timeline speech/event.

## User Info Modal

Clicking a non-target seat opens a user info modal.

The modal shows:

- avatar
- full display name
- seat number
- alive/dead status
- public identity information if revealed
- player type only if appropriate outside hidden-information gameplay

The modal must not reveal hidden role information before it becomes public by game rules.

## Phase-Specific UI

### Lobby

- Same seat tracks as game.
- Empty seats are clickable.
- Center stage: `开始游戏`.
- If not full, start opens the `补 AI 开始 / 继续等待` modal.
- No timeline button.
- No bottom action buttons.

### Deal

- Stage title: `身份卡发放`.
- No action buttons.
- Later animation: card deck, card distribution to seats, private card reveal.

### Night Transition

- Public waiting state.
- No action buttons.
- Later animation: day-to-night transition and village night background.

### Guard

- Only guard can act.
- Legal target avatars highlight.
- Center stage has player selection input.
- Selected target confirmation uses selected avatar and guard copy.

### Werewolf

- Only werewolves can act.
- Legal target avatars highlight.
- Wolf discussion and vote should be represented through stage/timeline, not a permanent separate panel.
- Selected target confirmation uses kill-vote copy.

### Witch Heal

- Only witch can act.
- Heal target comes from server private state.
- If the witch can heal, center stage should confirm heal or skip.
- Public view should not reveal target.

### Witch Poison

- Only witch can act.
- Legal target avatars highlight.
- Selected target confirmation uses poison copy.

### Seer

- Only seer can act.
- Legal target avatars highlight.
- Dead and already inspected players are not selectable.
- Selected target confirmation uses inspect copy.
- Inspect result is private and must not enter public timeline.

### Day Speech

- Only current speaker can act.
- Current speaker seat is highlighted.
- Speaker action belongs in the center stage.
- Non-speakers see waiting state.

### Vote

- Living players can vote.
- Legal candidate avatars highlight.
- Selected target confirmation uses exile copy.

### Tie Revote

- Living players can vote, but only tied candidates are legal targets.
- Only tied candidates are highlighted and listed.
- Stage copy should make clear this is a candidate-only revote.

### Game End

- Show result and role reveal entry points.
- No `生成总结` button.
- Timeline receives automatic GM/runtime summary.

## Animation And Audio Integration

Production will use a PixiJS stage layer for animation. The DOM stage should remain compatible with this:

- card dealing animation in deal phase
- nightfall transition
- shared village night background
- public role-phase animation for guard, wolves, witch, seer
- target selection highlight effects
- vote/kill/guard/inspect visual cues
- daybreak and exile effects
- draggable timeline capsule and capsule-to-modal morph animation
- role-card deal and role-card recall animation

All public animations are fixed by phase and public event. They should not differ based on whether the local user is the actor. Private information appears only in the private DOM interaction layer.

Audio should be optional and phase/event-driven:

- phase transition sounds
- short action confirmation sounds
- ambient night/day background

### Timeline Capsule Animation

The timeline entry is a first-class game-engine UI object.

States:

- `hidden`: before game start.
- `capsule`: after game start, draggable, compact, above the game stage.
- `opening`: capsule moves from its current position to the center and scales up.
- `panel`: full timeline modal is open.
- `closing`: panel collapses back to the capsule position.

Animation requirements:

- Opening should feel like the capsule itself becomes the modal, not like a separate modal appearing.
- Use one synchronized interpolation from current capsule rectangle to final modal rectangle.
- Position, width, height, scale, border radius, and shadow change together.
- Do not sequence this as `move to center` followed by `grow`; it must move and grow at the same time.
- Fade in timeline text after the capsule has visibly expanded.
- On close, reverse the transform and restore the dragged capsule coordinates.
- Respect reduced-motion settings by replacing the morph with a short fade/scale.

Implementation boundary:

- PixiJS owns the capsule, drag, and morph animation.
- DOM or React may own timeline text content inside/above the expanded panel if needed for accessibility and text selection.
- The visual transition must remain seamless; the user should perceive one object transforming.

### Role Card Animation

Identity card handling is also game-engine driven:

- During deal, card backs fly from the center deck toward seats.
- The local player's card flips and shows the role.
- The role card is a pure card surface, not a descriptive modal.
- The card should not include extra explanation panels or buttons.
- Clicking the card confirms and dismisses it.
- Clicking blank backdrop also dismisses it after the initial reveal.
- After confirmation, a compact card icon appears in the upper-right.
- Clicking the compact card icon replays the role-card reveal animation or opens the same pure card face.
- The compact card icon remains available after deal while the player is allowed to view their private role.

## API/State Requirements

The Web client needs perspective-filtered state including:

- room metadata
- phase id and phase label
- player count
- seats and occupants
- current user's seat, role-private state, alive state
- whether timeline is available
- whether current user can act
- legal action type
- legal target ids
- already inspected ids for seer perspective, or server-filtered legal targets
- current speaker id
- tie candidate ids
- public result and winner state

Production should prefer server-provided legal target ids over frontend-derived rules. The preview can simulate rules, but real UI must trust runtime projection.

## Implementation Notes

- Replace current game page UI with a component structure matching this spec.
- Keep `layout-design-preview.html` as design reference until production UI matches it.
- Suggested components:
  - `GameRoomShell`
  - `FloatingRoomStatus`
  - `SeatTracks`
  - `SeatAvatar`
  - `CenterStage`
  - `TargetSelector`
  - `TargetConfirmation`
  - `TimelineModal`
  - `UserInfoModal`
  - `StartGameModal`
- Avoid rebuilding the old two-column waiting-room list as production UI.
- Avoid a persistent bottom action bar for gameplay actions.
- Avoid duplicate timeline entry points.

## Acceptance Criteria

- Lobby and game use the same visual layout.
- Empty seats can be joined or switched before start.
- Start button is centered in lobby state.
- If seats are empty, starting prompts `补 AI 开始` or `继续等待`.
- Timeline button is hidden before start and appears after game starts.
- Action controls appear only when the current user can legally act.
- Targetable avatars are highlighted only when included in the legal target set.
- Dead, invalid, already inspected, or non-candidate tie targets are not highlighted and not listed.
- Selecting a target changes the center stage to avatar-based confirmation.
- Clicking the centered selected avatar clears selection.
- Game end does not show manual summary generation; summary appears in timeline.
- Medium-width responsive layout keeps players on left/right and shrinks the stage before collapsing.

### Animation Read-Only Control

- All timeline/cell animations are read-only from the user's perspective: client renders but does not derive game legality.
- Animation controls only allow:
  - play/pause transitions from server phase changes,
  - open/close timeline capsule,
  - open/close role card replay,
  - drag capsule within bounds.
- UI must never use animation state as a gameplay state source.
- If `prefers-reduced-motion` is true, motion must fallback to fade/scale while keeping timing order identical.

### Phase Transition Triggers

- `lobby`:
  - show floating room metadata + seat tracks + minimal stage;
  - timeline hidden;
  - role-card entry hidden.
- `start`:
  - server phase transition to `role_assignment` or game start event;
  - map to `deal` scene for UI action.
- `deal`:
  - role-card reveal animation;
  - `lobby/start` controls hidden.
- `night`:
  - public night transition animation + per role public animation slot;
  - timeline visible and openable.
- `day`:
  - day speech/turn state from server projection;
  - keep stage compact and centered.
- `vote`:
  - reveal vote prompt only for legal voters;
  - timeline remains visible.
- `tie`:
  - only tied candidates are legal targets;
  - stage text must indicate revote.
- `end`:
  - show winner summary; no manual summary button;
  - hide role-card entry only if no current player role exists.

### Timeline Capsule Rules

- Opening and closing must share the same morph transition in both directions.
- On open: capsule moves and scales to the panel rectangle in one continuous interpolation.
- Capsule position before open must be remembered and used for close return.
- Close reverses from panel rectangle to last dragged capsule coordinates.
- Timeline text/content can fade in after morph reaches 50%.
