import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameButton } from "./GameButton";
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
    expect(html).toContain(">Start<");
    expect(css).toContain("submit-button-9slice.png");
    expect(css).toContain("confirm-button-9slice.png");
    expect(css).toContain("cancel-button-9slice.png");
    expect(css).toContain("border-image-slice: 76 168 fill");
    expect(css).toContain("border-image-slice: 40 64 fill");
  });
});
