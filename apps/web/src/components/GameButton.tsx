import type { ButtonHTMLAttributes, ReactNode } from "react";
import { GAME_BUTTON_ASSET_URLS, preloadGameAssetUrls } from "../game/preloadAssets";

export type GameButtonVariant = "primary" | "confirm" | "secondary" | "danger";
export type GameButtonSize = "sm" | "md" | "lg";

const assetBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets/werewolf-ui/final/button/art`;

const BUTTON_IMAGE: Record<GameButtonVariant, string> = {
  primary: `${assetBase}/primary-button.png`,
  confirm: `${assetBase}/primary-button.png`,
  secondary: `${assetBase}/secondary-button.png`,
  danger: `${assetBase}/danger-button.png`,
};

const BUTTON_STATE_IMAGE = {
  disabled: `${assetBase}/disabled-button.png`,
  loading: `${assetBase}/loading-button.png`,
  pressed: `${assetBase}/pressed-button.png`,
};

let buttonArtPreloaded = false;

export function preloadGameButtonArt() {
  if (buttonArtPreloaded) return;
  buttonArtPreloaded = true;
  void preloadGameAssetUrls(GAME_BUTTON_ASSET_URLS);
}

preloadGameButtonArt();

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
