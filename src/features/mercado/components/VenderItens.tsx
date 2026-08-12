import { useState } from 'react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { ITEMS } from '@/data/items'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { GameButton, GameCard, GameInput, GameSelect, SectionLabel } from '@/components/game/controls'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { fmt } from '../utils'

export function VenderItens() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const [itemId, setItemId] = useState('')
  const [preco, setPreco] = useState(100)
  const [qtd, setQtd] = useState(1)
  const criar = useAcaoMercado(mercadoRpc.criarOrdem)
  const acao = useAcaoPendente()

  const disponiveis = Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id] && !lockedItems[id])
  const escolhido = itemId || disponiveis[0] || ''
  const maximo = items[escolhido] ?? 0

  if (disponiveis.length === 0) {
    return <p className="text-n500">Nenhum item destravado na mochila para anunciar.</p>
  }

  return (
    <GameCard className="flex flex-col gap-[.45em] p-[.55em]">
      <SectionLabel>ANUNCIAR ITEM</SectionLabel>
      <div className="flex flex-wrap items-end gap-[.5em]">
        <label className="flex min-w-[10em] flex-1 flex-col gap-[.2em] text-[.78em] text-n400">
          Item
          <GameSelect value={escolhido} onChange={(e) => setItemId(e.target.value)}>
            {disponiveis.map((id) => (
              <option key={id} value={id}>{ITEMS[id].name} (x{items[id]})</option>
            ))}
          </GameSelect>
        </label>
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
        Voce recebe ate <b className="text-gold">{fmt.format(preco * Math.min(qtd, maximo))}</b> de ouro.
        Os itens saem da mochila assim que a ordem e criada e voltam se voce cancelar.
      </div>
      <GameButton
        variant="primary"
        disabled={acao.isPending('criar-ordem') || maximo === 0}
        onClick={() => void acao.run('criar-ordem', () => criar.mutateAsync({ itemId: escolhido, side: 'venda', unitPrice: preco, quantity: Math.min(qtd, maximo) }).catch(() => {}))}
      >
        {acao.isPending('criar-ordem') ? '...' : 'Colocar a venda'}
      </GameButton>
    </GameCard>
  )
}
