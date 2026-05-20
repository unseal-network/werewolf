import type { HTMLAttributes, ReactNode } from "react";
import { GameButton } from "./GameButton";

export interface GameSegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface GameSegmentedControlProps<T extends string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> {
  value: T;
  options: GameSegmentedControlOption<T>[];
  onChange: (value: T) => void;
}

export function GameSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  ...rest
}: GameSegmentedControlProps<T>) {
  const classes = ["ww-segmented-control", className].filter(Boolean).join(" ");

  return (
    <div {...rest} className={classes} role={rest.role ?? "group"}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <GameButton
            key={option.value}
            className="ww-segmented-control__option"
            variant={selected ? "primary" : "secondary"}
            size="sm"
            label={option.label}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          />
        );
      })}
    </div>
  );
}
