import { useState } from 'react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { ITEMS } from '@/data/items'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { GameButton, GameCard, GameInput, SectionLabel } from '@/components/game/controls'
import { GradeDeInventario } from '@/components/game/GradeDeInventario'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { useTaxaDoMercado, taxaDeVenda } from '../useTaxaDoMercado'
import { fmt } from '../utils'

/**
 * Icone do item pra dentro do slot da grade.
 *
 * Local e nao componente compartilhado: o projeto repete este par
 * `itemIconUrl`/`itemIconBorderColor` inline em varios lugares (ItemPicker,
 * BagMenu, Correio) e unificar os cinco e refatoracao propria, nao carona
 * nesta. O que importa aqui e nao inventar um SEXTO jeito de desenhar.
 */
function IconeDeItem({ itemId }: { itemId: string }) {
  const url = itemIconUrl(itemId)
  const borda = itemIconBorderColor(itemId)
  if (!url) return <span className="h-full w-full rounded-[.25em] border border-n700" />
  return (
    <img
      src={url}
      alt=""
      className="h-full w-full rounded-[.25em] object-contain"
      style={borda ? { border: `2px solid ${borda}` } : undefined}
    />
  )
}

export function VenderItens() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const { regra } = useTaxaDoMercado()
  const [itemId, setItemId] = useState('')
  const [preco, setPreco] = useState(100)
  const [qtd, setQtd] = useState(1)
  const criar = useAcaoMercado(mercadoRpc.criarOrdem)
  const acao = useAcaoPendente()

  const disponiveis = Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id] && !lockedItems[id])
  const escolhido = itemId || disponiveis[0] || ''
  const maximo = items[escolhido] ?? 0

  // Livro de item e sempre em ouro, entao a taxa sempre incide aqui.
  const bruto = preco * Math.min(qtd, maximo)
  const taxa = taxaDeVenda(bruto, 'gold', regra)

  if (disponiveis.length === 0) {
    return <p className="text-n500">Nenhum item destravado na mochila para anunciar.</p>
  }

  return (
    <GameCard className="flex flex-col gap-[.45em] p-[.55em]">
      <SectionLabel>ANUNCIAR ITEM</SectionLabel>
      <div className="flex flex-wrap items-end gap-[.5em]">
        {/* Grade, e nao dropdown (PH-114). O contador do slot substitui o
            "(x30)" que estava no texto da opcao — ele fica visivel em TODOS os
            itens de uma vez, e nao so no que esta selecionado. */}
        <div className="flex w-full flex-col gap-[.2em] text-[.78em] text-n400">
          Item
          <GradeDeInventario
            rotuloDoGrupo="Item para anunciar"
            selecionado={escolhido || null}
            onSelecionar={setItemId}
            slots={disponiveis.map((id) => ({
              id,
              rotulo: `${ITEMS[id].name} (x${items[id]})`,
              contador: items[id],
              conteudo: <IconeDeItem itemId={id} />,
            }))}
          />
          {escolhido && <span className="text-n300">{ITEMS[escolhido].name}</span>}
        </div>
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Preco/un.
          <GameInput
            type="number" min={1} className="w-[7em]" value={preco}
            onChange={(e) => setPreco(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </label>
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Quantidade
          <GameInput
            type="number" min={1} max={maximo} className="w-[6em]" value={Math.min(qtd, maximo)}
            onChange={(e) => setQtd(Math.max(1, Math.min(maximo, Math.floor(Number(e.target.value) || 1))))}
          />
        </label>
      </div>
      <div className="text-[.8em] text-n400">
        Voce recebe ate <b className="text-gold">{fmt.format(bruto - taxa)}</b> de ouro.
        {/* A taxa aparece ANTES de confirmar (PH-98). Descobrir depois de vender
            e indistinguivel de bug de ouro faltando. */}
        {taxa > 0 && (
          <span className="text-n500">
            {' '}(bruto {fmt.format(bruto)} − taxa de {regra.percentual}%: {fmt.format(taxa)})
          </span>
        )}
        {' '}Os itens saem da mochila assim que a ordem e criada e voltam se voce cancelar.
      </div>
      <GameButton
        variant="primary"
        carregando={acao.isPending('criar-ordem')}
        disabled={maximo === 0}
        onClick={() => void acao.run('criar-ordem', () => criar.mutateAsync({ itemId: escolhido, side: 'venda', unitPrice: preco, quantity: Math.min(qtd, maximo) }).catch(() => {}))}
      >
        Colocar a venda
      </GameButton>
    </GameCard>
  )
}
