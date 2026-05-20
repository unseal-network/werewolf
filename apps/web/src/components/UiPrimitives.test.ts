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
    expect(css).toContain("grid-template-columns: 48px minmax(0, 1fr) auto");
    expect(css).toContain(".game-layout-root .agent-picker.ww-ui-panel .agent-add-button");
    expect(css).toContain("justify-self: end");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 96px))");
    expect(css).toContain("--art-button-width: 96px");
    expect(css).toContain("justify-content: center");
    expect(css).toContain("overflow-x: hidden");
    expect(css).not.toContain(".agent-add-button.ww-icon-button");
    expect(css).not.toContain("--ww-agent-add-size");
  });

  it("keeps compact agent add/remove glyphs centered by the shared icon button", () => {
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

    expect(html).toContain("art-icon-button");
    expect(html).toContain("agent-add-button");
    expect(html).toContain('<span class="art-icon-button__label">+</span>');
    expect(html).not.toContain("ww-icon-button__content");
    expect(css).not.toContain(".game-layout-root .ww-icon-button");
    expect(css).not.toContain("--ww-icon-button-size");
    expect(css).not.toContain(".game-layout-root .ww-icon-button__content");
  });

  it("renders decision buttons without generated visual skin classes", () => {
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

    expect(html).not.toContain("ww-game-button");
    expect(html).not.toContain("data-game-button-variant");
    expect(html).toContain(">Start<");
    expect(html).not.toContain("ww-game-button__chrome");
    expect(html).not.toContain("ww-game-button__content");
    expect(html).not.toContain("ww-game-button__label");
    expect(css).not.toContain(".game-layout-root .ww-game-button");
    expect(css).not.toContain("button/decision");
    expect(css).not.toContain("border-image-source: var(--ww-button-skin-image)");
  });

  it("renders reusable icon buttons with one shared icon style", () => {
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

    expect(html).not.toContain("ww-icon-button");
    expect(html).toContain(">+<");
    expect(html).not.toContain("ww-icon-button__content");
    expect(css).not.toContain(".game-layout-root .ww-icon-button");
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
    const actionCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(html).toContain("ww-segmented-control");
    expect(html).not.toContain("ww-game-button");
    expect(css).not.toContain(".game-layout-root .ww-segmented-control");
    expect(css).not.toContain(".ww-segmented-control__option");
    expect(css).not.toContain(".ww-segmented-control button.active");
    expect(actionCss).toContain(".game-layout-root .action-region .ww-segmented-control");
    expect(actionCss).toContain("grid-template-columns: repeat(2, minmax(0, calc(112px * var(--layout-action-scale, 1))))");
    expect(actionCss).toContain(".game-layout-root .action-region .ww-segmented-control__option");
    expect(actionCss).toContain("--art-button-width: calc(112px * var(--layout-action-scale, 1))");
  });

  it("does not add generated stage action classes", () => {
    const html = renderToStaticMarkup(
      createElement(StageActionButton, {
        className: "action-start",
        label: "Start",
      })
    );

    expect(html).toContain("art-button");
    expect(html).toContain("action-start");
    expect(html).toContain('<img class="art-button__image"');
    expect(html).toContain('<span class="art-button__label">Start</span>');
    expect(html).not.toContain("stage-action-button");
    expect(html).not.toContain("ww-game-button");
  });

  it("keeps caller layout classes only for primary stage actions", () => {
    const html = renderToStaticMarkup(
      createElement(StageActionButton, {
        className: "action-confirm player-picker-action",
        label: "确认查验",
        variant: "primary",
      })
    );

    expect(html).toContain("action-confirm player-picker-action");
    expect(html).toContain('<img class="art-button__image"');
    expect(html).not.toContain("ww-game-button");
  });

  it("keeps action containers visual-free without owning button skins", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(css).toContain(".game-layout-root .action-region .binary-action {");
    expect(css).toContain("background: transparent !important");
    expect(css).toContain("box-shadow: none !important");
    expect(css).toContain("backdrop-filter: none !important");
    expect(css).toContain(".game-layout-root .action-region .action-start");
    expect(css).toContain(".game-layout-root .action-region .player-picker-action");
    expect(css).toContain("pointer-events: none");
    expect(css).not.toContain("border-image-source: var(--ww-button-skin-image)");
    expect(css).not.toContain("border-image-slice: var(--ww-button-skin-slice) fill");
  });

  it("keeps action buttons positioned by the scene while skins stay in primitives", () => {
    const primitiveCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/ui-primitives.css"),
      "utf8"
    );
    const actionCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );
    const actionButtonCss = actionCss.slice(
      actionCss.indexOf(".game-layout-root .action-region .action-start")
    );
    expect(primitiveCss).not.toContain(".game-layout-root .ww-game-button");
    expect(primitiveCss).not.toContain(".game-layout-root .ww-icon-button");
    expect(actionButtonCss).toContain("--art-button-width: var(--action-button-width)");
    expect(actionButtonCss).toContain("max-width: 100%");
    expect(actionButtonCss).not.toContain("border-image-source");
    expect(actionButtonCss).not.toContain("background: none !important");
    const nonResetBackgroundLines = actionButtonCss
      .split("\n")
      .filter((line) => /\bbackground\s*:/.test(line))
      .filter((line) => !line.includes("background: none"))
      .filter((line) => !line.includes("background: transparent"))
      .filter((line) => !line.includes("var(--voice-frame-layer)"));

    expect(nonResetBackgroundLines).toEqual([]);
    expect(actionButtonCss).not.toContain("rgba(255, 255, 255");
    expect(actionButtonCss).not.toContain("backdrop-filter");
    expect(actionButtonCss).not.toContain("linear-gradient");
    expect(actionCss).toContain("--voice-fill-layer: transparent");
    expect(actionCss).toContain("--voice-active-fill-layer: transparent");
  });

  it("removes old stage button skins from legacy styles", () => {
    const legacyCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/legacy.css"),
      "utf8"
    );

    expect(legacyCss).not.toContain(".stage-confirm");
    expect(legacyCss).not.toContain(".stage-start");
    expect(legacyCss).not.toContain(".stage-skip");
    expect(legacyCss).not.toContain(".stage-action-button");
    expect(legacyCss).not.toContain("stage-button-spin");
    expect(legacyCss).not.toContain(".player-picker .player-picker-action");
  });

  it("keeps the lobby add-agent action as a small icon next to the main button", () => {
    const html = renderToStaticMarkup(
      createElement(GameIconButton, {
        className: "action-add-player",
        label: "+",
        size: "sm",
      })
    );
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(html).toContain("action-add-player");
    expect(html).toContain('<span class="art-icon-button__label">+</span>');
    expect(html).not.toContain("ww-game-button__label");
    expect(css).not.toContain(".stage-add-player .ww-game-button__label");
    expect(css).toContain(".game-layout-root .action-region .action-add-player");
    expect(css).toContain("--art-icon-button-size");
    expect(css).toContain("--action-primary-button-width: min(100%, calc(225px * var(--layout-action-scale, 1)))");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, var(--action-primary-button-width)) minmax(0, 1fr)");
    expect(css).toContain(".game-layout-root .action-region .lobby-action-row .action-start");
    expect(css).toContain("grid-column: 2");
    expect(css).toContain("grid-column: 3");
    expect(css).toContain("justify-self: start !important");
    expect(css).not.toContain(".game-layout-root .action-region .action-add-player {\n  --art-button-width");
    expect(css).not.toContain("transform: none !important");
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

  it("deletes legacy action button press overlays from the action region", () => {
    const css = readFileSync(
      resolve(process.cwd(), "apps/web/src/styles/game-room/components/action-region.css"),
      "utf8"
    );

    expect(css).not.toContain(".game-layout-root .action-region .stage-action-button::after");
    expect(css).not.toContain(".game-layout-root .action-region .player-picker-action::after");
    expect(css).not.toContain(".game-layout-root .action-region .stage-action-button.is-pressed");
    expect(css).not.toContain(".game-layout-root .action-region .stage-action-button__content");
    expect(css).not.toContain("--ww-button-content-offset-y");
    expect(css).not.toContain("line-height: 1 !important");
  });
});
