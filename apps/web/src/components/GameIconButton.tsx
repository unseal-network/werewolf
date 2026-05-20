import type { ButtonHTMLAttributes, ReactNode } from "react";

export type GameIconButtonSize = "sm" | "md" | "lg";

export interface GameIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: ReactNode;
  size?: GameIconButtonSize;
}

export function GameIconButton({
  label,
  size = "md",
  className,
  disabled,
  ...rest
}: GameIconButtonProps) {
  const classes = [
    "art-icon-button",
    `art-icon-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      {...rest}
      className={classes}
      disabled={disabled}
    >
      <span className="art-icon-button__label">{label}</span>
    </button>
  );
}
