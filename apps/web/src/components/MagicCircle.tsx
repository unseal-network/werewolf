import logoImg from '../assets/logo.jpeg'

export function MagicCircle({ isNight }: { isNight: boolean }) {
  const accent = isNight ? 'rgba(139,92,246,0.35)' : 'rgba(245,158,11,0.25)'
  const accentSolid = isNight ? '#8b5cf6' : '#f59e0b'
  return (
    <div style={{
      flex: 1, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', minHeight: 0,
    }}>
      <div style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', border: `1px solid ${accent}`, animation: 'magicSpin 24s linear infinite' }}>
        {['᛭','ᚠ','ᚢ','ᚦ','᛫','ᚱ','ᚲ','ᚷ'].map((r, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: `rotate(${i*45}deg) translateY(-108px) rotate(${-i*45}deg) translate(-50%,-50%)`,
            fontSize: 11, color: accent, lineHeight: 1,
          }}>{r}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', border: `1px dashed ${accent}`, animation: 'magicSpinReverse 16s linear infinite' }} />
      <div style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', border: `1px solid ${accent}`, animation: 'magicSpin 10s linear infinite' }} />
      <div style={{
        position: 'relative', zIndex: 2,
        width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
        border: `1px solid ${accent}`,
        boxShadow: `0 0 32px ${accentSolid}28`,
        opacity: 0.28, filter: 'saturate(0.6) brightness(0.9)',
      }}>
        <img src={logoImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
      </div>
    </div>
  )
}
