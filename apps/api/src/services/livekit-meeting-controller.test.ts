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
