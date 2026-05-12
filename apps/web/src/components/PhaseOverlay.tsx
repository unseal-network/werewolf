import { PHASE_ICON, PHASE_LABEL } from '../constants/roles'

interface PhaseOverlayProps {
  phase: string | null
}

export function PhaseOverlay({ phase }: PhaseOverlayProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,4,26,0.9)', backdropFilter: 'blur(16px)',
      opacity: phase ? 1 : 0, pointerEvents: phase ? 'auto' : 'none',
      transition: 'opacity 400ms',
    }}>
      {phase && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 56 }}>{PHASE_ICON[phase] ?? '🌙'}</div>
          <div style={{
            fontSize: 22, fontWeight: 900, letterSpacing: '0.15em',
            background: 'linear-gradient(135deg, #ffd166, #c084fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {PHASE_LABEL[phase] ?? phase}
          </div>
        </div>
      )}
    </div>
  )
}
