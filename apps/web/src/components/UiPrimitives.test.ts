import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameButton } from "./GameButton";
import { StageActionButton } from "./StageActionButton";
import { UiPanelFrame } from "./UiPanelFrame";

describe("new UI primitives", () => {
  it("renders panel chrome as real clipped pieces instead of pseudo background layers", () => {
    const html = renderToStaticMarkup(
      createElement(
        UiPanelFrame,
        { as: "section", className: "test-panel", tone: "bare", ornament: true },
        createElement("p", null, "Live vote")
      )
    );

    expect(html).toContain('class="ww-ui-panel');
    expect(html).toContain("ww-ui-panel__edge--top");
    expect(html).toContain("ww-ui-panel__edge--right");
    expect(html).toContain("ww-ui-panel__edge--bottom");
    expect(html).toContain("ww-ui-panel__edge--left");
    expect(html).toContain("ww-ui-panel__corner--tl");
    expect(html).toContain("ww-ui-panel__corner--tr");
    expect(html).toContain("ww-ui-panel__corner--bl");
    expect(html).toContain("ww-ui-panel__corner--br");
    expect(html).toContain("ww-ui-panel__ornament--top");
    expect(html).toContain("Live vote");
  });

  it("trims panel edges at the corner boundary", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );

    expect(css).toContain("--ww-panel-edge-overlap: 0px");
    expect(css).toContain("left: calc(var(--ww-panel-corner) - var(--ww-panel-edge-overlap))");
    expect(css).toContain("right: calc(var(--ww-panel-corner) - var(--ww-panel-edge-overlap))");
    expect(css).toContain("top: calc(var(--ww-panel-corner) - var(--ww-panel-edge-overlap))");
    expect(css).toContain("bottom: calc(var(--ww-panel-corner) - var(--ww-panel-edge-overlap))");
  });

  it("keeps framed modal content bounded inside the panel", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );

    expect(css).toContain("max-width: calc(100vw - 24px)");
    expect(css).toContain("max-height: calc(100dvh - 24px)");
    expect(css).toContain(".game-layout-root .ww-ui-panel__content");
    expect(css).toContain("overflow: hidden");
    expect(css).toContain(".game-layout-root .agent-picker.ww-ui-panel .agent-row");
    expect(css).toContain("grid-template-columns: 48px minmax(0, 1fr) 128px");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain(".agent-add-button.ww-game-button");
    expect(css).toContain("--ww-agent-add-size: 44px");
  });

  it("renders decision buttons with live text and verified 9-slice variants", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(GameButton, { label: "Start", variant: "primary" }),
        createElement(GameButton, { label: "Confirm", variant: "confirm" }),
        createElement(GameButton, { label: "Skip", variant: "secondary" })
      )
    );
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );

    expect(html).toContain("ww-game-button--primary");
    expect(html).toContain("ww-game-button--confirm");
    expect(html).toContain("ww-game-button--secondary");
    expect(html).toContain("ww-game-button__chrome");
    expect(html).toContain("ww-game-button__label");
    expect(html).toContain(">Start<");
    expect(css).toContain("submit-button-9slice.webp");
    expect(css).toContain("confirm-button-9slice.webp");
    expect(css).toContain("cancel-button-9slice.webp");
    expect(css).toContain(".game-layout-root .ww-game-button--primary");
    expect(css).toContain("color: #fff7d8");
    expect(css).toContain("background: transparent");
    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("--ww-button-chrome-image: url(\"/assets/werewolf-ui/final/button/decision/submit-button-9slice.webp\")");
    expect(css).toContain("--ww-button-chrome-image: url(\"/assets/werewolf-ui/final/button/decision/confirm-button-9slice.webp\")");
    expect(css).toContain("--ww-button-chrome-image: url(\"/assets/werewolf-ui/final/button/decision/cancel-button-9slice.webp\")");
    expect(css).toContain("--ww-button-chrome-slice: 76 168");
    expect(css).toContain("--ww-button-chrome-slice: 40 64");
    expect(css).toContain("border-image-source: var(--ww-button-chrome-image)");
    expect(css).toContain("border-image-slice: var(--ww-button-chrome-slice)");
    expect(css).toContain("background-image: none");
    expect(css).toContain("--ww-button-label-optical-y");
    expect(css).not.toContain("border-image-slice: 76 168 fill");
    expect(css).not.toContain("border-image-slice: 40 64 fill");
  });

  it("maps the room start action to the primary button skin", () => {
    const html = renderToStaticMarkup(
      createElement(StageActionButton, {
        className: "stage-start",
        label: "Start",
      })
    );

    expect(html).toContain("ww-game-button--primary");
    expect(html).not.toContain("ww-game-button--confirm");
  });

  it("removes legacy action button press overlays from the new button skins", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(css).toContain(".game-layout-root .action-region .stage-action-button::after");
    expect(css).toContain(".game-layout-root .action-region .player-picker-action::after");
    expect(css).toContain("content: none !important");
    expect(css).toContain("display: none !important");
    expect(css).toContain(".game-layout-root .action-region .stage-action-button.is-pressed");
    expect(css).not.toContain(".game-layout-root .action-region .stage-action-button__content");
    expect(css).not.toContain("--ww-button-content-offset-y");
    expect(css).not.toContain("line-height: 1 !important");
  });
});
