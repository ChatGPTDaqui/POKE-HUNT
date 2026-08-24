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
import { nomeDoStatus, type StatusAtivo } from '@/data/statusEffects'
import { statusVfxUrl } from '@/data/statusVfx'
import { ROTULO_ESTAGIO } from '@/data/statLabels'
import { ICONE_DE_ESTAGIO } from '@/data/statIcones'
import { getAbility } from '@/data/abilities'
import { nomeDaTrait } from '@/data/traits'
import type { FonteDeEstagio, StatDeEstagio } from '@/data/statusEffects'
import { useWorldStore } from '@/stores/worldStore'
import { useDeviceMode } from '@/stores/uiStore'
import { Sheet } from '@/components/game/Sheet'
import { Palavra } from '@/components/shared/Explicacao'
import { GLOSSARIO, verbeteDoStatus, type Verbete } from '@/data/glossario'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const ESTAGIOS_ORDEM: StatDeEstagio[] = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed', 'accuracy', 'evasion']

interface Badge {
  key: string
  url: string | null
  /**
   * Icone do ATRIBUTO, quando o selo e de estagio (PH-121). Substitui a `url`:
   * a arte de `statusVfxUrl` varia com o tipo do POKE e com a direcao, nunca
   * com o atributo, entao Ataque e Velocidade desenhavam a mesma coisa.
   */
  Icone: typeof ICONE_DE_ESTAGIO[StatDeEstagio] | null
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

export function StatusEffectsBar() {
  const poke = useWorldStore((s) => s.player?.poke ?? null)
  const statusVolatil = useWorldStore((s) => s.player?.statusVolatil ?? null)
  const estagios = useWorldStore((s) => s.player?.estagios ?? null)
  const estagiosFonte = useWorldStore((s) => s.player?.estagiosFonte ?? null)
  const { coarse } = useDeviceMode()
  // O NOME de cada efeito so existia no `title`, ou seja, so no hover: no
  // celular a faixa era uma fileira de icones sem legenda nenhuma. O toque abre
  // a lista escrita. Mesmo remendo do slot de golpe, mesma razao.
  const [aberta, setAberta] = useState(false)

  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null

  const badges: Badge[] = []

  for (const status of [poke.status, statusVolatil] as (StatusAtivo | null)[]) {
    if (!status) continue
    badges.push({
      key: `status-${status.tipo}`,
      url: statusVfxUrl(species.type, 'diminui'),
      Icone: null,
      titulo: status.turnosRestantes != null
        ? `${nomeDoStatus(status.tipo)} — ${status.turnosRestantes} turno(s) restante(s)`
        : `${nomeDoStatus(status.tipo)} — nao passa sozinho`,
      contador: status.turnosRestantes != null ? String(status.turnosRestantes) : '∞',
      aumenta: false,
      verbete: verbeteDoStatus(status),
      fontes: [],
    })
  }

  if (estagios) {
    for (const stat of ESTAGIOS_ORDEM) {
      const valor = estagios[stat] ?? 0
      if (valor === 0) continue
      badges.push({
        key: `estagio-${stat}`,
        // Sem `url`: o icone do ATRIBUTO e o que este selo tem pra dizer.
        url: null,
        Icone: ICONE_DE_ESTAGIO[stat],
        titulo: `${ROTULO_ESTAGIO[stat]} ${valor > 0 ? 'aumentado' : 'diminuido'} (${valor > 0 ? '+' : ''}${valor})`,
        contador: `${valor > 0 ? '+' : ''}${valor}`,
        aumenta: valor > 0,
        verbete: GLOSSARIO.estagioDeAtributo,
        fontes: estagiosFonte?.[stat] ?? [],
      })
    }
  }

  if (badges.length === 0) return null

  return (
    <>
    <div
      className={cn(
        'flex flex-wrap justify-center gap-[.3em]',
        coarse ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
      )}
      onClick={coarse ? () => setAberta(true) : undefined}
      data-keep-open={coarse ? '' : undefined}
      role={coarse ? 'button' : undefined}
      aria-label={coarse ? 'Ver efeitos ativos' : undefined}
    >
      {badges.map((badge) => (
        <BadgeDoEfeito key={badge.key} badge={badge} coarse={coarse}>
        <div
          className="relative flex h-[1.7em] w-[1.7em] items-center justify-center overflow-hidden rounded-[.4em] border"
          style={{
            borderColor: badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)',
            background: 'color-mix(in srgb, var(--color-n900) 80%, transparent)',
          }}
        >
          {badge.Icone ? (
            // `weight="bold"`, e nao `fill` nem `regular`. Conferido no harness:
            // com `fill` o escudo da Defesa virava um borrao vermelho sem forma
            // e Def. Esp. ficava um quadrado verde com uma estrela — ou seja, a
            // silhueta (que e a unica coisa que o icone tem pra dizer) se perdia
            // justamente nos dois atributos mais parecidos entre si. `regular` e
            // fino demais em 1.7em com o contador por cima. A cor segue a
            // direcao, igual a borda.
            <badge.Icone
              size="70%"
              weight="bold"
              aria-hidden
              color={badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)'}
              style={{ marginBottom: '.25em' }}
            />
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
          <span
            className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[.5em] font-bold tabular-nums text-white"
          >
            {badge.contador}
          </span>
        </div>
        </BadgeDoEfeito>
      ))}
    </div>

    {aberta && (
      <Sheet
        winKey="efeitos"
        snap="conteudo"
        zIndex={33}
        onClose={() => setAberta(false)}
        title="Efeitos ativos"
      >
        <ul className="flex flex-col gap-[.35em]">
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
      </Sheet>
    )}
    </>
  )
}

// No DEDO o toque em qualquer icone abre a LISTA inteira (sheet), que e o que
// cabe num alvo de 1.7em; no mouse, cada icone abre a propria bolha. Antes o
// desktop nao tinha caminho nenhum: o `title` dos icones nunca aparecia porque o
// container e `pointer-events-none` — o cursor nao chegava neles.
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
