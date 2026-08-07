// Port de js/ui/panels/WikiMenu.js — guia de referencia in-game, texto
// autoral + pequenas ferramentas interativas sobre dado real do jogo
// (TYPE_CHART, RARITIES). Nenhum estado do jogador e lido aqui.
import { useState, type ReactNode } from 'react'
import { TYPE_CHART, getEffectiveness } from '@/data/generated/typeChart.generated'
import { colorForType, TYPE_COLORS } from '@/data/typeColors'
import { RARITIES, RARITY_ORDER } from '@/data/rarity'
import type { ElementType } from '@/data/generated/types'
import { GameSelect, SegmentedTabs } from '@/components/game/controls'
import { TypeChip as SharedTypeChip } from '@/components/shared/TypeChip'

const ALL_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

// A Wiki mostra o nome COMPLETO do tipo (e um guia de referencia, nao uma
// lista densa) — no resto do jogo o chip usa a abreviacao de 3 letras.
function TypeChip({ type }: { type: ElementType }) {
  return <SharedTypeChip type={type} full />
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

function WikiCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-n900 p-3">
      <div className="mb-1.5 text-[.9em] font-medium">{title}</div>
      <div className="text-[.8em] leading-relaxed text-n400">{children}</div>
    </div>
  )
}

function InicioTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Bem-vindo(a) ao NOVO POKE IDLE!">
        Este e um jogo <b>idle</b>: seu POKE ativo anda e luta sozinho contra os selvagens de cada hunt, sem
        precisar apertar nenhum botao de ataque — seu trabalho e escolher onde caçar, cuidar do seu time e
        gerenciar recursos (itens, ouro, capturas).
      </WikiCard>

      <WikiCard title="1. Escolhendo seu inicial">
        Na primeira vez que voce abre o jogo, escolhe um dos 3 iniciais classicos (Charmander, Squirtle ou
        Bulbasaur). Ele comeca no Nivel 1 e ja pode ser levado direto pra Hunt Inicial — nao existe risco de
        cruzar com inimigos fortes logo de cara, essa hunt tem o nivel dos selvagens travado bem baixo.
      </WikiCard>

      <WikiCard title="2. Como funciona o combate automatico">
        Assim que voce entra numa hunt, seu POKE ativo comeca a andar pelo mapa sozinho procurando o inimigo
        selvagem mais proximo. Ao chegar perto o suficiente ele engaja em combate automaticamente e usa seus
        golpes por conta propria (dentre os que estao prontos/fora de cooldown, o de maior dano estimado
        contra aquele alvo — dando preferencia a golpes em area sempre que acertariam 2 ou mais inimigos ao
        mesmo tempo). Depois de derrotar o inimigo, ele imediatamente escolhe um novo alvo e continua a
        caçada — seu POKE nunca fica parado esperando ordem.
        <br />
        <br />
        Voce pode <b>desligar</b> um golpe especifico da rotacao automatica dando duplo clique no icone dele
        na barra de habilidades (a barra fixa no centro inferior da tela, entre os dois lados do HUD) — util
        pra evitar que a IA gaste um golpe fraco quando um mais forte esta quase pronto.
      </WikiCard>

      <WikiCard title="3. Navegando pelos menus">
        O menu inferior da tela tem os atalhos principais:
        <br />⚾ <b>Equipe</b> — seus ate 6 POKEs ativos, trocar quem esta em campo, evoluir, ver status
        completos.
        <br />🎒 <b>Mochila</b> — POKEs capturados extras e todos os seus itens (bolas, pocoes, revives,
        Stones).
        <br />🗺️ <b>Hunts</b> — escolher onde caçar (ver item 4 abaixo).
        <br />🛒 <b>Loja</b> — comprar itens e vender POKEs/itens por ouro.
        <br />📖 <b>Pokedex</b> — registro de toda especie do jogo, mesmo as que voce nunca capturou, com
        onde encontrar cada uma (incluindo fraquezas/resistencias de cada uma).
        <br />📚 <b>Wiki</b> — este guia que voce esta lendo agora.
        <br />🏥 <b>Hospital</b> — clique na enfermeira em campo pra curar seu time por completo, de graça.
        <br />🤖 <b>Auto</b> (botao flutuante no canto inferior direito) — liga/desliga auto-pot, auto-catch
        e auto-revive, e configura qual item cada automacao deve usar.
        <br />⚙️ <b>Config</b> — reiniciar o jogo e ver o historico de atualizacoes (Patch-notes).
      </WikiCard>

      <WikiCard title="4. Progredindo nas Hunts">
        Cada hunt tem uma faixa de nivel recomendada e um conjunto de especies proprio (organizadas por
        bioma/tipo elemental — ver a aba "Efetividade de Tipos" e a Pokedex pra saber onde cada tipo
        aparece). Conforme seu POKE ativo sobe de nivel, procure hunts com niveis mais altos pra continuar
        evoluindo com desafio real. O Novo Continente (Kanto) e liberado depois de derrotar o Campeao Lance,
        o chefe final de Johto — e o Modo Pesadelo (espelho de toda hunt em nivel bem mais alto, incluindo as
        hunts BOSS dos 11 lendarios) fica disponivel a qualquer momento, sem custo, pra quem quiser um
        desafio maior ainda.
        <br />
        <br />
        Deixe <b>auto-pot</b>, <b>auto-catch</b> e <b>auto-revive</b> ligados (vem ativados por padrao) pra
        caçar sem precisar intervir manualmente — configure as bolas/pocoes preferidas no painel 🤖 Auto.
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
          className="mt-[.6em] w-[11em]"
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
          <div className="text-[.8em] text-n400">Resistencia — recebe 0.5x de:</div>
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
        o multiplicador de status <b>e</b> de valor de venda — POKEs raros nao sao so um troféu, sao mais
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
        Alem da raridade, todo POKE tambem tem uma chance independente de nascer <b>Shiny</b> (aparencia
        alternativa, ✨ no nome) — a taxa real e 200x mais alta que a taxa oficial dos jogos, proporcional a
        taxa de captura da propria especie. Shiny nao muda status nem venda por si so (isso e o que a raridade
        acima faz) — e puramente um brinde visual raro, mas continua contando pro seu placar no painel de
        performance e no chat.
      </WikiCard>

      <WikiCard title="Lendarios">
        Os 11 Pokemon lendarios do Dex nao aparecem em nenhuma hunt normal — eles sao exclusivos das 11{' '}
        <b>hunts BOSS</b> do Modo Pesadelo (um confronto único e fixo por lendario, nivel bem alto, sem
        respawn). Em campo eles ganham uma escala visual 1.5x maior que o normal e uma barra de HP customizada
        (5x mais larga, 2x mais alta) pra refletir o quao imponente e essa luta — isso e visual/de
        apresentacao, a raridade sorteada neles continua seguindo a mesma tabela acima.
      </WikiCard>
    </div>
  )
}

function MecanicasTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Sistema de captura">
        A captura e <b>sempre automatica</b> — nao existe um botao pra jogar a bola manualmente. Sempre que um
        selvagem e derrotado (com <b>auto-catch</b> ligado no painel 🤖 Auto), o jogo tenta usar a bola
        configurada e rola uma chance de sucesso baseada em 3 fatores: a <b>taxa de captura real</b> da
        especie (dado da planilha/Gen2 — quanto menor, mais raro e dificil de capturar), o{' '}
        <b>multiplicador da bola</b> usada (bolas melhores capturam mais facil) e um multiplicador global fixo
        de balanceamento. Todo POKE capturado entra na mochila resetado pro <b>Nivel 1</b>, independente do
        nivel que tinha em campo — e sempre carrega consigo a raridade e o status shiny que foram sorteados no
        momento em que apareceu.
      </WikiCard>

      <WikiCard title="Odio / agressividade (lure)">
        Cada selvagem tem um raio de <b>agressividade</b> (aggro) — a distancia a partir da qual ele nota seu
        POKE e comeca a se aproximar. Esse alcance foi calibrado pra ser <b>moderado</b>: o selvagem só
        persegue de uma distancia media, nunca do mapa inteiro. Uma vez que a perseguição começa, existe um
        raio de <b>desistencia</b> (leash) mais generoso — se voce (ou ele) se afastar demais depois de já ter
        engajado, o selvagem desiste e volta a vagar perto do seu ponto de nascimento original, em vez de te
        seguir pra sempre.
        <br />
        <br />
        Do lado do jogador: seu POKE ativo sempre foca o inimigo vivo mais proximo no mapa inteiro (ou o shiny
        mais proximo, se houver algum shiny vivo na hunt — prioridade automatica sobre qualquer outro alvo) e
        redefine esse alvo a cada abate, então ele caça ativamente pelo mapa em vez de ficar parado numa unica
        posicao esperando os selvagens virem.
      </WikiCard>

      <WikiCard title="Distancia de visao (camera/FOV)">
        A camera comeca com um campo de visao 160% maior que o padrao original (voce ve mais mapa ao redor do
        seu POKE do que veria em 100%), tanto durante as hunts quanto na cena do Hospital. Isso e só o ponto
        de partida — o zoom ainda pode ser ajustado livremente com os botoes +/- no canto superior direito ou
        Ctrl+Scroll do mouse, pra qualquer lado (mais perto ou ainda mais longe).
      </WikiCard>

      <WikiCard title="Habilidades em area (AoE)">
        Alguns golpes (marcados com uma bolinha verde no icone da barra de habilidades) atingem{' '}
        <b>todos os alvos</b> dentro de um raio fixo ao redor de quem usou o golpe, em vez de só um alvo unico
        — o efeito visual em campo (o anel se expandindo) e desenhado exatamente do tamanho real dessa area,
        então dá pra ver visualmente quem vai ser atingido. Sempre que algum golpe AOE disponivel acertaria 2
        ou mais inimigos ao mesmo tempo, a IA de combate o escolhe direto — mesmo que exista um golpe
        single-target pronto com mais poder.
        <br />
        <br />
        Todo POKE, ao atingir o <b>Nivel 50</b>, aprende automaticamente um golpe em area exclusivo tematizado
        pelo seu próprio tipo elemental primario — a categoria de dano (Fisico ou Especial) desse golpe não e
        fixa: é decidida na hora, comparando o Atk Fisico e o Atk Especial daquele POKE especifico e usando o
        maior dos dois.
      </WikiCard>

      <WikiCard title="Sistema de recarga (tempo de acao)">
        Cada golpe tem seu proprio cooldown individual, calculado a partir do PP real daquele golpe na
        planilha: <b>menos PP significa mais tempo de recarga</b> (um golpe de 5 PP recarrega bem mais lento
        que um de 35 PP). Esse cooldown ainda e ajustado pela <b>Velocidade</b> do seu POKE — quanto maior a
        Velocidade, mais rapido todos os golpes recarregam. O Ataque Basico (o golpe universal de reserva que
        todo POKE sempre tem, tipo "Struggle") e a unica excecao: seu cooldown e fixo, nao depende de PP nem
        de Velocidade. Enquanto um golpe esta em uso, o POKE fica parado no lugar — ele so volta a se mover
        depois que a acao termina.
      </WikiCard>
    </div>
  )
}

type WikiTab = 'inicio' | 'tipos' | 'raridades' | 'mecanicas'

export function WikiMenu() {
  const [tab, setTab] = useState<WikiTab>('inicio')
  return (
    <div className="flex flex-col gap-[.8em]">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inicio', label: 'Primeiros Passos' },
          { value: 'tipos', label: 'Efetividade' },
          { value: 'raridades', label: 'Raridades' },
          { value: 'mecanicas', label: 'Mecanicas' },
        ]}
      />
      {tab === 'inicio' && <InicioTab />}
      {tab === 'tipos' && <TiposTab />}
      {tab === 'raridades' && <RaridadesTab />}
      {tab === 'mecanicas' && <MecanicasTab />}
    </div>
  )
}
