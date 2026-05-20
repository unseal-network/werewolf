import type { ButtonHTMLAttributes, ReactNode } from "react";

export type GameButtonVariant = "primary" | "confirm" | "secondary" | "danger";
export type GameButtonSize = "sm" | "md" | "lg";

const BUTTON_IMAGE: Record<GameButtonVariant, string> = {
  primary: "/assets/werewolf-ui/final/button/art/primary-button.png",
  confirm: "/assets/werewolf-ui/final/button/art/primary-button.png",
  secondary: "/assets/werewolf-ui/final/button/art/secondary-button.png",
  danger: "/assets/werewolf-ui/final/button/art/danger-button.png",
};

const BUTTON_STATE_IMAGE = {
  disabled: "/assets/werewolf-ui/final/button/art/disabled-button.png",
  loading: "/assets/werewolf-ui/final/button/art/loading-button.png",
  pressed: "/assets/werewolf-ui/final/button/art/pressed-button.png",
};

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
  const pressed = rest["aria-pressed"] === true || rest["aria-pressed"] === "true";
  const image = loading
    ? BUTTON_STATE_IMAGE.loading
    : disabled
      ? BUTTON_STATE_IMAGE.disabled
      : pressed
        ? BUTTON_STATE_IMAGE.pressed
        : BUTTON_IMAGE[variant];
  const classes = [
    "art-button",
    `art-button--${variant}`,
    `art-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      {...rest}
      className={classes}
      data-art-button-variant={variant}
      disabled={disabled || loading}
    >
      <img
        className="art-button__image"
        src={image}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="art-button__label">
        {loading ? loadingLabel : label}
      </span>
    </button>
  );
}
