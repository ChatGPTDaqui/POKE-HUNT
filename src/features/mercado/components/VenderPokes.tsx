import { useState } from 'react'
import { Gavel } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { SPECIES, averageIvPercent } from '@/data/pokes'
import { rarityOf } from '@/data/rarity'
import { useGameStateStore } from '@/stores/gameStateStore'
import { GameButton, GameCard, GameCheck, GameInput, GameSelect, SectionLabel } from '@/components/game/controls'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { useTaxaDoMercado, taxaDeVenda } from '../useTaxaDoMercado'
import { fmt } from '../utils'
import { useMochila } from '@/features/bag/useMochila'
import { EstadoDaMochila } from '@/features/bag/EstadoDaMochila'

export function VenderPokes() {
  // Mochila sob demanda: anunciar exige a lista, entao esta tela a pede.
  const { carregada } = useMochila()
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const [uid, setUid] = useState('')
  const [preco, setPreco] = useState(5000)
  const [moeda, setMoeda] = useState<'gold' | 'diamond'>('gold')
  const [apenasOferta, setApenasOferta] = useState(false)
  const anunciar = useAcaoMercado(mercadoRpc.anunciarPoke)
  const { regra } = useTaxaDoMercado()
  const taxa = taxaDeVenda(preco, moeda, regra)

  // POKE travado nao aparece: a trava existe justamente pra ele nao sair da
  // mochila por engano, e anunciar e sair da mochila.
  const elegiveis = bagPokes.filter((p) => !p.locked && SPECIES[p.speciesId])
  const escolhido = elegiveis.find((p) => p.uid === uid) ?? elegiveis[0]

  if (!carregada) return <EstadoDaMochila />

  if (elegiveis.length === 0) {
    return <p className="text-n500">Nenhum POKE destravado na mochila para anunciar.</p>
  }

  return (
    <GameCard className="flex flex-col gap-[.45em] p-[.55em]">
      <SectionLabel>ANUNCIAR POKE</SectionLabel>
      <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
        POKE
        <GameSelect value={escolhido?.uid ?? ''} onChange={(e) => setUid(e.target.value)}>
          {elegiveis.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.isShiny ? '✨ ' : ''}{SPECIES[p.speciesId].name} Lv{p.level} · {rarityOf(p).label} · IV {averageIvPercent(p.ivs).toFixed(0)}%
            </option>
          ))}
        </GameSelect>
      </label>
      <div className="flex flex-wrap items-end gap-[.5em]">
        {/* Em "somente lance" nao existe preco de compra direta — o campo sai da
            tela em vez de ficar desabilitado com um numero que nao vale nada. */}
        {!apenasOferta && (
          <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
            Preco
            <GameInput
              type="number" min={1} className="w-[8em]" value={preco}
              onChange={(e) => setPreco(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </label>
        )}
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Moeda
          <GameSelect value={moeda} onChange={(e) => setMoeda(e.target.value as typeof moeda)}>
            <option value="gold">Ouro</option>
            <option value="diamond">Diamante</option>
          </GameSelect>
        </label>
        <div className="flex-1 text-[.8em] text-n400">
          {/* Em "somente lance" nao ha preco pra descontar ainda — o valor sai do
              lance aceito, e a taxa e mostrada na hora de aceitar (Ativos). */}
          {!apenasOferta && (
            taxa > 0
              ? <>Voce recebe <b className="text-gold">{fmt.format(preco - taxa)}</b>
                <span className="text-n500"> (taxa de {regra.percentual}%: {fmt.format(taxa)})</span>.{' '}</>
              : <>Voce recebe <b className="text-gold">{fmt.format(preco)}</b>
                <span className="text-n500"> (sem taxa em {moeda === 'gold' ? 'ouro' : 'diamante'})</span>.{' '}</>
          )}
          O POKE sai da sua mochila enquanto o anuncio estiver de pe.
        </div>
      </div>
      <GameCheck checked={apenasOferta} onChange={setApenasOferta}>
        <span className="inline-flex items-center gap-[.3em]">
          <Gavel /> Somente Lance (sem compra direta)
        </span>
      </GameCheck>
      {apenasOferta && (
        <p className="text-[.78em] text-n500">
          O anúncio sai sem preço: outros jogadores enviam ofertas em {moeda === 'gold' ? 'ouro' : 'diamante'} e
          você aceita ou recusa em <b>Anúncios Ativos</b>. O valor de quem oferta fica retido até você responder.
        </p>
      )}
      <GameButton
        variant="primary"
        carregando={anunciar.isPending}
        disabled={!escolhido}
        onClick={() => escolhido && anunciar.mutate({
          pokeUid: escolhido.uid,
          price: apenasOferta ? null : preco,
          currency: moeda,
          apenasOferta,
        })}
      >
        {apenasOferta ? 'Abrir para lances' : 'Colocar a venda'}
      </GameButton>
    </GameCard>
  )
}
