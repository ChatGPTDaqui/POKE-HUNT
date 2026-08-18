// Seletor de item com ICONE e ESTOQUE, no lugar de um `<select>` nativo.
//
// Um `<option>` nao aceita imagem — nenhum navegador renderiza markup dentro
// dele. Entao o "selector rico" pedido (icone + nome + quantidade que o jogador
// tem) exige um dropdown proprio. Ele e minusculo de proposito: um botao que
// mostra a escolha atual e uma lista que abre por cima; sem busca, sem
// virtualizacao, sem portal — sao no maximo 17 linhas (as Pedras) e ele vive
// dentro de um painel de 19em.
//
// O botao e a lista sao elementos ESTAVEIS entre renders (React reconcilia, nao
// recria): e a mesma precaucao do bug documentado de "botao recriado a cada
// frame engole o clique" do jogo vanilla.
import { useEffect, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { cn } from '@/lib/utils'

export interface OpcaoDeItem {
  id: string
  nome: string
  /** Estoque atual. `null` quando a opcao nao e um item (ex.: "Escolher melhor"). */
  quantidade: number | null
  /** Destaca a linha em vermelho — usado pra estoque abaixo do limiar. */
  alerta?: boolean
}

function Linha({ opcao }: { opcao: OpcaoDeItem }) {
  const url = itemIconUrl(opcao.id)
  const borda = itemIconBorderColor(opcao.id)
  return (
    <>
      {url ? (
        <img
          src={url}
          alt=""
          className="h-[1.5em] w-[1.5em] shrink-0 rounded-[.25em] object-contain"
          style={borda ? { border: `2px solid ${borda}` } : undefined}
        />
      ) : (
        <span className="h-[1.5em] w-[1.5em] shrink-0 rounded-[.25em] border border-n700" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{opcao.nome}</span>
      {opcao.quantidade != null && (
        <span className={cn('shrink-0 tabular-nums', opcao.alerta ? 'font-semibold text-bad' : 'text-n400')}>
          x{opcao.quantidade}
        </span>
      )}
    </>
  )
}

export function ItemPicker({
  value, opcoes, onChange, disabled, className, label,
}: {
  value: string
  opcoes: OpcaoDeItem[]
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
  label: string
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const atual = opcoes.find((o) => o.id === value) ?? opcoes[0]

  // Fecha ao clicar fora. Armado no proximo tick pra o mesmo clique que abriu
  // (borbulhando do botao) nao fechar na hora — mesmo padrao do MoreMenu.
  useEffect(() => {
    if (!aberto) return
    let armado = false
    const timer = setTimeout(() => { armado = true }, 0)
    function onDown(e: PointerEvent) {
      if (!armado) return
      if (ref.current?.contains(e.target as Node)) return
      setAberto(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [aberto])

  if (!atual) return null

  return (
    <div ref={ref} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        disabled={disabled}
        onClick={() => setAberto((a) => !a)}
        className={cn(
          'flex w-full min-w-0 cursor-pointer items-center gap-[.35em] rounded-[.45em] border border-n700 bg-n900',
          'px-[.4em] py-[.28em] font-[inherit] text-[.85em] text-foreground',
          'focus-visible:border-n500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45',
        )}
      >
        <Linha opcao={atual} />
        <CaretDown className="shrink-0 text-n500" />
      </button>

      {aberto && (
        <div
          role="listbox"
          className="absolute z-[60] mt-[.2em] max-h-[13em] w-full min-w-[11em] overflow-y-auto rounded-[.45em] border border-n700 bg-background p-[.2em] shadow-2xl"
        >
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => { onChange(o.id); setAberto(false) }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-[.35em] rounded-[.35em] px-[.35em] py-[.25em]',
                'font-[inherit] text-[.85em] text-foreground hover:bg-n800',
                o.id === value && 'bg-n800',
              )}
            >
              <Linha opcao={o} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
