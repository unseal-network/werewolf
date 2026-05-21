import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("renders live speech updates directly instead of replaying them with a typewriter loop", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/CenterInfoPanel.tsx"),
      "utf8"
    );

    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("current.length + 1");
  });

  it("keeps phase, day, and alive counts out of the center live panel", () => {
    const speaker = player({ id: "p1", displayName: "阿青", seatNo: 1 });
    const html = renderPanel({
      players: [speaker],
      events: [
        event({
          type: "stream",
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

  it("labels agent and human speech with the same live captions heading", () => {
    const agent = player({
      id: "agent-1",
      agentId: "@agent:local",
      kind: "agent",
      displayName: "Agent 狼评",
      seatNo: 2,
    });
    const human = player({ id: "human-1", displayName: "真人玩家", seatNo: 3 });

    const agentHtml = renderPanel({
      players: [agent],
      events: [
        event({
          type: "stream",
          actorId: agent.id,
          payload: { delta: "这轮我先看四号的票型。" },
        }),
      ],
      currentSpeakerPlayerId: agent.id,
    });

    const humanHtml = renderPanel({
      players: [human],
      events: [
        event({
          type: "stream",
          actorId: human.id,
          payload: { day: 2, phase: "day_speak", text: "我是好人，先不要归我。" },
        }),
      ],
      currentSpeakerPlayerId: human.id,
    });

    expect(agentHtml).toContain("实时字幕");
    expect(agentHtml).not.toContain("Agent 输出");
    expect(humanHtml).toContain("实时字幕");
    expect(humanHtml).not.toContain("Agent 输出");
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
          type: "stream",
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
          type: "stream",
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
          type: "stream",
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

  it("shows the exiled player during day resolution after voting closes", () => {
    const players = Array.from({ length: 4 }, (_, index) =>
      player({
        id: `p${index + 1}`,
        displayName: `${index + 1}号玩家`,
        seatNo: index + 1,
      })
    );
    const [voterOne, voterTwo, exiled, voterFour] = players as [
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
      RoomPlayer,
    ];
    const html = renderPanel({
      rawPhase: "day_resolution",
      scene: "day",
      day: 2,
      players,
      events: [
        event({
          id: "vote-exiled-1",
          seq: 1,
          type: "vote_submitted",
          actorId: voterOne.id,
          subjectId: exiled.id,
          payload: { day: 2 },
        }),
        event({
          id: "vote-exiled-2",
          seq: 2,
          type: "vote_submitted",
          actorId: voterTwo.id,
          subjectId: exiled.id,
          payload: { day: 2 },
        }),
        event({
          id: "vote-other",
          seq: 3,
          type: "vote_submitted",
          actorId: exiled.id,
          subjectId: voterFour.id,
          payload: { day: 2 },
        }),
        event({
          id: "day-vote-closed",
          seq: 4,
          type: "phase_closed",
          actorId: "runtime",
          payload: {
            phase: "day_vote",
            day: 2,
            tally: { [exiled.id]: 2, [voterFour.id]: 1 },
            exiledPlayerId: exiled.id,
            tiedPlayerIds: [],
            nextPhase: "day_resolution",
          },
        }),
        event({
          id: "exiled",
          seq: 5,
          type: "player_eliminated",
          actorId: "runtime",
          subjectId: exiled.id,
          payload: { playerId: exiled.id, reason: "vote" },
        }),
      ],
    });
    const text = visibleText(html);

    expect(text).toContain("投票结果");
    expect(html).toContain('class="center-mini-avatar"');
    expect(html).toContain('class="center-vote-result-text"');
    expect(text).toContain("3号 3号玩家");
    expect(text).toContain("被放逐");
    expect(text).toContain("2 票出局");
    expect(text).toContain("投票人: 1号，2号");
    expect(text).not.toContain("等待玩家投票");
  });

  it("keeps vote result text styling scoped away from the mini avatar", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/center-info.css"),
      "utf8"
    );

    expect(css).toContain(".center-vote-result-player .center-vote-result-text span");
    expect(css).not.toContain(".center-vote-result-player span {");
  });
});
