// Icone de Ginasio (23/10/2026, pedido do dono): o predio do ginasio — telhado
// em arco com a Poke Bola no frontao, colunas e portao. Traco em currentColor,
// no tamanho do texto, como os icones Phosphor ao lado (aba da Hunt).
export function IconeDeGinasio({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1.35em" height="1.35em" className={className} aria-hidden
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* telhado em arco */}
      <path d="M2.5 10.5 Q12 2 21.5 10.5 Z" />
      {/* Poke Bola no frontao */}
      <circle cx="12" cy="7.8" r="1.9" strokeWidth="1.3" />
      <path d="M10.1 7.8 H13.9" strokeWidth="1.1" />
      {/* colunas e base */}
      <path d="M5 10.5 V19 M19 10.5 V19 M3 19.5 H21" />
      {/* portao em arco */}
      <path d="M9.5 19.5 V15 Q12 12.5 14.5 15 V19.5" />
    </svg>
  )
}
