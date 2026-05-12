interface AdminModalProps {
  onClose: () => void
  onHide: () => void
  onDisband: () => void
}

export function AdminModal({ onClose, onHide, onDisband }: AdminModalProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        }}
      />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', zIndex: 70,
        transform: 'translate(-50%, -50%)',
        background: 'linear-gradient(135deg, #1a1040, #0e0820)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 20, padding: '24px 20px',
        width: 280, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', textAlign: 'center', marginBottom: 4 }}>
          管理员操作
        </div>
        <button
          onClick={onHide}
          style={{
            padding: '12px', borderRadius: 14,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
          最小化游戏
        </button>
        <button
          onClick={onDisband}
          style={{
            padding: '12px', borderRadius: 14,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
          解散游戏
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '8px', background: 'transparent', border: 'none',
            color: 'rgba(148,163,184,0.5)', fontSize: 12, cursor: 'pointer',
          }}>
          取消
        </button>
      </div>
    </>
  )
}
