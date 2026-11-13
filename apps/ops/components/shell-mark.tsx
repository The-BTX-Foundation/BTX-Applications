// The small outlined alert mark shared by the not-built, 404 and error screens: a bare 22px line icon, never a tile.
export function ShellMark() {
  return (
    <svg className="sf-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.4v0.1" />
    </svg>
  );
}
