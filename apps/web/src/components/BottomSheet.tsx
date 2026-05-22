import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const base      = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}`;
const assetBase = `${base}assets/werewolf-ui/final`;
const bgDay     = `${base}assets/animation-demo/village-stage-day.avif`;

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-250"
        style={{
          background: "rgba(4,3,8,0.72)",
          backdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-[22px] overflow-hidden max-h-[78vh]"
        style={{
          border: "1px solid rgba(207,176,91,0.24)",
          borderBottom: "none",
          transform: open ? "translateY(0)" : "translateY(110%)",
          transition: "transform 320ms cubic-bezier(0.32,0.72,0,1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* ── Background layers ─────────────────────────── */}
        {/* Layer 1: village image */}
        <img
          src={bgDay}
          className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none select-none"
          style={{ opacity: 0.10, filter: "saturate(0.50) brightness(0.60)" }}
          aria-hidden
        />
        {/* Layer 2: dark base */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(20,15,6,0.96) 0%, rgba(10,8,4,0.98) 100%)" }}
        />

        {/* ── Top edge art ──────────────────────────────── */}
        <div
          className="relative z-10 w-full shrink-0 pointer-events-none"
          style={{
            height: 10,
            backgroundImage: `url("${assetBase}/panel-9slice/edge-top.webp")`,
            backgroundSize: "100% 10px",
            backgroundRepeat: "repeat-x",
            opacity: 0.65,
          }}
          aria-hidden
        />

        {/* ── Drag handle ───────────────────────────────── */}
        <div className="relative z-10 flex justify-center pt-2.5 pb-1 shrink-0">
          <div
            className="w-9 h-1 rounded-full"
            style={{ background: "rgba(207,176,91,0.40)" }}
          />
        </div>

        {/* ── Title ─────────────────────────────────────── */}
        <div
          className="relative z-10 text-center pt-1 pb-3 shrink-0"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#fff7d8",
            letterSpacing: "0.08em",
            textShadow: "0 2px 8px rgba(0,0,0,0.70)",
          }}
        >
          {title}
        </div>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="relative z-10 flex justify-center shrink-0 pb-4">
          <img
            src={`${assetBase}/panel-9slice/divider.webp`}
            style={{ width: "70%", maxWidth: 260, opacity: 0.45 }}
            aria-hidden
          />
        </div>

        {/* ── Content ───────────────────────────────────── */}
        <div className="relative z-10 flex-1 overflow-auto px-5 pb-6">
          {children}
        </div>

        {/* ── Bottom edge art ───────────────────────────── */}
        <div
          className="relative z-10 w-full shrink-0 pointer-events-none"
          style={{
            height: 10,
            backgroundImage: `url("${assetBase}/panel-9slice/edge-bottom.webp")`,
            backgroundSize: "100% 10px",
            backgroundRepeat: "repeat-x",
            opacity: 0.55,
          }}
          aria-hidden
        />
      </div>
    </>
  );
}
