// Mercado entre jogadores — abas Comprar, Vender, Anuncios Ativos e Historico.
//
// Dois modelos coexistem aqui, e a tela deixa isso explicito em vez de fingir
// que sao a mesma coisa (ver o cabecalho de server/src/mercado.ts):
//   ITEM  -> livro de ofertas: o jogador escolhe preco e quantidade, e a ordem
//            casa sozinha com o lado oposto.
//   POKE  -> anuncio de preco fixo em Ouro ou Diamante, com filtros de busca.
//
// Nada aqui calcula preco, taxa ou quem recebe o que: o cliente manda
// intencao, o servidor responde com o estado novo. Mesmo contrato do resto do
// jogo sob autoridade.
import { useState } from 'react'
import { Tag } from '@phosphor-icons/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { SegmentedTabs, StickyHeader } from '@/components/game/controls'
import { ComprarItens } from './components/ComprarItens'
import { ComprarPokes } from './components/ComprarPokes'
import { VenderItens } from './components/VenderItens'
import { VenderPokes } from './components/VenderPokes'
import { Ativos } from './components/Ativos'
import { Historico } from './components/Historico'
import { Moeda } from './components/shared'
import { ABAS, type Aba } from './utils'

export function MercadoMenu() {
  const [aba, setAba] = useState<Aba>('comprar')
  const [tipo, setTipo] = useState<'itens' | 'pokes'>('itens')
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)

  return (
    <div className="flex flex-col gap-[.5em]">
      <StickyHeader>
        <div className="flex flex-wrap items-center gap-[.5em]">
          <SegmentedTabs value={aba} onChange={setAba} options={ABAS} />
          <span className="flex items-center gap-[.45em] text-[.85em]">
            <Moeda valor={gold} tipo="gold" />
            <Moeda valor={diamonds} tipo="diamond" />
          </span>
        </div>

        {(aba === 'comprar' || aba === 'vender') && (
          <SegmentedTabs
            value={tipo}
            onChange={setTipo}
            options={[{ value: 'itens', label: 'Itens' }, { value: 'pokes', label: 'Pokémon' }]}
          />
        )}
      </StickyHeader>

      {aba === 'comprar' && (tipo === 'itens' ? <ComprarItens /> : <ComprarPokes />)}
      {aba === 'vender' && (tipo === 'itens' ? <VenderItens /> : <VenderPokes />)}
      {aba === 'ativos' && <Ativos />}
      {aba === 'historico' && <Historico />}

      {aba === 'comprar' && tipo === 'itens' && (
        <p className="flex items-start gap-[.4em] text-[.75em] text-n500">
          <Tag className="mt-[.2em] shrink-0" />
          Itens usam livro de ofertas: sua ordem casa com a melhor do outro lado e você paga o preço de
          quem já estava lá — o troco volta na hora. O que não casar fica esperando.
        </p>
      )}
    </div>
  )
}
