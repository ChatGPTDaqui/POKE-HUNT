// Trilho de status — a UNICA superficie permanente do topo.
//
// Substitui quatro superficies que antes disputavam a mesma faixa e, em 390px,
// literalmente se cobriam: `ActivePokeCard` (esquerda), `RatesCard` (ao lado),
// `CenterBlock` (centro, que em <1140px DESCIA pra cima dos outros dois) e
// `TrainerCard` + `SideMenuColumn` (direita). Medido no aparelho: os cards da
// esquerda e da direita somavam ~450px de largura numa tela de 374px uteis, e o
// HP do POKE ficava atras da carteira.
//
// O criterio pra estar no trilho e um so: o dado muda sozinho e o jogador olha
// pra ele sem ter pedido. HP, XP, carteira. Todo o resto (local, Pokedex,
// taxas) mora atras de um toque, na gaveta de detalhes — nao porque importe
// menos, mas porque ele NAO muda entre um olhar e outro.
import { useState } from 'react'
import { CaretDown, ChartLineUp, User } from '@phosphor-icons/react'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { spriteUrl } from '@/data/sprites'
import { faceEmocaoUrl } from '@/data/faceEmotions'
import { rarityOf } from '@/data/rarity'
import { stoneName } from '@/data/stones'
import { EscolhaDeEvolucao } from '@/components/modals/EscolhaDeEvolucao'
import {
  canEvolve, evolutionStoneRequirement, expProgressForInstance, opcoesDisponiveis,
} from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { getPerfStats } from '@/engine/systems/farmRates'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useUiStore, useDeviceMode } from '@/stores/uiStore'
import { Carteira } from '@/components/hud/Carteira'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { useFaceDoPoke } from '@/hooks/useFaceDoPoke'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { GameButton } from '@/components/game/controls'
import { SalaChip } from '@/components/hud/SalaChip'
import { useIntervalo } from '@/hooks/useIntervalo'
import { cn } from '@/lib/utils'

const TOTAL_ESPECIES = Object.keys(SPECIES).length

function fmtTaxa(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000) return `${(valor / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(valor)
}

export function StatusRail() {
  // 'deitado' conta como LARGO aqui, nao como celular: a tela tem 844px de
  // largura sobrando e esconder local/taxas atras de um toque so criaria um
  // toque a mais. O que falta deitado e altura, e nada do que entra na faixa
  // do meio aumenta a altura do trilho.
  const mode = useDeviceMode().mode
  const estreito = mode === 'compacto'
  const [gavetaAberta, setGavetaAberta] = useState(false)

  return (
    <div className="pointer-events-auto flex flex-col items-stretch gap-[.4em]">
      <div
        className={cn(
          // `overflow-hidden` e rede de seguranca, nao layout: se algum dado
          // novo (um nome de treinador longo, uma moeda de 13 digitos) estourar
          // a conta de novo, ele corta em vez de deixar o avatar sair da tela.
          'vidro flex items-center gap-[.5em] overflow-hidden rounded-[1.1em] py-[.35em] pr-[.4em] pl-[.35em]',
        )}
      >
        <FacePoke />
        <VitaisPoke />
        {/* Sobra de largura vira espaco AQUI, e nao barra de HP mais longa (ver
            `VitaisPoke`): sem este vao, com as barras tendo teto, o grupo da
            direita (carteira, detalhes, avatar) descolava da borda do trilho e
            ficava flutuando no meio dele — os vizinhos sao todos `shrink-0` e
            nenhum cresce pra ocupar o resto.

            PH-272: O VAO DEIXOU DE SER VAZIO. Ele e a faixa central do trilho, e
            e nela que "Sala 3/10 Relvado" mora agora, a pedido do usuario.
            `justify-center` dentro do proprio vao: o chip fica no meio do espaco
            que sobra, sem nunca sobrepor os vizinhos. Posicao absoluta
            centralizada na TELA foi descartada — em largura media ela passaria
            por cima da carteira, e o trilho ja teve esse defeito uma vez (ver o
            cabecalho deste arquivo).

            A sobra continua virando espaco quando nao ha o que mostrar, entao a
            razao original do vao segue de pe. */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          {!estreito && <FaixaCentral />}
        </div>
        {/* AS TAXAS E A CARTEIRA SAIRAM DAQUI (PH-279), a pedido do usuario.
            As taxas foram pro canto inferior direito (`TaxasNoCanto`) e a
            carteira entrou no card do treinador, logo ali na direita.

            Ganho de largura que isso deu ao trilho, medido em 1280: ~430px, que
            eram a soma das tres taxas (~230px) com o ouro e o diamante em valor
            cheio (~200px). Era essa largura que faltava pra faixa central — a
            PH-272 tinha acabado de reduzir as taxas a so `Gold/h` pra o nome do
            sub-bioma caber, e agora nem isso e preciso.

            As duas continuam na gaveta logo abaixo: as taxas em grade de quatro
            e o valor CHEIO da carteira no `title` do card e no perfil. */}
        {/* NO COMPACTO A CARTEIRA FICA AQUI MESMO, e nao no card: o card do
            treinador nao existe em 390px — ele desce pra gaveta por falta de
            largura (ali o avatar virava um icone generico ocupando ~46px
            permanentes da faixa mais disputada da tela). Mandar a carteira pra
            dentro dele sem esta linha tirava ouro e diamante da tela inteira no
            celular, deixando o jogador sem saber quanto tem sem abrir a
            gaveta. */}
        {estreito && <Carteira abreviada />}
        <BotaoDetalhes aberta={gavetaAberta} onToggle={() => setGavetaAberta((v) => !v)} />
        {/* PH-282: o card do treinador NAO fica mais aqui. Ele e o primeiro item
            da coluna do canto superior direito (`ColunaDeAtalhos`), porque este
            trilho para em `max-w-[64em]` e o card parava junto — em 1920px
            sobravam ~480px de tela a direita dele. */}
      </div>

      {gavetaAberta && <GavetaDetalhes comTreinador={estreito} />}
      <ChipEvolucao />
    </div>
  )
}

// --- POKE em campo -----------------------------------------------------------
// FONTE DE HP/EXP: `worldStore.player.poke`, nao `gameStateStore.team`. Durante
// a hunt o HP muda a cada tick no worldStore e so volta pro gameState de tempos
// em tempos — ler do save mostra HP defasado no meio do combate.
function usePokeAtivo(): PokeInstance | null {
  const worldPoke = useWorldStore((s) => s.player?.poke ?? null)
  const teamPoke = useGameStateStore((s) => s.team[s.activeIndex] ?? null)
  return worldPoke ?? teamPoke
}

// A ARTE muda com o estado do POKE — dor, tontura, sono, comemoracao (ver
// data/faceEmotions.ts). O trilho ja dizia HP/status em barra e selo; a face
// existe pra dizer a mesma coisa sem exigir leitura, e um retrato fixo era a
// unica peca do trilho que nao respondia a nada.
function FacePoke() {
  const poke = usePokeAtivo()
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const face = useFaceDoPoke(poke)
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null
  // `faceEmocaoUrl` ja cai na face neutra quando a especie nao tem a expressao,
  // entao o `??` aqui so cobre especie sem retrato NENHUM.
  const url = faceEmocaoUrl(poke.speciesId, poke.isShiny, face) ?? spriteUrl(poke.speciesId, poke.isShiny)
  const rarity = rarityOf(poke)
  return (
    <button
      type="button"
      data-keep-open
      aria-label={`Perfil de ${species.name}`}
      onClick={() => showProfile(poke, species)}
      // A raridade vira a MOLDURA em vez de um selo de texto ao lado do nome:
      // no trilho de uma linha nao ha largura pra "MYTHIC" escrito, e a cor
      // carrega a mesma informacao de relance.
      className="h-[2.5em] w-[2.5em] shrink-0 cursor-pointer overflow-hidden rounded-[.6em] border-2 bg-n900"
      style={{ borderColor: rarity.color }}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />}
    </button>
  )
}

function VitaisPoke() {
  const poke = usePokeAtivo()
  const fainted = useWorldStore((s) => s.player?.fainted ?? false)
  const statusVolatil = useWorldStore((s) => (
    s.player && poke && s.player.poke.uid === poke.uid ? s.player.statusVolatil : null
  ))
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null

  const hpPct = Math.max(0, Math.min(100, (poke.hp / poke.stats.hp) * 100))
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))
  const hpBaixo = hpPct < 30

  // O NUMERO nao arredonda igual a barra (PH-157). `Math.round` mentiria nas
  // duas pontas que mais importam: com 4 de 900 de HP ele escreve `0%` num POKE
  // que esta VIVO, e com 897 de 900 escreve `100%` num POKE que ja levou dano.
  // Nos dois casos o jogador le o oposto do que precisa decidir.
  //
  // `floor` resolve a ponta de cima (897/900 vira 99%) e o piso de 1 resolve a
  // de baixo — `0%` fica reservado pro POKE caido de verdade, que e a unica
  // situacao em que ele e a informacao certa.
  const hpNumero = poke.hp > 0 ? Math.max(1, Math.floor(hpPct)) : 0

  return (
    // LARGURA FIXA (PH-157), e nao mais uma coluna elastica entre piso e teto.
    //
    // Antes daqui saiam `min-w-[min(9em,34vw)] max-w-[14em] flex-1`, e esta era
    // a UNICA `flex-1` do trilho com conteudo: entre o piso e o teto, toda
    // largura que um IRMAO ganhava ou perdia saia daqui. Barra que muda de
    // tamanho sozinha e ruim de ler de relance, que e a unica coisa que ela
    // precisa fazer.
    //
    // Quem mexia, e a resposta NAO e o que parece: os irmaos sao `FacePoke`, o
    // vao vazio, a `Carteira`, o `BotaoDetalhes` e — no modo amplo —
    // `ResumoLocal` e `TaxasInline`. A que muda sozinha DURANTE o jogo e a
    // Carteira, porque ela imprime o ouro e o numero troca de largura com o
    // valor.
    //
    // Selo de status, selo `KO` e nome da especie NAO entram nessa conta, por
    // mais que pareca: os tres vivem DENTRO desta coluna, na linha do nome, e
    // disputam com o nome (que trunca) — nunca com a barra. Escrito aqui porque
    // a primeira versao deste comentario culpava justamente os tres, e mandava
    // o leitor procurar `StatusBadge` entre os irmaos, onde ele nao esta
    // (PH-160).
    //
    // Medido a 600px de viewport, forcando a largura da Carteira de 60 a 220px:
    // a coluna ia de 221,2px a 144px no layout antigo — 77,2px de amplitude — e
    // fica em 204px fixos com esta versao. A 1280px eram 66,6px de amplitude.
    // O numero esta aqui pra impedir que alguem "otimize" isto de volta.
    //
    // `min(14em, 34vw)` e FIXO PARA UMA DADA TELA, nao fixo em pixel absoluto —
    // e a distincao importa. Os dois numeros sao herdados de PH-54 e foram
    // MEDIDOS:
    //
    //  - `34vw` e o valor em que o conteudo do trilho cabe inteiro num aparelho
    //    de 320px. Com `14em` secos, os 224px mais os vizinhos de tamanho fixo
    //    estouram a caixa e quem sai pela borda e o avatar do treinador. Em
    //    320px este `min` da 108,8px — exatamente o piso que valia antes.
    //  - `14em` e onde a barra ja diz "esta acabando" sem ajuda; acima disso a
    //    largura extra nao acrescenta informacao. O trilho vai ate 64em
    //    (features/game/HudLayer.tsx), entao sem teto ela esticaria por 600px+.
    //
    // A sobra continua virando o vao antes do grupo da direita (o `flex-1`
    // vazio no trilho) — por isso tirar o `flex-1` daqui nao descola a carteira
    // da borda.
    // PH-193 (item 4): a largura fixa desceu do BLOCO pra BARRA.
    //
    // O conserto do PH-157 esta certo e continua inteiro — a barra segue com
    // `min(14em,34vw)` fixo, pelos mesmos motivos medidos acima. O efeito
    // colateral que ninguem viu na epoca foi outro: como a largura fixa estava
    // no bloco INTEIRO, a linha do nome herdava o mesmo teto e truncava junto.
    // Em 390px saia `Charmele…` com ~200px de vao vazio sobrando na mesma
    // linha, entre o `42%` e a carteira — o nome cortava por causa de um limite
    // que existia pra proteger a BARRA, nao ele.
    //
    // Agora o bloco cresce com o nome ate um teto proprio e a sobra vira o
    // mesmo `flex-1` vazio de antes; a barra nao muda de tamanho em nenhum dos
    // dois casos, que e a unica coisa que o PH-157 pediu.
    <div className="flex shrink-0 flex-col gap-[.18em]">
      {/* Teto proprio da linha do nome: sem ele, uma especie de nome longo
          empurraria a carteira pra fora em tela estreita. Medido — ver o
          comentario do bloco das porcentagens. */}
      <div className="flex min-w-0 max-w-[min(22em,52vw)] items-center gap-[.35em] text-[.82em] leading-none">
        <span className={cn('truncate font-medium', poke.isShiny && 'text-shiny')}>
          {poke.isShiny && '✨'}{species.name}
        </span>
        <span className="shrink-0 text-[.85em] text-n400">Lv {poke.level}</span>
        {fainted && <span className="shrink-0 text-[.85em] font-medium text-bad">KO</span>}
        <StatusBadge status={poke.status} />
        <StatusBadge status={statusVolatil} />
      </div>
      {/* As duas porcentagens (PH-157), a pedido do usuario. A versao anterior
          nao trazia numero nenhum, com o argumento de que o valor exato so
          importa com o jogador ja olhando o perfil — decisao revertida aqui de
          proposito, pra ninguem "corrigir" de volta depois.

          O rotulo tem largura RESERVADA (`w-[2.4em]`) e `tabular-nums`. Sem os
          dois ele viraria a proxima fonte de tremida: `7%` e `100%` tem
          larguras diferentes, e a barra ao lado e quem pagaria a diferenca a
          cada tick de dano — reintroduzindo, pelo rotulo novo, exatamente o
          defeito que esta issue veio tirar. */}
      <div className="flex items-center gap-[.3em]">
        {/* A largura fixa mora AQUI agora (PH-193): na barra, que e o que o
            PH-157 protegeu. Antes ela era `flex-1` dentro de um bloco fixo, o
            que dava no mesmo enquanto o vizinho da direita nao mudava — mas
            fazia qualquer coluna nova de rotulo sair do tamanho da barra. */}
        <div className="flex w-[min(14em,34vw)] shrink-0 flex-col gap-[.12em]">
          <Barra pct={hpPct} altura=".34em" cor={hpBaixo ? 'var(--color-hp-low)' : 'var(--color-hp)'} />
          <Barra pct={expPct} altura=".18em" cor="var(--color-exp)" />
        </div>
        {/* ROTULO EM CADA PORCENTAGEM (PH-193, item 3). Eram dois numeros
            empilhados em `.6em`, sem nada dizendo qual era HP e qual era XP —
            `42%` em cima de `0%` nao se explica sozinho, e a ordem so e obvia
            pra quem ja sabe.
            `justify-between` mantem o numero encostado a direita e o rotulo a
            esquerda; a largura continua RESERVADA e `tabular-nums`, entao `7%`
            e `100%` seguem ocupando o mesmo espaco e a tremida que o PH-157
            tirou nao volta pela porta do rotulo. */}
        <div className="w-[3.9em] shrink-0 text-[.6em] leading-[1.5] tabular-nums text-n400">
          <div className={cn('flex justify-between gap-[.3em]', hpBaixo && 'text-bad')}>
            <span className="font-medium">HP</span>
            <span>{hpNumero}%</span>
          </div>
          {/* EXP nao usa o piso de 1: `0%` logo depois de subir de nivel e o
              dado certo, e nao um POKE morto. */}
          <div className="flex justify-between gap-[.3em]">
            <span className="font-medium">XP</span>
            <span>{Math.floor(expPct)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Barra({ pct, altura, cor }: { pct: number; altura: string; cor: string }) {
  return (
    <span className="relative block w-full overflow-hidden rounded-full bg-n800" style={{ height: altura }}>
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
        style={{ width: `${pct}%`, background: cor }}
      />
    </span>
  )
}

// --- carteira e treinador ----------------------------------------------------
// PH-282: as duas mudaram de arquivo. A carteira foi pra hud/Carteira.tsx
// (ela e usada nos dois lugares agora) e o card do treinador virou
// components/hud/CardDoTreinador.tsx, ancorado no canto superior direito junto
// com a coluna de atalhos — dentro do trilho ele nunca alcancava a borda em
// tela larga, porque o trilho para em 64em.

// --- gaveta de detalhes ------------------------------------------------------
function BotaoDetalhes({ aberta, onToggle }: { aberta: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-keep-open
      aria-label={aberta ? 'Esconder detalhes' : 'Mostrar detalhes'}
      aria-expanded={aberta}
      onClick={onToggle}
      // `alvo-estendido`: a seta e estreita de proposito (esticar engordaria o
      // trilho inteiro), entao quem cresce no toque e so a area.
      className="alvo-estendido relative flex h-[1.9em] w-[1.5em] shrink-0 cursor-pointer items-center justify-center rounded-[.4em] text-n400"
    >
      <CaretDown className={cn('transition-transform duration-150', aberta && 'rotate-180')} />
    </button>
  )
}

function useTaxas() {
  const perfStats = useGameStateStore((s) => s.perfStats)
  // O denominador e tempo decorrido: ele avanca sozinho mesmo sem nenhum abate,
  // entao o valor precisa ser recalculado no relogio, nao no estado.
  useIntervalo(1000)
  return getPerfStats({ perfStats } as Parameters<typeof getPerfStats>[0])
}

/**
 * A faixa central do trilho (PH-272): a sala, ou o nome do lugar quando nao ha
 * sala.
 *
 * NUNCA OS DOIS, E NUNCA NENHUM — e o ponto deste componente.
 *
 *  - Os dois juntos seriam duas respostas pra mesma pergunta ("onde estou"), com
 *    o nome da hunt repetindo o que o sub-bioma ja diz melhor.
 *  - Nenhum deixaria um buraco no meio do trilho justamente no Hospital, que e
 *    onde o jogador para pra ler a tela. O criterio de aceite da issue pede
 *    exatamente isso.
 *
 * O nome do lugar era um bloco proprio encostado a direita, entre o vao e as
 * taxas (`ResumoLocal`). Ele existia porque em hunt de BOSS nao ha chip de sala
 * e o jogador ficaria sem saber onde esta — essa razao continua valendo, e por
 * isso ele nao sumiu: virou o outro lado deste `if`.
 */
function FaixaCentral() {
  const temSala = useWorldStore((s) => s.sala != null)
  const huntName = useWorldStore((s) => s.mapDef?.name ?? 'Hospital')
  if (temSala) return <SalaChip embutido />
  return <div className="max-w-[12em] truncate text-center text-[.72em] text-n300">{huntName}</div>
}

// PH-279: `TaxasInline` saiu daqui. As taxas viraram `TaxasNoCanto`, ancorada no
// canto inferior direito — o trilho nao mostra mais nenhuma delas. A grade de
// quatro na gaveta (logo abaixo) continua igual, e continua sendo o lugar onde
// `Shinys` aparece.

function GavetaDetalhes({ comTreinador }: { comTreinador: boolean }) {
  const stats = useTaxas()
  const abrirAnalyzer = useUiStore((s) => s.setAnalyzerOpen)
  const setPerfilOpen = useUiStore((s) => s.setPerfilOpen)
  const trainer = useGameStateStore((s) => s.trainer)
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const huntName = useWorldStore((s) => s.mapDef?.name ?? 'Hospital')
  const registradas = Object.keys(pokedexKills).length

  return (
    <div className="vidro flex flex-col gap-[.45em] rounded-[.9em] px-[.8em] py-[.6em] text-[.78em]">
      <div className="flex items-baseline justify-between gap-[.6em]">
        <span className="truncate font-medium text-n100">{huntName}</span>
        <span className="shrink-0 text-n400">Pokedex <b className="font-medium text-n200">{registradas}/{TOTAL_ESPECIES}</b></span>
      </div>
      {comTreinador && (
        <GameButton
          variant="secondary"
          data-keep-open
          block
          className="justify-between"
          onClick={() => setPerfilOpen(true)}
        >
          <span className="flex items-center gap-[.4em]"><User weight="fill" /> {trainer.name}</span>
          <span className="text-n400">Lv {trainer.level}</span>
        </GameButton>
      )}
      <div className="grid grid-cols-4 gap-[.3em] text-center text-[.85em]">
        <Taxa rotulo="Gold/h" valor={fmtTaxa(stats.goldPerHour)} cor="var(--color-gold)" />
        <Taxa rotulo="XP/h" valor={fmtTaxa(stats.xpPerHour)} />
        <Taxa rotulo="Mobs/h" valor={String(stats.mobsPerHour)} />
        <Taxa rotulo="Shinys" valor={String(stats.shinys)} cor="var(--color-shiny)" />
      </div>
      <div className="flex gap-[.4em]">
        <GameButton
          variant="secondary"
          data-keep-open
          className="flex-1 justify-center"
          onClick={() => abrirAnalyzer(true)}
        >
          <ChartLineUp /> Hunt Analyzer
        </GameButton>
        {/* Resetar fica separado do resto: ele descarta a amostra inteira e nao
            pode dividir area de toque com "ver detalhes". */}
        <GameButton
          variant="ghost"
          className="shrink-0 justify-center"
          onClick={() => controller.resetPerfStats()}
        >
          Resetar
        </GameButton>
      </div>
    </div>
  )
}

function Taxa({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex flex-col gap-[.1em] rounded-[.5em] bg-n900/60 py-[.3em]">
      <span className="text-[.8em] text-n500">{rotulo}</span>
      <b className="font-medium tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</b>
    </div>
  )
}

// --- evolucao ----------------------------------------------------------------
// Fora do trilho, como chip proprio: a acao aparece poucas vezes na vida de um
// POKE e some de novo. Dentro do trilho ela roubaria largura permanente de HP e
// carteira pra ficar 99% do tempo invisivel.
function ChipEvolucao() {
  const poke = usePokeAtivo()
  const acao = useAcaoPendente()
  // PH-139: aberto quando a especie tem mais de um destino. Hook antes de
  // qualquer `return` — a ordem dos hooks nao pode depender de condicao.
  const [escolhendo, setEscolhendo] = useState(false)
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species || !canEvolve(poke, species)) return null
  const opcoes = opcoesDisponiveis(poke, species)
  const stoneReq = evolutionStoneRequirement(species, opcoes[0])
  const pending = acao.isPending(`evo:${poke.uid}`)
  const evoluir = (alvo?: string) => {
    setEscolhendo(false)
    void acao.run(`evo:${poke.uid}`, () => controller.evolvePoke(poke.uid, alvo))
  }
  return (
    <>
    {escolhendo && (
      <EscolhaDeEvolucao
        poke={poke}
        opcoes={opcoes}
        requisito={(o) => evolutionStoneRequirement(species, o)}
        onEscolher={evoluir}
        onCancelar={() => setEscolhendo(false)}
      />
    )}
    <button
      type="button"
      data-keep-open
      disabled={pending}
      onClick={() => (opcoes.length > 1 ? setEscolhendo(true) : evoluir())}
      className="vidro-flutua alvo-toque flex cursor-pointer items-center justify-center gap-[.4em] self-start rounded-full border-gold px-[.9em] py-[.35em] text-[.8em] font-medium text-gold disabled:opacity-50"
    >
      ✨ {opcoes.length > 1
        ? 'Evoluir…'
        : stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'}
    </button>
    </>
  )
}
