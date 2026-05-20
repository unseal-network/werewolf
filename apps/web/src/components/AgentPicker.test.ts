import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentCandidate } from "../api/client";
import { I18nProvider } from "../i18n/I18nProvider";
import { AgentPicker } from "./AgentPicker";

const agents: AgentCandidate[] = [
  {
    userId: "@game-1:keepsecret.io",
    displayName: "game-1",
    userType: "bot",
    membership: "join",
    alreadyJoined: false,
  },
];

function renderPicker({
  errorMessage,
  candidates = agents,
  canStart = true,
  onFill,
}: {
  errorMessage?: string;
  candidates?: AgentCandidate[];
  canStart?: boolean;
  onFill?: (targetPlayerCount: number) => Promise<void>;
} = {}) {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(AgentPicker, {
        open: true,
        loading: false,
        agents: candidates,
        errorMessage,
        sourceRoomId: "!source:keepsecret.io",
        remainingSeats: 1,
        activePlayerCount: 5,
        targetPlayerCount: 6,
        canStartNow: true,
        onAdd: async () => undefined,
        onRemove: async () => undefined,
        ...(onFill ? { onFill } : {}),
        onRefresh: () => undefined,
        ...(canStart ? { onStartNow: () => undefined } : {}),
        onClose: () => undefined,
      })
    )
  );
}

describe("AgentPicker", () => {
  it("renders errors as a transient toast instead of an inline layout row", () => {
    const html = renderPicker({ errorMessage: "Game room not found" });

    expect(html).toContain("agent-picker-error-toast");
    expect(html).not.toContain("create-error");
    expect(html.indexOf("agent-picker-list")).toBeLessThan(
      html.indexOf("agent-picker-actions")
    );
  });

  it("uses a compact plus label for adding an agent to a seat", () => {
    const html = renderPicker();

    expect(html).toContain("agent-add-button");
    expect(html).toContain('<span class="art-icon-button__label">+</span>');
    expect(html).not.toContain("加入座位");
    expect(html).not.toContain("ww-game-button__label");
  });

  it("uses a compact minus label for removing an already seated agent", () => {
    const html = renderPicker({
      candidates: [{ ...agents[0]!, alreadyJoined: true }],
    });

    expect(html).toContain("agent-add-button added");
    expect(html).toContain('<span class="art-icon-button__label">-</span>');
    expect(html).not.toContain("已入座");
    expect(html).not.toContain("ww-game-button__label");
  });

  it("tells users to select an agent without showing the source room description", () => {
    const html = renderPicker();

    expect(html).toContain("选择 Agent 进入");
    expect(html).not.toContain("从源 Matrix 房间挑选 AI");
    expect(html).not.toContain("源房间 id");
    expect(html).not.toContain("!source:keepsecret.io");
  });

  it("hides start-now when the caller does not provide the start action", () => {
    const html = renderPicker({ canStart: false });

    expect(html).toContain("刷新列表");
    expect(html).not.toContain("立刻开始");
  });

  it("renders a target count control and one-click fill button when fill is available", () => {
    const html = renderPicker({ onFill: async () => undefined });

    expect(html).toContain("目标人数");
    expect(html).toContain('value="6"');
    expect(html).toContain("一键补齐");
  });
});
