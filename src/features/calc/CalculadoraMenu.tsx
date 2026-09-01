// Calculadora de Forca: simula os status de uma especie em qualquer
// nivel/raridade/IV, com comparacao lado a lado opcional.
//
// Nada aqui e estimativa: chama `computeStatsAtLevel`, a MESMA funcao que o
// jogo usa pra criar POKE, subir de nivel e evoluir. Se a formula da planilha
// mudar, esta tela muda junto.
//
// O handoff pedia campos "Potencial" e "Bonus de runa". Nenhum dos dois existe
// no modelo de dados — o que de fato multiplica status neste jogo e a RARIDADE
// (RARITIES[].statMultiplier), o shiny (SHINY_STAT_MULTIPLIER) e os IVs. Sao
// esses os controles aqui: os nomes do prototipo aplicados a campos que nao
// existem dariam numeros inventados.
import { useMemo, useState } from 'react'
import { SPECIES, computeStatsAtLevel, type Species, type StatBlock } from '@/data/pokes'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { useDeviceMode } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { useGameStateStore } from '@/stores/gameStateStore'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameButton, GameCheck, GameInput, GameSelect } from '@/components/game/controls'

const IV_MAX = 31
const fmt = new Intl.NumberFormat('pt-BR')
const ESPECIES = Object.values(SPECIES).sort((a, b) => a.name.localeCompare(b.name))

const STATS: readonly (readonly [string, keyof StatBlock])[] = [
  ['HP', 'hp'], ['Atk Fis', 'atkFis'], ['Atk Esp', 'atkEsp'],
  ['Defesa', 'def'], ['Def Esp', 'defEsp'], ['Velocidade', 'speed'],
]

interface Lado {
  speciesId: string
  level: number
  rarity: RarityKey
  iv: number
  isShiny: boolean
  /**
   * Valores digitados a mao, por atributo.
   *
   * Guardado separado do calculo (e nao substituindo `stats`) porque trocar
   * de nivel/raridade tem que voltar a recalcular os atributos que o jogador
   * NAO tocou. Chave ausente = "use o calculado".
   */
  manual: Partial<Record<keyof StatBlock, number>>
}

const LADO_PADRAO: Lado = { speciesId: '', level: 50, rarity: 'comum', iv: IV_MAX, isShiny: false, manual: {} }

function statsDe(lado: Lado): { species: Species; stats: StatBlock; calculado: StatBlock } | null {
  const species = SPECIES[lado.speciesId]
  if (!species) return null
  // Um unico controle de IV aplicado aos 6 atributos: a calculadora responde
  // "quanto este POKE chega a valer", nao "e se o IV de Defesa fosse 12" —
  // seis campos aqui pediriam mais atencao do que a pergunta merece.
  const ivs: StatBlock = {
    hp: lado.iv, atkFis: lado.iv, atkEsp: lado.iv, def: lado.iv, defEsp: lado.iv, speed: lado.iv,
  }
  const calculado = computeStatsAtLevel(species, lado.level, ivs, lado.rarity, lado.isShiny)
  const stats: StatBlock = { ...calculado }
  for (const [, key] of STATS) {
    const manual = lado.manual[key]
    if (manual != null) stats[key] = manual
  }
  return { species, stats, calculado }
}

export function CalculadoraMenu() {
  const { compacto } = useDeviceMode()
  const [ladoA, setLadoA] = useState<Lado>({ ...LADO_PADRAO, speciesId: ESPECIES[0]?.id ?? '' })
  const [ladoB, setLadoB] = useState<Lado>(LADO_PADRAO)

  const a = useMemo(() => statsDe(ladoA), [ladoA])
  const b = useMemo(() => statsDe(ladoB), [ladoB])

  return (
    <div className={compacto ? 'flex flex-col gap-[.65em]' : 'grid grid-cols-2 gap-[.65em]'}>
      <PainelLado marca="A" lado={ladoA} onChange={setLadoA} resultado={a} comparar={b} />
      <PainelLado marca="B" lado={ladoB} onChange={setLadoB} resultado={b} comparar={a} />
    </div>
  )
}

function PainelLado({
  marca, lado, onChange, resultado, comparar,
}: {
  marca: 'A' | 'B'
  lado: Lado
  onChange: (lado: Lado) => void
  resultado: ReturnType<typeof statsDe>
  comparar: ReturnType<typeof statsDe>
}) {
  const { compacto } = useDeviceMode()
  const url = resultado ? gen5SpriteUrl(resultado.species.id, lado.isShiny) : null
  // Especies presentes na equipe agora, na ordem da equipe e sem repetir
  // (dois POKEs da mesma especie dariam duas opcoes identicas).
  const team = useGameStateStore((s) => s.team)
  const daEquipe = useMemo(() => {
    const vistas = new Set<string>()
    const out: Species[] = []
    for (const poke of team) {
      const species = SPECIES[poke.speciesId]
      if (!species || vistas.has(species.id)) continue
      vistas.add(species.id)
      out.push(species)
    }
    return out
  }, [team])

  return (
    <div className="flex flex-col gap-[.45em] rounded-[.7em] border border-n800 bg-n900 p-[.6em]">
      <div className="flex items-center gap-[.5em]">
        <span className="flex h-[1.6em] w-[1.6em] items-center justify-center rounded-[.4em] bg-primary text-[.8em] font-semibold text-primary-foreground">
          {marca}
        </span>
        <GameSelect
          value={lado.speciesId}
          onChange={(e) => onChange({ ...lado, speciesId: e.target.value })}
          className="min-w-0 flex-1"
        >
          <option value="">Escolher Pokemon...</option>
          {/*
            A equipe atual vem PRIMEIRO, num grupo proprio (pedido explicito).
            O caso comum aqui e "quanto o meu POKE chega a valer" — com 226
            especies em ordem alfabetica, achar o proprio POKE era rolar a
            lista inteira. `<optgroup>` em vez de só reordenar porque sem o
            rotulo o jogador nao entende por que a lista comeca fora de ordem.
          */}
          {daEquipe.length > 0 && (
            <optgroup label="Sua equipe">
              {daEquipe.map((s) => (
                <option key={`equipe-${s.id}`} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={daEquipe.length > 0 ? 'Todas as espécies' : ''}>
            {ESPECIES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </optgroup>
        </GameSelect>
      </div>

      {!resultado ? (
        <div className="flex min-h-[10em] items-center justify-center rounded-[.6em] border border-dashed border-n700 p-[.6em] text-center text-[.8em] text-n500">
          Escolha um Pokemon para calcular os status — ou deixe vazio se so quer olhar o outro lado.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-[.45em]">
            {url && (
              <img
                src={url}
                alt=""
                className="h-[3.4em] w-[3.4em] object-contain [image-rendering:pixelated]"
                onError={(e) => e.currentTarget.remove()}
              />
            )}
            <div className="min-w-0">
              <div className="truncate font-medium" style={{ color: lado.isShiny ? 'var(--color-shiny)' : undefined }}>
                {lado.isShiny && '✨ '}{resultado.species.name}
              </div>
              <div className="mt-[.2em] flex gap-[.3em]">
                <TypeChip type={resultado.species.type} />
                {resultado.species.type2 && <TypeChip type={resultado.species.type2} />}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[.5em] text-[.8em]">
            <label className="flex flex-col gap-[.2em] text-n400">
              Nivel
              <GameInput
                type="number" min={1} max={999} value={lado.level}
                onChange={(e) => onChange({ ...lado, level: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
              />
            </label>
            <label className="flex flex-col gap-[.2em] text-n400">
              Raridade
              <GameSelect
                value={lado.rarity}
                onChange={(e) => onChange({ ...lado, rarity: e.target.value as RarityKey })}
              >
                {Object.values(RARITIES).map((r) => (
                  <option key={r.key} value={r.key}>{r.label} (×{r.statMultiplier})</option>
                ))}
              </GameSelect>
            </label>
            <label className="flex flex-col gap-[.2em] text-n400">
              IV (0–{IV_MAX}, aplicado em todos)
              <GameInput
                type="number" min={0} max={IV_MAX} value={lado.iv}
                onChange={(e) => onChange({ ...lado, iv: Math.max(0, Math.min(IV_MAX, Number(e.target.value) || 0)) })}
              />
            </label>
            <div className="flex items-end">
              <GameCheck checked={lado.isShiny} onChange={(v) => onChange({ ...lado, isShiny: v })}>
                Shiny ✨
              </GameCheck>
            </div>
          </div>

          {/* Duas colunas com rotulo AO LADO do campo no celular; tres colunas
              empilhadas no desktop. Empilhado, cada atributo custava ~90px
              (rotulo + campo de 44px + padding) e os seis somavam 300px de uma
              tela de ~470px — sobrava espaco pra nenhum resultado. */}
          <div className={cn('grid gap-[.4em]', compacto ? 'grid-cols-2' : 'grid-cols-3')}>
            {STATS.map(([label, key]) => {
              const valor = resultado.stats[key]
              const outro = comparar?.stats[key]
              const delta = outro == null ? null : valor - outro
              const editado = lado.manual[key] != null
              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-[.5em] border bg-background p-[.4em]',
                    compacto ? 'flex items-center gap-[.4em]' : 'text-center',
                  )}
                  style={{ borderColor: editado ? 'var(--color-primary)' : 'var(--color-n800)' }}
                >
                  <div className={cn('text-[.72em] text-n500', compacto && 'min-w-0 flex-1 truncate')}>{label}</div>
                  {/* Campo editavel, e nao numero fixo: o valor calculado e so
                      o ponto de partida. Digitar sobrescreve so este atributo;
                      apagar o campo devolve o controle ao calculo (por isso a
                      chave e REMOVIDA em vez de virar 0 — 0 e um valor manual
                      legitimo). */}
                  <GameInput
                    type="number"
                    min={0}
                    aria-label={label}
                    value={valor}
                    onChange={(e) => {
                      const bruto = e.target.value
                      const manual = { ...lado.manual }
                      if (bruto === '') delete manual[key]
                      else manual[key] = Math.max(0, Math.floor(Number(bruto) || 0))
                      onChange({ ...lado, manual })
                    }}
                    className={cn(
                      'text-center text-[1.05em] font-medium tabular-nums',
                      compacto ? 'w-[3.4em] shrink-0' : 'w-full',
                    )}
                  />
                  {/* Delta so aparece quando os dois lados estao preenchidos —
                      e a unica razao de existir um lado B. */}
                  {delta != null && delta !== 0 && (
                    <div
                      className="text-[.7em] tabular-nums"
                      style={{ color: delta > 0 ? 'var(--color-ok)' : 'var(--color-bad)' }}
                    >
                      {delta > 0 ? '+' : ''}{fmt.format(delta)}
                    </div>
                  )}
                  {editado && (
                    <div className="text-[.65em] text-n500">
                      calc. {fmt.format(resultado.calculado[key])}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {Object.keys(lado.manual).length > 0 && (
            <GameButton variant="ghost" block onClick={() => onChange({ ...lado, manual: {} })}>
              Voltar aos valores calculados
            </GameButton>
          )}
        </>
      )}
    </div>
  )
}
