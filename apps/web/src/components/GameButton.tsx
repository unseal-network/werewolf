import type { ButtonHTMLAttributes, ReactNode } from "react";

export type GameButtonVariant = "primary" | "confirm" | "secondary";
export type GameButtonSize = "sm" | "md" | "lg";

export interface GameButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: ReactNode;
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  loading?: boolean;
  loadingLabel?: ReactNode;
}

export function GameButton({
  label,
  variant = "confirm",
  size = "md",
  loading = false,
  loadingLabel = "...",
  className,
  disabled,
  ...rest
}: GameButtonProps) {
  const classes = [
    "relative",
    "ww-game-button",
    `ww-game-button--${variant}`,
    `ww-game-button--${size}`,
    loading ? "is-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      {...rest}
      className={classes}
      data-game-button-variant={variant}
      data-game-button-size={size}
      data-loading={loading ? "true" : "false"}
      disabled={disabled || loading}
    >
      <span className="ww-game-button__chrome" aria-hidden="true" />
      <span className="absolute z-4 left-0 right-0 top-2 bottom-0 flex items-center justify-center">
        {loading ? (
          <span className="ww-game-button__label">
            <span className="ww-game-button__spinner" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </span>
        ) : (
          <span className="ww-game-button__label">{label}</span>
        )}
      </span>
    </button>
  );
}
