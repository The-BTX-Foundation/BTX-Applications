// The pin mark beside a pinned item (drawn from the Figma "Board chat" frame; 17 x 17 grid, not in the shared icon set).
export function PinIcon({ size = 17 }: { size?: number }) {
  return (
    <svg className="ch-pin-i" width={size} height={size} viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.36" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.375 2.55H10.625L9.945 6.8L12.325 8.925V9.775H4.675V8.925L7.055 6.8L6.375 2.55Z" />
      <path d="M8.5 9.775V14.45" />
    </svg>
  );
}
