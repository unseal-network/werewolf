interface MobileHeaderProps {
  onClose?: (() => void) | undefined;
  onMore?: (() => void) | undefined;
}

export function MobileHeader({ onClose, onMore }: MobileHeaderProps) {
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 1000,
        right: 16, // 稍微拉开一点右边距，更符合胶囊视觉
        top: "calc(var(--web-safe-area-top, 0px) + 8px)",
        height: 32,
        display: "flex",
        alignItems: "stretch",
        borderRadius: 16,
        // 关键：微弱的顶部高光边框，模拟毛玻璃边缘切面
        border: "1px solid rgba(255, 255, 255, 0.12)",
        // 关键：深邃的暗黑背板色，略带一点点高级夜空蓝/紫调
        background: "rgba(13, 11, 22, 0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        overflow: "hidden",
        // 精美的双层暗黑阴影：一层扩散阴影，一层环境光阴影
        boxShadow: "0 4px 16px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
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
              width: 40, // 优化比例，从 44 缩小到 40，让胶囊更紧凑
              border: 0,
              background: "transparent",
              color: "rgba(255, 255, 255, 0.85)", // 提升暗黑模式下的可读性
              cursor: "pointer",
              padding: 0,
              transition: "opacity 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {/* 替换原生符号为精致的 SVG 更多图标 */}
            <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          
          {/* 细腻的半透明分割线 */}
          <div
            style={{
              width: 1,
              background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)",
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
          width: onMore ? 36 : 40, // 优化单双按钮时的整体对称比例
          border: 0,
          background: "transparent",
          color: "rgba(255, 255, 255, 0.85)",
          cursor: "pointer",
          padding: 0,
          transition: "opacity 0.2s",
        }}
        aria-label="关闭"
        onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
        onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <svg
          viewBox="0 0 20 20"
          width={14} // 略微缩小关闭图标（15 -> 14），使整体视觉重心更稳
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2} // 稍微调整线条粗细，避免在暗色背景下显得过粗
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 5l10 10M15 5L5 16" />
        </svg>
      </button>
    </div>
  );
}