// A aba "Progresso" da Wiki (PH-507) — o que faz um POKE e uma conta crescerem.
//
// COBERTURA QUE NAO EXISTIA: Especialidades (18 tipos x 2 trilhas), a cadeia de
// Missoes, a economia (por que vender captura rende muito mais que matar), a
// evolucao especial de nivel 80 e as Stones, o Bestiario e a Calculadora.
// Nenhum desses sistemas tinha uma linha na Wiki, e tres deles (Especialidades,
// Missoes, Bestiario) sao telas inteiras no menu "Mais" que o jogador abria sem
// nenhuma explicacao do que fazer ali.
//
// COMO OS NUMEROS ENTRAM. Mesma regra de `abaMundo.tsx`: por `import`.
// `ESPECIALIDADE_NIVEL_MAX`, `ESPECIALIDADE_BONUS_POR_NIVEL`,
// `ESPECIALIDADE_TYPES`, `SPECIAL_EVOLUTION_LEVEL`,
// `SPECIAL_EVOLUTION_STONE_COUNT`, `MAX_TEAM_SIZE`, `MAX_ACTIVE_ABILITIES` e a
// tabela de custo por tipo saem do codigo.
//
// O CUSTO DE ESPECIALIDADE E POR TIPO, e a tabela abaixo mostra isso em vez de
// um numero medio. A Stone so cai de POKE daquele tipo e os tipos nao aparecem
// na mesma frequencia — um "custa N Stones" unico seria falso para 17 dos 18.
import { useState } from 'react'
import {
  ESPECIALIDADE_TYPES, ESPECIALIDADE_NIVEL_MAX, ESPECIALIDADE_BONUS_POR_NIVEL,
  custosDoTipo,
} from '@/data/especialidades'
import { cadeiaDoTipo } from '@/data/missoes'
import { SPECIES, SPECIAL_EVOLUTION_LEVEL, SPECIAL_EVOLUTION_STONE_COUNT } from '@/data/pokes'
import { MAX_TEAM_SIZE } from '@/stores/gameStateDefaults'
import { MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { GameSelect } from '@/components/game/controls'
import { TypeChip as SharedTypeChip } from '@/components/shared/TypeChip'
import type { ElementType } from '@/data/generated/types'
import { WikiCard } from './WikiCard'

const fmt = new Intl.NumberFormat('pt-BR')
const BONUS_MAX_PCT = Math.round(ESPECIALIDADE_BONUS_POR_NIVEL * ESPECIALIDADE_NIVEL_MAX * 100)
const BONUS_POR_NIVEL_PCT = Math.round(ESPECIALIDADE_BONUS_POR_NIVEL * 100)

/** Quantas especies do elenco evoluem — contado, nao afirmado. */
const ESPECIES_QUE_EVOLUEM = Object.values(SPECIES)
  .filter((s) => (s.evolutionOptions?.length ?? 0) > 0).length

/**
 * O custo real das duas trilhas de UM tipo, escolhido pelo jogador.
 *
 * Interativo e nao uma matriz 18x5: a tabela cheia sao 90 celulas de numero
 * grande, que ninguem le. O jogador quer saber o custo do tipo que ELE esta
 * subindo.
 */
function CustoDaEspecialidade() {
  const [tipo, setTipo] = useState<ElementType>('FIRE')
  const custos = custosDoTipo(tipo)
  const totalStones = custos.reduce((a, c) => a + c.stoneQtd, 0)
  const totalGold = custos.reduce((a, c) => a + c.gold, 0)

  return (
    <div>
      <div className="mb-[.45em] flex items-center gap-[.4em]">
        <span className="text-[.8em] text-n400">Custo para</span>
        <GameSelect value={tipo} onChange={(e) => setTipo(e.target.value as ElementType)} className="w-[9em]">
          {ESPECIALIDADE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </GameSelect>
        <SharedTypeChip type={tipo} full />
      </div>
      <div className="overflow-hidden rounded-md border text-[.8em]">
        <div className="grid grid-cols-3 gap-1 border-b bg-muted/50 px-2 py-1 font-medium">
          <span>Nível</span><span>Pedras</span><span>Ouro</span>
        </div>
        {custos.map((c, i) => (
          <div key={i} className="grid grid-cols-3 gap-1 border-b px-2 py-1">
            <span className="font-semibold">{i + 1}</span>
            <span>{fmt.format(c.stoneQtd)}</span>
            <span>{fmt.format(c.gold)}</span>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-1 px-2 py-1 font-medium">
          <span>Trilha inteira</span>
          <span>{fmt.format(totalStones)}</span>
          <span>{fmt.format(totalGold)}</span>
        </div>
      </div>
      <div className="mt-[.4em] text-[.8em] text-n400">
        Esse é o custo de UMA trilha. Dano e defesa são separadas e cobram o mesmo — fechar as duas neste tipo
        custa {fmt.format(totalStones * 2)} pedras e {fmt.format(totalGold * 2)} de ouro.
      </div>
    </div>
  )
}

/** O tamanho da cadeia de missoes de um tipo, e o primeiro alvo dela. */
function CadeiaDeMissoes() {
  const [tipo, setTipo] = useState<ElementType>('FIRE')
  const cadeia = cadeiaDoTipo(tipo)
  const primeira = cadeia[0]
  const nomeDaEspecie = (id: string) => SPECIES[id]?.name ?? id

  return (
    <div>
      <div className="mb-[.45em] flex items-center gap-[.4em]">
        <span className="text-[.8em] text-n400">Cadeia de</span>
        <GameSelect value={tipo} onChange={(e) => setTipo(e.target.value as ElementType)} className="w-[9em]">
          {ESPECIALIDADE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </GameSelect>
        <SharedTypeChip type={tipo} full />
      </div>
      {cadeia.length === 0 ? (
        <div className="text-[.8em] text-n400">Este tipo não tem cadeia no elenco atual.</div>
      ) : (
        <div className="text-[.8em] text-n400">
          <b>{cadeia.length} missões</b> nesta cadeia. A primeira pede{' '}
          <b>{fmt.format(primeira.alvo)} abates de {nomeDaEspecie(primeira.speciesId)}</b> e paga{' '}
          {fmt.format(primeira.recompensa)} de ouro. A última é{' '}
          <b>{nomeDaEspecie(cadeia[cadeia.length - 1].speciesId)}</b>.
        </div>
      )}
    </div>
  )
}

export function ProgressoTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="Nível, EXP e a equipe">
        Seu POKE em campo ganha EXP por abate e sobe de nível sozinho. A <b>Equipe</b> são os até{' '}
        <b>{MAX_TEAM_SIZE}</b> POKEs que andam com você; só um fica em campo por vez, e é ele que ganha a EXP.
        O resto dos seus POKEs vive na <b>Mochila</b>.
        <br />
        <br />
        A curva do POKE é mais lenta que a do Treinador de propósito — seu nível de treinador sobe mais rápido
        que o do bicho. Ao subir de nível, o cartão de celebração mostra quanto cada atributo ganhou; em curva
        lenta um nível pode não mover atributo nenhum, e isso não é bug.
        <br />
        <br />
        Cada POKE carrega até <b>{MAX_ACTIVE_ABILITIES}</b> golpes ativos na barra. Golpe novo é aprendido por
        nível, e trocar quais estão ativos só é possível <b>fora</b> de uma caçada.
      </WikiCard>

      <WikiCard title="Captura — sempre automática">
        Não existe botão pra jogar bola. A captura acontece quando um selvagem é derrotado <b>com Auto-Catch
        ligado</b> (no painel de Automações, que nasce com ele desligado). A chance combina três coisas: a{' '}
        <b>taxa de captura real da espécie</b> (quanto mais rara a espécie, mais difícil), o{' '}
        <b>multiplicador da bola</b> usada, e um multiplicador global de balanceamento.
        <br />
        <br />
        A bola é consumida <b>mesmo quando a captura falha</b>. E o POKE capturado entra na Mochila no{' '}
        <b>Nível 1</b>, qualquer que fosse o nível dele em campo — o que ele traz do momento da captura é a
        raridade, o shiny, a natureza e os IVs.
        <br />
        <br />
        Dá pra criar <b>regra por espécie</b> ("capturar Dratini com Ultra Ball"). Ela tem prioridade sobre a
        bola padrão e sobre a bola de shiny — e se a bola daquela regra acabar, o Bot <b>não</b> troca por
        outra: ele simplesmente não tenta.
        <br />
        <br />
        <b>O chefe da sala é mais difícil de capturar</b>: Guardião e Lord têm metade da chance normal de
        entrarem na bola.
      </WikiCard>

      <WikiCard title="Vender captura rende muito mais que matar">
        Isto é o eixo da economia do jogo e não é acidente de balanceamento: o preço de venda de um POKE tem um{' '}
        <b>piso alto</b>, e o ouro por abate não tem. Medido na caçada inicial, o mesmo período rendeu cerca
        de <b>20x mais ouro vendendo capturas</b> do que abatendo.
        <br />
        <br />
        Consequência prática: se você quer ouro, ligue o Auto-Catch e venda o que não presta. O valor sobe com
        o nível do POKE e com a raridade dele. Existe uma <b>auto-venda</b> nas Automações que vende a captura
        no instante em que ela acontece, antes de o POKE entrar na Mochila — você escolhe quais raridades ela
        pega — e um <b>cadeado</b> pra marcar item e POKE que você nunca quer vender por engano.
        <br />
        <br />
        <b>A auto-venda nunca vende shiny</b>, qualquer que seja a configuração. É a única regra do Bot que não
        tem interruptor, e o motivo é simples: shiny vendido por engano não volta.
      </WikiCard>

      <WikiCard title="Itens e a Loja">
        A Loja vende bolas, poções, curas de status e Revives, e compra POKE e item de volta. Duas regras que
        vale saber:
        <ul className="mt-[.4em] flex flex-col gap-[.3em] pl-[1.1em]" style={{ listStyleType: 'disc' }}>
          <li>
            <b>A venda é metade do preço de compra</b>, sempre — não existe item que dê lucro comprando e
            revendendo.
          </li>
          <li>
            <b>Bola, poção e cura de status têm desconto grande na compra.</b> São os consumíveis do dia a dia,
            e o desconto entra antes do cálculo de venda.
          </li>
        </ul>
        <div className="mt-[.5em]">
          As <b>Pedras</b> (uma por tipo elemental) <b>não são compráveis em lugar nenhum</b> — só caem de
          abate, do tipo do POKE derrotado. Elas são o material da evolução especial e das Especialidades, e é
          por isso que os dois disputam o mesmo estoque.
        </div>
      </WikiCard>

      <WikiCard title="Evolução — por nível e por pedra">
        <b>{ESPECIES_QUE_EVOLUEM} espécies do elenco evoluem</b>, e a maioria por nível: chegando lá, o botão
        aparece na Equipe. Algumas têm <b>mais de um destino</b> (o Eevee é o caso extremo, com cinco), e nesse
        caso você escolhe — o jogo nunca decide por você.
        <br />
        <br />
        As evoluções que nos jogos originais aconteciam por troca ou item viraram <b>evolução especial</b>{' '}
        aqui: elas cobram <b>nível {SPECIAL_EVOLUTION_LEVEL} + {SPECIAL_EVOLUTION_STONE_COUNT} Pedras</b> do
        tipo certo. Qual tipo, é o do próprio caminho quando ele define um (Flareon cobra FIRE, Vaporeon WATER,
        Jolteon ELECTRIC, Espeon PSYCHIC, Umbreon DARK) e o tipo primário da espécie de origem quando não.
        <br />
        <br />
        <b>Evoluir tarde não perde golpe.</b> Se você passou do nível em que a forma evoluída aprenderia algo,
        ela desbloqueia tudo o que já era devido no momento da evolução. E um POKE evoluído nunca de-evolui,
        mesmo perdendo nível por desmaio.
      </WikiCard>

      <WikiCard title={`Especialidades — até +${BONUS_MAX_PCT}% por tipo`}>
        Uma progressão paralela ao nível, que vale pra <b>toda a sua conta</b> e não por POKE. São{' '}
        <b>{ESPECIALIDADE_TYPES.length} tipos elementais</b>, cada um com <b>duas trilhas</b> de{' '}
        <b>{ESPECIALIDADE_NIVEL_MAX} níveis</b>:
        <ul className="mt-[.4em] flex flex-col gap-[.3em] pl-[1.1em]" style={{ listStyleType: 'disc' }}>
          <li><b>Dano</b> — seus golpes daquele tipo ficam mais fortes.</li>
          <li><b>Defesa</b> — você recebe menos dano de golpes daquele tipo.</li>
        </ul>
        <div className="mt-[.5em]">
          Cada nível dá <b>+{BONUS_POR_NIVEL_PCT}%</b>, até <b>+{BONUS_MAX_PCT}%</b> no nível{' '}
          {ESPECIALIDADE_NIVEL_MAX}. Parece pouco por nível, e o ponto é o acúmulo: subir a trilha de defesa do
          tipo que mais te machuca no bioma em que você está é uma decisão real.
        </div>
        <div className="mt-[.5em]">
          O material são <b>Pedras</b> daquele tipo, mais ouro. Como a Pedra só cai de POKE daquele tipo, o
          custo é calibrado por tipo — tipo raro cobra menos pedras que tipo comum, pra o esforço real ficar
          parecido:
        </div>
        <div className="mt-[.55em]">
          <CustoDaEspecialidade />
        </div>
      </WikiCard>

      <WikiCard title="Missões — a cadeia de abates por tipo">
        Na tela <b>Tasks</b>, cada tipo elemental tem uma <b>cadeia sequencial</b> de missões de abate: mate N
        de uma espécie, receba ouro, e a missão seguinte da cadeia abre. As espécies vêm em ordem de
        dificuldade real de farm — quão fácil ela é de encontrar, depois quão avançada na linha de evolução ela
        é — e não por número de Pokédex.
        <div className="mt-[.55em]">
          <CadeiaDeMissoes />
        </div>
        <div className="mt-[.5em]">
          É a forma mais direta de transformar farm que você ia fazer de qualquer jeito em ouro extra: você
          escolhe o bioma pela espécie da missão atual em vez de caçar no vazio.
        </div>
      </WikiCard>

      <WikiCard title="Bestiário, Pokedex e Calculadora">
        Três telas de consulta, no menu <b>Mais</b>, e cada uma responde uma pergunta diferente:
        <ul className="mt-[.4em] flex flex-col gap-[.3em] pl-[1.1em]" style={{ listStyleType: 'disc' }}>
          <li>
            <b>Pokedex</b> — toda espécie do jogo, inclusive as que você nunca viu, com fraquezas,
            resistências e <b>onde encontrar cada uma</b>. É por aqui que se decide para qual bioma ir.
          </li>
          <li>
            <b>Bestiário</b> — quantos você já abateu de cada espécie, normal e shiny, com estágios de
            progresso. Hoje ele é <b>só registro</b>: os estágios não pagam recompensa nenhuma ainda, e a
            própria tela diz isso.
          </li>
          <li>
            <b>Calculadora de Força</b> — simula os atributos de qualquer espécie em qualquer nível, raridade e
            IV, com comparação lado a lado. Ela chama a <b>mesma função</b> que o jogo usa pra criar POKE e
            subir de nível, então o número não é estimativa.
          </li>
        </ul>
      </WikiCard>
    </div>
  )
}
