import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 250ms',
        }}
      />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        background: 'linear-gradient(180deg, #1a1040 0%, #0e0820 100%)',
        border: '1px solid rgba(139,92,246,0.3)',
        borderBottom: 'none',
        borderRadius: '24px 24px 0 0',
        padding: '0 0 env(safe-area-inset-bottom)',
        transform: open ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
        maxHeight: '75vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(139,92,246,0.4)' }} />
        </div>
        <div style={{
          textAlign: 'center', padding: '4px 0 16px',
          fontSize: 15, fontWeight: 700,
          color: '#e2e8f0', letterSpacing: '0.06em',
        }}>
          {title}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 24px' }}>
          {children}
        </div>
      </div>
    </>
  )
}
