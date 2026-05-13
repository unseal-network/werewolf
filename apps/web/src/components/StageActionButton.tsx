import {
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

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
  const resolvedClassName = useMemo(
    () =>
      [
        className,
        "stage-action-button",
        `stage-action-button--${variant}`,
        pressed ? "is-pressed" : "",
        loading ? "is-loading" : "",
      ]
        .filter(Boolean)
        .join(" "),
    [className, loading, pressed, variant]
  );

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
    <button
      type="button"
      {...rest}
      className={resolvedClassName}
      data-variant={variant}
      data-loading={loading ? "true" : "false"}
      disabled={disabled || loading}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
      <span className="stage-action-button__content">
        {loading ? (
          <>
            <span className="stage-action-button__spinner" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </>
        ) : (
          label
        )}
      </span>
    </button>
  );
}
