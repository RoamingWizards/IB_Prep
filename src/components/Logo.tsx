/** The app mark: a rounded tile with a rising line, in the primary accent. No wording, so it also works collapsed. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="IB Prep">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="color-mix(in srgb, var(--primary), #fff 25%)" />
          <stop offset="1" stopColor="var(--primary)" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" style={{ fill: "rgb(var(--accent-rgb) / 0.12)" }} stroke="url(#logo-g)" strokeWidth="1.5" />
      <path d="M7 21.5 12.5 15l4 3.8L24.5 9.5" fill="none" stroke="url(#logo-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 9.5h5v5" fill="none" stroke="url(#logo-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
