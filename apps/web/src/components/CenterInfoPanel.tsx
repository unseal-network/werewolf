import { useEffect, useRef, useState } from "react";
import type { GameEventDto, RoomPlayer } from "../api/client";
import { useT } from "../i18n/I18nProvider";
import { avatarPalette, firstReadableInitial } from "./SeatAvatar";
import type { SceneId } from "./GameRoomShell";
import { UiPanelFrame } from "./UiPanelFrame";

interface CenterInfoPanelProps {
  rawPhase: string | null | undefined;
  scene: SceneId;
  day: number | undefined;
  players: RoomPlayer[];
  events: GameEventDto[];
  currentSpeakerPlayerId?: string | null | undefined;
}

interface VoteGroup {
  target: RoomPlayer | undefined;
  targetId: string;
  voters: RoomPlayer[];
}

interface VoteResult {
  exiled: RoomPlayer | undefined;
  exiledId: string;
  voteCount: number | null;
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

function seatNoLabel(seatNo: number | undefined, suffix: string): string {
  return `${seatNo ?? "?"}${suffix}`;
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

function stringPayload(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function latestSpeechEvent(
  events: GameEventDto[],
  day: number | undefined,
  rawPhase: string | null | undefined,
  currentSpeakerPlayerId: string | null | undefined
): GameEventDto | undefined {
  return [...events]
    .reverse()
    .find(
      (event) => {
        if (
          event.type !== "stream" &&
          event.type !== "speech_transcript_delta" &&
          event.type !== "speech_submitted"
        ) {
          return false;
        }
        if (
          currentSpeakerPlayerId &&
          event.actorId !== currentSpeakerPlayerId
        ) {
          return false;
        }
        const eventDay = numberPayload(event.payload.day);
        if (day !== undefined && eventDay !== null && eventDay !== day) {
          return false;
        }
        const eventPhase = stringPayload(event.payload.phase);
        if (rawPhase && eventPhase && eventPhase !== rawPhase) {
          return false;
        }
        return true;
      }
    );
}

function speechText(event: GameEventDto | undefined): string {
  if (!event) return "";
  if (event.type === "stream" || event.type === "speech_transcript_delta") {
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

function latestVoteResultForDay(
  events: GameEventDto[],
  players: RoomPlayer[],
  day: number | undefined
): VoteResult | null {
  const resultEvent = [...events].reverse().find((event) => {
    if (event.type !== "phase_closed") return false;
    const phase = stringPayload(event.payload.phase);
    if (phase !== "day_vote" && phase !== "tie_vote") return false;
    const eventDay = numberPayload(event.payload.day);
    if (day !== undefined && eventDay !== null && eventDay !== day) return false;
    return stringPayload(event.payload.exiledPlayerId) !== null;
  });
  if (!resultEvent) return null;

  const exiledId = stringPayload(resultEvent.payload.exiledPlayerId);
  if (!exiledId) return null;

  const playersById = playerById(players);
  const tally = resultEvent.payload.tally;
  const rawVoteCount =
    tally && typeof tally === "object"
      ? (tally as Record<string, unknown>)[exiledId]
      : undefined;
  const voteCount = numberPayload(rawVoteCount);
  const voters =
    voteGroupsForDay(events, players, day, "day_vote").find(
      (group) => group.targetId === exiledId
    )?.voters ?? [];

  return {
    exiledId,
    exiled: playersById.get(exiledId),
    voteCount,
    voters,
  };
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
  rawPhase,
  scene,
  day,
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
  const voteResult = latestVoteResultForDay(events, players, day);
  const showVoteResult =
    Boolean(voteResult) && !isVotePhase && !isSpeechPhase && rawPhase === "day_resolution";
  const latestSpeech = latestSpeechEvent(
    events,
    day,
    rawPhase,
    currentSpeakerPlayerId
  );
  const latestSpeechPlayer = playersById.get(latestSpeech?.actorId ?? "");
  const currentSpeaker = playersById.get(currentSpeakerPlayerId ?? "");
  const speechPlayer = currentSpeaker ?? latestSpeechPlayer;
  const speechHeading =
    speechPlayer?.kind === "agent"
      ? t("centerInfo.agentStream")
      : t("centerInfo.liveCaptions");
  const text = speechText(latestSpeech);
  const [displayText, setDisplayText] = useState(text);
  const speechTextRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!text) {
      setDisplayText("");
      return undefined;
    }
    setDisplayText((current) => (text.startsWith(current) ? current : ""));
    const id = window.setInterval(() => {
      setDisplayText((current) => {
        if (current === text) {
          window.clearInterval(id);
          return current;
        }
        return text.slice(0, current.length + 1);
      });
    }, 18);
    return () => window.clearInterval(id);
  }, [text]);

  useEffect(() => {
    const node = speechTextRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayText]);

  if (!isVotePhase && !isSpeechPhase && !showVoteResult) {
    return null;
  }

  return (
    <UiPanelFrame
      as="section"
      className="center-info-panel"
      contentClassName="center-info-panel-content"
      tone="bare"
      size="compact"
      ornament={false}
      aria-live="polite"
    >
      <div className="center-info-surface">
        {isVotePhase ? (
          <div className="center-live-block center-vote-block">
            <div className="center-live-heading">
              <span>{t("centerInfo.voteLive")}</span>
            </div>
            {voteGroups.length ? (
              <div className="center-vote-groups">
                {voteGroups.map((group) => (
                  <article className="center-vote-group" key={group.targetId}>
                    <div className="center-vote-target">
                      <span>{t("centerInfo.voteTarget")}</span>
                      <strong>
                        {seatNoLabel(
                          group.target?.seatNo,
                          t("centerInfo.seatSuffix")
                        )}
                      </strong>
                    </div>
                    <div className="center-voter-list center-voter-seat-list">
                      {group.voters
                        .map((voter) =>
                          seatNoLabel(voter.seatNo, t("centerInfo.seatSuffix"))
                        )
                        .join("，")}
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
              <span>{speechHeading}</span>
            </div>
            <div className="center-speaker-row">
              <MiniAvatar player={speechPlayer} />
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
            {displayText ? (
              <p className="center-speech-text" ref={speechTextRef}>{displayText}</p>
            ) : (
              <div className="center-info-empty">{t("centerInfo.noSpeechYet")}</div>
            )}
          </div>
        ) : null}

        {showVoteResult && voteResult ? (
          <div className="center-live-block center-vote-result-block">
            <div className="center-live-heading">
              <span>{t("centerInfo.voteResult")}</span>
            </div>
            <div className="center-vote-result-player">
              <MiniAvatar player={voteResult.exiled} />
              <div>
                <strong>
                  {seatNoLabel(voteResult.exiled?.seatNo, t("centerInfo.seatSuffix"))}
                  {" "}
                  {playerLabel(voteResult.exiled, voteResult.exiledId)}
                </strong>
                <span>{t("centerInfo.exiledPlayer")}</span>
              </div>
            </div>
            <div className="center-vote-result-meta">
              {voteResult.voteCount !== null
                ? t("centerInfo.exiledVoteCount", { count: voteResult.voteCount })
                : t("centerInfo.exiledByVote")}
              {voteResult.voters.length ? (
                <span>
                  {t("centerInfo.voters")}:{" "}
                  {voteResult.voters
                    .map((voter) => seatNoLabel(voter.seatNo, t("centerInfo.seatSuffix")))
                    .join("，")}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </UiPanelFrame>
  );
}
