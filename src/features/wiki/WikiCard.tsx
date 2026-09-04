// O cartao de verbete da Wiki, extraido de `WikiMenu.tsx` na reformulacao de
// 04/09 (PH-507).
//
// Ele saiu de la porque a Wiki deixou de ser um arquivo: as abas novas — Mundo,
// Progresso, Jogadores — vivem em arquivos irmaos e usam o MESMO cartao. Ter
// duas definicoes visualmente identicas em dois arquivos e como um bloco de
// verbete se separa do outro por meio pixel de padding seis meses depois.
import type { ReactNode } from 'react'

export function WikiCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-n900 p-3">
      <div className="mb-1.5 text-[.9em] font-medium">{title}</div>
      <div className="text-[.8em] leading-relaxed text-n400">{children}</div>
    </div>
  )
}
