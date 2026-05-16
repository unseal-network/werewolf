import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameEventDto, RoomPlayer } from "../api/client";
import { I18nProvider } from "../i18n/I18nProvider";
import { CenterInfoPanel } from "./CenterInfoPanel";

function player(overrides: Partial<RoomPlayer> & Pick<RoomPlayer, "id" | "displayName" | "seatNo">): RoomPlayer {
  const { id, displayName, seatNo, ...rest } = overrides;
  return {
    id,
    userId: `@${id}:local`,
    displayName,
    seatNo,
    kind: "user",
    ready: true,
    onlineState: "online",
    leftAt: null,
    ...rest,
  };
}

function event(overrides: Partial<GameEventDto> & Pick<GameEventDto, "type">): GameEventDto {
  return {
    id: `${overrides.type}-1`,
    gameRoomId: "room-1",
    seq: 1,
    visibility: "public",
    payload: {},
    createdAt: "2026-05-16T00:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof CenterInfoPanel>[0]> = {}): string {
  const defaults: Parameters<typeof CenterInfoPanel>[0] = {
    rawPhase: "day_speak",
    scene: "day",
    day: 2,
    players: [],
    events: [],
    currentSpeakerPlayerId: undefined,
  };
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(CenterInfoPanel, { ...defaults, ...props })
    )
  );
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("CenterInfoPanel", () => {
  it("keeps phase, day, and alive counts out of the center live panel", () => {
    const speaker = player({ id: "p1", displayName: "阿青", seatNo: 1 });
    const html = renderPanel({
      players: [speaker],
      events: [
        event({
          type: "speech_transcript_delta",
          actorId: speaker.id,
          payload: { text: "我觉得三号需要解释。" },
        }),
      ],
      currentSpeakerPlayerId: speaker.id,
    });

    expect(html).not.toContain("白天发言");
    expect(html).not.toContain("day_speak");
    expect(html).not.toContain("5/6");
    expect(html).not.toContain("存活");
    expect(html).toContain("实时字幕");
    expect(html).toContain("我觉得三号需要解释。");
  });

  it("labels agent speech as stream output and human speech as live captions", () => {
    const agent = player({
      id: "agent-1",
      agentId: "@agent:local",
      kind: "agent",
      displayName: "Agent 狼评",
      seatNo: 2,
    });
    const human = player({ id: "human-1", displayName: "真人玩家", seatNo: 3 });

    expect(
      renderPanel({
        players: [agent],
        events: [
          event({
            type: "speech_transcript_delta",
            actorId: agent.id,
            payload: { delta: "这轮我先看四号的票型。" },
          }),
        ],
        currentSpeakerPlayerId: agent.id,
      })
    ).toContain("Agent 输出");

    expect(
      renderPanel({
        players: [human],
        events: [
          event({
            type: "speech_transcript_delta",
            actorId: human.id,
            payload: { day: 2, phase: "day_speak", text: "我是好人，先不要归我。" },
          }),
        ],
        currentSpeakerPlayerId: human.id,
      })
    ).toContain("实时字幕");
  });

  it("shows only the current speech turn stream in the center panel", () => {
    const previousSpeaker = player({ id: "p1", displayName: "一号", seatNo: 1 });
    const currentSpeaker = player({ id: "p2", displayName: "二号", seatNo: 2 });
    const staleHtml = renderPanel({
      rawPhase: "day_speak",
      scene: "day",
      day: 2,
      players: [previousSpeaker, currentSpeaker],
      currentSpeakerPlayerId: currentSpeaker.id,
      events: [
        event({
          id: "previous-speaker-current-day",
          seq: 1,
          type: "speech_transcript_delta",
          actorId: previousSpeaker.id,
          payload: {
            day: 2,
            phase: "day_speak",
            text: "上一位发言人的字幕不应该留在中间栏。",
          },
        }),
        event({
          id: "current-speaker-old-day",
          seq: 2,
          type: "speech_transcript_delta",
          actorId: currentSpeaker.id,
          payload: {
            day: 1,
            phase: "day_speak",
            text: "昨天同一个人的旧字幕也不应该显示。",
          },
        }),
      ],
    });

    expect(staleHtml).toContain("暂无发言内容");
    expect(staleHtml).not.toContain("上一位发言人的字幕");
    expect(staleHtml).not.toContain("昨天同一个人的旧字幕");

    const liveHtml = renderPanel({
      rawPhase: "day_speak",
      scene: "day",
      day: 2,
      players: [previousSpeaker, currentSpeaker],
      currentSpeakerPlayerId: currentSpeaker.id,
      events: [
        event({
          id: "current-speaker-live",
          seq: 3,
          type: "speech_transcript_delta",
          actorId: currentSpeaker.id,
          payload: {
            day: 2,
            phase: "day_speak",
            text: "当前回合二号的实时字幕。",
          },
        }),
      ],
    });

    expect(liveHtml).toContain("当前回合二号的实时字幕。");
  });

  it("shows visible vote target and voter information during voting", () => {
    const players = Array.from({ length: 8 }, (_, index) =>
      player({
        id: `p${index + 1}`,
        displayName: `${index + 1}号玩家`,
        seatNo: index + 1,
      })
    );
    const [
      voterOne,
      voterTwo,
      voterThree,
      targetFour,
      voterFive,
      voterSix,
      voterSeven,
      targetEight,
    ] = players as [
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
    ];
    const html = renderPanel({
      rawPhase: "day_vote",
      scene: "vote",
      players,
      events: [
        ...[
          voterOne,
          voterTwo,
          voterThree,
          targetFour,
          voterSix,
          voterSeven,
        ].map((voter, index) =>
          event({
            id: `vote-eight-${index}`,
            seq: index + 1,
            type: "vote_submitted",
            actorId: voter.id,
            subjectId: targetEight.id,
            payload: { day: 2 },
          })
        ),
        event({
          id: "vote-four-1",
          seq: 10,
          type: "vote_submitted",
          actorId: voterFive.id,
          subjectId: targetFour.id,
          payload: { day: 2 },
        }),
        event({
          id: "vote-four-2",
          seq: 11,
          type: "vote_submitted",
          actorId: targetEight.id,
          subjectId: targetFour.id,
          payload: { day: 2 },
        }),
      ],
    });
    const text = visibleText(html);

    expect(text).toContain("被投人 8号");
    expect(text).toContain("1号，2号，3号，4号，6号，7号");
    expect(text).toContain("被投人 4号");
    expect(text).toContain("5号，8号");
    expect(text).not.toContain("投票人");
    expect(text).not.toMatch(/\d+\s*票/);
    expect(text).not.toContain("8号玩家");
    expect(text).not.toContain("5/6");
    expect(text).not.toContain("存活");
  });
});
