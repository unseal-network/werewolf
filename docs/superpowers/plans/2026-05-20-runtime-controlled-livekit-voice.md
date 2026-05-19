# Runtime-Controlled LiveKit Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild realtime voice so clients join one LiveKit room once, while the game runtime/server controls who can speak and who can hear tracks, including private wolf discussion where non-wolves hear GM/system audio only.

**Architecture:** Add a server-side LiveKit meeting controller with per-room serialized sync, projection-version guards, and LiveKit event resync for participant joins and newly published tracks. Client tokens become join-only; the browser never upgrades tokens for speech and never auto-subscribes to all tracks. Game runtime remains authoritative, while the controller treats LiveKit as a best-effort meeting layer whose stale operations cannot re-open private audio.

**Tech Stack:** TypeScript, Hono API, `livekit-server-sdk`, `livekit-client`, React, Vitest.

---

## File Structure

- Create `apps/api/src/services/livekit-meeting-controller.ts`
  - Defines `LivekitMeetingController`, `LivekitMeetingRoomState`, `LivekitRoomSnapshot`, and `ServerLivekitMeetingController`.
  - Wraps `RoomServiceClient`.
  - Ensures LiveKit room creation is cached and idempotent.
  - Computes the desired meeting policy from game phase, alive players, roles, and current speaker.
  - Applies policy in a per-room queue, with a version guard to prevent stale sync from restoring old permissions.
  - Resyncs on LiveKit participant/track events through `syncForLivekitEvent(gameRoomId)`.
  - Revokes unsafe player subscriptions before granting allowed subscriptions.

- Create `apps/api/src/services/livekit-meeting-controller.test.ts`
  - Tests token-independent meeting policy with fake LiveKit state.
  - Tests late microphone track publication triggers subscriptions.
  - Tests stale sync is skipped.
  - Tests missing/offline participants do not abort the whole sync.
  - Tests wolf discussion privacy as a listener x publisher matrix.

- Modify `apps/api/src/services/game-service.ts`
  - Adds `setLivekitMeetingController()`.
  - Registers a room snapshot provider so LiveKit events can ask for the current game state.
  - Calls meeting sync before GM narration, after phase starts, when speech queue/speaker changes, when wolf discussion opens, when players leave/die, and when the game ends.

- Modify `apps/api/src/services/game-service.test.ts`
  - Adds fake-controller tests for sync ordering from game runtime.
  - Verifies GM pre-narration sync happens before `playAudioFiles`.
  - Verifies wolf discussion uses only living wolf player ids.

- Modify `apps/api/src/app.ts`
  - Creates or accepts one shared meeting controller.
  - Installs the controller on `InMemoryGameService`.
  - Passes the controller to LiveKit routes.

- Modify `apps/api/src/routes/livekit.ts`
  - Uses the shared meeting controller for room creation.
  - Issues join-only player tokens: `roomJoin=true`, `canPublish=false`, `canSubscribe=false`, `canPublishData=false`.
  - Exposes a LiveKit webhook endpoint that authenticates LiveKit webhooks and calls `syncForLivekitEvent(gameRoomId)`.

- Modify `apps/api/src/routes/games.test.ts`
  - Verifies tokens are join-only.
  - Verifies route-level room creation is delegated to the shared controller.

- Modify `apps/web/src/routes/game.$gameRoomId.tsx`
  - Removes publish-token refresh state and callback.
  - Keeps one LiveKit credential fetch per user/game.

- Modify `apps/web/src/components/CenterStage.tsx`
  - Removes `canPublishVoice` and `onRequestPublishVoice` props.

- Modify `apps/web/src/components/VoicePanel.tsx`
  - Removes publish-token request flow.
  - Maps LiveKit publish-denied errors to `还没轮到你发言`.

- Modify `apps/web/src/components/VoiceRoom.tsx`
  - Connects with `autoSubscribe: false`.
  - Removes `publication.setSubscribed(true)`.
  - Attaches audio only on `TrackSubscribed`.

- Modify `apps/web/src/components/GameRoomShell.test.ts`
  - Adds source-shape tests for no token upgrade and no client auto-subscribe.

---

## Task 1: Meeting Controller Policy and Ordered Sync

**Files:**
- Create: `apps/api/src/services/livekit-meeting-controller.ts`
- Create: `apps/api/src/services/livekit-meeting-controller.test.ts`

- [ ] **Step 1: Write the failing policy tests**

Create `apps/api/src/services/livekit-meeting-controller.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  ServerLivekitMeetingController,
  type LivekitMeetingRoomState,
} from "./livekit-meeting-controller";

function makeRoom(
  phase: LivekitMeetingRoomState["projection"]["phase"],
  currentSpeakerPlayerId: string | null = null,
  version = 10
): LivekitMeetingRoomState {
  return {
    id: "game_1",
    players: [
      { id: "player_1", kind: "user", userId: "@alice:example.com", leftAt: null },
      { id: "player_2", kind: "user", userId: "@bob:example.com", leftAt: null },
      { id: "player_3", kind: "user", userId: "@cara:example.com", leftAt: null },
      { id: "player_4", kind: "user", userId: "@dan:example.com", leftAt: null },
      { id: "player_5", kind: "agent", agentId: "@agent:example.com", leftAt: null },
    ],
    privateStates: [
      { playerId: "player_1", role: "werewolf", alive: true },
      { playerId: "player_2", role: "villager", alive: true },
      { playerId: "player_3", role: "werewolf", alive: true },
      { playerId: "player_4", role: "werewolf", alive: false },
      { playerId: "player_5", role: "seer", alive: true },
    ],
    projection: {
      phase,
      day: 1,
      version,
      currentSpeakerPlayerId,
      alivePlayerIds: ["player_1", "player_2", "player_3", "player_5"],
    },
  };
}

function fakeRoomService() {
  return {
    createRoom: vi.fn(async () => undefined),
    listParticipants: vi.fn(async () => [
      { identity: "@alice:example.com", tracks: [{ sid: "TR_ALICE", type: 0 }] },
      { identity: "@bob:example.com", tracks: [{ sid: "TR_BOB", type: 0 }] },
      { identity: "@cara:example.com", tracks: [{ sid: "TR_CARA", type: 0 }] },
      { identity: "@dan:example.com", tracks: [{ sid: "TR_DAN", type: 0 }] },
      { identity: "voice-agent:game_1", tracks: [{ sid: "TR_GM", type: 0 }] },
    ]),
    updateParticipant: vi.fn(async () => ({})),
    updateSubscriptions: vi.fn(async () => undefined),
  };
}

function subscriptionCalls(service: ReturnType<typeof fakeRoomService>) {
  return service.updateSubscriptions.mock.calls.map(
    ([room, identity, trackSids, subscribe]) => ({
      room,
      identity,
      trackSids: [...trackSids].sort(),
      subscribe,
    })
  );
}

describe("ServerLivekitMeetingController", () => {
  it("public speech lets all living users hear only the current speaker and GM", async () => {
    const service = fakeRoomService();
    const controller = new ServerLivekitMeetingController(service);

    await controller.syncForRoom(makeRoom("day_speak", "player_2"));

    expect(service.updateParticipant).toHaveBeenCalledWith(
      "game_1",
      "@bob:example.com",
      expect.objectContaining({
        permission: expect.objectContaining({
          canPublish: true,
          canSubscribe: false,
          canPublishData: false,
          canPublishSources: expect.any(Array),
        }),
      })
    );
    expect(service.updateParticipant).toHaveBeenCalledWith(
      "game_1",
      "@alice:example.com",
      expect.objectContaining({
        permission: expect.objectContaining({ canPublish: false }),
      })
    );
    expect(subscriptionCalls(service)).toEqual(
      expect.arrayContaining([
        { room: "game_1", identity: "@alice:example.com", trackSids: ["TR_ALICE", "TR_BOB", "TR_CARA", "TR_DAN"], subscribe: false },
        { room: "game_1", identity: "@alice:example.com", trackSids: ["TR_BOB", "TR_GM"], subscribe: true },
        { room: "game_1", identity: "@bob:example.com", trackSids: ["TR_ALICE", "TR_BOB", "TR_CARA", "TR_DAN"], subscribe: false },
        { room: "game_1", identity: "@bob:example.com", trackSids: ["TR_BOB", "TR_GM"], subscribe: true },
        { room: "game_1", identity: "@cara:example.com", trackSids: ["TR_ALICE", "TR_BOB", "TR_CARA", "TR_DAN"], subscribe: false },
        { room: "game_1", identity: "@cara:example.com", trackSids: ["TR_BOB", "TR_GM"], subscribe: true },
      ])
    );
  });

  it("wolf discussion lets living wolves hear wolf tracks and keeps non-wolves on GM only", async () => {
    const service = fakeRoomService();
    const controller = new ServerLivekitMeetingController(service);

    await controller.syncForRoom(makeRoom("night_wolf", null));

    expect(service.updateParticipant).toHaveBeenCalledWith(
      "game_1",
      "@alice:example.com",
      expect.objectContaining({
        permission: expect.objectContaining({ canPublish: true }),
      })
    );
    expect(service.updateParticipant).toHaveBeenCalledWith(
      "game_1",
      "@cara:example.com",
      expect.objectContaining({
        permission: expect.objectContaining({ canPublish: true }),
      })
    );
    expect(service.updateParticipant).toHaveBeenCalledWith(
      "game_1",
      "@dan:example.com",
      expect.objectContaining({
        permission: expect.objectContaining({ canPublish: false }),
      })
    );
    expect(subscriptionCalls(service)).toEqual(
      expect.arrayContaining([
        { room: "game_1", identity: "@alice:example.com", trackSids: ["TR_ALICE", "TR_CARA", "TR_GM"], subscribe: true },
        { room: "game_1", identity: "@cara:example.com", trackSids: ["TR_ALICE", "TR_CARA", "TR_GM"], subscribe: true },
        { room: "game_1", identity: "@bob:example.com", trackSids: ["TR_GM"], subscribe: true },
        { room: "game_1", identity: "@dan:example.com", trackSids: ["TR_GM"], subscribe: true },
      ])
    );
    const bobAllowed = subscriptionCalls(service).find(
      (call) => call.identity === "@bob:example.com" && call.subscribe
    );
    expect(bobAllowed?.trackSids).not.toContain("TR_ALICE");
    expect(bobAllowed?.trackSids).not.toContain("TR_CARA");
  });
});
```

- [ ] **Step 2: Run the policy tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/livekit-meeting-controller.test.ts
```

Expected: FAIL because `apps/api/src/services/livekit-meeting-controller.ts` does not exist.

- [ ] **Step 3: Implement controller types and policy sync**

Create `apps/api/src/services/livekit-meeting-controller.ts` with this code:

```ts
import {
  RoomServiceClient,
  TrackSource,
  TrackType,
} from "livekit-server-sdk";
import type { GamePhase, Role } from "@werewolf/shared";

export interface LivekitMeetingPlayer {
  id: string;
  kind: "user" | "agent";
  userId?: string | undefined;
  agentId?: string | undefined;
  leftAt: string | null;
}

export interface LivekitMeetingPrivateState {
  playerId: string;
  role: Role;
  alive: boolean;
}

export interface LivekitMeetingProjection {
  phase: GamePhase;
  day: number;
  version: number;
  currentSpeakerPlayerId: string | null;
  alivePlayerIds: string[];
}

export interface LivekitMeetingRoomState {
  id: string;
  players: LivekitMeetingPlayer[];
  privateStates: LivekitMeetingPrivateState[];
  projection: LivekitMeetingProjection;
}

export interface LivekitMeetingController {
  ensureRoom(gameRoomId: string): Promise<void>;
  setRoomSnapshotProvider(provider: (gameRoomId: string) => LivekitMeetingRoomState | null): void;
  syncForRoom(room: LivekitMeetingRoomState, reason?: string): Promise<void>;
  syncForLivekitEvent(gameRoomId: string, reason?: string): Promise<void>;
  syncPublicSpeaker(room: LivekitMeetingRoomState, speakerPlayerId: string | null, reason?: string): Promise<void>;
  syncWolfDiscussion(room: LivekitMeetingRoomState, wolfPlayerIds: string[], reason?: string): Promise<void>;
  clearPlayerAudio(room: LivekitMeetingRoomState, reason?: string): Promise<void>;
}

type LivekitTrackInfo = { sid?: string; type?: unknown; source?: unknown };
type LivekitParticipantInfo = { identity?: string; tracks?: LivekitTrackInfo[] };

type LivekitRoomService = Pick<
  RoomServiceClient,
  "createRoom" | "listParticipants" | "updateParticipant" | "updateSubscriptions"
>;

const ensuredLivekitRooms = new Set<string>();
const ensuringLivekitRooms = new Map<string, Promise<void>>();
const voiceAgentIdentityPrefix = "voice-agent:";

export function clearEnsuredLivekitRoomsForTests(): void {
  ensuredLivekitRooms.clear();
  ensuringLivekitRooms.clear();
}

export function createLivekitMeetingControllerFromEnv(): ServerLivekitMeetingController {
  const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
  return new ServerLivekitMeetingController(
    new RoomServiceClient(livekitUrl, apiKey, apiSecret)
  );
}

export class ServerLivekitMeetingController implements LivekitMeetingController {
  private roomSnapshotProvider: (gameRoomId: string) => LivekitMeetingRoomState | null = () => null;
  private roomQueues = new Map<string, Promise<void>>();
  private latestRequestedVersion = new Map<string, string>();

  constructor(private readonly roomService: LivekitRoomService) {}

  setRoomSnapshotProvider(provider: (gameRoomId: string) => LivekitMeetingRoomState | null): void {
    this.roomSnapshotProvider = provider;
  }

  async ensureRoom(gameRoomId: string): Promise<void> {
    if (ensuredLivekitRooms.has(gameRoomId)) return;
    const existing = ensuringLivekitRooms.get(gameRoomId);
    if (existing) return existing;
    const pending = this.roomService
      .createRoom({ name: gameRoomId, emptyTimeout: 30 * 60, maxParticipants: 20 })
      .then(() => {
        ensuredLivekitRooms.add(gameRoomId);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.toLowerCase().includes("already")) {
          ensuredLivekitRooms.add(gameRoomId);
          return;
        }
        throw err;
      })
      .finally(() => {
        ensuringLivekitRooms.delete(gameRoomId);
      });
    ensuringLivekitRooms.set(gameRoomId, pending);
    return pending;
  }

  syncForLivekitEvent(gameRoomId: string, reason = "livekitEvent"): Promise<void> {
    const room = this.roomSnapshotProvider(gameRoomId);
    if (!room) return Promise.resolve();
    return this.syncForRoom(room, reason);
  }

  syncForRoom(room: LivekitMeetingRoomState, reason = "syncForRoom"): Promise<void> {
    const phase = room.projection.phase;
    if (phase === "day_speak" || phase === "tie_speech") {
      return this.syncPublicSpeaker(room, room.projection.currentSpeakerPlayerId, reason);
    }
    if (phase === "night_wolf") {
      return this.syncWolfDiscussion(room, this.livingWolfPlayerIds(room), reason);
    }
    return this.clearPlayerAudio(room, reason);
  }

  syncPublicSpeaker(room: LivekitMeetingRoomState, speakerPlayerId: string | null, reason = "publicSpeaker"): Promise<void> {
    return this.enqueueSync(room, reason, new Set(speakerPlayerId ? [speakerPlayerId] : []), () => {
      return new Set(speakerPlayerId ? [speakerPlayerId] : []);
    });
  }

  syncWolfDiscussion(room: LivekitMeetingRoomState, wolfPlayerIds: string[], reason = "wolfDiscussion"): Promise<void> {
    const wolves = new Set(wolfPlayerIds);
    return this.enqueueSync(room, reason, wolves, (listener) => {
      if (!wolves.has(listener.id)) return new Set<string>();
      return new Set(wolfPlayerIds);
    });
  }

  clearPlayerAudio(room: LivekitMeetingRoomState, reason = "clearPlayerAudio"): Promise<void> {
    return this.enqueueSync(room, reason, new Set(), () => new Set());
  }

  private enqueueSync(
    room: LivekitMeetingRoomState,
    reason: string,
    publishPlayerIds: Set<string>,
    audiblePlayerIdsForListener: (listener: LivekitMeetingPlayer) => Set<string>
  ): Promise<void> {
    const versionKey = versionKeyFor(room);
    this.latestRequestedVersion.set(room.id, versionKey);
    const previous = this.roomQueues.get(room.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (this.latestRequestedVersion.get(room.id) !== versionKey) return;
        await this.applySync(room, versionKey, publishPlayerIds, audiblePlayerIdsForListener);
      })
      .catch((err) => {
        console.error("[LiveKitMeeting] sync failed", {
          gameRoomId: room.id,
          reason,
          versionKey,
          err,
        });
      })
      .finally(() => {
        if (this.roomQueues.get(room.id) === next) this.roomQueues.delete(room.id);
      });
    this.roomQueues.set(room.id, next);
    return next;
  }

  private async applySync(
    room: LivekitMeetingRoomState,
    versionKey: string,
    publishPlayerIds: Set<string>,
    audiblePlayerIdsForListener: (listener: LivekitMeetingPlayer) => Set<string>
  ): Promise<void> {
    await this.ensureRoom(room.id);
    if (this.latestRequestedVersion.get(room.id) !== versionKey) return;
    const participantInfos = (await this.roomService.listParticipants(room.id)) as LivekitParticipantInfo[];
    const connectedIdentities = new Set(participantInfos.map((p) => p.identity).filter((identity): identity is string => Boolean(identity)));
    const eligiblePlayers = this.eligiblePlayers(room).filter((player) => {
      const identity = resolveLivekitIdentity(player);
      return Boolean(identity && connectedIdentities.has(identity));
    });
    const trackIndex = this.indexAudioTracks(participantInfos, room.players);
    const allPlayerTrackSids = Array.from(trackIndex.playerAudioTrackSids);
    const gmTrackSids = trackIndex.gmAudioTrackSids;

    for (const listener of eligiblePlayers) {
      const identity = resolveLivekitIdentity(listener);
      if (!identity || allPlayerTrackSids.length === 0) continue;
      await this.tryUpdateSubscriptions(room.id, identity, allPlayerTrackSids, false);
    }
    if (this.latestRequestedVersion.get(room.id) !== versionKey) return;

    for (const player of eligiblePlayers) {
      const identity = resolveLivekitIdentity(player);
      if (!identity) continue;
      await this.tryUpdateParticipant(room.id, identity, {
        canPublish: publishPlayerIds.has(player.id),
        canSubscribe: false,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
      });
    }
    if (this.latestRequestedVersion.get(room.id) !== versionKey) return;

    for (const listener of eligiblePlayers) {
      const identity = resolveLivekitIdentity(listener);
      if (!identity) continue;
      const audiblePlayerIds = audiblePlayerIdsForListener(listener);
      const allowedTrackSids = [
        ...Array.from(audiblePlayerIds).flatMap((playerId) => trackIndex.audioTrackSidsByPlayerId.get(playerId) ?? []),
        ...gmTrackSids,
      ];
      if (allowedTrackSids.length > 0) {
        await this.tryUpdateSubscriptions(room.id, identity, allowedTrackSids, true);
      }
    }
  }

  private async tryUpdateParticipant(room: string, identity: string, permission: Record<string, unknown>): Promise<void> {
    try {
      await this.roomService.updateParticipant(room, identity, { permission });
    } catch (err) {
      console.warn("[LiveKitMeeting] updateParticipant skipped", { room, identity, err });
    }
  }

  private async tryUpdateSubscriptions(room: string, identity: string, trackSids: string[], subscribe: boolean): Promise<void> {
    try {
      await this.roomService.updateSubscriptions(room, identity, trackSids, subscribe);
    } catch (err) {
      console.warn("[LiveKitMeeting] updateSubscriptions skipped", { room, identity, trackSids, subscribe, err });
    }
  }

  private eligiblePlayers(room: LivekitMeetingRoomState): LivekitMeetingPlayer[] {
    const alive = new Set(room.projection.alivePlayerIds);
    return room.players.filter((player) => !player.leftAt && alive.has(player.id));
  }

  private livingWolfPlayerIds(room: LivekitMeetingRoomState): string[] {
    const alive = new Set(room.projection.alivePlayerIds);
    return room.privateStates
      .filter((state) => state.role === "werewolf" && state.alive && alive.has(state.playerId))
      .map((state) => state.playerId);
  }

  private indexAudioTracks(participants: LivekitParticipantInfo[], players: LivekitMeetingPlayer[]) {
    const playerIdByIdentity = new Map<string, string>();
    for (const player of players) {
      const identity = resolveLivekitIdentity(player);
      if (identity) playerIdByIdentity.set(identity, player.id);
    }
    const audioTrackSidsByPlayerId = new Map<string, string[]>();
    const playerAudioTrackSids = new Set<string>();
    const gmAudioTrackSids: string[] = [];
    for (const participant of participants) {
      const identity = participant.identity ?? "";
      const audioTrackSids = (participant.tracks ?? [])
        .filter(isAudioTrack)
        .map((track) => track.sid)
        .filter((sid): sid is string => Boolean(sid));
      if (identity.startsWith(voiceAgentIdentityPrefix)) {
        gmAudioTrackSids.push(...audioTrackSids);
        continue;
      }
      const playerId = playerIdByIdentity.get(identity);
      if (!playerId) continue;
      audioTrackSidsByPlayerId.set(playerId, audioTrackSids);
      for (const sid of audioTrackSids) playerAudioTrackSids.add(sid);
    }
    return { audioTrackSidsByPlayerId, playerAudioTrackSids, gmAudioTrackSids };
  }
}

function versionKeyFor(room: LivekitMeetingRoomState): string {
  return `${room.projection.day}:${room.projection.phase}:${room.projection.version}:${room.projection.currentSpeakerPlayerId ?? ""}`;
}

function resolveLivekitIdentity(player: LivekitMeetingPlayer): string | null {
  if (player.kind === "user") return player.userId ?? null;
  return player.agentId ?? null;
}

function isAudioTrack(track: LivekitTrackInfo): boolean {
  return track.type === TrackType.AUDIO || track.type === 0 || track.type === "AUDIO";
}
```

- [ ] **Step 4: Run the policy tests**

Run:

```bash
pnpm vitest run apps/api/src/services/livekit-meeting-controller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/livekit-meeting-controller.ts apps/api/src/services/livekit-meeting-controller.test.ts
git commit -m "feat: add ordered livekit meeting controller"
```

---

## Task 2: Late Track Publish, Join/Reconnect Resync, and Failure Tolerance

**Files:**
- Modify: `apps/api/src/services/livekit-meeting-controller.test.ts`
- Modify: `apps/api/src/services/livekit-meeting-controller.ts`

- [ ] **Step 1: Add failing tests for review findings**

Append these tests to `apps/api/src/services/livekit-meeting-controller.test.ts`:

```ts
it("resyncs newly published microphone tracks through the room snapshot provider", async () => {
  const service = fakeRoomService();
  service.listParticipants
    .mockResolvedValueOnce([
      { identity: "@alice:example.com", tracks: [] },
      { identity: "@bob:example.com", tracks: [] },
      { identity: "voice-agent:game_1", tracks: [{ sid: "TR_GM", type: 0 }] },
    ])
    .mockResolvedValueOnce([
      { identity: "@alice:example.com", tracks: [] },
      { identity: "@bob:example.com", tracks: [{ sid: "TR_BOB_LATE", type: 0 }] },
      { identity: "voice-agent:game_1", tracks: [{ sid: "TR_GM", type: 0 }] },
    ]);
  const controller = new ServerLivekitMeetingController(service);
  controller.setRoomSnapshotProvider((roomId) =>
    roomId === "game_1" ? makeRoom("day_speak", "player_2", 11) : null
  );

  await controller.syncForRoom(makeRoom("day_speak", "player_2", 10));
  await controller.syncForLivekitEvent("game_1", "trackPublished");

  expect(service.updateSubscriptions).toHaveBeenCalledWith(
    "game_1",
    "@alice:example.com",
    ["TR_BOB_LATE", "TR_GM"],
    true
  );
});

it("does not let an older queued sync restore stale permissions after a newer version", async () => {
  const service = fakeRoomService();
  let releaseFirstList: (() => void) | null = null;
  service.listParticipants.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseFirstList = () => resolve([
          { identity: "@alice:example.com", tracks: [{ sid: "TR_ALICE", type: 0 }] },
          { identity: "@bob:example.com", tracks: [{ sid: "TR_BOB", type: 0 }] },
          { identity: "voice-agent:game_1", tracks: [{ sid: "TR_GM", type: 0 }] },
        ]);
      })
  );
  const controller = new ServerLivekitMeetingController(service);

  const oldSync = controller.syncForRoom(makeRoom("day_speak", "player_2", 10));
  const newSync = controller.syncForRoom(makeRoom("night_wolf", null, 11));
  releaseFirstList?.();
  await Promise.all([oldSync, newSync]);

  const bobGrants = service.updateParticipant.mock.calls.filter(
    ([, identity]) => identity === "@bob:example.com"
  );
  expect(bobGrants.at(-1)?.[2]).toEqual(
    expect.objectContaining({
      permission: expect.objectContaining({ canPublish: false }),
    })
  );
});

it("continues syncing other participants when one participant update fails", async () => {
  const service = fakeRoomService();
  service.updateParticipant.mockImplementation(async (_room, identity) => {
    if (identity === "@alice:example.com") throw new Error("participant not found");
    return {};
  });
  const controller = new ServerLivekitMeetingController(service);

  await controller.syncForRoom(makeRoom("day_speak", "player_2"));

  expect(service.updateParticipant).toHaveBeenCalledWith(
    "game_1",
    "@bob:example.com",
    expect.objectContaining({
      permission: expect.objectContaining({ canPublish: true }),
    })
  );
});
```

- [ ] **Step 2: Run tests to verify the review-finding tests fail if Task 1 did not cover them**

Run:

```bash
pnpm vitest run apps/api/src/services/livekit-meeting-controller.test.ts -t "resyncs newly published|older queued|continues syncing"
```

Expected: PASS after Task 1 implementation. If any fail, fix `ServerLivekitMeetingController` by keeping the provider, version queue, and per-identity try/catch exactly as shown in Task 1.

- [ ] **Step 3: Commit if tests required fixes**

If files changed:

```bash
git add apps/api/src/services/livekit-meeting-controller.ts apps/api/src/services/livekit-meeting-controller.test.ts
git commit -m "test: cover livekit meeting resync ordering"
```

Expected: commit succeeds only if Task 2 produced edits.

---

## Task 3: Wire Game Runtime to the Meeting Controller Before Routes

**Files:**
- Modify: `apps/api/src/services/game-service.ts`
- Modify: `apps/api/src/services/game-service.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add failing game-service tests**

In `apps/api/src/services/game-service.test.ts`, add this helper near the top:

```ts
function fakeLivekitMeeting() {
  return {
    ensureRoom: vi.fn(async () => undefined),
    setRoomSnapshotProvider: vi.fn(),
    syncForRoom: vi.fn(async () => undefined),
    syncForLivekitEvent: vi.fn(async () => undefined),
    syncPublicSpeaker: vi.fn(async () => undefined),
    syncWolfDiscussion: vi.fn(async () => undefined),
    clearPlayerAudio: vi.fn(async () => undefined),
  };
}
```

Add these tests inside `describe("InMemoryGameService rules", () => { ... })`:

```ts
it("installs a room snapshot provider for LiveKit event resync", () => {
  const games = new InMemoryGameService();
  const livekitMeeting = fakeLivekitMeeting();

  games.setLivekitMeetingController(livekitMeeting);

  expect(livekitMeeting.setRoomSnapshotProvider).toHaveBeenCalledWith(expect.any(Function));
  const provider = livekitMeeting.setRoomSnapshotProvider.mock.calls[0]![0];
  expect(provider("missing")).toBeNull();
});

it("syncs GM subscriptions before playing phase narration", async () => {
  const games = new InMemoryGameService();
  const livekitMeeting = fakeLivekitMeeting();
  const calls: string[] = [];
  livekitMeeting.syncForRoom.mockImplementation(async () => {
    calls.push("sync");
  });
  games.setLivekitMeetingController(livekitMeeting);
  games.setVoiceAgents({
    getOrCreate: async () => ({
      registerPlayerVoiceIdentity: () => undefined,
      playAudioFiles: async () => {
        calls.push("gm");
      },
    }),
    get: () => null,
    setTranscriptHandler: () => undefined,
    destroy: async () => undefined,
  } as unknown as VoiceAgentRegistry);
  const { room } = games.createGame(
    {
      sourceMatrixRoomId: "!source:example.com",
      title: "Rules",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    },
    players[0][0]
  );
  for (const [userId, name] of players.slice(0, 6)) games.join(room.id, userId, name);

  games.start(room.id, players[0][0]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(calls[0]).toBe("sync");
});

it("syncs wolf discussion with living wolves only", async () => {
  const { games, gameRoomId } = createStartedServiceGame();
  const livekitMeeting = fakeLivekitMeeting();
  games.setLivekitMeetingController(livekitMeeting);
  const room = games.snapshot(gameRoomId);
  room.projection = {
    ...room.projection!,
    phase: "night_wolf",
    deadlineAt: new Date(Date.now() + 45_000).toISOString(),
  };
  const livingWolves = room.privateStates
    .filter((state) => state.role === "werewolf" && state.alive)
    .map((state) => state.playerId);

  await games.advanceGame(gameRoomId, passAgentTurn);

  expect(livekitMeeting.syncWolfDiscussion).toHaveBeenCalledWith(
    expect.objectContaining({ id: gameRoomId }),
    livingWolves,
    "nightWolfDiscussionWindow"
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts -t "LiveKit event resync|before playing phase narration|living wolves only"
```

Expected: FAIL because `setLivekitMeetingController` and the new sync calls are not implemented.

- [ ] **Step 3: Implement game-service wiring**

In `apps/api/src/services/game-service.ts`, import the interface:

```ts
import type { LivekitMeetingController } from "./livekit-meeting-controller";
```

Add a private field near `voiceAgents`:

```ts
  private livekitMeeting: LivekitMeetingController | null = null;
```

Add this setter after `setVoiceAgents`:

```ts
  setLivekitMeetingController(controller: LivekitMeetingController): void {
    this.livekitMeeting = controller;
    controller.setRoomSnapshotProvider((gameRoomId) => this.rooms.get(gameRoomId) ?? null);
  }
```

Add these helpers near `playGmAnnouncement`:

```ts
  private async syncLivekitMeetingBeforeNarration(
    room: StoredGameRoom,
    reason: string
  ): Promise<void> {
    if (!this.livekitMeeting || !room.projection) return;
    await this.livekitMeeting.syncForRoom(room, reason);
  }

  private syncLivekitMeeting(room: StoredGameRoom, reason: string): void {
    if (!this.livekitMeeting || !room.projection) return;
    void this.livekitMeeting.syncForRoom(room, reason);
  }

  private syncLivekitPublicSpeaker(
    room: StoredGameRoom,
    speakerPlayerId: string | null,
    reason: string
  ): void {
    if (!this.livekitMeeting || !room.projection) return;
    void this.livekitMeeting.syncPublicSpeaker(room, speakerPlayerId, reason);
  }

  private syncLivekitWolfDiscussion(
    room: StoredGameRoom,
    wolfPlayerIds: string[],
    reason: string
  ): void {
    if (!this.livekitMeeting || !room.projection) return;
    void this.livekitMeeting.syncWolfDiscussion(room, wolfPlayerIds, reason);
  }

  private clearLivekitPlayerAudio(room: StoredGameRoom, reason: string): void {
    if (!this.livekitMeeting || !room.projection) return;
    void this.livekitMeeting.clearPlayerAudio(room, reason);
  }
```

In `playGmAnnouncement`, before `const voiceAgent = await this.ensureVoiceAgentRegistered(room);`, add:

```ts
    await this.syncLivekitMeetingBeforeNarration(room, "beforeGmNarration");
```

In `startPhase`, after appending the `phase_started` event, add:

```ts
    this.syncLivekitMeeting(room, "startPhase");
```

In `beginSpeechQueue`, after `this.emitSpeechTurnStarted(...)`, add:

```ts
    this.syncLivekitPublicSpeaker(room, currentSpeakerPlayerId, "beginSpeechQueue");
```

In `advanceSpeechSpeaker`, after assigning the new projection, add:

```ts
    this.syncLivekitPublicSpeaker(room, nextSpeakerPlayerId, "advanceSpeechSpeaker");
```

In the `night_wolf` discussion-window branch, after appending the window event and before returning the tick result, add:

```ts
            this.syncLivekitWolfDiscussion(
              room,
              wolves,
              "nightWolfDiscussionWindow"
            );
```

In `endGame`, before destroying voice agents, add:

```ts
    this.clearLivekitPlayerAudio(room, "endGame");
```

In the player removal flow after `player.leftAt` is set, add:

```ts
    this.syncLivekitMeeting(room, "removePlayer");
```

- [ ] **Step 4: Wire the controller before routes in `app.ts`**

Modify `apps/api/src/app.ts` imports:

```ts
import {
  createLivekitMeetingControllerFromEnv,
  type LivekitMeetingController,
} from "./services/livekit-meeting-controller";
```

Extend `AppDeps`:

```ts
  livekitMeeting?: LivekitMeetingController | undefined;
```

Inside `createApp`, before route registration:

```ts
  const livekitMeeting =
    deps.livekitMeeting ?? createLivekitMeetingControllerFromEnv();
  deps.games.setLivekitMeetingController(livekitMeeting);
```

- [ ] **Step 5: Run game-service tests**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts -t "LiveKit event resync|before playing phase narration|living wolves only"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/game-service.ts apps/api/src/services/game-service.test.ts apps/api/src/app.ts
git commit -m "feat: sync livekit meeting from game runtime"
```

---

## Task 4: Join-Only Tokens and LiveKit Event Webhook

**Files:**
- Modify: `apps/api/src/routes/livekit.ts`
- Modify: `apps/api/src/routes/games.test.ts`

- [ ] **Step 1: Add failing route tests**

In `apps/api/src/routes/games.test.ts`, replace the existing LiveKit token test with:

```ts
it("issues LiveKit tokens with Matrix identity but no speaker or subscriber grants", async () => {
  const deps = createTestDeps();
  const app = createApp(deps);
  const { room } = deps.games.createGame(
    {
      sourceMatrixRoomId: "!source:example.com",
      title: "Friday Werewolf",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    },
    "@alice:example.com"
  );
  const player = deps.games.join(room.id, "@alice:example.com", "Alice", undefined, 1);

  const response = await app.request(`/games/${room.id}/livekit-token`, {
    method: "POST",
    headers: { authorization: "Bearer matrix-token-alice" },
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.identity).toBe("@alice:example.com");
  expect(body.identity).not.toBe(player.id);
  expect(body.canPublish).toBe(false);
  expect(body.canSubscribe).toBe(false);
});
```

Add this source-shape test:

```ts
it("delegates LiveKit room creation and event resync to the meeting controller", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/api/src/routes/livekit.ts"),
    "utf8"
  );
  expect(source).toContain("livekitMeeting.ensureRoom(gameRoomId)");
  expect(source).toContain("livekitMeeting.syncForLivekitEvent");
  expect(source).not.toContain("new RoomServiceClient");
  expect(source).not.toContain("const ensuredLivekitRooms = new Set<string>()");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/routes/games.test.ts -t "LiveKit"
```

Expected: FAIL because token grants and route wiring still use the old behavior.

- [ ] **Step 3: Update `livekit.ts` dependencies and token grants**

In `apps/api/src/routes/livekit.ts`, replace the SDK import:

```ts
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";
```

Import the controller type:

```ts
import type { LivekitMeetingController } from "../services/livekit-meeting-controller";
```

Add the dependency:

```ts
  livekitMeeting: LivekitMeetingController;
```

Remove route-local `RoomServiceClient`, `ensuredLivekitRooms`, `ensuringLivekitRooms`, and `ensureLivekitRoom`.

Change player token grants to:

```ts
      at.addGrant({
        room: gameRoomId,
        roomJoin: true,
        canPublish: false,
        canSubscribe: false,
        canPublishData: false,
      });
```

Replace room creation with:

```ts
        await deps.livekitMeeting.ensureRoom(gameRoomId);
```

Return:

```ts
      return c.json({
        token,
        serverUrl: LIVEKIT_URL,
        room: gameRoomId,
        identity,
        canPublish: false,
        canSubscribe: false,
      });
```

- [ ] **Step 4: Add the LiveKit webhook route for join/track events**

In `apps/api/src/routes/livekit.ts`, create the receiver inside `createLivekitRoutes`:

```ts
  const webhookReceiver = new WebhookReceiver(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );
```

Add this route before `return app;`:

```ts
  app.post("/livekit-webhook", async (c) => {
    try {
      const body = await c.req.text();
      const authHeader = c.req.header("authorization") ?? "";
      const event = await webhookReceiver.receive(body, authHeader);
      const roomName = event.room?.name;
      if (
        roomName &&
        (event.event === "participant_joined" ||
          event.event === "track_published" ||
          event.event === "track_unpublished")
      ) {
        void deps.livekitMeeting.syncForLivekitEvent(roomName, event.event);
      }
      return c.json({ ok: true });
    } catch (error) {
      console.warn("[LiveKit] webhook rejected", error);
      return c.json({ error: "invalid webhook" }, 401);
    }
  });
```

- [ ] **Step 5: Run route tests**

Run:

```bash
pnpm vitest run apps/api/src/routes/games.test.ts -t "LiveKit"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/livekit.ts apps/api/src/routes/games.test.ts
git commit -m "feat: make livekit tokens join-only"
```

---

## Task 5: Remove Client Token Upgrade and Auto-Subscribe

**Files:**
- Modify: `apps/web/src/routes/game.$gameRoomId.tsx`
- Modify: `apps/web/src/components/CenterStage.tsx`
- Modify: `apps/web/src/components/VoicePanel.tsx`
- Modify: `apps/web/src/components/VoiceRoom.tsx`
- Modify: `apps/web/src/components/GameRoomShell.test.ts`

- [ ] **Step 1: Add failing web tests**

In `apps/web/src/components/GameRoomShell.test.ts`, add:

```ts
it("does not fetch a new LiveKit token when voice recording starts", () => {
  const route = readFileSync(
    resolve(process.cwd(), "apps/web/src/routes/game.$gameRoomId.tsx"),
    "utf8"
  );
  const centerStage = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/CenterStage.tsx"),
    "utf8"
  );
  const voicePanel = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/VoicePanel.tsx"),
    "utf8"
  );

  expect(route).not.toContain("requestPublishVoiceToken");
  expect(route).not.toContain("livekitCanPublish");
  expect(route).not.toContain("livekitPublishTokenInFlightRef");
  expect(centerStage).not.toContain("onRequestPublishVoice");
  expect(centerStage).not.toContain("canPublishVoice");
  expect(voicePanel).not.toContain("onRequestPublishVoice");
  expect(voicePanel).not.toContain("canPublishVoice");
});

it("does not auto-subscribe to LiveKit tracks in the browser", () => {
  const voiceRoom = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/VoiceRoom.tsx"),
    "utf8"
  );
  expect(voiceRoom).toContain("autoSubscribe: false");
  expect(voiceRoom).not.toContain("publication.setSubscribed(true)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run apps/web/src/components/GameRoomShell.test.ts -t "LiveKit token|auto-subscribe"
```

Expected: FAIL because publish-token upgrade and auto-subscribe still exist.

- [ ] **Step 3: Remove publish-token upgrade from the route and stage props**

In `apps/web/src/routes/game.$gameRoomId.tsx`, remove:

```ts
  const [livekitCanPublish, setLivekitCanPublish] = useState(false);
  const livekitPublishTokenInFlightRef = useRef<Promise<void> | null>(null);
```

Remove all `setLivekitCanPublish(...)` calls.

Delete the full `requestPublishVoiceToken` callback.

Remove these props from `<CenterStage />`:

```tsx
            canPublishVoice={livekitCanPublish}
            onRequestPublishVoice={requestPublishVoiceToken}
```

In `apps/web/src/components/CenterStage.tsx`, remove `canPublishVoice` and `onRequestPublishVoice` from props, destructuring, and `<VoicePanel />`.

- [ ] **Step 4: Simplify `VoicePanel` and map denied publish errors**

In `apps/web/src/components/VoicePanel.tsx`, remove `canPublishVoice`, `onRequestPublishVoice`, `pendingMicStartRef`, the pending effect, and the token-request branch.

Add above `VoicePanel`:

```ts
function micStartErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.toLowerCase().includes("insufficient permissions") ||
    message.includes("PublishTrackError")
  ) {
    return "还没轮到你发言";
  }
  return message;
}
```

In the mic-start catch block, use:

```ts
      setMicError(micStartErrorMessage(err));
```

- [ ] **Step 5: Disable browser auto-subscribe in `VoiceRoom`**

In `apps/web/src/components/VoiceRoom.tsx`, change `RoomEvent.TrackPublished` to logging only:

```ts
      .on(RoomEvent.TrackPublished, (publication, participant) => {
        if (publication.kind === Track.Kind.Audio) {
          console.info("[VoiceRoom] remote audio published", {
            trackSid: publication.trackSid,
            participantIdentity: participant.identity,
          });
        }
      })
```

Change connect options:

```ts
      .connect(serverUrl, token, { autoSubscribe: false })
```

Remove this block from the connected loop:

```ts
            if (publication.kind === Track.Kind.Audio) {
              publication.setSubscribed(true);
            }
```

Keep:

```ts
            if (publication.track && publication.isSubscribed) {
              attachAudio(publication.track, publication, participant);
            }
```

- [ ] **Step 6: Run web tests**

Run:

```bash
pnpm vitest run apps/web/src/components/GameRoomShell.test.ts -t "LiveKit token|auto-subscribe"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/game.\\$gameRoomId.tsx apps/web/src/components/CenterStage.tsx apps/web/src/components/VoicePanel.tsx apps/web/src/components/VoiceRoom.tsx apps/web/src/components/GameRoomShell.test.ts
git commit -m "feat: let server control livekit subscriptions"
```

---

## Task 6: Final Verification

**Files:**
- Review: `apps/api/src/services/livekit-meeting-controller.ts`
- Review: `apps/api/src/services/game-service.ts`
- Review: `apps/api/src/routes/livekit.ts`
- Review: `apps/web/src/components/VoiceRoom.tsx`
- Review: `apps/web/src/components/VoicePanel.tsx`

- [ ] **Step 1: Run API tests**

Run:

```bash
pnpm vitest run apps/api/src/services/livekit-meeting-controller.test.ts apps/api/src/services/game-service.test.ts apps/api/src/routes/games.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web tests**

Run:

```bash
pnpm vitest run apps/web/src/components/GameRoomShell.test.ts apps/web/src/components/UiPrimitives.test.ts apps/web/src/components/centerStageLayout.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
pnpm --filter @werewolf/api typecheck
pnpm --filter @werewolf/web typecheck
```

Expected: both commands exit 0.

- [ ] **Step 4: Inspect invariants**

Run:

```bash
rg -n "canPublish: isPlayer|requestPublishVoiceToken|publication.setSubscribed\\(true\\)|autoSubscribe: true" apps/api apps/web
```

Expected: no matches.

Run:

```bash
rg -n "syncForLivekitEvent|TrackSource.MICROPHONE|autoSubscribe: false|canSubscribe: false|还没轮到你发言" apps/api apps/web
```

Expected: matches in the meeting controller, route, and web voice components.

- [ ] **Step 5: Commit verification fixes if any were needed**

If files changed:

```bash
git add apps/api apps/web
git commit -m "fix: tighten livekit meeting control"
```

Expected: commit succeeds only if verification produced edits.

---

## Self-Review

Spec coverage:

- One LiveKit room per game room: Tasks 1 and 4 use shared controller room creation.
- Clients join once: Tasks 4 and 5 remove publish-capable token churn and browser auto-subscribe.
- Runtime controls publish and subscribe: Tasks 1 and 3 route all phase/speaker state through `LivekitMeetingController`.
- Wolf night privacy: Task 1 tests living wolf and non-wolf listener matrices.
- Non-wolves hear GM/system audio: Task 1 always includes GM tracks; Task 3 syncs before narration.
- Late track publication: Task 2 requires `syncForLivekitEvent` for `track_published`.
- Participant join/reconnect: Task 4 adds the LiveKit webhook event path.
- Ordered sync: Task 1 serializes per room and uses version keys.
- Partial LiveKit failure tolerance: Task 1 and Task 2 use per-identity try/catch.
- SSE remains decoupled from LiveKit: no task connects SSE reconnect to token refresh or LiveKit reconnect.

Placeholder scan:

- This plan contains no placeholder implementation steps.
- All code snippets use types and methods defined in this plan.

Type consistency:

- `LivekitMeetingController` includes `setRoomSnapshotProvider`, `syncForRoom`, `syncForLivekitEvent`, `syncPublicSpeaker`, `syncWolfDiscussion`, and `clearPlayerAudio`; the same names are used in app, route, and game-service tasks.
- `LivekitMeetingRoomState.projection` includes `day`, `phase`, `version`, `currentSpeakerPlayerId`, and `alivePlayerIds`; these fields exist on game projections used by `StoredGameRoom`.
- The web task removes the old `canPublishVoice` / `onRequestPublishVoice` props everywhere they are referenced.
