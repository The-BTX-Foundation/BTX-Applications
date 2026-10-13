// The progress ring: a grey track with a coloured arc for how far along, and the "5/13" style label in the middle.
// size 44 is the laptop card, 32 the phone card (same proportions, as in the Figma "Progress ring" component).
export function Ring({ frac, label, color, size }: { frac: number; label: string; color: 'gold' | 'ink'; size: 44 | 32 }) {
  const r = size === 44 ? 17 : 12.5;
  const stroke = size === 44 ? 5 : 4;
  const c = 2 * Math.PI * r;
  const c0 = size / 2;
  return (
    <span className="o-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c0} cy={c0} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {frac > 0 ? (
          <circle
            cx={c0}
            cy={c0}
            r={r}
            fill="none"
            stroke={color === 'gold' ? 'var(--gold)' : 'var(--ink)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * frac).toFixed(1)} ${c.toFixed(1)}`}
            transform={`rotate(-90 ${c0} ${c0})`}
          />
        ) : null}
      </svg>
      <span style={{ fontSize: size === 44 ? 11.5 : 10 }}>{label}</span>
    </span>
  );
}
