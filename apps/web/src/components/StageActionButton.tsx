import {
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GameButton } from "./GameButton";

export type StageActionButtonVariant = "primary" | "secondary";

export interface StageActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: ReactNode;
  variant?: StageActionButtonVariant;
  loading?: boolean;
  loadingLabel?: ReactNode;
}

export function StageActionButton({
  label,
  variant = "primary",
  loading = false,
  loadingLabel = "...",
  className,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...rest
}: StageActionButtonProps) {
  const [pressed, setPressed] = useState(false);

  function resetPressState() {
    setPressed(false);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!(disabled || loading)) {
      setPressed(true);
    }
    onPointerDown?.(event);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    resetPressState();
    onPointerUp?.(event);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    resetPressState();
    onPointerCancel?.(event);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLButtonElement>) {
    resetPressState();
    onPointerLeave?.(event);
  }

  return (
    <GameButton
      {...rest}
      className={className}
      variant={variant === "secondary" ? "secondary" : "primary"}
      aria-pressed={pressed || undefined}
      disabled={disabled || loading}
      label={label}
      loading={loading}
      loadingLabel={loadingLabel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    />
  );
}
