interface MobileHeaderProps {
  onClose: () => void;
  onMore?: () => void;
}

export function MobileHeader({ onClose, onMore }: MobileHeaderProps) {
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 1000,
        right: 12,
        top: "calc(var(--web-safe-area-top, 0px) + 6px)",
        height: 32,
        display: "flex",
        alignItems: "stretch",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(20,14,40,0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        overflow: "hidden",
      }}
    >
      {onMore && (
        <>
          <button
            onClick={onMore}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              border: 0,
              background: "transparent",
              color: "rgba(255,255,255,0.7)",
              fontSize: 16,
              letterSpacing: "0.08em",
              cursor: "pointer",
              padding: 0,
            }}
          >
            •••
          </button>
          <div
            style={{
              width: 1,
              background: "rgba(255,255,255,0.14)",
              alignSelf: "stretch",
              margin: "6px 0",
            }}
          />
        </>
      )}
      <button
        onClick={onClose}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: onMore ? 36 : 44,
          border: 0,
          background: "transparent",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          padding: 0,
        }}
        aria-label="关闭"
      >
        <svg
          viewBox="0 0 20 20"
          width={15}
          height={15}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        >
          <path d="M4 4l12 12M16 4L4 16" />
        </svg>
      </button>
    </div>
  );
}
