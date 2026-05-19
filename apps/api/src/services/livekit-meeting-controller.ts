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
  setRoomSnapshotProvider(
    provider: (gameRoomId: string) => LivekitMeetingRoomState | null
  ): void;
  syncForRoom(room: LivekitMeetingRoomState, reason?: string): Promise<void>;
  syncForLivekitEvent(gameRoomId: string, reason?: string): Promise<void>;
  syncPublicSpeaker(
    room: LivekitMeetingRoomState,
    speakerPlayerId: string | null,
    reason?: string
  ): Promise<void>;
  syncWolfDiscussion(
    room: LivekitMeetingRoomState,
    wolfPlayerIds: string[],
    reason?: string
  ): Promise<void>;
  clearPlayerAudio(
    room: LivekitMeetingRoomState,
    reason?: string
  ): Promise<void>;
}

type LivekitTrackInfo = { sid?: string; type?: unknown; source?: unknown };
type LivekitParticipantInfo = {
  identity?: string;
  tracks?: LivekitTrackInfo[];
};

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
  private roomSnapshotProvider: (
    gameRoomId: string
  ) => LivekitMeetingRoomState | null = () => null;
  private roomQueues = new Map<string, Promise<void>>();
  private latestRequestedVersion = new Map<string, string>();

  constructor(private readonly roomService: LivekitRoomService) {}

  setRoomSnapshotProvider(
    provider: (gameRoomId: string) => LivekitMeetingRoomState | null
  ): void {
    this.roomSnapshotProvider = provider;
  }

  async ensureRoom(gameRoomId: string): Promise<void> {
    if (ensuredLivekitRooms.has(gameRoomId)) return;
    const existing = ensuringLivekitRooms.get(gameRoomId);
    if (existing) return existing;
    const pending = this.roomService
      .createRoom({
        name: gameRoomId,
        emptyTimeout: 30 * 60,
        maxParticipants: 20,
      })
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

  syncForLivekitEvent(
    gameRoomId: string,
    reason = "livekitEvent"
  ): Promise<void> {
    const room = this.roomSnapshotProvider(gameRoomId);
    if (!room) return Promise.resolve();
    return this.syncForRoom(room, reason);
  }

  syncForRoom(
    room: LivekitMeetingRoomState,
    reason = "syncForRoom"
  ): Promise<void> {
    const phase = room.projection.phase;
    if (phase === "day_speak" || phase === "tie_speech") {
      return this.syncPublicSpeaker(
        room,
        room.projection.currentSpeakerPlayerId,
        reason
      );
    }
    if (phase === "night_wolf") {
      return this.syncWolfDiscussion(room, this.livingWolfPlayerIds(room), reason);
    }
    return this.clearPlayerAudio(room, reason);
  }

  syncPublicSpeaker(
    room: LivekitMeetingRoomState,
    speakerPlayerId: string | null,
    reason = "publicSpeaker"
  ): Promise<void> {
    return this.enqueueSync(
      room,
      reason,
      new Set(speakerPlayerId ? [speakerPlayerId] : []),
      () => new Set(speakerPlayerId ? [speakerPlayerId] : [])
    );
  }

  syncWolfDiscussion(
    room: LivekitMeetingRoomState,
    wolfPlayerIds: string[],
    reason = "wolfDiscussion"
  ): Promise<void> {
    const wolves = new Set(wolfPlayerIds);
    return this.enqueueSync(room, reason, wolves, (listener) => {
      if (!wolves.has(listener.id)) return new Set<string>();
      return new Set(wolfPlayerIds);
    });
  }

  clearPlayerAudio(
    room: LivekitMeetingRoomState,
    reason = "clearPlayerAudio"
  ): Promise<void> {
    return this.enqueueSync(room, reason, new Set(), () => new Set());
  }

  private enqueueSync(
    room: LivekitMeetingRoomState,
    reason: string,
    publishPlayerIds: Set<string>,
    audiblePlayerIdsForListener: (
      listener: LivekitMeetingPlayer
    ) => Set<string>
  ): Promise<void> {
    const versionKey = versionKeyFor(room);
    this.latestRequestedVersion.set(room.id, versionKey);
    const previous = this.roomQueues.get(room.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (this.latestRequestedVersion.get(room.id) !== versionKey) return;
        await this.applySync(
          room,
          versionKey,
          publishPlayerIds,
          audiblePlayerIdsForListener
        );
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
    audiblePlayerIdsForListener: (
      listener: LivekitMeetingPlayer
    ) => Set<string>
  ): Promise<void> {
    await this.ensureRoom(room.id);
    if (this.latestRequestedVersion.get(room.id) !== versionKey) return;
    const participantInfos = (await this.roomService.listParticipants(
      room.id
    )) as LivekitParticipantInfo[];
    const connectedIdentities = new Set(
      participantInfos
        .map((participant) => participant.identity)
        .filter((identity): identity is string => Boolean(identity))
    );
    const activeConnectedPlayers = this.activePlayers(room).filter((player) => {
      const identity = resolveLivekitIdentity(player);
      return Boolean(identity && connectedIdentities.has(identity));
    });
    const trackIndex = this.indexAudioTracks(participantInfos, room.players);
    const allPlayerTrackSids = Array.from(trackIndex.playerAudioTrackSids);
    const gmTrackSids = trackIndex.gmAudioTrackSids;

    for (const listener of activeConnectedPlayers) {
      const identity = resolveLivekitIdentity(listener);
      if (!identity || allPlayerTrackSids.length === 0) continue;
      await this.tryUpdateSubscriptions(
        room.id,
        identity,
        allPlayerTrackSids,
        false
      );
    }
    if (this.latestRequestedVersion.get(room.id) !== versionKey) return;

    for (const player of activeConnectedPlayers) {
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

    for (const listener of activeConnectedPlayers) {
      const identity = resolveLivekitIdentity(listener);
      if (!identity) continue;
      const audiblePlayerIds = audiblePlayerIdsForListener(listener);
      const allowedTrackSids = [
        ...Array.from(audiblePlayerIds).flatMap(
          (playerId) => trackIndex.audioTrackSidsByPlayerId.get(playerId) ?? []
        ),
        ...gmTrackSids,
      ];
      if (allowedTrackSids.length > 0) {
        await this.tryUpdateSubscriptions(
          room.id,
          identity,
          allowedTrackSids,
          true
        );
      }
    }
  }

  private async tryUpdateParticipant(
    room: string,
    identity: string,
    permission: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.roomService.updateParticipant(room, identity, { permission });
    } catch (err) {
      console.warn("[LiveKitMeeting] updateParticipant skipped", {
        room,
        identity,
        err,
      });
    }
  }

  private async tryUpdateSubscriptions(
    room: string,
    identity: string,
    trackSids: string[],
    subscribe: boolean
  ): Promise<void> {
    try {
      await this.roomService.updateSubscriptions(
        room,
        identity,
        trackSids,
        subscribe
      );
    } catch (err) {
      console.warn("[LiveKitMeeting] updateSubscriptions skipped", {
        room,
        identity,
        trackSids,
        subscribe,
        err,
      });
    }
  }

  private activePlayers(room: LivekitMeetingRoomState): LivekitMeetingPlayer[] {
    return room.players.filter((player) => !player.leftAt);
  }

  private livingWolfPlayerIds(room: LivekitMeetingRoomState): string[] {
    const alive = new Set(room.projection.alivePlayerIds);
    return room.privateStates
      .filter(
        (state) =>
          state.role === "werewolf" && state.alive && alive.has(state.playerId)
      )
      .map((state) => state.playerId);
  }

  private indexAudioTracks(
    participants: LivekitParticipantInfo[],
    players: LivekitMeetingPlayer[]
  ): {
    audioTrackSidsByPlayerId: Map<string, string[]>;
    playerAudioTrackSids: Set<string>;
    gmAudioTrackSids: string[];
  } {
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
