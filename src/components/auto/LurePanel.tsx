// Aba de LURE do painel de Automacoes.
//
// A mecanica esta em `engine/systems/lureSystem.ts` — o cabecalho dela explica
// por que reunir selvagens e o que habilita farm em area. Esta tela e so a
// escolha do jogador (ligar, e quantos) mais a leitura do que o motor esta
// fazendo agora.
//
// O status AO VIVO existe porque sem ele a mecanica lê como bug: o POKE atravessa
// a hunt passando ao lado de inimigos sem bater, e nada na tela diz que aquilo
// e intencional. Mesmo raciocinio do `SalaChip` — a barra de abates da sala foi
// adicionada porque "quanto falta" era invisivel.
import { useEffect, useRef } from 'react'
import { LURE_QUANTIDADE_MAX, LURE_QUANTIDADE_MIN } from '@/stores/gameStateDefaults'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { sincronizarLure } from '@/data/remote/autoridade'
import { SegmentedTabs } from '@/components/game/controls'
import { BlocoAuto } from './BlocoAuto'

const DICA_LURE = 'Antes de bater, o POKE passa pelo raio de aggro de vários selvagens '
  + 'e os puxa atrás de si. Com o grupo junto, um golpe de área acerta todos de uma vez — '
  + 'é o farm em área. Em troca, você leva o ataque de todos eles ao mesmo tempo.'

const OPCOES_DE_QUANTIDADE = Array.from(
  { length: LURE_QUANTIDADE_MAX - LURE_QUANTIDADE_MIN + 1 },
  (_, i) => {
    const n = LURE_QUANTIDADE_MIN + i
    return { value: String(n), label: String(n) }
  },
)

/**
 * O que o motor esta fazendo agora. Le CAMPOS soltos do `world.lure`, nunca o
 * objeto: `stepWorld` reescreve `world.lure` a cada tick, entao um selector que
 * devolvesse o objeto re-renderizaria esta tela 60 vezes por segundo. Com
 * primitivos, o React so re-renderiza quando a fase ou a contagem mudam de
 * verdade (ver a nota de topo de stores/worldStore.ts).
 */
function StatusAoVivo() {
  const fase = useWorldStore((s) => s.lure?.fase ?? null)
  const reunidos = useWorldStore((s) => s.lure?.reunidos ?? 0)
  const alvo = useWorldStore((s) => s.lure?.alvo ?? 0)
  const esperando = useWorldStore((s) => s.lure?.esperandoRetardatario ?? false)
  const naHunt = useWorldStore((s) => s.mapDef != null)

  if (!naHunt) return <div className="text-n500">Entre numa hunt pra ver a reunião acontecendo.</div>
  if (fase == null) return null

  const rotulo = fase === 'reunindo'
    ? (esperando ? 'Esperando o retardatário' : 'Reunindo')
    : 'Lutando com o grupo'

  return (
    <div className="flex items-center justify-between gap-[.5em] rounded-[.5em] border border-n800 px-[.6em] py-[.4em]">
      <span className="text-n400">{rotulo}</span>
      <span className="tabular-nums font-medium text-n100">{reunidos}/{alvo}</span>
    </div>
  )
}

export function LurePanel() {
  const lureConfig = useGameStateStore((s) => s.lureConfig)
  const setLureConfig = useGameStateStore((s) => s.setLureConfig)

  // Mesmo desenho do `AutoPanel`: sincroniza quando a config muda, e IGNORA o
  // primeiro disparo — ele aconteceria logo apos o estado chegar DO servidor e
  // mandaria os mesmos valores de volta a cada abertura da aba.
  //
  // O servidor precisa desta config, e nao e detalhe de persistencia: ele
  // resimula a janela de flush com o MESMO motor, e sem o lure do lado dele o
  // resultado dele divergiria do que o jogador acabou de ver na tela.
  //
  // `sincronizarLure` e nao `sincronizarAuto`: chamada separada de proposito —
  // ver o cabecalho dela em data/remote/autoridade.ts.
  const primeiraSync = useRef(true)
  useEffect(() => {
    if (primeiraSync.current) {
      primeiraSync.current = false
      return
    }
    sincronizarLure()
  }, [lureConfig])

  return (
    <div className="flex flex-col gap-[.45em]">
      <BlocoAuto
        titulo="Lure"
        dica={DICA_LURE}
        ligado={lureConfig.ligado}
        aoLigar={(v) => setLureConfig({ ligado: v })}
      >
        <label className="flex flex-col gap-[.3em]">
          <span className="text-n400">Quantos POKEs reunir antes de bater</span>
          <SegmentedTabs
            value={String(lureConfig.quantidade)}
            options={OPCOES_DE_QUANTIDADE}
            onChange={(v) => setLureConfig({ quantidade: Number(v) })}
          />
        </label>

        <StatusAoVivo />

        {/* As tres coisas que o jogador precisa saber ANTES de subir a conta, e
            que nenhuma delas e adivinhavel olhando a tela: o dano entra
            multiplicado, o ganho depende de ter golpe de área na rotação, e o
            lure sai de cena sozinho quando aparece shiny. */}
        <ul className="flex flex-col gap-[.2em] text-[.92em] text-n500">
          <li>· Reunir {lureConfig.quantidade} multiplica o dano que entra no seu POKE.</li>
          <li>· O ganho vem do golpe de área: sem um na rotação, o grupo só bate mais em você.</li>
          <li>· Shiny em campo cancela a reunião — ele continua tendo prioridade.</li>
          <li>· Hunt de um inimigo só (inicial, BOSS, Lance) ignora o lure.</li>
        </ul>
      </BlocoAuto>
    </div>
  )
}
