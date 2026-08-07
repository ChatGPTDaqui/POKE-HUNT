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
import { useBreakpoints } from '@/stores/uiStore'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameCheck, GameInput, GameSelect } from '@/components/game/controls'

const IV_MAX = 31
const fmt = new Intl.NumberFormat('pt-BR')
const ESPECIES = Object.values(SPECIES).sort((a, b) => a.name.localeCompare(b.name))

interface Lado {
  speciesId: string
  level: number
  rarity: RarityKey
  iv: number
  isShiny: boolean
}

const LADO_PADRAO: Lado = { speciesId: '', level: 50, rarity: 'comum', iv: IV_MAX, isShiny: false }

function statsDe(lado: Lado): { species: Species; stats: StatBlock } | null {
  const species = SPECIES[lado.speciesId]
  if (!species) return null
  // Um unico controle de IV aplicado aos 6 atributos: a calculadora responde
  // "quanto este POKE chega a valer", nao "e se o IV de Defesa fosse 12" —
  // seis campos aqui pediriam mais atencao do que a pergunta merece.
  const ivs: StatBlock = {
    hp: lado.iv, atkFis: lado.iv, atkEsp: lado.iv, def: lado.iv, defEsp: lado.iv, speed: lado.iv,
  }
  return { species, stats: computeStatsAtLevel(species, lado.level, ivs, lado.rarity, lado.isShiny) }
}

export function CalculadoraMenu() {
  const { colStack } = useBreakpoints()
  const [ladoA, setLadoA] = useState<Lado>({ ...LADO_PADRAO, speciesId: ESPECIES[0]?.id ?? '' })
  const [ladoB, setLadoB] = useState<Lado>(LADO_PADRAO)

  const a = useMemo(() => statsDe(ladoA), [ladoA])
  const b = useMemo(() => statsDe(ladoB), [ladoB])

  return (
    <div className={colStack ? 'flex flex-col gap-[1em]' : 'grid grid-cols-2 gap-[1em]'}>
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
  const url = resultado ? gen5SpriteUrl(resultado.species.id, lado.isShiny) : null

  return (
    <div className="flex flex-col gap-[.6em] rounded-[.7em] border border-n800 bg-n900 p-[.8em]">
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
          {ESPECIES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </GameSelect>
      </div>

      {!resultado ? (
        <div className="flex min-h-[10em] items-center justify-center rounded-[.6em] border border-dashed border-n700 p-[.8em] text-center text-[.8em] text-n500">
          Escolha um Pokemon para calcular os status — ou deixe vazio se so quer olhar o outro lado.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-[.6em]">
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

          <div className="grid grid-cols-3 gap-[.4em]">
            {([
              ['HP', 'hp'], ['Atk Fis', 'atkFis'], ['Atk Esp', 'atkEsp'],
              ['Defesa', 'def'], ['Def Esp', 'defEsp'], ['Velocidade', 'speed'],
            ] as const).map(([label, key]) => {
              const valor = resultado.stats[key]
              const outro = comparar?.stats[key]
              const delta = outro == null ? null : valor - outro
              return (
                <div key={key} className="rounded-[.5em] border border-n800 bg-background p-[.5em] text-center">
                  <div className="text-[.72em] text-n500">{label}</div>
                  <div className="text-[1.1em] font-medium tabular-nums">{fmt.format(valor)}</div>
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
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
