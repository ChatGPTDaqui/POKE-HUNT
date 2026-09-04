// Port de js/ui/panels/WikiMenu.js — guia de referencia in-game, texto
// autoral + pequenas ferramentas interativas sobre dado real do jogo
// (TYPE_CHART, RARITIES). Nenhum estado do jogador e lido aqui.
import { useState, type ReactNode } from 'react'
import {
  Backpack, BookOpen, Books, Drop, FirstAid, Fire, Gear, Lightning, MapTrifold, Moon,
  Question, Robot, Scales, Snowflake, Storefront, Trophy, UsersThree, type Icon,
} from '@phosphor-icons/react'
import { TYPE_CHART, getEffectiveness } from '@/data/generated/typeChart.generated'
import { colorForType, TYPE_COLORS } from '@/data/typeColors'
import { RARITIES, RARITY_ORDER } from '@/data/rarity'
import type { ElementType, StatusCondition } from '@/data/generated/types'
import { GameSelect, SegmentedTabs } from '@/components/game/controls'
import { TypeChip as SharedTypeChip } from '@/components/shared/TypeChip'
import {
  STATUS_NAO_VOLATEIS, STATUS_VOLATEIS, TURNOS_DE_IMUNIDADE_APOS_CURA,
  regraDoStatus, nomeDoStatus, poderDoAutoDano,
} from '@/data/statusEffects'
import { TURNO_SEGUNDOS, getAbility } from '@/data/abilities'
import { formatarPrazoEmTurnos, TEXTO_DE_RITMO_CONTINUO } from '@/data/textoDeEstagioEPrazo'
import { ITEMS, type GeneratedItem } from '@/data/items'
import { STATUS_RULES } from '@/data/generated/status.generated'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { TYPED_AOE_LEVEL } from '@/data/typedAoeMoves'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { BIOMAS } from '@/data/biomas'
import { MAX_TEAM_SIZE } from '@/stores/gameStateDefaults'
import type { TraitId } from '@/data/traits'
import { WikiCard } from './WikiCard'
import { MundoTab } from './abaMundo'
import { ProgressoTab } from './abaProgresso'
import { JogadoresTab } from './abaJogadores'

const ALL_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

// A Wiki mostra o nome COMPLETO do tipo (e um guia de referencia, nao uma
// lista densa) — no resto do jogo o chip usa a abreviacao de 3 letras.
function TypeChip({ type }: { type: ElementType }) {
  return <SharedTypeChip type={type} full />
}

// Uma linha da lista "Navegando pelos menus": o MESMO icone do botao real
// (@phosphor-icons/react, a biblioteca de icones do projeto) em vez de um emoji
// aproximado do sistema operacional.
function LinhaDeMenu({ Icon, nome, children }: { Icon: Icon; nome: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-[.5em]">
      <Icon className="mt-[.15em] shrink-0 text-[1.2em] text-n300" />
      <span>
        <b>{nome}</b> — {children}
      </span>
    </li>
  )
}

function ChipList({ types }: { types: ElementType[] }) {
  if (types.length === 0) return <span className="text-[.8em] text-n400">Nenhum</span>
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <TypeChip key={t} type={t} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A ABA DE ABERTURA, REESCRITA EM 04/09 (PH-507)
// ---------------------------------------------------------------------------
// A versao anterior tinha TRES afirmacoes falsas, e as tres foram conferidas
// contra o codigo antes de sair:
//
//  1. "Deixe auto-pot, auto-catch e auto-revive ligados (vem ativados por
//     padrao)". `stores/gameStateDefaults.ts` diz `autoPot: true`,
//     `autoCatch: false`, `autoRevive: false`. Dois dos tres nascem
//     DESLIGADOS, e o proprio tutorial do jogo dizia o contrario da Wiki — o
//     jogador lia os dois e nao sabia em qual acreditar.
//
//  2. "O Novo Continente (Kanto) e liberado depois de derrotar o Campeao
//     Lance". A separacao por regiao acabou; o mundo e 12 biomas, e o gate do
//     Lance virou `progressoDeBioma.ts#bloqueioDoLance` (estagio 5 nos 12
//     biomas), que e um pre-requisito PARA enfrenta-lo, e nao um premio dele.
//
//  3. "Cada hunt tem uma faixa de nivel recomendada". As faixas de 30 niveis
//     morreram na PH-425; a regua e 10 estagios de 10 niveis por bioma.
//
// O CONTEUDO DE MUNDO SAIU DAQUI e virou a aba `MundoTab`, que e onde
// progressao mora agora. Esta aba responde uma pergunta so: "acabei de entrar,
// o que eu faco?".
function ComecandoTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Bem-vindo ao NOVO POKE IDLE">
        Este é um jogo <b>idle</b>: seu POKE em campo anda e luta sozinho contra os selvagens, e você nunca
        aperta um botão de ataque. Seu trabalho é decidir <b>onde caçar</b>, cuidar do time e gerenciar o que
        você ganha — itens, ouro e capturas.
        <br />
        <br />
        Isto é um guia de referência: use as abas acima pra achar o sistema que te interessa. Se você só quer
        começar a jogar, os três cartões seguintes bastam.
      </WikiCard>

      <WikiCard title="1. Seu inicial, e a primeira caçada">
        Na primeira vez que você abre o jogo, escolhe um dos 3 iniciais clássicos (Charmander, Squirtle ou
        Bulbasaur). Ele começa no Nível 1 e já pode ir direto pra caçada.
        <br />
        <br />
        Comece pela <b>Rota 46 (Inicial)</b>: ela fica no topo da lista de hunts, acima do mapa dos biomas, e é
        a única feita pro nível 1 — só aparecem POKEs de nível 1 e 2, então não existe risco de cruzar com algo
        forte logo de cara. Os biomas vêm depois, quando seu POKE tiver nível pra eles.
      </WikiCard>

      <WikiCard title="2. Como funciona o combate automático">
        Ao entrar numa caçada, seu POKE começa a andar pelo mapa procurando o selvagem vivo mais próximo. Ao
        chegar perto ele engaja e escolhe os golpes sozinho: entre os que estão fora de recarga, o de maior
        dano estimado contra aquele alvo — com preferência por golpe em área sempre que ele acertaria 2 ou mais
        inimigos ao mesmo tempo. Derrotado o inimigo, ele escolhe outro imediatamente. Seu POKE nunca fica
        parado esperando ordem.
        <br />
        <br />
        Se houver um <b>shiny</b> vivo na caçada, ele passa a ser o alvo prioritário automaticamente.
        <br />
        <br />
        Você pode <b>desligar</b> um golpe específico da rotação: no celular, toque no ícone dele e use o botão
        no fim da ficha; no computador, duplo clique no ícone na barra de habilidades. É útil pra impedir que a
        IA gaste um golpe fraco quando um mais forte está quase pronto.
      </WikiCard>

      <WikiCard title="3. As automações não vêm todas ligadas">
        <b>Auto-Pot</b> (usar poção) e <b>Auto-Status</b> (curar veneno, queimadura, paralisia, congelamento)
        nascem <b>LIGADOS</b>. <b>Auto-Catch</b> (jogar bola) e <b>Auto-Revive</b> nascem{' '}
        <b>DESLIGADOS</b> — os dois gastam item a cada uso, e nenhum deles deve começar consumindo seu estoque
        sem você pedir.
        <br />
        <br />
        Tudo isso vive no botão de <b>robô</b>, na barra de ação ao lado dos golpes, onde você também escolhe
        qual item cada automação deve gastar. Se você quer capturar, é lá que se liga o Auto-Catch — sem ele,
        nenhum POKE é capturado, porque não existe botão manual de jogar bola.
      </WikiCard>

      <WikiCard title="4. Navegando pelos menus">
        A barra de baixo tem os atalhos principais: <b>Equipe</b>, <b>Mochila</b>, <b>Hunt</b> (o botão do
        meio) e <b>Loja</b>. Tudo o mais — Pokedex, Mercado, Social, Bestiário, Tasks, Especialidades,
        Calculadora, Ranking, Wiki, Tutoriais, Configurações e o Hospital, quando você está numa caçada — vive
        atrás do botão <b>Mais</b>, no fim da barra. Numa tela larga, Pokedex e Mercado sobem pra barra e saem
        do Mais. Os ícones abaixo são os MESMOS que aparecem no jogo.
        <ul className="mt-[.5em] flex flex-col gap-[.4em]">
          <LinhaDeMenu Icon={UsersThree} nome="Equipe">
            seus até {MAX_TEAM_SIZE} POKEs ativos, trocar quem está em campo, evoluir, ver atributos
            completos.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Backpack} nome="Mochila">
            POKEs capturados extras e todos os seus itens (bolas, poções, revives, Pedras).
          </LinhaDeMenu>
          <LinhaDeMenu Icon={MapTrifold} nome="Hunt">
            escolher onde caçar — a Rota 46 no topo, e o mapa dos {BIOMAS.length} biomas abaixo dela.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Storefront} nome="Loja">
            comprar itens e vender POKEs e itens por ouro.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={BookOpen} nome="Pokedex">
            registro de toda espécie do jogo, mesmo as que você nunca capturou, com fraquezas,
            resistências e onde encontrar cada uma.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Scales} nome="Mercado">
            comprar e vender com outros jogadores: itens por livro de ofertas, POKEs por anúncio.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Trophy} nome="Tasks">
            cadeias de missões de abate por tipo elemental, cada uma pagando ouro.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Lightning} nome="Especialidades">
            progressão de dano e defesa por tipo elemental, paga com Pedras — vale pra conta inteira.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Books} nome="Wiki">
            este guia que você está lendo agora.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={FirstAid} nome="Hospital">
            clique na enfermeira em campo pra curar seu time por completo, de graça.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Robot} nome="Automações">
            o botão de robô na barra de ação, ao lado dos golpes — liga e desliga auto-pot, auto-status,
            auto-catch, auto-revive e auto-venda, e configura qual item cada uma deve usar.
          </LinhaDeMenu>
          <LinhaDeMenu Icon={Gear} nome="Configurações">
            reiniciar o jogo e ver o histórico de atualizações (Patch-notes).
          </LinhaDeMenu>
        </ul>
      </WikiCard>

      <WikiCard title="5. Ajustando o que você vê">
        A câmera começa afastada — você vê mais mapa ao redor do seu POKE do que o enquadramento original
        mostrava. Isso é só o ponto de partida: dentro de uma caçada, as lupas <b>+</b> e <b>−</b> à esquerda
        da barra de golpes ajustam o zoom livremente, e no computador o <b>Ctrl + roda do mouse</b> faz o
        mesmo.
      </WikiCard>

      <WikiCard title="6. Onde continuar">
        Cada aba desta Wiki é um bloco de assunto:
        <ul className="mt-[.4em] flex flex-col gap-[.3em] pl-[1.1em]" style={{ listStyleType: 'disc' }}>
          <li>
            <b>Mundo</b> — os biomas, os estágios, as salas, os chefes de sala, o clima, o Campeão Lance e o
            Modo Pesadelo. <b>Comece por aqui</b> se você não sabe pra onde ir.
          </li>
          <li><b>Combate</b> — tipos, status, como o dano é calculado, natureza e habilidade.</li>
          <li><b>Progresso</b> — captura, raridade, evolução, Especialidades, missões e economia.</li>
          <li><b>Jogadores</b> — Mercado, Troca, Social, chat e Ranking.</li>
        </ul>
      </WikiCard>
    </div>
  )
}

// Tabela de referencia 17x17 — linhas sao o tipo do golpe ATACANTE, colunas
// o tipo do POKE DEFENSOR, direto do mesmo TYPE_CHART usado no combate real
// (sem matematica de tipo duplo aqui — isso e o que a ferramenta interativa
// acima ja cobre; esta e a tabela-fonte crua de tipo unico).
function TypeMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[.7em]">
        <thead>
          <tr>
            <th className="border bg-muted px-1 py-0.5 text-left whitespace-nowrap">Atk \ Def</th>
            {ALL_TYPES.map((t) => (
              <th key={t} className="border px-1 py-0.5 text-white" style={{ background: colorForType(t) }}>
                {t.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_TYPES.map((atk) => (
            <tr key={atk}>
              <th className="border px-1 py-0.5 text-white" style={{ background: colorForType(atk) }}>
                {atk.slice(0, 3)}
              </th>
              {ALL_TYPES.map((def) => {
                const m = TYPE_CHART[atk][def]
                const cls =
                  m === 2 ? 'bg-emerald-500/25 font-semibold'
                    : m === 0.5 ? 'bg-amber-500/20'
                      : m === 0 ? 'bg-destructive/25 font-semibold'
                        : 'text-n400'
                return (
                  <td key={def} className={`border px-1 py-0.5 text-center ${cls}`}>
                    {m === 1 ? '·' : m}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TiposTab() {
  const [selected, setSelected] = useState<ElementType>('FIRE')

  const atkRow = TYPE_CHART[selected] || {}
  const strongAtk: ElementType[] = []
  const weakAtk: ElementType[] = []
  const noEffAtk: ElementType[] = []
  for (const t of ALL_TYPES) {
    const m = atkRow[t]
    if (m === 2) strongAtk.push(t)
    else if (m === 0.5) weakAtk.push(t)
    else if (m === 0) noEffAtk.push(t)
  }

  const weaknesses: ElementType[] = []
  const resistances: ElementType[] = []
  const immunities: ElementType[] = []
  for (const t of ALL_TYPES) {
    const m = getEffectiveness(t, selected, null)
    if (m === 2) weaknesses.push(t)
    else if (m === 0.5) resistances.push(t)
    else if (m === 0) immunities.push(t)
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-n900 p-3">
        <div className="mb-1.5 text-[.9em] font-medium">Como funciona a efetividade de tipos</div>
        <div className="text-[.8em] leading-relaxed text-n400">
          Todo golpe tem um tipo elemental. Quando ele acerta um POKE, o dano e multiplicado de acordo com o
          tipo do defensor: <b>2x</b> (super eficaz), <b>0.5x</b> (pouco eficaz/resistido) ou <b>0x</b> (sem
          efeito/imune) — sem multiplicador nenhum, o golpe causa dano normal (1x). POKEs com <b>dois tipos</b>{' '}
          multiplicam os dois efeitos juntos (ex.: um golpe de Agua contra um POKE Terra+Rocha seria 2x * 2x =
          4x de dano).
        </div>
        <GameSelect
          value={selected}
          onChange={(e) => setSelected(e.target.value as ElementType)}
          className="mt-[.45em] w-[11em]"
        >
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </GameSelect>
      </div>

      <div className="rounded-lg border bg-n900 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[.9em] font-medium">
          Atacando com golpes de <TypeChip type={selected} />
        </div>
        <div className="space-y-1.5">
          <div className="text-[.8em] text-n400">Super eficaz (2x) contra:</div>
          <ChipList types={strongAtk} />
          <div className="text-[.8em] text-n400">Pouco eficaz (0.5x) contra:</div>
          <ChipList types={weakAtk} />
          <div className="text-[.8em] text-n400">Sem efeito (0x) contra:</div>
          <ChipList types={noEffAtk} />
        </div>
      </div>

      <div className="rounded-lg border bg-n900 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[.9em] font-medium">
          Defendendo como um POKE de <TypeChip type={selected} />
        </div>
        <div className="space-y-1.5">
          <div className="text-[.8em] text-n400">Fraqueza — recebe 2x de:</div>
          <ChipList types={weaknesses} />
          <div className="text-[.8em] text-n400">Resistência — recebe 0.5x de:</div>
          <ChipList types={resistances} />
          <div className="text-[.8em] text-n400">Imunidade — recebe 0x de:</div>
          <ChipList types={immunities} />
        </div>
      </div>

      <div className="rounded-lg border bg-n900 p-3">
        <div className="mb-1.5 text-[.9em] font-medium">
          Tabela completa (linhas = golpe atacante, colunas = POKE defensor)
        </div>
        <div className="mb-2 text-[.8em] text-n400">
          Arraste pros lados pra ver a tabela inteira. "·" = dano normal (1x).
        </div>
        <TypeMatrix />
      </div>
    </div>
  )
}

function RaridadesTab() {
  const rows = RARITY_ORDER.map((key) => RARITIES[key])
  return (
    <div className="space-y-2">
      <WikiCard title="O que e a raridade de um POKE">
        Toda vez que um POKE aparece (selvagem em campo ou capturado), ele sorteia uma <b>raridade</b> — um
        eixo totalmente independente da especie ou da hunt de onde veio. Um Rattata comum pode nascer "Mythic"
        do mesmo jeito que um Dragonite pode nascer "Comum" — a chance por especie/hunt de aparecer ja existia
        antes e continua separada (ver a aba "Efetividade de Tipos"/Pokedex pra isso). Quanto mais rara, maior
        o multiplicador de status <b>e</b> de valor de venda — POKEs raros não são só um troféu, são mais
        fortes de verdade.
      </WikiCard>

      <div className="rounded-lg border bg-n900 p-3">
        <div className="mb-1.5 text-[.9em] font-medium">Tabela de raridades</div>
        <div className="overflow-hidden rounded-md border text-[.8em]">
          <div className="grid grid-cols-4 gap-1 border-b bg-muted/50 px-2 py-1 font-medium">
            <span>Raridade</span><span>Chance</span><span>Status</span><span>Venda</span>
          </div>
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-4 gap-1 border-b px-2 py-1 last:border-b-0">
              <span style={{ color: r.color }} className="font-semibold">{r.label}</span>
              <span>{r.weight}%</span>
              <span>{r.statMultiplier}x</span>
              <span>{r.sellMultiplier}x</span>
            </div>
          ))}
        </div>
      </div>

      <WikiCard title="Shiny — um eixo separado">
        Além da raridade, todo POKE também tem uma chance independente de nascer <b>Shiny</b> (aparência
        alternativa, ✨ no nome) — a taxa real e 200x mais alta que a taxa oficial dos jogos, proporcional a
        taxa de captura da propria especie. Shiny nao muda status nem venda por si so (isso e o que a raridade
        acima faz) — e puramente um brinde visual raro, mas continua contando pro seu placar no painel de
        performance e no chat.
      </WikiCard>

      <WikiCard title="Lendários">
        Os <b>{LEGENDARY_SPECIES_IDS.length} POKEs lendários</b> do Dex não aparecem em nenhuma caçada normal —
        eles são exclusivos das <b>hunts BOSS</b> do Modo Pesadelo, uma por lendário: confronto único e fixo,
        nível bem alto, sem respawn. Em campo eles são desenhados maiores que o normal pra refletir o tamanho
        da luta, mas isso é apresentação: a raridade sorteada neles segue a mesma tabela acima.
        <br />
        <br />
        A barra de vida deles é a mesma de qualquer selvagem. A barra grande no topo é do <b>chefe de sala</b>{' '}
        (Guardião ou Lord), e não do lendário.
      </WikiCard>
    </div>
  )
}

// AS MECANICAS DE CAMPO, e nao mais "Mecanicas" solto (PH-507).
//
// A aba antiga era um balde: captura, aggro, camera, area e recarga no mesmo
// lugar, sem nada em comum a nao ser "nao cabia nas outras seis abas". Dois
// verbetes saem daqui pra onde eles pertencem — a captura vira `abaProgresso`
// (ela e sobre o que voce GANHA, e o resto da economia esta la) e o campo de
// visao vira a aba de abertura (e um controle de tela, nao uma mecanica de
// jogo). O que sobra sao as tres regras que governam o combate em campo, e o
// nivel do golpe de area agora vem de `TYPED_AOE_LEVEL`.
function MecanicasDeCampoTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Agressividade e desistência (aggro e leash)">
        Cada selvagem tem um raio de <b>agressividade</b> — a distância a partir da qual ele nota seu POKE e
        começa a se aproximar. Esse alcance é <b>moderado</b> de propósito: o selvagem persegue de uma
        distância média, nunca do mapa inteiro.
        <br />
        <br />
        Uma vez começada a perseguição, existe um raio de <b>desistência</b> mais generoso: se a distância
        entre vocês crescer demais depois do engajamento, ele desiste e volta a vagar perto de onde nasceu, em
        vez de te seguir pra sempre.
        <br />
        <br />
        Do seu lado, seu POKE foca o inimigo vivo <b>mais próximo do mapa inteiro</b> — ou o <b>shiny</b> mais
        próximo, se houver algum vivo, que tem prioridade automática sobre qualquer outro alvo — e reescolhe o
        alvo a cada abate. Ele caça ativamente pelo mapa em vez de esperar os selvagens vierem.
      </WikiCard>

      <WikiCard title="Golpes em área (AoE)">
        Alguns golpes — marcados com uma bolinha verde no ícone da barra de habilidades — atingem{' '}
        <b>todos os alvos</b> dentro de um raio ao redor de quem usou, em vez de um alvo só. O anel que se
        expande em campo é desenhado <b>exatamente do tamanho real</b> da área, então dá pra ver quem vai ser
        atingido antes de acontecer.
        <br />
        <br />
        Sempre que um golpe em área disponível acertaria <b>2 ou mais</b> inimigos ao mesmo tempo, a IA o
        escolhe direto — mesmo que exista um golpe de alvo único pronto e mais forte.
        <br />
        <br />
        Todo POKE, ao atingir o <b>Nível {TYPED_AOE_LEVEL}</b>, aprende automaticamente um golpe em área
        exclusivo, tematizado pelo próprio tipo elemental primário. A categoria de dano dele{' '}
        <b>não é fixa</b>: é decidida na hora, comparando o Ataque Físico e o Ataque Especial daquele POKE e
        usando o maior dos dois — então ele nunca é o golpe errado pra quem o aprendeu.
      </WikiCard>

      <WikiCard title="Recarga — por que alguns golpes demoram tanto">
        Cada golpe tem a própria recarga, e ela sai do <b>PP</b> real daquele golpe:{' '}
        <b>menos PP significa mais tempo de recarga</b> — um golpe de 5 PP volta bem mais devagar que um de 35
        PP. É a tradução do "usos limitados" dos jogos originais para um jogo que roda sozinho.
        <br />
        <br />
        Em cima disso entra a <b>Velocidade</b> do seu POKE: quanto maior, mais rápido <i>todos</i> os golpes
        recarregam. É o que faz Velocidade valer mesmo num jogo sem ordem de turno.
        <br />
        <br />
        O <b>Ataque Básico</b> — o golpe de reserva que todo POKE sempre tem — é a única exceção: a recarga
        dele é fixa e não depende de PP nem de Velocidade. E enquanto um golpe está em execução o POKE fica{' '}
        <b>parado</b>: ele só volta a andar quando a ação termina.
      </WikiCard>
    </div>
  )
}

const STATUS_ICON: Record<StatusCondition, Icon> = {
  poison: Drop,
  burn: Fire,
  paralysis: Lightning,
  sleep: Moon,
  freeze: Snowflake,
  confusion: Question,
}

const STATUS_COLOR: Record<StatusCondition, string> = {
  poison: '#a855f7',
  burn: '#f97316',
  paralysis: '#eab308',
  sleep: '#94a3b8',
  freeze: '#38bdf8',
  confusion: '#ec4899',
}

function formatPercent(fracao: number): string {
  return `${Math.round(fracao * 100)}%`
}

function itensQueCuram(tipo: StatusCondition): GeneratedItem[] {
  return Object.values(ITEMS)
    .filter((item): item is GeneratedItem =>
      'kind' in item && item.kind === 'status_heal'
      && Array.isArray(item.healsStatus) && item.healsStatus.includes(tipo))
    .sort((a, b) => a.buyPrice - b.buyPrice)
}

// Cada numero abaixo sai DIRETO de `data/generated/status.generated.ts`
// (Gen VII/Ultra Sun, conferido na Bulbapedia — ver data/statusEffects.ts) —
// nada aqui e hardcoded: se um golpe/planilha mudar a regra, a Wiki muda
// junto sozinha.
function StatusCard({ tipo }: { tipo: StatusCondition }) {
  const regra = regraDoStatus(tipo)
  if (!regra) return null
  const StatusIcon = STATUS_ICON[tipo]
  const cor = STATUS_COLOR[tipo]

  const linhas: ReactNode[] = []

  if (regra.bloqueiaAcao) {
    linhas.push(<li key="acao">Impede agir em <b>todo</b> turno enquanto durar.</li>)
  } else if (regra.chanceDePerderOTurno) {
    linhas.push(
      <li key="acao">{formatPercent(regra.chanceDePerderOTurno)} de chance de perder o turno (não agir) a cada ação tentada.</li>,
    )
  }

  if (regra.danoPorTurnoFracaoDoMaximo) {
    linhas.push(
      <li key="dano">
        Tira {formatPercent(regra.danoPorTurnoFracaoDoMaximo)} do HP <b>máximo</b> {TEXTO_DE_RITMO_CONTINUO} (minimo 1
        de dano, mesmo em HP maximo baixo).
      </li>,
    )
  }

  if (regra.multiplicadorDeVelocidade && regra.multiplicadorDeVelocidade !== 1) {
    linhas.push(<li key="vel">Velocidade do POKE multiplicada por {regra.multiplicadorDeVelocidade}x.</li>)
  }
  if (regra.multiplicadorDeDanoFisico && regra.multiplicadorDeDanoFisico !== 1) {
    linhas.push(
      <li key="fis">Dano de golpes <b>Físicos</b> causados por este POKE multiplicado por {regra.multiplicadorDeDanoFisico}x.</li>,
    )
  }

  if (regra.duracaoEmTurnos) {
    const [min, max] = regra.duracaoEmTurnos
    linhas.push(
      <li key="dur">
        {/* PH-422: a wiki pode dizer "turno", porque o papel dela e EXPLICAR a
            equivalencia; o que ela nao pode e ter a propria conversao. O numero
            em segundos sai da mesma funcao do HUD. */}
        Passa sozinho depois de {min} a {max} turnos ({formatarPrazoEmTurnos(min)} a {formatarPrazoEmTurnos(max)}), sorteado
        no momento em que pega.
      </li>,
    )
  } else if (regra.chanceDeDescongelarPorTurno) {
    linhas.push(
      <li key="desc">{formatPercent(regra.chanceDeDescongelarPorTurno)} de chance de sair sozinho a cada turno — sem prazo fixo, pode durar 1 turno ou 20.</li>,
    )
  } else {
    linhas.push(<li key="dur">Não passa sozinho com o tempo — só sai com item ou curando no Hospital.</li>)
  }

  if (regra.descongelaComTipo) {
    linhas.push(
      <li key="degelo" className="flex items-center gap-1">
        Um golpe de tipo <TypeChip type={regra.descongelaComTipo} /> que cause dano também tira este status na hora,
        alem do proprio dano do golpe.
      </li>,
    )
  }

  if (regra.chanceDeSeAtacar) {
    linhas.push(
      <li key="auto">
        {formatPercent(regra.chanceDeSeAtacar)} de chance, a cada acao tentada, de se atacar sozinho em vez de agir —
        um golpe tipico (sem tipo, sem STAB) de poder {poderDoAutoDano(tipo)}.
      </li>,
    )
  }

  const curas = itensQueCuram(tipo)

  return (
    <div className="rounded-lg border bg-n900 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[.9em] font-medium">
        <StatusIcon className="text-[1.2em]" style={{ color: cor }} weight="fill" />
        {nomeDoStatus(tipo)}
      </div>
      <ul className="mb-2 list-disc space-y-1 pl-4 text-[.8em] leading-relaxed text-n400">{linhas}</ul>
      {regra.imunidadesPorTipo.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[.8em] text-n400">
          Imune por tipo: <ChipList types={regra.imunidadesPorTipo} />
        </div>
      )}
      <div className="text-[.8em] text-n400">
        Cura: {curas.length === 0 ? 'só no Hospital' : `${curas.map((i) => i.name).join(', ')}, ou o Hospital de graça`}
      </div>
    </div>
  )
}

function StatusTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Como funciona o sistema de status">
        Um status e um efeito que gruda no seu POKE (ou no inimigo) alem do dano normal do golpe — os jogos
        originais resolvem isso por <b>turno</b> de batalha; aqui o combate e continuo, entao um "turno" equivale a{' '}
        <b>{TURNO_SEGUNDOS} segundos</b> reais, o mesmo intervalo mínimo entre duas ações do POKE. Existem duas
        familias:
        <ul className="mt-[.5em] list-disc space-y-1 pl-4">
          <li>
            <b>Nao-volateis</b> (Envenenado, Queimado, Paralisado, Dormindo, Congelado) — só cabe <b>um por vez</b>{' '}
            no POKE, igual aos jogos originais: se ele ja esta paralisado, um golpe de veneno simplesmente falha.
            Sobrevivem entre combates (voltar pra hunt com um POKE queimado ainda o mantem queimado) — so saem com
            item ou no Hospital.
          </li>
          <li>
            <b>Volateis</b> (Confuso) — convive normalmente com um status não-volatil (dá pra estar envenenado E
            confuso ao mesmo tempo) e some sozinho ao sair da hunt/trocar de cena, mesmo sem cura nenhuma.
          </li>
        </ul>
      </WikiCard>

      <div className="grid gap-2 sm:grid-cols-2">
        {STATUS_NAO_VOLATEIS.map((tipo) => <StatusCard key={tipo} tipo={tipo} />)}
        {STATUS_VOLATEIS.map((tipo) => <StatusCard key={tipo} tipo={tipo} />)}
      </div>

      <WikiCard title="Barra de status em campo">
        Enquanto seu POKE ativo (ou o inimigo) estiver com algum status ou atributo alterado, um icone aparece numa
        fileira fixa logo acima da barra de golpes — some sozinho quando o status passa ou e curado. E so
        informativo (nao precisa tocar em nada); no computador, passe o mouse pra ver o nome exato.
      </WikiCard>

      <WikiCard title="Imunidade de reaplicação">
        Todo status que sai — seja curado por item, no Hospital, ou expirando sozinho (sono acabando, degelo) —
        deixa o POKE <b>imune a receber outro status por {TURNOS_DE_IMUNIDADE_APOS_CURA} turnos</b> (
        {TURNOS_DE_IMUNIDADE_APOS_CURA * TURNO_SEGUNDOS}s). Sem isso, curar um Antidoto no meio de uma luta contra
        um POKE selvagem que so usa golpe de veneno seria dinheiro jogado fora — ele reenvenenaria no proximo
        golpe.
      </WikiCard>

      <WikiCard title={`Golpes de pó (${STATUS_RULES.golpesDePo.golpes.map((id) => getAbility(id)?.name ?? id).join(', ')})`}>
        POKEs de tipo <TypeChip type="GRASS" /> são imunes a qualquer golpe dessa família especifica, mesmo que o
        STATUS que ele causaria normalmente pudesse pegar neles — e uma regra sobre o GOLPE usado, nao sobre o tipo
        de status. Essa imunidade e diferente (e além) das imunidades por tipo listadas em cada card acima.
      </WikiCard>

      <WikiCard title="Curando status">
        Os itens de cura de status (Antidote, Awakening, Burn Heal, Ice Heal, Paralyze Heal e o Full Heal, que cura
        os seis de uma vez) ficam disponiveis na Loja. O painel 🤖 Auto tem uma automacao dedicada a isso: com ela
        ligada, assim que seu POKE ativo pega um status o bot usa sozinho o item MAIS BARATO que voce possui capaz
        de curar aquele status especifico — o Full Heal (mais caro, cura tudo) só entra quando é o único que
        sobrou no seu inventário. E sempre possivel curar os seis de graça e na hora indo ate a Enfermeira no
        Hospital.
      </WikiCard>
    </div>
  )
}

// Mesmo motor de formula que o combate real usa (combatSystem.ts) — os
// numeros abaixo (STAB, critico, velocidade de referencia, cooldown do
// Ataque Basico) sao editaveis pela planilha, entao a Wiki le o valor AO VIVO
// em vez de copiar um numero que pode ficar desatualizado no primeiro ajuste
// de balanceamento.
const formulaEngineDaWiki = createFormulaEngine(FORMULAS)
const STAB_MULTIPLIER_WIKI = formulaEngineDaWiki.eval('STAB_MULTIPLIER')
const CRIT_CHANCE_WIKI = formulaEngineDaWiki.eval('CRIT_CHANCE')
const CRIT_MULTIPLIER_WIKI = formulaEngineDaWiki.eval('CRIT_MULTIPLIER')
const SPEED_REFERENCE_WIKI = formulaEngineDaWiki.evalOrDefault('ATTACK_SPEED_REFERENCE', 100)
const BASIC_ATTACK_COOLDOWN_WIKI = formulaEngineDaWiki.evalOrDefault('BASIC_ATTACK_COOLDOWN', 2)

// Nome do golpe pelo id real do catalogo (`data/abilities.ts`), com o
// proprio id cru como fallback honesto se um dia um id mudar de nome — igual
// ao padrao ja usado na aba Status pros golpes de po.
function nomeDoGolpe(id: string): string {
  return getAbility(id)?.name ?? id
}

function turnos(qtd: number): string {
  return `${qtd} turno${qtd === 1 ? '' : 's'} (${qtd * TURNO_SEGUNDOS}s)`
}

// As Traits com mecanica de verdade no motor (combatSystem.ts/statusSystem.ts)
// — nomes reais das habilidades passivas dos jogos originais, ja que esse e o
// vocabulario que este projeto usa pra elas (traits.ts nao tem uma tabela de
// traducao propria, ao contrario dos golpes). A lista de traits SEM mecanica
// nenhuma implementada (so decorativas por enquanto) fica numa nota separada
// abaixo, honesta sobre a lacuna em vez de fingir que fazem algo.
const TRAITS_IMPLEMENTADAS: { id: TraitId; efeito: ReactNode }[] = [
  { id: 'levitate', efeito: 'Imune a golpes de tipo GROUND.' },
  { id: 'volt_absorb', efeito: 'Imune a ELECTRIC — cura 1/4 do HP máximo em vez de tomar dano.' },
  { id: 'water_absorb', efeito: 'Imune a WATER — cura 1/4 do HP máximo em vez de tomar dano.' },
  { id: 'flash_fire', efeito: 'Imune a FIRE — depois de absorver um golpe assim, os próprios golpes FIRE saem 1.5x mais fortes pro resto da luta.' },
  { id: 'sap_sipper', efeito: 'Imune a GRASS — ganha +1 de estágio de Ataque Físico.' },
  { id: 'lightning_rod', efeito: 'Imune a ELECTRIC — ganha +1 de estágio de Ataque Especial.' },
  { id: 'storm_drain', efeito: 'Imune a WATER — ganha +1 de estágio de Ataque Especial.' },
  { id: 'motor_drive', efeito: 'Imune a ELECTRIC — ganha +1 de estágio de Velocidade.' },
  { id: 'intimidate', efeito: 'Ao entrar em combate, baixa 1 estágio do Ataque Físico do oponente.' },
  { id: 'download', efeito: 'Ao entrar em combate, sobe +1 no próprio Atk Físico ou Atk Especial — o que for mais forte contra a Defesa correspondente do oponente.' },
  { id: 'static', efeito: '30% de chance de paralisar quem acertar um golpe FÍSICO nele.' },
  { id: 'flame_body', efeito: '30% de chance de queimar quem acertar um golpe FÍSICO nele.' },
  { id: 'poison_point', efeito: '30% de chance de envenenar quem acertar um golpe FÍSICO nele.' },
  { id: 'effect_spore', efeito: '30% de chance de envenenar, paralisar OU adormecer (sorteado) quem acertar um golpe FÍSICO nele — não pega em atacante GRASS.' },
  { id: 'inner_focus', efeito: 'Imune a flinch (perder a próxima ação por ter sido atingido).' },
  { id: 'huge_power', efeito: 'Ataque Físico multiplicado por 2x.' },
  { id: 'pure_power', efeito: 'Ataque Físico multiplicado por 2x.' },
  { id: 'hustle', efeito: 'Ataque Físico multiplicado por 1.5x, mas os próprios golpes FÍSICOS saem com 20% menos precisão.' },
  { id: 'guts', efeito: 'Ataque Físico multiplicado por 1.5x enquanto estiver com qualquer status.' },
  { id: 'marvel_scale', efeito: 'Defesa Física multiplicada por 1.5x enquanto estiver com qualquer status.' },
  { id: 'quick_feet', efeito: 'Enquanto estiver com qualquer status, Velocidade multiplicada por 1.5x — ignorando por completo a penalidade de velocidade que o próprio status daria (ex: Paralisia).' },
  { id: 'blaze', efeito: <>Abaixo de 1/3 do HP máximo, golpes de tipo <TypeChip type="FIRE" /> saem 1.5x mais fortes.</> },
  { id: 'torrent', efeito: <>Abaixo de 1/3 do HP máximo, golpes de tipo <TypeChip type="WATER" /> saem 1.5x mais fortes.</> },
  { id: 'overgrow', efeito: <>Abaixo de 1/3 do HP máximo, golpes de tipo <TypeChip type="GRASS" /> saem 1.5x mais fortes.</> },
  { id: 'swarm', efeito: <>Abaixo de 1/3 do HP máximo, golpes de tipo <TypeChip type="BUG" /> saem 1.5x mais fortes.</> },
  { id: 'sturdy', efeito: 'Sobrevive com 1 de HP a um golpe que seria fatal — só funciona partindo do HP máximo EXATO.' },
  { id: 'multiscale', efeito: 'Dano recebido reduzido pela metade enquanto o HP estiver no máximo EXATO.' },
  { id: 'synchronize', efeito: 'Veneno/Paralisia/Queimadura recebidos são refletidos de volta em quem aplicou.' },
  { id: 'poison_heal', efeito: 'Em vez de tomar dano de veneno por turno, cura a mesma fracao de HP.' },
  { id: 'rough_skin', efeito: 'Todo golpe FÍSICO recebido por contato causa dano de retorno no atacante (1/8 do HP máximo dele).' },
  { id: 'iron_barbs', efeito: 'Todo golpe FÍSICO recebido por contato causa dano de retorno no atacante (1/8 do HP máximo dele).' },
  { id: 'aftermath', efeito: 'Se for derrotado por um golpe FÍSICO, o atacante recebe dano de retorno (1/4 do próprio HP máximo dele).' },
  { id: 'immunity', efeito: 'Imune a Envenenado.' },
  { id: 'limber', efeito: 'Imune a Paralisado.' },
  { id: 'insomnia', efeito: 'Imune a Dormindo.' },
  { id: 'vital_spirit', efeito: 'Imune a Dormindo.' },
  { id: 'water_veil', efeito: 'Imune a Queimado.' },
  { id: 'magma_armor', efeito: 'Imune a Congelado.' },
  { id: 'own_tempo', efeito: 'Imune a Confuso.' },
  { id: 'drizzle', efeito: 'Ao entrar em combate, poe chuva em campo (dura até outro clima sobrescrever).' },
  { id: 'sand_stream', efeito: 'Ao entrar em combate, poe areia em campo (dura até outro clima sobrescrever).' },
  { id: 'snow_warning', efeito: 'Ao entrar em combate, poe granizo em campo (dura até outro clima sobrescrever).' },
  { id: 'drought', efeito: 'Ao entrar em combate, poe sol em campo (dura até outro clima sobrescrever).' },
]

const TRAITS_SEM_MECANICA: TraitId[] = [
  'swift_swim', 'chlorophyll', 'sand_rush', 'ice_body', 'sand_veil', 'snow_cloak',
  'speed_boost', 'moxie', 'shed_skin', 'rain_dish',
]

function nomeDaTrait(id: TraitId): string {
  return id.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ')
}

function TraitTable({ traits }: { traits: { id: TraitId; efeito: ReactNode }[] }) {
  return (
    <div className="overflow-hidden rounded-md border text-[.8em]">
      <div className="grid grid-cols-[9em_1fr] gap-2 border-b bg-muted/50 px-2 py-1 font-medium">
        <span>Trait</span><span>Efeito</span>
      </div>
      {traits.map((t) => (
        <div key={t.id} className="grid grid-cols-[9em_1fr] gap-2 border-b px-2 py-1 last:border-b-0">
          <span className="font-semibold">{nomeDaTrait(t.id)}</span>
          <span className="text-n400">{t.efeito}</span>
        </div>
      ))}
    </div>
  )
}

function CombateTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Combate continuo, sem turnos e sem prioridade">
        Este jogo NAO tem turno de batalha alternado como os jogos originais — o combate roda em tempo real,
        continuo, e cada POKE age assim que estiver pronto (golpe fora de cooldown), sem esperar a "vez" de
        ninguem. A unidade de tempo usada nas contas abaixo (duracao de status/escudo/trava, etc.) e o{' '}
        <b>turno</b>, que aqui equivale a <b>{TURNO_SEGUNDOS} segundos</b> reais — o mesmo intervalo mínimo entre
        duas ações de um POKE (o <b>cooldown global</b>, ver PP/Velocidade na aba Mecânicas) — na prática, um
        golpe so recarrega mais rapido que isso se a Velocidade do POKE for maior que a referencia de{' '}
        {SPEED_REFERENCE_WIKI}. O Ataque Basico foge dessa regra: seu cooldown e sempre fixo em{' '}
        {BASIC_ATTACK_COOLDOWN_WIKI}s, sem depender de PP nem de Velocidade. Por causa disso,{' '}
        <b>não existe sistema de prioridade de golpe</b> (o que faria um golpe como {nomeDoGolpe('quick_attack')}{' '}
        agir sempre primeiro, independente de Velocidade): todo golpe passa pelo mesmo cano de resolucao, sem
        fila nem ordem especial — {nomeDoGolpe('wide_guard')} e {nomeDoGolpe('quick_guard')} existem no catalogo
        mas essa parte deles nao faz nada aqui, por exatamente esse motivo.
        <br />
        <br />
        Alvo, alcance de engajamento (corpo-a-corpo sempre), agressividade/desistencia do selvagem, area de
        efeito (AOE) e o golpe de nível 50 já estão detalhados na aba <b>Mecânicas</b> — esta aba cobre o que
        acontece a partir do momento em que um golpe e de fato usado: acerto, calculo de dano, e todas as
        mecanicas de status/campo que um golpe pode acionar.
      </WikiCard>

      <WikiCard title="Como a IA escolhe o golpe">
        POKEs <b>selvagens</b> escolhem sozinhos, a cada ação, entre os golpes fora de cooldown: primeiro
        verificam se algum golpe de apoio (status, buff/debuff, escudo, armadilha de campo) ainda vale a pena
        usar — por exemplo, nao usam {nomeDoGolpe('toxic')} se o alvo ja esta envenenado, nem uma tela se ela ja
        esta de pe — e,
        se houver um pronto E o melhor golpe de dano disponivel nao bastaria pra derrotar o alvo neste instante,
        usam o de apoio. Caso contrario escolhem golpe de dano: se algum golpe em AREA (AOE) pronto atingiria 2
        ou mais alvos, a escolha fica restrita aos golpes de AOE; dentro do que sobrou, escolhem o de maior{' '}
        <b>dano esperado</b> (dano estimado multiplicado pela própria chance de acerto — um golpe forte mas
        impreciso pode perder pra um mais fraco e mais confiavel). Sem nada pronto, cai no Ataque Basico.
        <br />
        <br />
        Seu <b>próprio POKE</b> segue uma lógica diferente: ele usa os até <b>{MAX_ACTIVE_ABILITIES} golpes</b>{' '}
        que voce escolheu deixar ativos (aba Golpes do perfil do POKE), numa fila fixa — tenta o proximo da fila
        assim que ele estiver pronto, pulando (sem gastar a vez) um golpe de status que nao faria nada agora
        (alvo imune, ja no teto de estagio, etc.). Ele NAO prioriza AOE sozinho — a ordem e inteiramente a que
        voce escolheu.
      </WikiCard>

      <WikiCard title="Acerto ou erro">
        Todo golpe (exceto os de precisao 100, que nunca erram — o Ataque Basico e um deles) rola uma chance de
        acerto: <code>precisão do golpe × multiplicador de Precisão do atacante ÷ multiplicador de Evasão do
        defensor</code>. Os estágios de <b>Precisão</b> e <b>Evasão</b> são um eixo separado dos estágios normais
        de Ataque/Defesa/Velocidade (formula propria, base 3 em vez de base 2): +1 da 1.33x, −1 da 0.75x. A rolagem
        e feita <b>uma vez por uso</b> do golpe, não por alvo atingido (um AOE não pode acertar 2 e errar o 3º).
        <br />
        <br />
        Golpes como {nomeDoGolpe('lock_on')}/{nomeDoGolpe('mind_reader')} (que travam o alvo) ignoram a rolagem
        por completo no proximo golpe contra aquele alvo, e golpes como {nomeDoGolpe('foresight')}/
        {nomeDoGolpe('miracle_eye')}/{nomeDoGolpe('odor_sleuth')} fazem o atacante ignorar a Evasao do defensor
        dali em diante.
      </WikiCard>

      <WikiCard title="O cálculo de dano, passo a passo">
        Pra golpes de dano fixo ({nomeDoGolpe('seismic_toss')}/{nomeDoGolpe('night_shade')} usam o proprio
        nivel do usuario, {nomeDoGolpe('dragon_rage')} e sempre 40, {nomeDoGolpe('super_fang')} tira metade do
        HP atual do alvo) o dano sai direto, sem passar pelos passos abaixo — so a imunidade de tipo continua
        valendo. Pra golpe normal:
        <ol className="mt-[.5em] list-decimal space-y-1 pl-5">
          <li>
            <b>Dano base</b>: fórmula com Nível do atacante, Poder do golpe, e o Ataque/Defesa certos — Físico
            usa Atk Fisico/Defesa, Especial usa Atk Especial/Defesa Especial (categoria decidida por golpe; o
            golpe de AOE de nivel 50 usa o maior dos dois Ataques do PROPRIO usuario, fixado no valor que ele
            tinha no Nivel 50).
          </li>
          <li>Cada stat de Ataque/Defesa usada ja entra multiplicada pelo proprio estagio (+1 = 1.5x, −1 = 0.67x, ... ate ±6).</li>
          <li>Queimado reduz o dano de golpes FÍSICOS causados pelo próprio queimado pela metade.</li>
          <li>
            <b>STAB</b> (Same Type Attack Bonus): golpe do MESMO tipo elemental de um dos tipos do atacante sai{' '}
            {STAB_MULTIPLIER_WIKI}x mais forte.
          </li>
          <li>Traits de baixo HP (Blaze/Torrent/Overgrow/Swarm — ver tabela abaixo) e Flash Fire aplicam o próprio multiplicador aqui, se valerem.</li>
          <li>
            <b>Efetividade de tipo</b> (2x/0.5x/0x, multiplicando os dois tipos do defensor — ver a aba
            Efetividade pra tabela completa).
          </li>
          <li>Clima favorece ou prejudica o tipo do golpe (ver card de Clima abaixo).</li>
          <li>Multiscale reduz pela metade se o defensor estiver no HP máximo exato.</li>
          <li>{nomeDoGolpe('reflect')}/{nomeDoGolpe('light_screen')} reduzem pela metade, se o defensor tiver o escudo certo de pé.</li>
          <li>
            <b>Crítico</b>: chance base de {formatPercent(CRIT_CHANCE_WIKI)}, multiplicada por 3 pra cada
            "estágio de crítico" que o golpe/usuario tiver ({nomeDoGolpe('focus_energy')} da +2 por uso, alguns
            golpes ja nascem com +1) — satura em 50% de chance a partir do 3º estagio. Um critico multiplica o
            dano por {CRIT_MULTIPLIER_WIKI}x. {nomeDoGolpe('lucky_chant')} torna o usuario dela imune a critico
            recebido (mesmo contra um critico GARANTIDO por {nomeDoGolpe('laser_focus')});{' '}
            {nomeDoGolpe('laser_focus')} garante o critico no proprio proximo golpe de
            dano, uma unica vez.
          </li>
          <li>Variação final aleatória entre 85% e 100% do valor calculado.</li>
        </ol>
        <div className="mt-[.5em]">
          Resultado sempre arredondado, com piso de 1 de dano (ou 0, se o defensor for imune ao tipo do golpe).
        </div>
      </WikiCard>

      <WikiCard title="Habilidades passivas (Traits)">
        Toda espécie pode ter <b>uma</b> Trait fixa (ver o card dela no perfil/Pokedex) — um efeito passivo que
        vale o tempo todo, sem gastar golpe nem turno. Estas sao as que ja tem mecanica real no motor:
        <div className="mt-[.5em]">
          <TraitTable traits={TRAITS_IMPLEMENTADAS} />
        </div>
        <div className="mt-[.5em] text-[.75em] text-n500">
          As demais Traits do jogo ({TRAITS_SEM_MECANICA.map(nomeDaTrait).join(', ')}) ja existem no dado das
          especies mas ainda nao tem efeito nenhum implementado em combate — decorativas por enquanto, honesto
          dizer isso aqui em vez de fingir que fazem algo.
        </div>
      </WikiCard>

      <WikiCard title="Clima">
        Existem 6 climas — Chuva, Sol, Granizo, Areia, Neve e Neblina. Cada sala pode NASCER com um clima
        proprio, sorteado pelo sub-bioma dela: chove quase sempre no mar, neva na floresta nevada, o vulcao
        vive sob sol forte. Esse clima vale enquanto voce estiver naquela sala e some quando voce troca.
        <br /><br />
        Quatro deles tambem sao ligados por golpe ({nomeDoGolpe('rain_dance')}, {nomeDoGolpe('sunny_day')},{' '}
        {nomeDoGolpe('hail')}, {nomeDoGolpe('sandstorm')}) ou por Trait de entrada (Drizzle/Sand Stream/
        Snow Warning/Drought, ver tabela acima). Um clima novo sempre substitui o anterior (nao empilha);
        ligado por golpe, dura {turnos(10)} — e quando acaba, o clima da SALA volta, em vez de o ceu ficar
        limpo. <b>Neve e Neblina só vem do ambiente</b>: não há golpe que as invoque.
        <ul className="mt-[.5em] list-disc space-y-1 pl-4">
          <li>Chuva: golpes <TypeChip type="WATER" /> +50% de dano, <TypeChip type="FIRE" /> −50%.</li>
          <li>Sol: golpes <TypeChip type="FIRE" /> +50% de dano, <TypeChip type="WATER" /> −50%.</li>
          <li>
            Granizo: tira 1/16 do HP maximo por turno de todo POKE que NAO for <TypeChip type="ICE" /> (nenhum
            dos dois tipos).
          </li>
          <li>
            Areia: tira 1/16 do HP maximo por turno de todo POKE que NAO for <TypeChip type="ROCK" />,{' '}
            <TypeChip type="GROUND" /> ou <TypeChip type="STEEL" /> (nenhum dos tipos).
          </li>
          <li>
            Neve: <b>não causa dano nenhum</b> — da +50% de Defesa pra POKE do tipo <TypeChip type="ICE" />.
            Nao confunda com Granizo: sao climas diferentes.
          </li>
          <li>Neblina: precisão de TODOS os golpes cai pra 60% do normal, dos dois lados.</li>
        </ul>
        <div className="mt-[.5em]">
          Alguns golpes mudam de comportamento conforme o tempo: {nomeDoGolpe('thunder')} e{' '}
          {nomeDoGolpe('hurricane')} nunca erram na Chuva e caem pra 50% de precisao no Sol;{' '}
          {nomeDoGolpe('blizzard')} nunca erra no Granizo nem na Neve; {nomeDoGolpe('weather_ball')} muda de
          tipo e dobra de forca; {nomeDoGolpe('solar_beam')} perde metade do dano fora do Sol;{' '}
          {nomeDoGolpe('synthesis')} e {nomeDoGolpe('moonlight')} curam 2/3 no Sol e so 1/4 em clima ruim;{' '}
          {nomeDoGolpe('growth')} sobe 2 estagios em vez de 1 sob Sol.
        </div>
      </WikiCard>

      <WikiCard title="Escudos (telas de campo)">
        Golpes de escudo protegem sempre quem os usou (nunca redirecionam pra outro alvo), por {turnos(5)}:
        <ul className="mt-[.5em] list-disc space-y-1 pl-4">
          <li><b>{nomeDoGolpe('reflect')}</b>: reduz pela metade o dano de golpes FÍSICOS recebidos.</li>
          <li><b>{nomeDoGolpe('light_screen')}</b>: reduz pela metade o dano de golpes ESPECIAIS recebidos.</li>
          <li><b>{nomeDoGolpe('safeguard')}</b>: impede qualquer status NOVO de pegar (não remove um que já estava lá).</li>
          <li><b>{nomeDoGolpe('mist')}</b>: impede o OPONENTE de baixar seus estágios (não bloqueia queda auto-infligida).</li>
          <li><b>{nomeDoGolpe('lucky_chant')}</b>: imune a crítico recebido, mesmo um garantido.</li>
          <li><b>{nomeDoGolpe('wide_guard')}</b>: cancela por completo o próximo golpe em ÁREA recebido (golpe de alvo único passa direto).</li>
        </ul>
      </WikiCard>

      <WikiCard title={`${nomeDoGolpe('protect')}, ${nomeDoGolpe('endure')} e ${nomeDoGolpe('destiny_bond')}`}>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>{nomeDoGolpe('protect')}</b>/<b>{nomeDoGolpe('detect')}</b>: bloqueia por completo o próximo
            golpe que mira em quem usou (dano, status ou mudanca de estagio) — golpes que miram no proprio
            usuario (cura, buff em si mesmo) ignoram a Protecao, assim como uma lista curta de golpes especiais
            ({nomeDoGolpe('endure')}, {nomeDoGolpe('destiny_bond')}, {nomeDoGolpe('rest')},{' '}
            {nomeDoGolpe('perish_song')} entre outros). Consumido no golpe bloqueado.
          </li>
          <li>
            <b>{nomeDoGolpe('endure')}</b>: garante sobreviver com 1 de HP no próximo golpe recebido, SE ele
            fosse te derrotar — mesma garantia que a Trait Sturdy, so que com timer (um uso, precisa ser usado
            de novo) em vez de depender de estar no HP maximo.
          </li>
          <li>
            <b>{nomeDoGolpe('destiny_bond')}</b>: se quem usou for derrotado enquanto este efeito estiver
            ativo, quem o derrotou tambem cai junto, no mesmo instante.
          </li>
        </ul>
      </WikiCard>

      <WikiCard title="Efeitos continuos (dano ou cura por turno)">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>{nomeDoGolpe('leech_seed')}</b>: drena 1/8 do HP máximo do alvo por turno, curando quem plantou
            a semente — não pega em alvo <TypeChip type="GRASS" />.
          </li>
          <li>
            <b>{nomeDoGolpe('curse')}</b> (variante <TypeChip type="GHOST" />, só usavel por POKEs desse tipo):
            custa 50% do proprio HP MAXIMO de quem usa, e tira 1/4 do HP maximo do alvo por turno, sem prazo pra
            acabar sozinho.
          </li>
          <li>
            <b>{nomeDoGolpe('nightmare')}</b>: tira 1/4 do HP máximo do alvo por turno, mas SÓ enquanto ele
            estiver Dormindo — para de fazer efeito se ele acordar (sem precisar curar o Pesadelo em si).
          </li>
          <li>
            <b>{nomeDoGolpe('ingrain')}</b> e <b>{nomeDoGolpe('aqua_ring')}</b>: curam 1/16 do próprio HP máximo
            por turno, sem prazo pra acabar sozinho.
          </li>
          <li>
            <b>{nomeDoGolpe('wish')}</b>: não cura na hora — agenda uma cura de 50% do HP máximo de quem usou,
            que se aplica 2 turnos depois (mesmo que o time ja tenha trocado de POKE ativo nesse meio tempo).
          </li>
        </ul>
      </WikiCard>

      <WikiCard title="Golpes que travam o oponente">
        <ul className="list-disc space-y-1 pl-4">
          <li><b>{nomeDoGolpe('taunt')}</b>: por {turnos(3)}, o alvo fica proibido de usar qualquer golpe de status.</li>
          <li><b>{nomeDoGolpe('disable')}</b>: por {turnos(4)}, tranca especificamente o ÚLTIMO golpe que o alvo usou.</li>
          <li><b>{nomeDoGolpe('encore')}</b>: por {turnos(3)}, força o alvo a repetir só o último golpe que usou (cai pro Ataque Básico se esse golpe entrar em cooldown).</li>
          <li><b>{nomeDoGolpe('torment')}</b>: por {turnos(3)}, o alvo nunca pode repetir o mesmo golpe duas vezes seguidas.</li>
          <li><b>{nomeDoGolpe('spite')}</b>: soma {turnos(4)} direto no cooldown do último golpe que o alvo usou.</li>
          <li><b>{nomeDoGolpe('heal_block')}</b>: por {turnos(5)}, bloqueia qualquer cura/dreno positivo no alvo (não bloqueia recoil, que e dano).</li>
          <li><b>{nomeDoGolpe('yawn')}</b>: não adormece na hora — 2 turnos depois, tenta aplicar Dormindo de verdade (respeitando imunidade normalmente).</li>
        </ul>
      </WikiCard>

      <WikiCard title="Golpes de poder variável ou dano fixo">
        <ul className="list-disc space-y-1 pl-4">
          <li><b>{nomeDoGolpe('magnitude')}</b>: sorteia o poder do golpe — de 10 (5% de chance) até 150 (5% de chance), passando por 30/50/70/90/110 no meio.</li>
          <li><b>{nomeDoGolpe('reversal')}</b>/<b>{nomeDoGolpe('flail')}</b>: quanto MENOS HP restante o usuário tiver, mais forte sai (até poder 200 perto de morrer).</li>
          <li><b>{nomeDoGolpe('present')}</b>: poder sorteado entre 40, 80 ou 120.</li>
          <li><b>{nomeDoGolpe('hidden_power')}</b>: sempre tipo NORMAL aqui (simplificação deste jogo), poder entre 30 e 70 conforme a media dos IVs do POKE.</li>
          <li><b>{nomeDoGolpe('psywave')}</b>: dano aleatório baseado só no NÍVEL do usuário, ignorando Ataque/Defesa por completo.</li>
          <li><b>{nomeDoGolpe('counter')}</b>/<b>{nomeDoGolpe('mirror_coat')}</b>: devolve 2x o último dano FÍSICO/ESPECIAL sofrido nos últimos 3 segundos — sem nada recente pra devolver, vira um golpe genérico de poder 40.</li>
          <li><b>{nomeDoGolpe('seismic_toss')}</b>/<b>{nomeDoGolpe('night_shade')}</b>: dano fixo igual ao NÍVEL do usuário.</li>
          <li><b>{nomeDoGolpe('super_fang')}</b>: tira metade do HP ATUAL do alvo.</li>
        </ul>
      </WikiCard>

      <WikiCard title="Armadilhas de campo (Hazards)">
        {nomeDoGolpe('spikes')} (ate 3 camadas), {nomeDoGolpe('toxic_spikes')} (ate 2 camadas),{' '}
        {nomeDoGolpe('stealth_rock')} e {nomeDoGolpe('sticky_web')} sao golpes que armam uma armadilha no CAMPO
        do time inimigo — nao num POKE especifico — e machucam/atrapalham cada selvagem novo que nascer na hunt
        dali em diante. So o seu POKE pode arma-las (o motor nao tem conceito de "lado" pra um selvagem armar
        contra voce).
      </WikiCard>

      <WikiCard title="Outras mecânicas de combate">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>Confusao</b> (detalhes completos na aba Status): quando o POKE confuso falha em agir, ele se
            ataca sozinho com um golpe sem tipo, poder 40, sem STAB e sem chance de critico.
          </li>
          <li>
            <b>{nomeDoGolpe('explosion')}</b>/<b>{nomeDoGolpe('self_destruct')}</b>: causam dano normal no alvo
            E custam 50% do HP ATUAL de quem usa (nao desmaiam o usuario de verdade, diferente dos jogos
            originais — esses golpes nao ficariam com custo nenhum sem essa adaptacao).
          </li>
          <li>
            <b>{nomeDoGolpe('soak')}</b>: força o TIPO do alvo pra <TypeChip type="WATER" /> só pra efeito de
            calculo de efetividade (nao muda imunidade de status nem STAB do proprio alvo).
          </li>
          <li>
            <b>Flinch</b> (perder a próxima ação por ter sido atingido): modelado como um cooldown global extra
            no atingido, ja que este combate nao tem "ordem de turno" pra furar. A Trait Inner Focus da imunidade.
          </li>
          <li>
            <b>{nomeDoGolpe('rage_powder')}</b>: existe no catálogo mas não faz nada aqui — esse golpe redireciona
            ataques pro usuario num time de 2+ POKEs em campo, e este jogo e sempre 1 POKE seu contra os
            selvagens, sem aliado pra redirecionar.
          </li>
          <li>
            Ao sair de uma hunt (ou trocar de POKE), estagios de atributo, Confusao, escudos, clima, travas ({nomeDoGolpe('taunt')}
            /{nomeDoGolpe('disable')}/{nomeDoGolpe('encore')}/{nomeDoGolpe('torment')}), efeitos de dreno
            continuo e as flags de {nomeDoGolpe('protect')}/{nomeDoGolpe('endure')}/{nomeDoGolpe('destiny_bond')}{' '}
            zeram todos — status nao-volatil (Envenenado/Queimado/Paralisado/Dormindo/Congelado) NAO zera, ele
            sobrevive entre combates como nos jogos originais.
          </li>
        </ul>
      </WikiCard>
    </div>
  )
}

// A aba dos TRES tracos individuais. Existe porque os tres sao invisiveis no
// combate: ninguem "ve" a Natureza mudando um atributo, nem a Habilidade
// negando um golpe. Sem uma pagina que diga que eles existem, o jogador so
// percebe que dois POKE iguais nao sao iguais — e nao entende por que.
function TracosTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Cada POKE e um individuo">
        Dois Charmander do mesmo nivel nao sao iguais. Alem dos IVs, cada POKE nasce com tres
        tracos proprios, todos visiveis na ficha dele (toque no POKE {'>'} aba Status):
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li><b>Natureza</b> — sobe um atributo e desce outro.</li>
          <li><b>Habilidade</b> — um efeito passivo que vale a luta inteira.</li>
          <li><b>Caracteristica</b> — uma frase que denuncia qual IV dele e o mais alto.</li>
        </ul>
      </WikiCard>

      <WikiCard title="Natureza">
        Sao 25. Cada uma sobe UM atributo em 10% e desce OUTRO em 10% — e cinco delas sobem e
        descem o mesmo, ou seja, nao mexem em nada (a ficha marca essas como "neutra").
        <br /><br />
        <b>O HP nunca e afetado por natureza</b>, em nenhuma das 25. Ela e sorteada no nascimento
        e nao muda nunca: nao ha item nem NPC que troque a natureza de um POKE.
      </WikiCard>

      <WikiCard title="Habilidade">
        Cada espécie tem 1 ou 2 habilidades normais e, as vezes, uma <b>oculta</b>. O POKE sorteia
        a dele quando aparece — dois Marill selvagens podem sair um com Thick Fat e outro com Huge
        Power, que dobra o Ataque Fisico. A oculta e rara (5% dos encontros) e a ficha a marca
        com um selo.
        <br /><br />
        A habilidade e passiva: nao ocupa slot de golpe e nao precisa ser ativada. A descricao do
        que a sua faz esta na ficha do POKE.
        <br /><br />
        <b>Nem toda habilidade funciona aqui.</b> Algumas dependem de coisas que este jogo não tem
        — trocar de POKE no meio da luta, item equipado, aliado em campo, fuga. Quando for o caso,
        a ficha diz isso em amarelo, com o motivo. Preferimos avisar a fingir.
      </WikiCard>

      <WikiCard title="Caracteristica">
        A frase da ficha ("Gosta de se debater", "Cochila muito") nao e enfeite: ela aponta qual
        dos seis IVs do POKE e o mais alto. Como a ficha ja mostra os IVs em numero, ela vale mais
        como sabor — mas a informacao e real e sempre confere.
      </WikiCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A NAVEGACAO EM DOIS NIVEIS (PH-507)
// ---------------------------------------------------------------------------
// A Wiki tinha SETE abas planas numa fileira, e a reformulacao acrescentou tres
// blocos de conteudo que nunca existiram (Mundo, Progresso, Jogadores). Onze
// abas planas nao e uma opcao: `SegmentedTabs` rola na horizontal no celular a
// partir de cinco, e uma fileira rolavel de onze e o mesmo que esconder seis
// delas — o jogador nao sabe procurar o que ele nao ve.
//
// A SAIDA E AGRUPAR POR PERGUNTA, e nao por sistema. Cada grupo responde uma:
//
//   Começando   "acabei de entrar, o que eu faco?"
//   Mundo       "pra onde eu vou?"
//   Combate     "por que esse numero de dano?"
//   Progresso   "como eu fico mais forte?"
//   Jogadores   "como eu negocio com outra pessoa?"
//
// Cinco cabem na fileira sem rolagem no celular, que era o limite medido.
//
// POR QUE O SEGUNDO NIVEL SO EXISTE EM DOIS GRUPOS. Combate tem quatro
// ferramentas pesadas (a tabela 18x18, os status, as formulas, as traits) e
// Progresso tem duas (a tabela de raridade e o resto). Empilhar as quatro de
// Combate num scroll unico dariam ~700 linhas de rolagem pra chegar na ultima.
// Mundo, Começando e Jogadores sao prosa curta e cabem empilhados — dar a eles
// uma segunda fileira de botoes seria navegacao a mais pra conteudo de menos.
type Grupo = 'comecando' | 'mundo' | 'combate' | 'progresso' | 'jogadores'
type SubCombate = 'tipos' | 'campo' | 'numeros' | 'status' | 'tracos'
type SubProgresso = 'geral' | 'raridade'

const GRUPOS: { value: Grupo; label: string }[] = [
  { value: 'comecando', label: 'Começando' },
  { value: 'mundo', label: 'Mundo' },
  { value: 'combate', label: 'Combate' },
  { value: 'progresso', label: 'Progresso' },
  { value: 'jogadores', label: 'Jogadores' },
]

const SUB_COMBATE: { value: SubCombate; label: string }[] = [
  { value: 'tipos', label: 'Tipos' },
  { value: 'campo', label: 'Em campo' },
  { value: 'numeros', label: 'Dano' },
  { value: 'status', label: 'Status' },
  { value: 'tracos', label: 'Natureza' },
]

const SUB_PROGRESSO: { value: SubProgresso; label: string }[] = [
  { value: 'geral', label: 'Progressão' },
  { value: 'raridade', label: 'Raridade e Shiny' },
]

export function WikiMenu() {
  const [grupo, setGrupo] = useState<Grupo>('comecando')
  const [subCombate, setSubCombate] = useState<SubCombate>('tipos')
  const [subProgresso, setSubProgresso] = useState<SubProgresso>('geral')

  return (
    <div className="flex flex-col gap-[.55em]">
      <SegmentedTabs value={grupo} onChange={setGrupo} options={GRUPOS} />

      {grupo === 'comecando' && <ComecandoTab />}
      {grupo === 'mundo' && <MundoTab />}
      {grupo === 'jogadores' && <JogadoresTab />}

      {grupo === 'combate' && (
        <>
          <SegmentedTabs value={subCombate} onChange={setSubCombate} options={SUB_COMBATE} />
          {subCombate === 'tipos' && <TiposTab />}
          {subCombate === 'campo' && <MecanicasDeCampoTab />}
          {subCombate === 'numeros' && <CombateTab />}
          {subCombate === 'status' && <StatusTab />}
          {subCombate === 'tracos' && <TracosTab />}
        </>
      )}

      {grupo === 'progresso' && (
        <>
          <SegmentedTabs value={subProgresso} onChange={setSubProgresso} options={SUB_PROGRESSO} />
          {subProgresso === 'geral' && <ProgressoTab />}
          {subProgresso === 'raridade' && <RaridadesTab />}
        </>
      )}
    </div>
  )
}
