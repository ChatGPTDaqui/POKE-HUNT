// Barra de filtro das telas de venda (PH-142).
//
// Fica ACIMA da grade, e a grade continua sendo a grade — o filtro recorta o
// que ela recebe, não muda como ela desenha. Foi o que permitiu ligar isto nas
// duas telas sem tocar em `GradeDeInventario`.
//
// A regra de casamento mora em `../filtrosDaVenda.ts`, com teste. Aqui é só
// controle.
import { GameInput, GameSelect } from '@/components/game/controls'
import { RARITIES } from '@/data/rarity'
import { TYPE_COLORS } from '@/data/typeColors'

import { NOME_DA_CATEGORIA } from '../filtrosDaVenda'

import type { FiltroDeItem, FiltroDePoke } from '../filtrosDaVenda'
import type { ElementType } from '@/data/generated/types'

const TIPOS = Object.keys(TYPE_COLORS) as ElementType[]

/** Linha de controles compacta — em 390px ela quebra em vez de espremer. */
function Linha({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-[.35em]">{children}</div>
}

export function FiltroDePokes({
  filtro, onFiltro, total, mostrando,
}: {
  filtro: FiltroDePoke
  onFiltro: (f: FiltroDePoke) => void
  total: number
  mostrando: number
}) {
  const set = <K extends keyof FiltroDePoke>(chave: K, valor: FiltroDePoke[K]) =>
    onFiltro({ ...filtro, [chave]: valor })

  return (
    <div className="flex flex-col gap-[.3em]">
      <Linha>
        <GameInput
          type="search"
          value={filtro.busca}
          onChange={(e) => set('busca', e.target.value)}
          placeholder="Buscar espécie"
          aria-label="Buscar espécie"
          className="min-w-[8em] flex-1"
        />
        <GameSelect
          value={filtro.tipo}
          onChange={(e) => set('tipo', e.target.value as FiltroDePoke['tipo'])}
          aria-label="Filtrar por tipo"
        >
          <option value="todos">Todos os tipos</option>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </GameSelect>
        <GameSelect
          value={filtro.raridade}
          onChange={(e) => set('raridade', e.target.value as FiltroDePoke['raridade'])}
          aria-label="Filtrar por raridade"
        >
          <option value="todos">Toda raridade</option>
          {Object.values(RARITIES).map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </GameSelect>
      </Linha>
      <Linha>
        <GameSelect
          value={filtro.shiny}
          onChange={(e) => set('shiny', e.target.value as FiltroDePoke['shiny'])}
          aria-label="Filtrar shiny"
        >
          <option value="todos">Shiny e normal</option>
          <option value="shiny">Só shiny</option>
          <option value="normal">Só normal</option>
        </GameSelect>
        <GameSelect
          value={filtro.ordem}
          onChange={(e) => set('ordem', e.target.value as FiltroDePoke['ordem'])}
          aria-label="Ordenar por"
        >
          <option value="nivel">Nível ↓</option>
          <option value="iv">IV ↓</option>
          <option value="raridade">Raridade ↓</option>
          <option value="nome">Nome A-Z</option>
        </GameSelect>
        <Contador total={total} mostrando={mostrando} />
      </Linha>
    </div>
  )
}

export function FiltroDeItens({
  filtro, onFiltro, categorias, total, mostrando,
}: {
  filtro: FiltroDeItem
  onFiltro: (f: FiltroDeItem) => void
  /** Só as categorias que EXISTEM no que o jogador tem — menu vazio é um beco. */
  categorias: string[]
  total: number
  mostrando: number
}) {
  return (
    <Linha>
      <GameInput
        type="search"
        value={filtro.busca}
        onChange={(e) => onFiltro({ ...filtro, busca: e.target.value })}
        placeholder="Buscar item"
        aria-label="Buscar item"
        className="min-w-[8em] flex-1"
      />
      <GameSelect
        value={filtro.categoria}
        onChange={(e) => onFiltro({ ...filtro, categoria: e.target.value })}
        aria-label="Filtrar por categoria"
      >
        <option value="todos">Todas as categorias</option>
        {categorias.map((c) => (
          <option key={c} value={c}>{NOME_DA_CATEGORIA[c] ?? c}</option>
        ))}
      </GameSelect>
      <Contador total={total} mostrando={mostrando} />
    </Linha>
  )
}

/**
 * "12 de 40" — some quando não há recorte.
 *
 * É o que separa "o filtro escondeu coisa" de "eu só tenho isto". Sem ele, uma
 * lista curta depois de filtrar parece a mochila inteira.
 */
function Contador({ total, mostrando }: { total: number; mostrando: number }) {
  if (mostrando === total) return null
  return (
    <span className="shrink-0 text-[.72em] tabular-nums text-n500">
      {mostrando} de {total}
    </span>
  )
}
