import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-250"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-[24px] max-h-[75vh] border border-b-0 border-violet-500/30"
        style={{
          background: "linear-gradient(180deg, #1a1040 0%, #0e0820 100%)",
          padding: "0 0 env(safe-area-inset-bottom)",
          transform: open ? "translateY(0)" : "translateY(110%)",
          transition: "transform 300ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-violet-500/40" />
        </div>

        {/* Title */}
        <div className="text-center pb-4 text-[15px] font-bold text-slate-200 tracking-[0.06em]">
          {title}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 pb-6">
          {children}
        </div>
      </div>
    </>
  );
}
