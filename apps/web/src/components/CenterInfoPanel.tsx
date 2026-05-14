import type { GameEventDto, RoomPlayer } from "../api/client";
import { useT } from "../i18n/I18nProvider";
import { avatarPalette, firstReadableInitial } from "./SeatAvatar";
import type { SceneId } from "./GameRoomShell";

interface CenterInfoPanelProps {
  phaseLabel: string;
  rawPhase: string | null | undefined;
  scene: SceneId;
  day: number | undefined;
  living: number;
  total: number;
  players: RoomPlayer[];
  events: GameEventDto[];
  currentSpeakerPlayerId?: string | null | undefined;
}

interface VoteGroup {
  target: RoomPlayer | undefined;
  targetId: string;
  voters: RoomPlayer[];
}

function numberPayload(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function playerById(players: RoomPlayer[]): Map<string, RoomPlayer> {
  return new Map(players.map((player) => [player.id, player]));
}

function playerLabel(player: RoomPlayer | undefined, fallbackId?: string): string {
  if (!player) return fallbackId ? fallbackId.slice(0, 8) : "?";
  return player.displayName || `${player.seatNo} 号`;
}

function playerInitial(player: RoomPlayer | undefined): string {
  if (!player) return "?";
  return (
    firstReadableInitial(player.userId) ??
    firstReadableInitial(player.agentId) ??
    firstReadableInitial(player.id) ??
    firstReadableInitial(player.displayName) ??
    "?"
  );
}

function latestSpeechEvent(events: GameEventDto[]): GameEventDto | undefined {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "speech_transcript_delta" ||
        event.type === "speech_submitted"
    );
}

function speechText(event: GameEventDto | undefined): string {
  if (!event) return "";
  if (event.type === "speech_transcript_delta") {
    return String(event.payload.text ?? event.payload.delta ?? "").trim();
  }
  return String(event.payload.speech ?? "").trim();
}

function voteGroupsForDay(
  events: GameEventDto[],
  players: RoomPlayer[],
  day: number | undefined,
  rawPhase: string | null | undefined
): VoteGroup[] {
  const playersById = playerById(players);
  const voteType =
    rawPhase === "night_wolf" || rawPhase === "night_wolf_action"
      ? "wolf_vote_submitted"
      : "vote_submitted";
  const latestVoteByActor = new Map<string, GameEventDto>();

  for (const event of events) {
    if (event.type !== voteType || !event.actorId || !event.subjectId) continue;
    const eventDay = numberPayload(event.payload.day);
    if (day !== undefined && eventDay !== null && eventDay !== day) continue;
    latestVoteByActor.set(event.actorId, event);
  }

  const grouped = new Map<string, string[]>();
  for (const event of latestVoteByActor.values()) {
    const targetId = event.subjectId;
    if (!targetId) continue;
    const voters = grouped.get(targetId) ?? [];
    voters.push(event.actorId!);
    grouped.set(targetId, voters);
  }

  return [...grouped.entries()]
    .map(([targetId, voterIds]) => ({
      targetId,
      target: playersById.get(targetId),
      voters: voterIds
        .map((voterId) => playersById.get(voterId))
        .filter((player): player is RoomPlayer => Boolean(player))
        .sort((left, right) => left.seatNo - right.seatNo),
    }))
    .sort((left, right) => {
      if (right.voters.length !== left.voters.length) {
        return right.voters.length - left.voters.length;
      }
      return (left.target?.seatNo ?? 99) - (right.target?.seatNo ?? 99);
    });
}

function MiniAvatar({ player }: { player: RoomPlayer | undefined }) {
  const seed = player?.userId ?? player?.agentId ?? player?.id ?? "unknown";
  const palette = avatarPalette(seed);
  return (
    <span
      className="center-mini-avatar"
      style={{
        ["--center-avatar-bg" as string]: palette.bg,
        ["--center-avatar-fg" as string]: palette.fg,
      }}
      title={playerLabel(player)}
    >
      {playerInitial(player)}
    </span>
  );
}

export function CenterInfoPanel({
  phaseLabel,
  rawPhase,
  scene,
  day,
  living,
  total,
  players,
  events,
  currentSpeakerPlayerId,
}: CenterInfoPanelProps) {
  const t = useT();
  const playersById = playerById(players);
  const isVotePhase =
    rawPhase === "day_vote" ||
    rawPhase === "tie_vote" ||
    scene === "vote" ||
    scene === "tie";
  const isSpeechPhase = rawPhase === "day_speak" || rawPhase === "tie_speech";
  const voteGroups = voteGroupsForDay(events, players, day, rawPhase);
  const latestSpeech = latestSpeechEvent(events);
  const latestSpeechPlayer = playersById.get(latestSpeech?.actorId ?? "");
  const currentSpeaker = playersById.get(currentSpeakerPlayerId ?? "");
  const text = speechText(latestSpeech);

  return (
    <section className="center-info-panel" aria-live="polite">
      <div className="center-info-kicker">{rawPhase ?? scene}</div>
      <div className="center-info-title">{phaseLabel}</div>
      <div className="center-info-meta">{living}/{total} {t("centerInfo.alive")}</div>

      {isVotePhase ? (
        <div className="center-live-block center-vote-block">
          <div className="center-live-heading">
            <span>{t("centerInfo.voteLive")}</span>
            <b>{voteGroups.reduce((count, group) => count + group.voters.length, 0)}</b>
          </div>
          {voteGroups.length ? (
            <div className="center-vote-groups">
              {voteGroups.map((group) => (
                <article className="center-vote-group" key={group.targetId}>
                  <div className="center-vote-target">
                    <span>{group.target?.seatNo ?? "?"} {t("centerInfo.seatSuffix")}</span>
                    <strong>{playerLabel(group.target, group.targetId)}</strong>
                    <em>{group.voters.length} {t("centerInfo.voteCount")}</em>
                  </div>
                  <div className="center-voter-list">
                    {group.voters.map((voter) => (
                      <MiniAvatar key={voter.id} player={voter} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="center-info-empty">{t("centerInfo.voteWaiting")}</div>
          )}
        </div>
      ) : null}

      {isSpeechPhase ? (
        <div className="center-live-block center-speech-block">
          <div className="center-live-heading">
            <span>{t("centerInfo.speechLive")}</span>
          </div>
          <div className="center-speaker-row">
            <MiniAvatar player={currentSpeaker ?? latestSpeechPlayer} />
            <span>
              {currentSpeaker
                ? t("centerInfo.currentSpeaker", {
                    seat: currentSpeaker.seatNo,
                    name: playerLabel(currentSpeaker),
                  })
                : latestSpeechPlayer
                  ? t("centerInfo.latestSpeaker", {
                      seat: latestSpeechPlayer.seatNo,
                      name: playerLabel(latestSpeechPlayer),
                    })
                  : t("centerInfo.waitingSpeech")}
            </span>
          </div>
          {text ? (
            <p className="center-speech-text">{text}</p>
          ) : (
            <div className="center-info-empty">{t("centerInfo.noSpeechYet")}</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
