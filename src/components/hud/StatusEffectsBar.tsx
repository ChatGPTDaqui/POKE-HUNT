// Faixa de buffs/debuffs ativos no POKE em campo, acima da barra de golpes.
//
// Cobre os DOIS sistemas que hoje so tinham representacao textual (StatusBadge,
// selo "VEN"/"QUE"/...) ou nenhuma (estagios de atributo — Danca das Espadas,
// Rosnado etc nunca tiveram icone algum antes desta leva, so o numero cru na
// ficha de Status):
//   - condicao nao-volatil/volatil (`poke.status`/`player.statusVolatil`) —
//     mesmo dado do StatusBadge, agora com o GIF de statusVfx.ts (o mesmo
//     usado no flash de golpe) como icone PERSISTENTE, nao so o flash de
//     0,35-1,1s do impacto.
//   - estagio de atributo (`player.estagios`, +/-6 por stat) — pedido
//     explicito do usuario ("de maneira visual seja melhor entendido").
//
// Reusa `statusVfxUrl(tipo, direcao)` com o TIPO PRIMARIO DO PROPRIO POKE (nao
// o tipo do golpe que causou o efeito, que o flash de combate ja usa e nao
// sobrevive alem do proprio hit) — mesma linguagem visual de "tint by type"
// que aura/icone de habilidade/moldura de raridade ja usam neste jogo.
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { nomeDoStatus, type StatusAtivo } from '@/data/statusEffects'
import { statusVfxUrl } from '@/data/statusVfx'
import { ROTULO_ESTAGIO, textoDoSelo } from '@/data/statLabels'
import { formatarEstagio, formatarVariacao, formatarPrazoEmTurnos, multiplicadorDoStat } from '@/data/textoDeEstagioEPrazo'

import { getAbility } from '@/data/abilities'
import { nomeDaTrait } from '@/data/traits'
import type { FonteDeEstagio, StatDeEstagio } from '@/data/statusEffects'
import type { WorldEntity } from '@/engine/types'
import { useWorldStore } from '@/stores/worldStore'
import { useDeviceMode } from '@/stores/uiStore'
import { Sheet } from '@/components/game/Sheet'
import { Palavra } from '@/components/shared/Explicacao'
import { SectionLabel } from '@/components/game/controls'
import { Crosshair } from '@phosphor-icons/react'
import { GLOSSARIO, verbeteDoStatus, type Verbete } from '@/data/glossario'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const ESTAGIOS_ORDEM: StatDeEstagio[] = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed', 'accuracy', 'evasion']

interface Badge {
  key: string
  url: string | null
  /**
   * A SIGLA do atributo, quando o selo e de estagio: `+Atk`, `−Vel`.
   *
   * PH-121 tinha posto um icone Phosphor aqui, porque a arte de `statusVfxUrl`
   * variava com o tipo do POKE e com a direcao, nunca com o atributo — Ataque e
   * Velocidade desenhavam a mesma coisa. A PH-493 troca o icone pela sigla, a
   * pedido do dono do projeto: espada/escudo/vento ainda exigiam que o jogador
   * aprendesse um vocabulario, e `+Atk` nao exige nada. Substitui a `url` pelo
   * mesmo motivo que o icone substituia.
   */
  sigla: string | null
  titulo: string
  contador: string | null
  aumenta: boolean
  /** O que o efeito FAZ. O `titulo` diz so o nome e a contagem. */
  verbete: Verbete
  /** De onde o estagio veio (PH-121). Vazio para status. */
  fontes: FonteDeEstagio[]
}

/** "Danca das Espadas (voce)" / "Rosnado (Rattata)" / "Intimidate (Gyarados)". */
function descreverFonte(fonte: FonteDeEstagio): string {
  const nome = fonte.tipo === 'golpe'
    ? getAbility(fonte.id)?.name ?? fonte.id
    : nomeDaTrait(fonte.id) ?? fonte.id
  const quem = fonte.proprio ? 'você' : fonte.deQuem
  const marca = fonte.tipo === 'trait' ? ' · habilidade' : ''
  return `${nome} (${quem})${marca}`
}

/**
 * Monta os selos de UMA entidade. Extraida do corpo do componente (PH-132)
 * porque agora o jogador e o ALVO passam pela mesma regra — dois caminhos
 * separados divergiriam na primeira mudanca, e a issue pedia explicitamente que
 * o inimigo nao ganhasse um segundo dialeto visual.
 *
 * `prefixo` entra na `key` do React: o mesmo atributo pode estar alterado nos
 * dois lados, e sem ele as chaves colidiriam.
 */
function selosDaEntidade(entidade: WorldEntity | null, prefixo: string): Badge[] {
  if (!entidade) return []
  const species = SPECIES[entidade.poke.speciesId]
  if (!species) return []

  const badges: Badge[] = []

  for (const status of [entidade.poke.status, entidade.statusVolatil] as (StatusAtivo | null)[]) {
    if (!status) continue
    badges.push({
      key: `${prefixo}-status-${status.tipo}`,
      url: statusVfxUrl(species.type),
      sigla: null,
      // PH-422: prazo em SEGUNDOS. "3 turno(s)" nao diz nada a quem nunca viu
      // quanto vale um turno; o contador continua andando em degraus de
      // TURNO_SEGUNDOS porque `turnosRestantes` so cai quando o relogio fecha.
      titulo: status.turnosRestantes != null
        ? `${nomeDoStatus(status.tipo)} — ${formatarPrazoEmTurnos(status.turnosRestantes)} restantes`
        : `${nomeDoStatus(status.tipo)} — não passa sozinho`,
      contador: status.turnosRestantes != null
        ? formatarPrazoEmTurnos(status.turnosRestantes)
        : '∞',
      aumenta: false,
      verbete: verbeteDoStatus(status),
      fontes: [],
    })
  }

  for (const stat of ESTAGIOS_ORDEM) {
    const valor = entidade.estagios?.[stat] ?? 0
    if (valor === 0) continue
    badges.push({
      key: `${prefixo}-estagio-${stat}`,
      // Sem `url`: a sigla do ATRIBUTO e o que este selo tem pra dizer.
      url: null,
      sigla: textoDoSelo(stat, valor > 0),
      // PH-421: o selo diz o EFEITO, nao o degrau. "-1" e lido como "menos um
      // ponto de Ataque" e na verdade e um terco do atributo embora. O degrau
      // nao aparece mais em lugar nenhum de jogo; ele fica na wiki, junto da
      // formula.
      //
      // PH-481: e o efeito e dito em PORCENTAGEM. O contador do selo tem espaco
      // pra um numero so e ele passa a ser `−33%`; o multiplicador continua no
      // titulo, dentro do `formatarEstagio`, pra quem abrir o detalhe.
      titulo: `${ROTULO_ESTAGIO[stat]} ${valor > 0 ? 'aumentado' : 'diminuido'} — ${formatarEstagio(stat, valor)}`,
      contador: formatarVariacao(multiplicadorDoStat(stat, valor)),
      aumenta: valor > 0,
      verbete: GLOSSARIO.estagioDeAtributo,
      fontes: entidade.estagiosFonte?.[stat] ?? [],
    })
  }

  return badges
}

export function StatusEffectsBar() {
  const jogador = useWorldStore((s) => s.player ?? null)
  // O ALVO ATUAL (PH-132). `player.targetId` e publicado pelo motor
  // (combatSystem#updateCombat) exatamente pra isto — antes o buff do inimigo
  // nao aparecia em lugar nenhum, e a assimetria era o pior caso: Rosnado NO
  // jogador acendia selo, Danca das Espadas NO inimigo nao acendia nada, o que
  // ensina que "selo = tudo que esta ativo".
  const alvo = useWorldStore((s) => (
    s.player?.targetId ? s.enemies.find((e) => e.id === s.player!.targetId) ?? null : null
  ))
  const { coarse } = useDeviceMode()
  // O NOME de cada efeito so existia no `title`, ou seja, so no hover: no
  // celular a faixa era uma fileira de icones sem legenda nenhuma. O toque abre
  // a lista escrita. Mesmo remendo do slot de golpe, mesma razao.
  const [aberta, setAberta] = useState(false)

  if (!jogador) return null

  const badges = selosDaEntidade(jogador, 'eu')
  const badgesDoAlvo = selosDaEntidade(alvo, 'alvo')
  const nomeDoAlvo = alvo ? SPECIES[alvo.poke.speciesId]?.name ?? alvo.poke.speciesId : null
  // A cara do alvo ao lado do nome (PH-193, item 2) — ver o comentario do
  // rotulo. `faceIconUrl` e o mesmo icone que o trilho de reservas usa, entao o
  // jogador ja conhece esse vocabulario.
  const faceDoAlvo = alvo ? faceIconUrl(alvo.poke.speciesId, alvo.poke.isShiny) : null

  if (badges.length === 0 && badgesDoAlvo.length === 0) return null

  return (
    <>
    <div
      className={cn(
        'flex flex-col items-center gap-[.2em]',
        coarse ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
      )}
      onClick={coarse ? () => setAberta(true) : undefined}
      data-keep-open={coarse ? '' : undefined}
      role={coarse ? 'button' : undefined}
      aria-label={coarse ? 'Ver efeitos ativos' : undefined}
    >
      {badges.length > 0 && <FileiraDeSelos badges={badges} coarse={coarse} />}
      {/* O ALVO em fileira PROPRIA, com rotulo (PH-132). Misturar os dois numa
          fila so seria pior que nao mostrar: o jogador leria o buff do inimigo
          como se fosse dele. O rotulo e o que separa — icone igual dos dois
          lados e proposital (mesmo vocabulario), entao a unica coisa que
          responde "de quem" e a linha. */}
      {badgesDoAlvo.length > 0 && (
        <div className="flex items-center gap-[.3em]">
          {/* O ROTULO PRECISA SOBREVIVER AO FUNDO PIOR, NAO AO MAIS BONITO
              (PH-193, lição do PH-141).

              Ele saía em `text-n400` (#9b9ea8) direto sobre o cenário da hunt,
              sem superfície nenhuma atrás. Sobre a grama clara de Route 46 o
              nome da espécie ficava praticamente apagado — e ele é o UNICO
              elemento que responde "de quem são estes selos". Perdê-lo devolve
              exatamente o defeito que o PH-132 veio tirar: o jogador lê o buff
              do inimigo como se fosse dele.

              A correção é a superfície, não a cor: `vidro` é a mesma linguagem
              do trilho e da doca, e não depende do que está atrás. A cor sobe
              junto pra `n100` porque agora há contraste garantido pra gastar.

              A CARA DO ALVO vem junto pelo item 2 da issue: os selos moram no
              rodapé, a ~500px do POKE a que se referem, e relacionar "esse +2 é
              do Sentret" dependia de memória. O ícone é o vínculo mais barato
              que existe hoje — a marcação de alvo NO CAMPO, que seria o vínculo
              ideal, é PH-189 e ainda não existe. Quando ela chegar, a cor dela
              entra aqui e os dois passam a se apontar. */}
          <span className="vidro flex shrink-0 items-center gap-[.25em] rounded-full py-[.15em] pr-[.45em] pl-[.3em] text-[.55em] uppercase tracking-wide text-n100">
            <Crosshair size="1.4em" weight="bold" aria-hidden />
            {faceDoAlvo && (
              <img
                src={faceDoAlvo}
                alt=""
                aria-hidden
                draggable={false}
                className="h-[1.6em] w-[1.6em] shrink-0 rounded-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
            {nomeDoAlvo}
          </span>
          <FileiraDeSelos badges={badgesDoAlvo} coarse={coarse} />
        </div>
      )}
    </div>

    {aberta && (
      <Sheet
        winKey="efeitos"
        snap="conteudo"
        zIndex={33}
        onClose={() => setAberta(false)}
        title="Efeitos ativos"
      >
        {/* DOIS GRUPOS COM TITULO (PH-132). No dedo esta lista e o unico lugar
            que abre, entao ela precisa dizer de quem e cada efeito — uma lista
            corrida faria o jogador ler o buff do inimigo como se fosse dele. */}
        <ListaDeEfeitos titulo="No seu POKE" badges={badges} />
        {badgesDoAlvo.length > 0 && (
          <ListaDeEfeitos titulo={`No alvo · ${nomeDoAlvo}`} badges={badgesDoAlvo} />
        )}
      </Sheet>
    )}
    </>
  )
}

// No DEDO o toque em qualquer icone abre a LISTA inteira (sheet), que e o que
// cabe num alvo de 1.7em; no mouse, cada icone abre a propria bolha. Antes o
// desktop nao tinha caminho nenhum: o `title` dos icones nunca aparecia porque o
// container e `pointer-events-none` — o cursor nao chegava neles.
/** Um grupo da lista escrita, com titulo dizendo de QUEM sao os efeitos. */
function ListaDeEfeitos({ titulo, badges }: { titulo: string; badges: Badge[] }) {
  if (badges.length === 0) return null
  return (
    <>
      <SectionLabel>{titulo}</SectionLabel>
      <ul className="mb-[.6em] flex flex-col gap-[.35em]">
        {badges.map((badge) => (
          <li
            key={badge.key}
            className="flex items-center gap-[.5em] rounded-[.5em] border border-n800 px-[.6em] py-[.45em] text-[.85em]"
          >
            <span
              className="mt-[.35em] h-[.6em] w-[.6em] shrink-0 rounded-full"
              style={{ background: badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)' }}
            />
            {/* O nome e a contagem vinham sozinhos aqui: a lista dizia "Veneno
                — 3 turno(s)" e nada sobre o que o veneno faz. */}
            <span className="flex min-w-0 flex-col gap-[.15em]">
              <b className="font-medium">{badge.titulo}</b>
              {/* DE ONDE VEIO (PH-121) — antes a lista dizia so o atributo e a
                  contagem, e "quem fez isso" nao existia em lugar nenhum do
                  estado. Vem primeiro que a explicacao generica: e a parte que
                  responde a pergunta do jogador naquele instante. */}
              {badge.fontes.length > 0 && (
                <span className="leading-tight text-n300">
                  Origem: {badge.fontes.map(descreverFonte).join(' · ')}
                </span>
              )}
              {badge.verbete.corpo.map((linha) => (
                <span key={linha} className="leading-tight text-n400">{linha}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Uma fileira de selos. Extraida pra o jogador e o alvo desenharem igual. */
function FileiraDeSelos({ badges, coarse }: { badges: Badge[]; coarse: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-[.3em]">
      {badges.map((badge) => (
        <BadgeDoEfeito key={badge.key} badge={badge} coarse={coarse}>
          <div
            // LARGURA AUTOMATICA no selo de sigla, e nao o quadrado de 1.7em
            // (PH-493): `−AtkE` e `+Vel` nao medem igual, e uma caixa fixa
            // cortaria a sigla mais longa — que e justamente a que precisa das
            // quatro letras pra nao virar o mesmo texto de `AtkF`. A ALTURA
            // continua fixa: os selos de condicao (que sao imagem quadrada) e os
            // de atributo dividem a mesma fileira, e altura desigual leria como
            // duas fileiras.
            className="relative flex h-[1.7em] min-w-[1.7em] shrink-0 items-center justify-center overflow-hidden rounded-[.4em] border px-[.15em]"
            style={{
              borderColor: badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)',
              background: 'color-mix(in srgb, var(--color-n900) 80%, transparent)',
            }}
          >
            {badge.sigla ? (
              // A sigla ocupa o mesmo slot que o icone ocupava, com a mesma
              // folga embaixo — o contador de multiplicador mora na faixa
              // inferior e sobreporia o texto sem ela. A cor segue a direcao,
              // igual a borda: o sinal (`+`/`−`) e a cor dizem a mesma coisa por
              // dois canais, que e o que faz o selo funcionar pra quem nao
              // separa verde de vermelho.
              <span
                className="text-[.6em] font-bold leading-none whitespace-nowrap"
                style={{
                  color: badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)',
                  marginBottom: '.4em',
                }}
              >
                {badge.sigla}
              </span>
            ) : badge.url ? (
              <img
                src={badge.url}
                alt=""
                aria-hidden
                draggable={false}
                className="h-full w-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-[.55em] font-bold text-n300">?</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[.5em] font-bold tabular-nums text-white">
              {badge.contador}
            </span>
          </div>
        </BadgeDoEfeito>
      ))}
    </div>
  )
}

function BadgeDoEfeito(
  { badge, coarse, children }: { badge: Badge; coarse: boolean; children: ReactNode },
) {
  if (coarse) return <>{children}</>
  // No mouse a bolha e o unico lugar que abre, entao ela carrega o MESMO
  // conteudo da lista do celular: titulo com o atributo e a contagem, origem, e
  // depois a explicacao generica. Antes ela mostrava so a generica, e "de onde
  // veio" nao existia em canto nenhum (PH-121).
  const verbete: Verbete = {
    ...badge.verbete,
    titulo: badge.titulo,
    corpo: badge.fontes.length > 0
      ? [`Origem: ${badge.fontes.map(descreverFonte).join(' · ')}`, ...badge.verbete.corpo]
      : badge.verbete.corpo,
  }
  return (
    <Palavra verbete={verbete} className="pointer-events-auto no-underline" side="top">
      {children}
    </Palavra>
  )
}
