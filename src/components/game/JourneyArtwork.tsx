export type ArtKind = 'bag' | 'dex' | 'map' | 'team' | 'guide' | 'shop' | 'hospital' | 'market' | 'social'

/** Cartografia discreta: decorativa, não interfere no arraste ou no foco. */
export function RouteDecoration() {
  return <svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className="journey-route-decoration">
    <path d="M-30 120Q80-30 125 75T280 42 440 20" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 9" />
    <circle cx="125" cy="75" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="280" cy="42" r="5" fill="currentColor" />
    <path d="m330 105 15-27 15 27Zm-30 8 12-21 12 21Z" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
}

/** Pequenas ilustrações vetoriais originais: mesma linha, material e perspectiva. */
export function EquipmentArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  return <svg viewBox="0 0 100 100" className={`equipment-art ${className}`} aria-hidden="true" focusable="false">
    <ellipse cx="51" cy="86" rx="32" ry="6" fill="var(--journey-ink)" opacity=".13" />
    <g stroke="var(--journey-ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
      {kind === 'social' && <>
        <path d="M35 39h44v31H67L55 82V70H35Z" fill="var(--journey-leaf)" />
        <path d="M16 18h49v34H38L24 64V52h-8Z" fill="var(--journey-paper)" />
        <path d="M27 30h27M27 40h18" stroke="var(--journey-primary)" />
      </>}
      {kind === 'shop' && <>
        <path d="M21 40h58v44H21Z" fill="var(--journey-paper)" />
        <path d="m15 36 9-19h52l9 19v11q-7 9-14 0-7 9-14 0-7 9-14 0-7 9-14 0-7 9-14 0Z" fill="var(--journey-primary)" />
        <path d="m35 17-5 19m20-19v19m15-19 5 19" stroke="var(--journey-paper)" />
        <rect x="30" y="57" width="17" height="16" rx="2" fill="var(--journey-wash)" />
        <path d="M57 84V58h13v26" fill="var(--journey-leaf)" />
      </>}
      {kind === 'hospital' && <>
        <rect x="18" y="25" width="64" height="60" rx="12" fill="var(--journey-paper)" />
        <path d="M18 44h64V36q0-11-12-11H30q-12 0-12 11Z" fill="var(--journey-primary)" />
        <path d="M38 25V15h24v10" fill="none" />
        <path d="M45 51h10v10h10v10H55v10H45V71H35V61h10Z" fill="var(--journey-leaf)" />
      </>}
      {kind === 'market' && <>
        <path d="M50 17v60M24 84h52M33 77h34M21 30l58-7" fill="none" />
        <circle cx="50" cy="24" r="7" fill="var(--journey-warning)" />
        <path d="m23 31-13 27h26Zm54-7L64 52h26Z" fill="var(--journey-wash)" />
        <path d="M10 58q13 18 26 0ZM64 52q13 18 26 0Z" fill="var(--journey-primary)" />
      </>}
      {kind === 'bag' && <>
        <path d="M36 25v-6c0-12 28-12 28 0v6" fill="none" />
        <path d="M26 33 18 76q-1 10 11 10h44q11 0 9-11l-8-42" fill="var(--journey-wash)" />
        <rect x="25" y="23" width="49" height="59" rx="15" fill="var(--journey-leaf)" />
        <path d="M25 37q24 15 49 0V31q0-11-13-11H38q-13 0-13 11Z" fill="var(--journey-wash)" />
        <rect x="34" y="53" width="32" height="23" rx="6" fill="var(--journey-paper)" />
        <path d="M35 61h30M44 35v14m13-14v14" fill="none" />
        <rect x="41" y="37" width="6" height="8" rx="2" fill="var(--journey-warning)" />
        <rect x="54" y="37" width="6" height="8" rx="2" fill="var(--journey-warning)" />
      </>}
      {kind === 'dex' && <>
        <rect x="22" y="12" width="58" height="73" rx="11" fill="var(--journey-primary)" transform="rotate(8 50 50)" />
        <path d="m23 34 55 8" fill="none" />
        <circle cx="36" cy="26" r="8" fill="var(--journey-wash)" />
        <circle cx="36" cy="26" r="3" fill="var(--journey-card)" stroke="none" />
        <path d="m52 26 3 .5m6 0 3 .5" stroke="var(--journey-paper)" />
        <path d="m32 43 36 5-3 23-36-5Z" fill="var(--journey-paper)" />
        <path d="m40 55 6 1m9 1 3 .5m-20 20 14 2" fill="none" />
      </>}
      {kind === 'map' && <>
        <path d="m13 28 23-10 27 11 24-11v58L64 86 36 76 13 86Z" fill="var(--journey-paper)" />
        <path d="M36 18v58m27-47v57" stroke="var(--journey-line)" />
        <path d="M23 69q6-24 21-14t24-11" stroke="var(--journey-leaf)" strokeDasharray="3 6" fill="none" />
        <path d="M63 40c-13-18 18-29 18-9 0 5-9 14-9 14Z" fill="var(--journey-primary)" />
        <circle cx="72" cy="31" r="3" fill="var(--journey-paper)" stroke="none" />
        <path d="m21 45 7-14 7 14Z" fill="var(--journey-wash)" />
      </>}
      {kind === 'team' && <>
        <circle cx="50" cy="47" r="31" fill="var(--journey-paper)" />
        <path d="M19 47a31 31 0 0 1 62 0Z" fill="var(--journey-primary)" />
        <path d="M19 47h62" strokeWidth="5" />
        <circle cx="50" cy="47" r="11" fill="var(--journey-paper)" />
        <circle cx="50" cy="47" r="5" fill="var(--journey-card)" stroke="var(--journey-line)" strokeWidth="2" />
        <path d="M31 29q5-6 10-6" stroke="var(--journey-card)" strokeWidth="4" />
        <path d="m74 72 5 4 9-11" stroke="var(--journey-leaf)" strokeWidth="5" fill="none" />
      </>}
      {kind === 'guide' && <>
        <path d="M24 18h50v67H24q-9 0-9-9V27q0-9 9-9Z" fill="var(--journey-focus)" />
        <path d="M27 18v67m5-57h34v44H32Z" fill="var(--journey-paper)" />
        <path d="M45 18v22l6-5 6 5V18" fill="var(--journey-primary)" />
        <path d="m40 56 6-6 6 5 8-9" stroke="var(--journey-leaf)" fill="none" />
        <path d="M39 63h19M20 28h12M20 43h12M20 59h12M20 74h12" fill="none" />
      </>}
    </g>
  </svg>
}
