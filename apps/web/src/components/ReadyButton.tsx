interface ReadyButtonProps {
  ready: boolean
  loading?: boolean
  onClick: () => void
}

export function ReadyButton({ ready, loading, onClick }: ReadyButtonProps) {
  if (ready) {
    return (
      <button
        disabled
        style={{
          width: '100%', height: 56, borderRadius: 18,
          background: 'rgba(52,211,153,0.15)',
          border: '1px solid rgba(52,211,153,0.4)',
          color: '#6ee7b7', fontSize: 16, fontWeight: 800,
          letterSpacing: '0.08em', cursor: 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        ✓ 已准备
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: '100%', height: 56, borderRadius: 18,
        background: loading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #5b21b6, #7c3aed)',
        border: '1px solid rgba(255,209,102,0.4)',
        boxShadow: loading ? 'none' : '0 0 20px rgba(109,40,217,0.4)',
        color: '#ffd166', fontSize: 16, fontWeight: 800,
        letterSpacing: '0.08em', cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
      {loading ? (
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
          display: 'inline-block', animation: 'spin 0.7s linear infinite',
        }} />
      ) : '⚔️ 准备'}
    </button>
  )
}
