import { createElement, type HTMLAttributes, type ReactNode } from "react";

type UiPanelElement = "div" | "section" | "article" | "aside";
type UiPanelTone = "bare" | "filled";
type UiPanelSize = "compact" | "medium" | "large";

export interface UiPanelFrameProps extends HTMLAttributes<HTMLElement> {
  as?: UiPanelElement;
  children?: ReactNode;
  tone?: UiPanelTone;
  size?: UiPanelSize;
  ornament?: boolean;
  contentClassName?: string;
}

const CORNERS = ["tl", "tr", "bl", "br"] as const;
const EDGES = ["top", "right", "bottom", "left"] as const;

export function UiPanelFrame({
  as = "div",
  children,
  className,
  contentClassName,
  tone = "bare",
  size = "medium",
  ornament = false,
  ...rest
}: UiPanelFrameProps) {
  const classes = [
    "ww-ui-panel",
    `ww-ui-panel--${tone}`,
    `ww-ui-panel--${size}`,
    ornament ? "ww-ui-panel--ornamented" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return createElement(
    as,
    {
      ...rest,
      className: classes,
      "data-ui-panel-tone": tone,
      "data-ui-panel-size": size,
    },
    <>
      <span className="ww-ui-panel__fill" aria-hidden="true" />
      {EDGES.map((edge) => (
        <span
          key={edge}
          className={`ww-ui-panel__edge ww-ui-panel__edge--${edge}`}
          aria-hidden="true"
        />
      ))}
      {CORNERS.map((corner) => (
        <span
          key={corner}
          className={`ww-ui-panel__corner ww-ui-panel__corner--${corner}`}
          aria-hidden="true"
        />
      ))}
      {ornament ? (
        <>
          <span
            className="ww-ui-panel__ornament ww-ui-panel__ornament--top"
            aria-hidden="true"
          />
          <span
            className="ww-ui-panel__ornament ww-ui-panel__ornament--bottom"
            aria-hidden="true"
          />
        </>
      ) : null}
      <div
        className={["ww-ui-panel__content", contentClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </>
  );
}
