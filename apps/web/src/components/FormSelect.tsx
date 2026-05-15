import { useEffect, useRef, useState } from "react";

export interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  value: string;
  options: FormSelectOption[];
  onChange: (value: string) => void;
}

export function FormSelect({ value, options, onChange }: FormSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      {/* Trigger */}
      <button
        type="button"
        className="flex items-center justify-between w-full min-h-[50px] px-3.5 rounded-[9px] text-[#141722] text-base transition-colors"
        style={{
          border: `1px solid ${open ? "rgba(212,177,92,0.55)" : "rgba(223,189,103,0.28)"}`,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,242,247,0.98))",
          boxShadow: open ? "0 0 0 4px rgba(212,177,92,0.13)" : undefined,
        }}
        onClick={() => setOpen((c) => !c)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-left">{selected?.label ?? ""}</span>
        <span
          className="ml-3 flex-none"
          style={{
            width: 18,
            height: 18,
            color: open ? "#d4b15c" : "#4d556a",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 180ms ease, color 160ms ease",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <svg
            viewBox="0 0 16 16"
            focusable="false"
            style={{ display: "block", width: "100%", height: "100%" }}
          >
            <path
              d="M3.5 5.75 8 10.25l4.5-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {/* Dropdown */}
      <div
        className="absolute z-50 top-full left-0 right-0 mt-2 rounded-xl overflow-auto p-2 flex flex-col gap-1 origin-top"
        role="listbox"
        aria-hidden={!open}
        style={{
          maxHeight: "min(310px, 45vh)",
          border: "1px solid rgba(212,177,92,0.22)",
          background:
            "linear-gradient(180deg, rgba(36,38,51,0.96), rgba(22,24,35,0.98))",
          boxShadow:
            "0 20px 42px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.04)",
          backdropFilter: "blur(18px) saturate(1.08)",
          WebkitBackdropFilter: "blur(18px) saturate(1.08)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transform: open ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
          transition: "opacity 140ms ease, transform 180ms ease",
        }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              className="flex items-center gap-2.5 w-full min-h-[40px] rounded-[9px] px-3 text-left text-sm transition-colors hover:bg-white/[0.08]"
              style={
                active
                  ? {
                      background:
                        "linear-gradient(180deg, rgba(223,189,103,0.2), rgba(223,189,103,0.12))",
                      color: "#fff7dd",
                    }
                  : { color: "#eef2fb" }
              }
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span
                className="flex-none w-4 text-base font-black"
                style={{ color: "#f0c95a" }}
                aria-hidden
              >
                {active ? "✓" : ""}
              </span>
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
