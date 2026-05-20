import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameButton } from "./GameButton";
import { GameIconButton } from "./GameIconButton";
import { GameSegmentedControl } from "./GameSegmentedControl";
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
    expect(css).not.toContain(".agent-add-button.ww-icon-button");
    expect(css).not.toContain("--ww-agent-add-size");
  });

  it("keeps compact agent add/remove glyphs as direct button text", () => {
    const html = renderToStaticMarkup(
      createElement(GameIconButton, {
        label: "+",
        "aria-label": "add",
        className: "agent-add-button",
        size: "lg",
      })
    );
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );

    expect(html).toContain("ww-icon-button");
    expect(html).toContain("ww-icon-button--lg");
    expect(html).toContain(">+</button>");
    expect(html).not.toContain("ww-icon-button__content");
    expect(css).not.toContain(".game-layout-root .ww-icon-button");
    expect(css).not.toContain(".game-layout-root .ww-icon-button__content");
  });

  it("renders decision buttons as unstyled semantic buttons with live text", () => {
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
    expect(html).toContain('data-game-button-variant="primary"');
    expect(html).toContain('data-game-button-variant="confirm"');
    expect(html).toContain('data-game-button-variant="secondary"');
    expect(html).toContain(">Start<");
    expect(html).not.toContain("ww-game-button__chrome");
    expect(html).not.toContain("ww-game-button__content");
    expect(html).not.toContain("ww-game-button__label");
    expect(css).not.toContain("submit-button-9slice.webp");
    expect(css).not.toContain("confirm-button-9slice.webp");
    expect(css).not.toContain("cancel-button-9slice.webp");
    expect(css).not.toContain(".game-layout-root .ww-game-button");
    expect(css).not.toContain("--ww-button-chrome");
    expect(css).not.toContain("border-image-source");
  });

  it("renders reusable icon buttons without shared visual chrome", () => {
    const html = renderToStaticMarkup(
      createElement(GameIconButton, {
        label: "+",
        "aria-label": "add",
        className: "agent-add-button",
        size: "lg",
      })
    );
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );

    expect(html).toContain("ww-icon-button");
    expect(html).toContain("ww-icon-button--lg");
    expect(html).toContain(">+<");
    expect(html).not.toContain("ww-icon-button__content");
    expect(css).not.toContain(".game-layout-root .ww-icon-button");
    expect(css).not.toContain("--ww-icon-button-size");
  });

  it("renders segmented controls from unstyled button primitives", () => {
    const html = renderToStaticMarkup(
      createElement(GameSegmentedControl, {
        "aria-label": "wolf-actions",
        value: "target",
        options: [
          { value: "target", label: "选择玩家" },
          { value: "speech", label: "发言" },
        ],
        onChange: () => undefined,
      })
    );
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );

    expect(html).toContain("ww-segmented-control");
    expect(html).toContain("ww-game-button--primary");
    expect(html).toContain("ww-game-button--secondary");
    expect(css).not.toContain(".game-layout-root .ww-segmented-control");
    expect(css).not.toContain(".ww-segmented-control__option");
    expect(css).not.toContain(".ww-segmented-control button.active");
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

  it("maps primary stage actions to the shared primary button skin", () => {
    const html = renderToStaticMarkup(
      createElement(StageActionButton, {
        className: "stage-confirm player-picker-action",
        label: "确认查验",
        variant: "primary",
      })
    );

    expect(html).toContain("ww-game-button--primary");
    expect(html).not.toContain("ww-game-button--confirm");
  });

  it("removes legacy action container and picker button backgrounds", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(css).toContain(".game-layout-root .action-region .binary-action {");
    expect(css).toContain("background: transparent !important");
    expect(css).toContain("box-shadow: none !important");
    expect(css).toContain("backdrop-filter: none !important");
    expect(css).toContain(".game-layout-root .action-region .stage-start");
    expect(css).toContain(".game-layout-root .action-region .player-picker-action");
    expect(css).toContain("padding: 0 !important");
    expect(css).toContain("border: 0 !important");
    expect(css).toContain("background: none !important");
    expect(css).toContain("background-image: none !important");
  });

  it("keeps action buttons positioned by the scene while clearing visual styles", () => {
    const primitiveCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );
    const actionCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );
    const actionButtonCss = actionCss.slice(
      actionCss.indexOf(".game-layout-root .action-region .stage-start")
    );
    expect(primitiveCss).not.toContain(".game-layout-root .ww-game-button");
    expect(primitiveCss).not.toContain(".game-layout-root .ww-icon-button");
    expect(actionButtonCss).toContain("width: var(--action-button-width) !important");
    expect(actionButtonCss).toContain("max-width: var(--action-button-width) !important");
    expect(actionButtonCss).toContain("background: none !important");
    expect(actionButtonCss).toContain("background-image: none !important");
    expect(actionButtonCss).toContain("box-shadow: none !important");
    const nonResetBackgroundLines = actionButtonCss
      .split("\n")
      .filter((line) => /\bbackground\s*:/.test(line))
      .filter((line) => !line.includes("background: none"))
      .filter((line) => !line.includes("background: transparent"));

    expect(nonResetBackgroundLines).toEqual([]);
    expect(actionButtonCss).not.toContain("rgba(255, 255, 255");
    expect(actionButtonCss).not.toContain("backdrop-filter");
    expect(actionButtonCss).not.toContain("linear-gradient");
    expect(actionCss).toContain("--voice-fill-layer: transparent");
    expect(actionCss).toContain("--voice-active-fill-layer: transparent");
  });

  it("centers the lobby add-agent glyph inside its short stage button", () => {
    const html = renderToStaticMarkup(
      createElement(StageActionButton, {
        className: "stage-skip stage-add-player",
        label: "+",
        variant: "secondary",
      })
    );
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(html).toContain("stage-add-player");
    expect(html).toContain(">+</button>");
    expect(html).not.toContain("ww-game-button__label");
    expect(css).not.toContain(".stage-add-player .ww-game-button__label");
    expect(css).toContain(".game-layout-root .action-region .stage-skip");
    expect(css).toContain("width: var(--action-secondary-button-width) !important");
    expect(css).toContain("transform: none !important");
  });

  it("routes one-glyph chrome buttons through GameIconButton", () => {
    const files = [
      "apps/web/src/components/AgentPicker.tsx",
      "apps/web/src/components/GameRoomShell.tsx",
      "apps/web/src/components/SeerResultDialog.tsx",
      "apps/web/src/components/TimelineCapsule.tsx",
      "apps/web/src/components/UserInfoPanel.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));

    for (const source of files) {
      expect(source).toContain("GameIconButton");
    }
    expect(files.join("\n")).not.toMatch(/<button[\s\S]{0,160}className="profile-close"/);
    expect(files.join("\n")).not.toMatch(/<button[\s\S]{0,160}className="seer-result-close"/);
    expect(files.join("\n")).not.toMatch(/<button[\s\S]{0,160}className="sheet-close"/);
    expect(files.join("\n")).not.toMatch(/<button[\s\S]{0,160}className="hud-back-button"/);
  });

  it("routes wolf mode switching through GameSegmentedControl", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/web/src/components/CenterStage.tsx"),
      "utf8"
    );

    expect(source).toContain("GameSegmentedControl");
    expect(source).not.toContain('className="action-mode-switch"');
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
