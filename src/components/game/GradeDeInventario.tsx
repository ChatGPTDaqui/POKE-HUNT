// Grade quadriculada de inventario (PH-114) — escolher UM item/POKE clicando
// num slot com imagem, em vez de ler nome num `<select>`.
//
// ---------------------------------------------------------------------------
// POR QUE ELA EXISTE
// ---------------------------------------------------------------------------
// Anunciar no Mercado escolhia por dropdown de TEXTO ("✨ Charmander Lv12 ·
// Incomum · IV 74%"). Sem sprite, sem borda de raridade, sem marca de shiny
// legivel — e no celular um `<select>` vira lista nativa do sistema. Escolher o
// POKE errado ali tem consequencia: ele sai da mochila.
//
// ---------------------------------------------------------------------------
// O QUE ELA NAO E
// ---------------------------------------------------------------------------
// NAO tem teto de slots, nao tem "auto arrange" e nao tem capacidade. A
// referencia que originou o pedido mostrava `0/124`, e isso ficou de fora de
// propósito: inventar limite de mochila mudaria balanceamento, e o pedido foi
// explicito em ser "apenas forma visual de organizar". A grade desenha
// exatamente os slots que existem.
//
// Tambem nao e arrastavel. Reordenar inventario e outro assunto (o trilho de
// reservas ja tem o seu), e misturar arrasto com selecao no mesmo toque e como
// se ganha o bug de "toquei pra escolher e ele reordenou".
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SlotDeInventario {
  /** Chave estavel e valor devolvido na selecao. */
  id: string
  /** O que desenha dentro do slot (sprite, icone). */
  conteudo: ReactNode
  /**
   * Descricao pra leitor de tela e pro `title` do hover. Obrigatoria: o slot e
   * uma imagem, entao sem isto ele e um botao sem nome nenhum.
   */
  rotulo: string
  /** Canto inferior direito — quantidade de item. Ausente nao desenha nada. */
  contador?: number
}

/**
 * Lado do slot, em `em`. 3.2 e o menor lado em que o sprite de 32px ainda le
 * como o POKE que e, e ao mesmo tempo passa dos ~44px de alvo de toque no
 * regime compacto.
 */
const LADO = 3.2

export function GradeDeInventario({
  slots, selecionado, onSelecionar, alturaMaxEm = 13, className, rotuloDoGrupo,
}: {
  slots: SlotDeInventario[]
  selecionado: string | null
  onSelecionar: (id: string) => void
  /** Altura maxima antes de rolar. Inventario grande nao pode estourar o painel. */
  alturaMaxEm?: number
  className?: string
  rotuloDoGrupo: string
}) {
  return (
    <div
      // `radiogroup` e nao `listbox`: e escolha unica entre opcoes visiveis, que
      // e exatamente a semantica de radio. O `<select>` que estava aqui antes
      // era listbox por acidente de elemento, nao por intencao.
      role="radiogroup"
      aria-label={rotuloDoGrupo}
      className={cn('overflow-y-auto rounded-[.5em] border border-n800 bg-n900/60 p-[.3em]', className)}
      style={{
        maxHeight: `${alturaMaxEm}em`,
        display: 'grid',
        // `auto-fill` e nao um numero fixo de colunas: a mesma grade serve o
        // painel largo do desktop e os ~470px uteis do celular sem media query.
        gridTemplateColumns: `repeat(auto-fill, minmax(${LADO}em, 1fr))`,
        gap: '.3em',
      }}
    >
      {slots.map((slot) => {
        const ativo = slot.id === selecionado
        return (
          <button
            key={slot.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={slot.rotulo}
            title={slot.rotulo}
            onClick={() => onSelecionar(slot.id)}
            className={cn(
              'relative flex cursor-pointer items-center justify-center rounded-[.4em] border-2 p-[.15em] transition-colors',
              ativo ? 'border-primary bg-primary/15' : 'border-n800 bg-n950/60 hover:border-n600',
            )}
            style={{ aspectRatio: '1 / 1' }}
          >
            {slot.conteudo}
            {slot.contador !== undefined && (
              // `pointer-events-none`: o contador fica DENTRO do botao, e sem
              // isto o clique em cima do numero nao contava como clique no slot
              // em alguns navegadores.
              <span className="pointer-events-none absolute right-[.1em] bottom-0 rounded-[.25em] bg-n950/85 px-[.2em] text-[.62em] leading-[1.4] tabular-nums text-n200">
                {slot.contador}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
