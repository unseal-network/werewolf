interface MobileHeaderProps {
  onClose?: (() => void) | undefined;
  onMore?: (() => void) | undefined;
}

export function MobileHeader({ onClose, onMore }: MobileHeaderProps) {
  return (
    <div
      className="fixed z-[1000] right-4 h-8 flex items-stretch rounded-2xl border border-white/[0.12] bg-[rgba(13,11,22,0.75)] backdrop-blur-[20px] overflow-hidden shadow-[0_4px_16px_-1px_rgba(0,0,0,0.4),0_2px_4px_-1px_rgba(0,0,0,0.3)]"
      style={{ top: "calc(var(--web-safe-area-top, 0px) + 8px)" }}
    >
      {onMore && (
        <>
          <button
            onClick={onMore}
            className="flex items-center justify-center w-10 border-0 bg-transparent text-white/85 cursor-pointer p-0 transition-opacity hover:opacity-70"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>

          {/* 半透明分割线 */}
          <div className="w-px self-stretch my-1.5 bg-gradient-to-b from-white/0 via-white/[0.12] to-white/0" />
        </>
      )}

      <button
        onClick={onClose}
        className={`flex items-center justify-center border-0 bg-transparent text-white/85 cursor-pointer p-0 transition-opacity hover:opacity-70 ${onMore ? "w-9" : "w-10"}`}
        aria-label="关闭"
      >
        <svg
          viewBox="0 0 20 20"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 5l10 10M15 5L5 16" />
        </svg>
      </button>
    </div>
  );
}

