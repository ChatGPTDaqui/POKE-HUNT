import { useState } from 'react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { SPECIES, averageIvPercent } from '@/data/pokes'
import { rarityOf } from '@/data/rarity'
import { useGameStateStore } from '@/stores/gameStateStore'
import { GameButton, GameCard, GameInput, GameSelect, SectionLabel } from '@/components/game/controls'
import { GradeDeInventario } from '@/components/game/GradeDeInventario'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { useTaxaDoMercado, taxaDeVenda } from '../useTaxaDoMercado'
import { fmt } from '../utils'
import { useMochila } from '@/features/bag/useMochila'
import { EstadoDaMochila } from '@/features/bag/EstadoDaMochila'

/** Os tres jeitos de anunciar um POKE. Excludentes por construcao — ver a nota
 *  no `GameSelect` de "Como vender". */
type Modo = 'preco_fixo' | 'lance' | 'leilao'
/** Duracoes fechadas, iguais as que `criar_leilao` aceita. A RPC recusa
 *  qualquer outro valor com frase, entao a lista aqui nao e a unica defesa. */
type Horas = 6 | 12 | 24

export function VenderPokes() {
  // Mochila sob demanda: anunciar exige a lista, entao esta tela a pede.
  const { carregada } = useMochila()
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const [uid, setUid] = useState('')
  const [preco, setPreco] = useState(5000)
  const [moeda, setMoeda] = useState<'gold' | 'diamond'>('gold')
  const [modo, setModo] = useState<Modo>('preco_fixo')
  const [horas, setHoras] = useState<Horas>(24)
  const [lanceMinimo, setLanceMinimo] = useState(1000)
  // Incremento default de 100, e nao 1: com incremento de 1 o leilao vira uma
  // guerra de +1 que ninguem quer disputar, e o vendedor que nao pensou no
  // numero cai justamente nesse caso.
  const [incremento, setIncremento] = useState(100)
  const anunciar = useAcaoMercado(mercadoRpc.anunciarPoke)
  const leiloar = useAcaoMercado(mercadoRpc.criarLeilao)
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
      {/* Grade, e nao dropdown (PH-114): o que se escolhe aqui sai da mochila,
          e o texto do `<select>` nao mostrava sprite, borda de raridade nem
          shiny. O dado que estava no rotulo da opcao nao se perdeu — ele passou
          pro `title`/`aria-label` do slot e pra linha de resumo abaixo, que
          descreve o SELECIONADO em vez de todos ao mesmo tempo. */}
      <div className="flex flex-col gap-[.2em] text-[.78em] text-n400">
        POKE
        <GradeDeInventario
          rotuloDoGrupo="POKE para anunciar"
          selecionado={escolhido?.uid ?? null}
          onSelecionar={setUid}
          slots={elegiveis.map((p) => ({
            id: p.uid,
            rotulo: `${p.isShiny ? '✨ ' : ''}${SPECIES[p.speciesId].name} Lv${p.level} · ${rarityOf(p).label} · IV ${averageIvPercent(p.ivs).toFixed(0)}%`,
            conteudo: (
              <PokeSwatch species={SPECIES[p.speciesId]} isShiny={p.isShiny} poke={p} size={2.5} />
            ),
          }))}
        />
        {escolhido && (
          <span className="text-n300">
            {escolhido.isShiny ? '✨ ' : ''}
            {SPECIES[escolhido.speciesId].name} Lv{escolhido.level} · {rarityOf(escolhido).label}
            {' · '}IV {averageIvPercent(escolhido.ivs).toFixed(0)}%
          </span>
        )}
      </div>
      {/* Os tres modos sao MUTUAMENTE EXCLUSIVOS, entao viraram uma selecao e
          nao dois checkboxes (PH-101). Com dois booleanos haveria quatro
          estados, dois deles sem significado — "leilao e preco fixo ao mesmo
          tempo" e uma combinacao que a check do banco recusa, e a tela nao
          deveria nem ser capaz de montar. */}
      <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
        Como vender
        <GameSelect value={modo} onChange={(e) => setModo(e.target.value as Modo)}>
          <option value="preco_fixo">Preço fixo — compra direta</option>
          <option value="lance">Somente lance — você aceita ou recusa</option>
          <option value="leilao">Leilão — maior lance no fim leva</option>
        </GameSelect>
      </label>

      <div className="flex flex-wrap items-end gap-[.5em]">
        {/* Sem compra direta nao existe preco — o campo sai da tela em vez de
            ficar desabilitado com um numero que nao vale nada. */}
        {modo === 'preco_fixo' && (
          <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
            Preco
            <GameInput
              type="number" min={1} className="w-[8em]" value={preco}
              onChange={(e) => setPreco(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </label>
        )}
        {modo === 'leilao' && (
          <>
            <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
              Duração
              <GameSelect value={horas} onChange={(e) => setHoras(Number(e.target.value) as Horas)}>
                <option value={6}>6 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas</option>
              </GameSelect>
            </label>
            <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
              Lance mínimo
              <GameInput
                type="number" min={1} className="w-[8em]" value={lanceMinimo}
                onChange={(e) => setLanceMinimo(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              />
            </label>
            <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
              Incremento
              <GameInput
                type="number" min={1} className="w-[7em]" value={incremento}
                onChange={(e) => setIncremento(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Moeda
          <GameSelect value={moeda} onChange={(e) => setMoeda(e.target.value as typeof moeda)}>
            <option value="gold">Ouro</option>
            <option value="diamond">Diamante</option>
          </GameSelect>
        </label>
        <div className="flex-1 text-[.8em] text-n400">
          {/* So em preco fixo. Nos outros dois modos nao ha preco pra descontar
              ainda: em "somente lance" o valor sai do lance aceito (a taxa
              aparece na hora de aceitar, em Ativos) e em leilao sai do maior
              lance no fim do prazo. Descontar `preco` neles mostraria um
              liquido calculado sobre um campo que aquele modo nem usa. */}
          {modo === 'preco_fixo' && (
            taxa > 0
              ? <>Voce recebe <b className="text-gold">{fmt.format(preco - taxa)}</b>
                <span className="text-n500"> (taxa de {regra.percentual}%: {fmt.format(taxa)})</span>.{' '}</>
              : <>Voce recebe <b className="text-gold">{fmt.format(preco)}</b>
                <span className="text-n500"> (sem taxa em {moeda === 'gold' ? 'ouro' : 'diamante'})</span>.{' '}</>
          )}
          O POKE sai da sua mochila enquanto o anuncio estiver de pe.
        </div>
      </div>

      {modo === 'lance' && (
        <p className="text-[.78em] text-n500">
          O anúncio sai sem preço: outros jogadores enviam ofertas em {moeda === 'gold' ? 'ouro' : 'diamante'} e
          você aceita ou recusa em <b>Anúncios Ativos</b>. O valor de quem oferta fica retido até você responder.
        </p>
      )}
      {modo === 'leilao' && (
        <p className="text-[.78em] text-n500">
          Encerra sozinho no fim do prazo e o maior lance leva —{' '}
          <b>você não decide, e não dá para retirar depois do primeiro lance</b>. Cada lance novo tem que superar o
          anterior pelo incremento. Lance nos últimos 30 segundos estende o leilão em 30 segundos, então quem quer
          ganhar precisa cobrir de verdade em vez de esperar o último instante.
        </p>
      )}

      <GameButton
        variant="primary"
        carregando={anunciar.isPending || leiloar.isPending}
        disabled={!escolhido}
        onClick={() => {
          if (!escolhido) return
          if (modo === 'leilao') {
            leiloar.mutate({
              pokeUid: escolhido.uid,
              currency: moeda,
              horas,
              lanceMinimo,
              incrementoMinimo: incremento,
            })
            return
          }
          anunciar.mutate({
            pokeUid: escolhido.uid,
            price: modo === 'lance' ? null : preco,
            currency: moeda,
            apenasOferta: modo === 'lance',
          })
        }}
      >
        {modo === 'leilao' ? 'Abrir leilão' : modo === 'lance' ? 'Abrir para lances' : 'Colocar a venda'}
      </GameButton>
    </GameCard>
  )
}
