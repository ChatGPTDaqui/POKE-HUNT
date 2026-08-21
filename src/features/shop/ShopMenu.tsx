// Loja: aba Itens (colunas comprar/vender) e aba Pokemons (venda em lote com
// filtros).
//
// Todo botao daqui faz round-trip ao servidor de autoridade, entao todos passam
// por `useAcaoPendente` (fica desabilitado enquanto a intencao esta no ar) e por
// `pedirAcaoComLocal` (o toast reporta o resultado REAL, nao um literal fixo —
// ver a nota naquele helper).
import { useState } from 'react'
import { Coin, Diamond } from '@phosphor-icons/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useDeviceMode } from '@/stores/uiStore'
import { SegmentedTabs, StickyHeader } from '@/components/game/controls'
import { ItensTab } from './components/ItensTab'
import { PokemonsTab } from './components/PokemonsTab'
import { fmt } from './utils'

export function ShopMenu() {
  const [tab, setTab] = useState<'itens' | 'pokemons'>('itens')
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  const { compacto } = useDeviceMode()

  return (
    <div className="flex flex-col gap-[.55em]">
      <StickyHeader className="flex-row flex-wrap items-center">
        {/* Uma fileira so, e os mesmos dois destinos em todo regime. Ela chegou
            a ter tres opcoes no celular ("Comprar | Vender | POKEs") porque
            comprar e vender eram ABAS la; agora as duas colunas aparecem
            juntas e o eixo "que lado" deixou de existir. */}
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'itens', label: 'Itens' },
            { value: 'pokemons', label: 'Pokemons' },
          ]}
        />
        {/* No celular a carteira ja esta no trilho de status, logo acima — aqui
            ela so empurrava as abas. */}
        {!compacto && (
          <span className="flex items-center gap-[.45em] text-[.85em] text-n300">
            <span className="flex items-center gap-[.25em] text-gold">
              <Coin weight="fill" /> {fmt.format(gold)}
            </span>
            <span className="flex items-center gap-[.25em] text-diamond">
              <Diamond weight="fill" /> {fmt.format(diamonds)}
            </span>
          </span>
        )}
      </StickyHeader>
      {tab === 'itens' ? <ItensTab /> : <PokemonsTab />}
    </div>
  )
}
