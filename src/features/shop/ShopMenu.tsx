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

type Destino = 'comprar' | 'vender' | 'pokemons'

export function ShopMenu() {
  const [tab, setTab] = useState<'itens' | 'pokemons'>('itens')
  // Estado proprio do compacto, onde as duas fileiras de aba viram uma. Nao
  // deriva de `tab`: sao dois eixos diferentes (o que vender x comprar ou
  // vender), e amarrar um no outro fazia trocar de regime perder o lado.
  const [destino, setDestino] = useState<Destino>('comprar')
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  const { compacto } = useDeviceMode()

  return (
    <div className="flex flex-col gap-[.55em]">
      <StickyHeader className="flex-row flex-wrap items-center">
        {/* Compacto: UMA fileira com os tres destinos reais da Loja. Antes eram
            duas barras empilhadas (Itens/Pokemons e depois Comprar/Vender), e a
            segunda so existia porque a primeira nao dizia o que o jogador ia
            fazer — "Itens" nao e uma acao. */}
        {compacto ? (
          <SegmentedTabs
            value={destino}
            onChange={setDestino}
            options={[
              { value: 'comprar', label: 'Comprar' },
              { value: 'vender', label: 'Vender' },
              { value: 'pokemons', label: 'POKEs' },
            ]}
          />
        ) : (
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'itens', label: 'Itens' },
              { value: 'pokemons', label: 'Pokemons' },
            ]}
          />
        )}
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
      {compacto
        ? (destino === 'pokemons' ? <PokemonsTab /> : <ItensTab ladoExterno={destino} />)
        : (tab === 'itens' ? <ItensTab /> : <PokemonsTab />)}
    </div>
  )
}
