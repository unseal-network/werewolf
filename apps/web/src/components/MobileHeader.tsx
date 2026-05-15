/**
 * MobileHeader
 * 仅在移动端（co.isMobile）使用的悬浮胶囊按钮。
 * fixed 定位，始终显示在右上角；
 * top = var(--web-safe-area-top)，垂直居中于 44px 导航区域内。
 * 右上角为小程序风格胶囊按钮：[•••  ✕]
 */

interface MobileHeaderProps {
  /** 点击关闭（✕）回调 */
  onClose?: (() => void) | undefined
  /** 点击更多（···）回调，不传则隐藏更多按钮 */
  onMore?: (() => void) | undefined
}

export function MobileHeader({ onClose, onMore }: MobileHeaderProps) {
  return (
    <div style={{
      position: 'fixed',
      zIndex: 1000,
      right: 12,
      // 胶囊高度 32px，在 44px 区域内垂直居中：offset = (44 - 32) / 2 = 6px
      top: 'calc(var(--web-safe-area-top) + 6px)',
      height: 32,
      display: 'flex',
      alignItems: 'stretch',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(20,14,40,0.72)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      overflow: 'hidden',
    }}>
      {/* 更多按钮 */}
      {onMore && (
        <>
          <button
            onClick={onMore}
            style={{
              width: 40, height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none',
              cursor: 'pointer',
              color: 'rgba(226,232,240,0.85)',
              padding: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="更多"
          >
            <svg width="18" height="4" viewBox="0 0 18 4" fill="none">
              <circle cx="2"  cy="2" r="1.6" fill="currentColor"/>
              <circle cx="9"  cy="2" r="1.6" fill="currentColor"/>
              <circle cx="16" cy="2" r="1.6" fill="currentColor"/>
            </svg>
          </button>
          {/* 分割线 */}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
        </>
      )}

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        style={{
          width: onMore ? 40 : 48, height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none',
          cursor: 'pointer',
          color: 'rgba(226,232,240,0.85)',
          padding: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
        aria-label="关闭"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
