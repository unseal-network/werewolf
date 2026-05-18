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
}: {
  errorMessage?: string;
  candidates?: AgentCandidate[];
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
        canStartNow: true,
        onAdd: async () => undefined,
        onRemove: async () => undefined,
        onRefresh: () => undefined,
        onStartNow: () => undefined,
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

    expect(html).toContain('<span class="ww-game-button__label">+</span>');
    expect(html).not.toContain("加入座位");
  });

  it("uses a compact minus label for removing an already seated agent", () => {
    const html = renderPicker({
      candidates: [{ ...agents[0]!, alreadyJoined: true }],
    });

    expect(html).toContain('<span class="ww-game-button__label">-</span>');
    expect(html).not.toContain("已入座");
  });
});
