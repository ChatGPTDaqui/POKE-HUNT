// Pecas do perfil de POKE: cabecalho (sprite gen5 animada + identidade +
// barras), grid de stats/IVs, e a tabela de moveset completo.
//
// O cabecalho fica FORA do corpo trocado pelas abas (ver PokeProfileModal): se
// fosse remontado a cada clique de aba, a animacao do GIF reiniciaria do zero.
import type { ReactNode } from 'react'
import { expProgressForInstance } from '@/engine/systems/progressionSystem'
import { getAbility, BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis, MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { rarityOf } from '@/data/rarity'
import { descricaoDaNatureza } from '@/data/natures'
import { STAT_LABEL } from '@/data/statLabels'
import { traitDoPoke, nomeDaTrait, traitEhOculta } from '@/data/traits'
import { descricaoDaTrait, motivoSemEfeito } from '@/data/traitInfo'
import { IV_MAX, caracteristicaDe } from '@/data/characteristics'
import {
  verbeteDaCaracteristica,
  verbeteDaNatureza,
  verbeteDaTrait,
  verbeteDoStat,
  verbeteDosTiposDaEspecie,
} from '@/data/glossario'
import type { PokeInstance, Species } from '@/data/pokes'
import { PokeNameTag } from './PokeNameTag'
import { StatusBadge } from './StatusBadge'
import { TypeChip } from './TypeChip'
import { AbilityTooltip } from './AbilityTooltip'
import { Palavra } from './Explicacao'
import { Meter } from '@/components/game/controls'
import type { AbilityCategory } from '@/data/generated/types'

// Rotulo das 3 categorias reais. Antes era um ternario `physical ? ... : ...`,
// que passou a mentir quando 'status' virou categoria de verdade com os dados
// do Ultra Sun: todo golpe de status apareceria como "Especial".
const ROTULO_CATEGORIA: Record<AbilityCategory, string> = {
  physical: 'Fisico',
  special: 'Especial',
  status: 'Status',
}

export function ProfileHero({ poke, species }: { poke: PokeInstance; species: Species }) {
  const url = gen5SpriteUrl(poke.speciesId, poke.isShiny)
  const hpPct = Math.max(0, (poke.hp / poke.stats.hp) * 100)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <div className="flex items-start gap-[.6em] border-b border-n800 p-[.7em]">
      <div
        // `object-contain` num box fixo: o GIF nativo varia muito de tamanho
        // (Charmander 41x42, Gyarados 102x84) e sem o box a arte "pula" de
        // tamanho a cada POKE aberto.
        className="flex h-[7em] w-[7em] shrink-0 items-center justify-center rounded-[.7em] border-2 bg-n900"
        style={{ borderColor: rarityOf(poke).color }}
      >
        {/* `h-full w-full` (e nao `max-h/max-w`): os GIFs nativos variam muito
            de tamanho — Charmander e 41x42, Gyarados e 102x84 — e com `max-*` os
            pequenos ficavam perdidos no meio de um box de 7em. Assim toda
            especie preenche o mesmo espaco, com upscale pixelado. */}
        <img
          src={url}
          alt={species.name}
          className="h-full w-full object-contain [image-rendering:pixelated]"
          onError={(e) => e.currentTarget.remove()}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[.35em]">
        <div className="flex flex-wrap items-center gap-[.4em]">
          <PokeNameTag poke={poke} species={species} />
          <span className="text-n400">Lv{poke.level}</span>
        </div>
        {/* Um gatilho pros DOIS chips, nao um por chip: a fraqueza de verdade
            sai da combinacao dos dois tipos (o 4x so existe assim), entao duas
            bolhas separadas dariam duas respostas incompletas. */}
        <Palavra
          verbete={verbeteDosTiposDaEspecie(species)}
          side="bottom"
          className="inline-flex gap-[.3em] no-underline"
        >
          <TypeChip type={species.type} />
          {species.type2 && <TypeChip type={species.type2} />}
        </Palavra>
        <div className="flex items-center gap-[.4em] text-[.75em] text-n400">
          <span>HP {Math.floor(poke.hp)}/{poke.stats.hp}</span>
          {/* So o nao-volatil aqui: a ficha abre pra qualquer POKE da equipe ou
              da mochila, e confusao so existe pra quem esta em campo. */}
          <StatusBadge status={poke.status} />
        </div>
        <Meter pct={hpPct} height=".45em" color={hpPct < 30 ? 'var(--color-hp-low)' : 'var(--color-hp)'} />
        <Meter pct={expPct} height=".3em" color="var(--color-exp)" />
      </div>
    </div>
  )
}

const IV_LABELS: Record<string, string> = {
  hp: 'HP', atkFis: 'AF', atkEsp: 'AE', def: 'DF', defEsp: 'DE', speed: 'VL',
}

/**
 * Os TRES tracos individuais dos jogos, na ficha do POKE.
 *
 * Ficam JUNTOS e no topo de proposito: os tres respondem a mesma pergunta ("o
 * que este individuo tem de diferente de outro da mesma especie e nivel") e
 * separa-los faria a Natureza parecer parte dos atributos e a Caracteristica,
 * enfeite. A Caracteristica em especial so faz sentido lida ao lado dos IVs
 * logo abaixo — ela e uma PISTA do IV mais alto.
 */
function TracosIndividuais({ poke }: { poke: PokeInstance }) {
  const trait = traitDoPoke(poke)
  const oculta = traitEhOculta(poke.speciesId, trait)
  const semEfeito = motivoSemEfeito(trait)
  const caracteristica = caracteristicaDe(poke.ivs)

  return (
    // DUAS bolhas por linha, e nao uma: o ROTULO explica o CAMPO ("o que e
    // natureza") e o VALOR explica AQUELE sorteio ("o que Hardy faz"). Pedido
    // explicito do usuario, e a divisao se sustenta — quem toca o rotulo nao sabe
    // o que o campo e; quem toca o valor ja sabe e quer o efeito.
    <div className="flex flex-col gap-[.35em] rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.45em] text-[.85em]">
      <div className="flex items-baseline justify-between gap-[.5em]">
        <Palavra verbete="natureza" className="shrink-0 text-n500">Natureza</Palavra>
        <Palavra
          verbete={verbeteDaNatureza(poke.nature)}
          className="min-w-0 truncate text-right font-medium"
        >
          {descricaoDaNatureza(poke.nature, (s) => STAT_LABEL[s])}
        </Palavra>
      </div>

      {trait && (
        <div className="flex flex-col gap-[.15em]">
          <div className="flex items-baseline justify-between gap-[.5em]">
            <Palavra verbete="habilidade" className="shrink-0 text-n500">Habilidade</Palavra>
            <Palavra
              verbete={verbeteDaTrait(trait, oculta)}
              className="min-w-0 truncate text-right font-medium"
            >
              {nomeDaTrait(trait)}
              {/* Habilidade OCULTA e rara (5% no nascimento) e nao aparece em
                  nenhum outro lugar do jogo — sem a marca, o jogador nao teria
                  como saber que tirou uma. */}
              {oculta && <span className="ml-[.35em] text-[.85em] text-amber-400 no-underline">oculta</span>}
            </Palavra>
          </div>
          <p className="text-[.85em] leading-tight text-n500">{descricaoDaTrait(trait)}</p>
          {/* Habilidade sem efeito AQUI e dita em voz alta, com o motivo. O
              contrario — mostrar a descricao real de uma habilidade que o motor
              ignora — seria a ficha mentindo pro jogador. */}
          {semEfeito && (
            <p className="text-[.8em] leading-tight text-amber-500/80">Sem efeito neste jogo: {semEfeito}</p>
          )}
        </div>
      )}

      {caracteristica && (
        <div className="flex items-baseline justify-between gap-[.5em]">
          <Palavra verbete="caracteristica" className="shrink-0 text-n500">Caracteristica</Palavra>
          <Palavra
            verbete={verbeteDaCaracteristica(caracteristica)}
            className="min-w-0 truncate text-right font-medium"
          >
            {caracteristica.texto}
          </Palavra>
        </div>
      )}
    </div>
  )
}

export function StatDetail({ poke, weaknessSection }: { poke: PokeInstance; weaknessSection: ReactNode }) {
  return (
    <div className="flex flex-col gap-[.5em]">
      <TracosIndividuais poke={poke} />
      {/* Ausente em POKE anterior a coluna `original_trainer` que o backfill
          nao alcancou (nenhum hoje) — a linha some em vez de mostrar vazio. */}
      {poke.originalTrainer && (
        <div className="flex items-center justify-between rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.4em] text-[.85em]">
          <span className="text-n500">Treinador original</span>
          <b className="min-w-0 truncate font-medium">{poke.originalTrainer}</b>
        </div>
      )}
      <div className="grid grid-cols-3 gap-[.4em]">
        {/* O rotulo aqui e o nome LONGO ("Defesa"), diferente do STAT_LABEL
            curto que a bolha usa como titulo — de proposito: o card tem largura
            pra escrever por extenso e a bolha nao. */}
        {([
          ['Atk Fis', 'atkFis', poke.stats.atkFis],
          ['Atk Esp', 'atkEsp', poke.stats.atkEsp],
          ['Defesa', 'def', poke.stats.def],
          ['Def Esp', 'defEsp', poke.stats.defEsp],
          ['Velocidade', 'speed', poke.stats.speed],
        ] as const).map(([label, stat, value]) => (
          <div key={label} className="flex justify-between rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.4em]">
            <Palavra verbete={verbeteDoStat(stat)} className="text-[.85em] text-n500">{label}</Palavra>
            <b className="font-medium">{value}</b>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-[.3em]">
        {/* A fileira nunca disse em nenhum lugar que aqueles seis numeros SAO os
            IVs — quem nao conhece o termo via "HP 24 AF 31" e mais nada. */}
        <Palavra verbete="iv" className="text-[.72em] text-n500">IVs</Palavra>
        {Object.entries(poke.ivs).map(([key, value]) => {
          const perfeito = value >= IV_MAX
          return (
            <Palavra key={key} verbete={verbeteDoStat(key as keyof typeof poke.ivs)} className="no-underline">
              <span
                className="rounded-[.4em] border px-[.5em] py-[.15em] text-[.72em]"
                style={{
                  color: perfeito ? '#4ade80' : 'var(--color-n400)',
                  borderColor: perfeito ? '#4ade80' : 'var(--color-n700)',
                }}
              >
                {IV_LABELS[key] || key} {value}
              </span>
            </Palavra>
          )
        })}
      </div>

      {weaknessSection}
    </div>
  )
}

// A coluna de PRECISAO entrou em 2026-08-18 a pedido do usuario, e o motivo e
// mecanico: a IA de combate ja ranqueia golpe por DANO ESPERADO (poder x
// precisao — ver combatSystem#danoEsperado), entao um golpe de 110 de poder com
// 70% de precisao vale menos que um de 90 com 100%. Sem a coluna, a tela pedia
// ao jogador uma escolha que ela nao tinha como informar.
const MOVE_GRID = 'grid grid-cols-[2.4em_1fr_3.4em_3.8em_3em_3em_2.4em_2.6em] items-center gap-[.4em]'

/**
 * "100%" / "70%". Golpe SEM dano nao mostra precisao — Danca das Espadas com
 * "100%" ao lado sugere um teste de acerto que nao existe pra ele.
 */
function textoDePrecisao(ability: { accuracy?: number; power: number }): string {
  if (ability.power <= 0) return '—'
  return `${ability.accuracy ?? 100}%`
}

// Celula da coluna "Usar". Desde 2026-08-18 vale pra TODOS os golpes,
// inclusive Ataque Basico e Explosao Elemental — os dois deixaram de ser
// liga/desliga fora do slot e passaram a disputar os 4 como o resto.
//
// Mostra a ORDEM (1o/2o/3o/4o) baseada no indice em `activeAbilities` em vez
// de um check: a posicao importa de verdade, a rotacao percorre a fila nessa
// ordem (ver pickAbilityDaFila em combatSystem.ts).
//
// `desligado` e um estado SEPARADO da ordem: o golpe pode ocupar slot e ainda
// estar fora da rotacao pelo duplo-clique no AbilityHud
// (`disabledAbilities`). Sem mostrar isso aqui, o jogador via "2º na fila"
// num golpe que o motor estava ignorando, sem nada explicando por que.
function CelulaOrdem(
  { aprendido, ordem, habilitado, desligado, onClick }:
  { aprendido: boolean; ordem: number | null; habilitado: boolean; desligado?: boolean; onClick: () => void },
) {
  if (!aprendido) return <span className="text-n700">—</span>
  const ativo = ordem != null
  return (
    <button
      type="button"
      disabled={!habilitado}
      onClick={onClick}
      title={
        !habilitado
          ? 'Saia da hunt para trocar de golpe'
          : ativo
            ? `${ordem}º na fila — clique pra remover${desligado ? ' (desligado no HUD: duplo clique no ícone religa)' : ''}`
            : 'Adicionar ao fim da fila'
      }
      className={cn(
        'h-[1.4em] w-[1.4em] rounded-[.25em] border font-[inherit] text-[.85em] leading-none',
        ativo ? 'border-primary bg-primary text-n900' : 'border-n700 bg-transparent text-n700',
        ativo && desligado && 'border-n600 bg-n600 text-n900 line-through',
        habilitado ? 'cursor-pointer' : 'cursor-not-allowed opacity-45',
      )}
    >
      {ativo ? ordem : ''}
    </button>
  )
}

/**
 * A fila dos escolhidos, na ORDEM, com as setas pra reordenar.
 *
 * Existe por duas razoes que sao a mesma: a ordem dos slots e a ordem em que o
 * POKE usa os golpes (`combatSystem#pickAbilityDaFila` percorre
 * `activeAbilities` do 1o ao ultimo), e nada na tela dizia isso — a coluna Usar
 * mostra numeros, mas so da pra "acrescentar no fim" e "remover", entao o
 * numero parecia consequencia da ordem de aprendizado.
 *
 * Fica FORA da tabela de propriedade: a tabela lista o learnset inteiro por
 * nivel, e a fila e um recorte de no maximo 4 linhas numa ordem diferente.
 * Tentar fazer as setas caberem na celula de 2.6em da coluna Usar dava tres
 * alvos de toque colados num quadrado de dedo.
 */
function FilaDeGolpes(
  { ativos, podeMover, onMover }:
  { ativos: string[]; podeMover: boolean; onMover: (de: number, passo: -1 | 1) => void },
) {
  return (
    <div className="flex flex-col gap-[.2em]">
      <span className="text-[.9em] text-n500">
        Ordem de uso: o POKE tenta o 1º, depois o 2º, e volta ao começo.
      </span>
      <div className="flex flex-wrap gap-[.3em]">
        {ativos.map((key, i) => {
          const ability = getAbility(key)
          return (
            <span
              key={`${key}-${i}`}
              className="flex items-center gap-[.25em] rounded-full border border-n700 bg-n800 pr-[.15em] pl-[.5em]"
            >
              <span className="tabular-nums text-n500">{i + 1}º</span>
              <span className="max-w-[7em] truncate">{ability?.name ?? key}</span>
              {/* Duas setas por chip em vez de arrastar: arrastar exige
                  biblioteca de DnD e nao tem equivalente de teclado, e a fila
                  tem no maximo 4 itens — uma seta resolve em um toque. */}
              {([-1, 1] as const).map((passo) => {
                const limite = passo === -1 ? i === 0 : i === ativos.length - 1
                return (
                  <button
                    key={passo}
                    type="button"
                    disabled={!podeMover || limite}
                    aria-label={`${passo === -1 ? 'Subir' : 'Descer'} ${ability?.name ?? key} na fila`}
                    title={podeMover ? (passo === -1 ? 'Usar mais cedo' : 'Usar mais tarde') : 'Saia da hunt para reordenar'}
                    onClick={() => onMover(i, passo)}
                    className={cn(
                      'h-[1.3em] w-[1.3em] rounded-full border-0 bg-transparent font-[inherit] text-[.9em] leading-none text-n300',
                      !podeMover || limite ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:text-foreground',
                    )}
                  >
                    {passo === -1 ? '‹' : '›'}
                  </button>
                )
              })}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function MovesetTable({ poke, species }: { poke: PokeInstance; species: Species }) {
  // O learnset COMPLETO da especie, nao so `poke.unlockedAbilities`: a tabela
  // tambem serve como preview de "o que vem por ai".
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => Boolean(r.ability))
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  // A selecao dos 4 so aparece pra POKE QUE E SEU. Este mesmo componente abre
  // na Pokedex com um POKE de preview (createPokeInstance com uid solto), e la
  // nao ha nada a configurar — dai a checagem por uid no estado, e nao uma prop
  // que cada chamador teria que lembrar de passar.
  const equipe = useGameStateStore((s) => s.team)
  const mochila = useGameStateStore((s) => s.bagPokes)
  const emHunt = useGameStateStore((s) => s.currentMapId) != null
  const meu = [...equipe, ...mochila].some((p) => p.uid === poke.uid)

  // `poke` e a prop que o chamador passou — pro perfil aberto de um POKE
  // seu, isso e um SNAPSHOT tirado no clique que abriu o modal
  // (usePokeProfileStore#showProfile grava o objeto, nao um uid), que nunca
  // mais atualiza sozinho. Bug real achado ao vivo: marcar/desmarcar um
  // golpe aqui dentro chamava a acao certa (RPC ida, estado global mudava),
  // mas o proprio checkbox clicado continuava mostrando o valor antigo ate
  // fechar e reabrir o modal — mesmo o slot-de-4 preexistente ja tinha esse
  // problema, so nunca tinha um teste ao vivo que clicasse e conferisse a
  // tela sem reabrir. Resolvido lendo do POKE AO VIVO (equipe/mochila) por
  // uid quando ele e seu; POKE de preview (Pokedex/ranking) nao esta em
  // nenhum dos dois arrays, entao cai de volta na prop como sempre.
  const pokeVivo = equipe.find((p) => p.uid === poke.uid) ?? mochila.find((p) => p.uid === poke.uid) ?? poke

  // SANEADO, nao cru: `golpesUtilizaveis` e a mesma porta que o combate usa,
  // entao a contagem "n/4" e os numeros da coluna Usar passam a descrever
  // exatamente o que o POKE leva pra luta.
  //
  // Lendo cru, uma escolha gravada com golpe que o learnset atual nao tem mais
  // (regra do Recordador, rename do Ultra Sun) contava pro teto de 4 sem
  // aparecer em linha nenhuma da tabela — o jogador via "4/4" com 3 numeros,
  // nao tinha o que desmarcar, e cada clique mandava a chave orfa de volta pra
  // RPC, que recusava a edicao inteira. Ver
  // data/activeAbilities.ts#sanearEscolhaDeGolpes.
  const ativos = golpesUtilizaveis(pokeVivo, species, false)
  // Pedido explicito do usuario (revertendo uma leva anterior, que a tinha
  // removido a pedido DELE tambem): build fixo durante o combate, editavel so
  // fora da hunt. Tecnicamente nao havia risco de corromper nada (o servidor
  // so le `active_abilities`/`disabled_abilities` na proxima janela de flush,
  // <=30s) — a trava aqui e regra de jogo, nao protecao de dado, e a RPC quem
  // decide de verdade (`definir_golpes_ativos`/`alternar_habilidade`, ambas
  // recusando com sessao viva — migration 20260815190000). A tela so espelha.
  const podeEscolher = meu && !emHunt
  const desabilitados = pokeVivo.disabledAbilities ?? {}

  function alternar(key: string): void {
    if (!podeEscolher) return
    const ja = ativos.includes(key)
    if (!ja && ativos.length >= MAX_ACTIVE_ABILITIES) {
      useToastStore.getState().pushToast(`Maximo de ${MAX_ACTIVE_ABILITIES} golpes — desmarque um primeiro.`, 'info', 'world')
      return
    }
    // TIRAR O ULTIMO e permitido — a liberdade de montar a build sem restricao
    // e pedido explicito registrado em data/activeAbilities.ts —, mas nao pode
    // ser silencioso: sem golpe nenhum o POKE nao ataca, ponto
    // (combatSystem#pickAbility nao tem fallback pro jogador desde
    // 2026-08-18). O sintoma aparece longe daqui, dentro da hunt, como um POKE
    // parado em campo sem nada na tela explicando — que le como jogo travado.
    if (ja && ativos.length === 1) {
      useToastStore.getState().pushToast(
        'Sem nenhum golpe escolhido seu POKE nao ataca. Escolha ao menos um.', 'error', 'world',
      )
    }
    controller.setActiveAbilities(poke.uid, ja ? ativos.filter((k) => k !== key) : [...ativos, key])
  }

  /**
   * Troca de lugar o golpe da posicao `de` com o vizinho na direcao `passo`.
   *
   * UMA chamada com a lista final, e nao uma sequencia de tira-e-poe: cada
   * chamada e um round-trip a RPC que pode falhar por conta propria, e a ordem
   * intermediaria seria gravada no meio do caminho. Antes disto nao havia como
   * reordenar: a coluna Usar so acrescenta no fim e remove, entao pra pôr um
   * golpe em 1o o jogador desmarcava os quatro e remarcava na ordem — oito
   * cliques e oito chamadas. E a ordem NAO e enfeite: e a rotacao que
   * `combatSystem#pickAbilityDaFila` percorre.
   */
  function mover(de: number, passo: -1 | 1): void {
    if (!podeEscolher) return
    const para = de + passo
    if (para < 0 || para >= ativos.length) return
    const nova = [...ativos]
    ;[nova[de], nova[para]] = [nova[para], nova[de]]
    controller.setActiveAbilities(poke.uid, nova)
  }

  return (
    <div className="overflow-hidden rounded-[.4em] border border-n800 text-[.8em]">
      {meu && (
        <div className="flex flex-col gap-[.3em] border-b border-n800 bg-n900 px-[.5em] py-[.35em]">
          <div className="flex items-center justify-between gap-[.5em]">
            <span className="text-n400">
              Golpes ativos <span className="text-foreground">{ativos.length}/{MAX_ACTIVE_ABILITIES}</span>
            </span>
            <span className="min-w-0 truncate text-n500">
              {emHunt ? 'Saia da hunt para trocar de golpe.' : 'Clique na coluna Usar para escolher.'}
            </span>
          </div>
          {ativos.length > 0 && <FilaDeGolpes ativos={ativos} podeMover={podeEscolher} onMover={mover} />}
        </div>
      )}
      <div
        className={`${MOVE_GRID} overflow-y-hidden border-b border-n800 bg-n800/60 px-[.5em] py-[.3em] font-medium`}
        style={{ scrollbarGutter: 'stable' }}
      >
        <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>Prec.</span><span>AOE</span><span>Usar</span>
      </div>
      {/* `scrollbar-gutter: stable` nos dois: sem isso, a barra de rolagem
          nativa (so aparece aqui, quando a lista estoura 18em) reduz a
          largura util so do corpo, desalinhando as colunas contra o
          cabecalho de cima (que nunca rola). Reservando o gutter sempre nos
          dois, a largura util fica igual com ou sem overflow. */}
      <div className="max-h-[18em] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        {meu && (
          <div className={`${MOVE_GRID} border-b border-n800 bg-n900 px-[.5em] py-[.3em] text-foreground`}>
            <span className="text-n400">—</span>
            <AbilityTooltip ability={BASIC_ATTACK} poke={pokeVivo}>
              <span className="cursor-help truncate underline decoration-dotted underline-offset-2">
                {BASIC_ATTACK.name}
              </span>
            </AbilityTooltip>
            <span><TypeChip type={BASIC_ATTACK.type} /></span>
            <span className="text-n400">{ROTULO_CATEGORIA[resolveAbilityCategory(BASIC_ATTACK, pokeVivo)]}</span>
            <span>{BASIC_ATTACK.power > 0 ? BASIC_ATTACK.power : '—'}</span>
            <span className="text-n400">{textoDePrecisao(BASIC_ATTACK)}</span>
            <span className="text-n400">—</span>
            <span>
              {/* Golpe comum desde 2026-08-18: ocupa um dos 4 slots como
                  qualquer outro, com a mesma celula de ORDEM. Todo POKE
                  "conhece" o Ataque Basico, entao `aprendido` e sempre true. */}
              <CelulaOrdem
                aprendido
                ordem={ativos.indexOf(BASIC_ATTACK.id) === -1 ? null : ativos.indexOf(BASIC_ATTACK.id) + 1}
                habilitado={podeEscolher}
                desligado={Boolean(desabilitados[BASIC_ATTACK.id])}
                onClick={() => alternar(BASIC_ATTACK.id)}
              />
            </span>
          </div>
        )}
        {rows.map(({ entry, ability }, index) => {
          const learned = entry.levelReq <= pokeVivo.level
          const idxNaFila = ativos.indexOf(entry.key)
          return (
            <div
              // A chave inclui o indice porque uma especie PODE aprender o
              // mesmo golpe em dois niveis (forma evoluida herda no nivel 1 e
              // reaprende no nivel real dela) — so a chave do golpe duplicaria.
              key={`${entry.key}-${index}`}
              className={`${MOVE_GRID} border-b border-n800 px-[.5em] py-[.3em] last:border-b-0 ${
                learned ? 'bg-n900 text-foreground' : 'text-n500 opacity-45'
              }`}
            >
              <span className="text-n400">{entry.levelReq}</span>
              <AbilityTooltip ability={ability} poke={pokeVivo}>
                <span className="cursor-help truncate underline decoration-dotted underline-offset-2">
                  {ability.name}
                </span>
              </AbilityTooltip>
              <span><TypeChip type={ability.type} /></span>
              <span className="text-n400">
                {ROTULO_CATEGORIA[resolveAbilityCategory(ability, pokeVivo)]}
              </span>
              <span>{ability.power > 0 ? ability.power : '—'}</span>
              {/* Abaixo de 100% em amarelo: o numero cru some no meio da linha,
                  e "esse golpe erra" e exatamente a informacao que muda a
                  escolha. 100% fica em cinza pra nao virar ruido em toda linha. */}
              <span className={(ability.accuracy ?? 100) < 100 && ability.power > 0 ? 'text-warn' : 'text-n400'}>
                {textoDePrecisao(ability)}
              </span>
              <span className="text-n400">{ability.target === 'aoe' ? '✓' : '—'}</span>
              {/* A Explosao Elemental (aoe50) usava uma celula propria de
                  liga/desliga porque nao ocupava slot. Desde 2026-08-18 ela e
                  golpe comum e cai na MESMA celula de ordem do resto. */}
              <span>{meu && (
                <CelulaOrdem
                  aprendido={learned}
                  ordem={idxNaFila === -1 ? null : idxNaFila + 1}
                  habilitado={podeEscolher}
                  desligado={Boolean(desabilitados[entry.key])}
                  onClick={() => alternar(entry.key)}
                />
              )}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
