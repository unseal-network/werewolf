import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useT } from "../i18n/I18nProvider";

interface GameEventLike {
  id: string;
  seq: number;
  type: string;
  actorId?: string;
  subjectId?: string;
  visibility: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface TimelinePlayerLike {
  id: string;
  displayName: string;
  seatNo: number;
}

interface TimelineCapsuleProps {
  enabled: boolean;
  events: GameEventLike[];
  players?: TimelinePlayerLike[];
  myPlayerId?: string | undefined;
  revealAll?: boolean;
}

function isVisibleEvent(
  event: GameEventLike,
  myPlayerId?: string,
  revealAll = false
): boolean {
  if (event.visibility === "runtime") return false;
  if (revealAll) return true;
  if (event.type === "game_ended") return true;
  if (event.type === "night_action_submitted") {
    return event.actorId === myPlayerId;
  }
  if (event.type === "seer_result_revealed") {
    return event.visibility === `private:user:${myPlayerId}`;
  }
  if (event.type === "witch_kill_revealed") {
    return event.visibility === `private:user:${myPlayerId}`;
  }
  if (event.visibility === "public") return true;
  if (event.visibility.startsWith("private:user:")) {
    return event.visibility === `private:user:${myPlayerId}`;
  }
  if (event.visibility.startsWith("private:team:")) {
    return true; // team private events are already filtered by backend
  }
  return false;
}

function formatEventWith(
  t: (key: string, params?: Record<string, string | number>) => string,
  playerLabel: (id: string | undefined) => string
) {
  return (event: GameEventLike): { typeKey: string; text: string } => {
    if (event.type === "phase_started") {
      return {
        typeKey: "phase",
        text: t("timeline.evt.phaseChanged", {
          phase: String(event.payload.phase ?? ""),
        }),
      };
    }
    if (event.type === "turn_started") {
      return {
        typeKey: "phase",
        text: t("timeline.evt.turnStarted", {
          subject: playerLabel(event.subjectId),
        }),
      };
    }
    if (event.type === "speech_submitted") {
      return {
        typeKey: "speech",
        text: t("timeline.evt.speech", {
          speech: String(event.payload.speech ?? ""),
        }),
      };
    }
    if (event.type === "speech_transcript_delta") {
      return {
        typeKey: "speech",
        text: t("timeline.evt.transcript", {
          actor: playerLabel(event.actorId),
          text: String(event.payload.text ?? ""),
        }),
      };
    }
    if (event.type === "vote_submitted") {
      return {
        typeKey: "vote",
        text: t("timeline.evt.vote", {
          actor: playerLabel(event.actorId),
          subject: playerLabel(event.subjectId),
        }),
      };
    }
    if (event.type === "wolf_vote_submitted") {
      return {
        typeKey: "vote",
        text: t("timeline.evt.wolfVote", {
          actor: playerLabel(event.actorId),
          subject: playerLabel(event.subjectId),
        }),
      };
    }
    if (event.type === "wolf_vote_resolved") {
      const target = String(event.payload?.targetPlayerId ?? "");
      return {
        typeKey: "vote",
        text: target
          ? t("timeline.evt.wolfVoteResolved", { target: playerLabel(target) })
          : t("timeline.evt.wolfVoteTied"),
      };
    }
    if (event.type === "night_action_submitted") {
      const action = (event.payload?.action ?? {}) as {
        kind?: string;
        targetPlayerId?: string;
      };
      const target = playerLabel(action.targetPlayerId ?? event.subjectId);
      switch (action.kind) {
        case "guardProtect":
          return { typeKey: "action", text: t("timeline.evt.guardProtect", { target }) };
        case "witchHeal":
          return { typeKey: "action", text: t("timeline.evt.witchHeal", { target }) };
        case "witchPoison":
          return { typeKey: "action", text: t("timeline.evt.witchPoison", { target }) };
        case "seerInspect":
          return { typeKey: "action", text: t("timeline.evt.seerInspect", { target }) };
        case "wolfKill":
          return { typeKey: "action", text: t("timeline.evt.wolfKill", { target }) };
        default:
          return {
            typeKey: "action",
            text: t("timeline.evt.nightAction", { actor: playerLabel(event.actorId) }),
          };
      }
    }
    if (event.type === "seer_result_revealed") {
      const target = playerLabel(event.subjectId);
      const alignment = String(
        event.payload?.alignment ?? event.payload?.team ?? event.payload?.role ?? ""
      );
      const alignmentKey =
        alignment === "wolf"
          ? "timeline.alignment.wolf"
          : alignment === "good"
            ? "timeline.alignment.good"
            : "";
      const alignmentText = alignmentKey ? t(alignmentKey) : alignment;
      return {
        typeKey: "action",
        text: t("timeline.evt.seerResult", {
          target,
          team: alignmentText,
        }),
      };
    }
    if (event.type === "witch_kill_revealed") {
      const target = playerLabel(event.subjectId);
      return {
        typeKey: "action",
        text: t("timeline.evt.witchKillRevealed", { target }),
      };
    }
    if (event.type === "night_resolved") {
      return { typeKey: "system", text: t("timeline.evt.nightResolved") };
    }
    if (event.type === "player_eliminated") {
      return {
        typeKey: "system",
        text: t("timeline.evt.eliminated", {
          subject: playerLabel(event.subjectId),
        }),
      };
    }
    if (event.type === "player_seat_changed") {
      const fromSeat = String(event.payload?.fromSeatNo ?? "?");
      const toSeat = String(event.payload?.toSeatNo ?? "?");
      const movedName = String(event.payload?.movedDisplayName ?? "");
      const displacedName = String(event.payload?.displacedDisplayName ?? "");
      if (displacedName) {
        return {
          typeKey: "system",
          text: t("timeline.evt.seatSwapped", {
            moved: movedName,
            fromSeat,
            toSeat,
            displaced: displacedName,
          }),
        };
      }
      return {
        typeKey: "system",
        text: t("timeline.evt.seatMoved", {
          moved: movedName,
          fromSeat,
          toSeat,
        }),
      };
    }
    if (event.type === "player_removed") {
      return {
        typeKey: "system",
        text: t("timeline.evt.playerRemoved", {
          name: String(event.payload?.displayName ?? playerLabel(event.actorId)),
          seat: String(event.payload?.seatNo ?? "?"),
        }),
      };
    }
    if (event.type === "game_ended") {
      return { typeKey: "system", text: t("timeline.evt.gameEnded") };
    }
    return { typeKey: "system", text: event.type };
  };
}

export function TimelineCapsule({
  enabled,
  events,
  players,
  myPlayerId,
  revealAll,
}: TimelineCapsuleProps) {
  const t = useT();
  const playerLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players ?? []) {
      map.set(p.id, `${p.seatNo}号 ${p.displayName}`);
    }
    return (id: string | undefined) => {
      if (!id) return "";
      return map.get(id) ?? id;
    };
  }, [players]);
  const formatEvent = useMemo(
    () => formatEventWith(t, playerLabel),
    [t, playerLabel]
  );
  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => isVisibleEvent(e, myPlayerId, Boolean(revealAll)))
        .slice(-120)
        .reverse(),
    [events, myPlayerId, revealAll]
  );

  const groupedEvents = useMemo(() => {
    const groups: { phase?: string; day?: number; events: typeof visibleEvents }[] = [];
    let currentGroup: typeof groups[number] | null = null;
    for (const event of visibleEvents) {
      if (event.type === "phase_started") {
        const phase = String(event.payload.phase ?? "");
        const day = Number(event.payload.day ?? 1);
        currentGroup = { phase, day, events: [event] };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.events.push(event);
      } else {
        currentGroup = { events: [event] };
        groups.push(currentGroup);
      }
    }
    return groups;
  }, [visibleEvents]);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className={`log-peek ${open ? "is-hidden" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={t("timeline.capsule")}
      >
        {t("timeline.title")}
      </button>

      <div
        className={`sheet-backdrop timeline-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
      />
      <section className={`log-sheet ${open ? "open" : ""}`}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{t("timeline.title")}</div>
            <div className="sheet-sub">{t("timeline.sub")}</div>
          </div>
          <button
            type="button"
            className="sheet-close"
            onClick={() => setOpen(false)}
            aria-label={t("user.close")}
          >
            ×
          </button>
        </div>
        <div className="log-grid">
          {visibleEvents.length === 0 ? (
            <div className="log-empty">{t("timeline.empty")}</div>
          ) : (
            groupedEvents.map((group, groupIndex) => (
              <div key={groupIndex}>
                {group.phase ? (
                  <div className="log-phase-header">
                    {String(group.phase ?? "")} {group.day ? `· Day ${group.day}` : ""}
                  </div>
                ) : null}
                {group.events.map((event) => {
                  const formatted = formatEvent(event);
                  const isExpanded = expandedIds.has(event.id);
                  return (
                    <div
                      className={`log-row ${isExpanded ? "is-expanded" : ""}`}
                      key={event.id}
                      onClick={() => toggleExpand(event.id)}
                    >
                      <div className={`log-type ${formatted.typeKey}`}>{t(`timeline.tag.${formatted.typeKey}`)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="log-text">{formatted.text}</div>
                        {isExpanded ? (
                          <div className="log-meta">
                            #{event.seq} · {event.actorId ? `${event.actorId} · ` : ""}
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </div>
                        ) : null}
                      </div>
                      <div className="log-time">#{event.seq}</div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
