// Observa o POKE em campo e devolve a FACE que o retrato do trilho deve mostrar.
//
// A regra de qual estado da qual face e pura e mora em data/faceEmotions.ts.
// Aqui fica so o que precisa do React: ler o mundo com selector estreito, achar
// o level-up (que e um EVENTO, e o estado do mundo so guarda o resultado) e
// segurar a face por um tempo minimo pra ela nao piscar.
import { useEffect, useRef, useState } from 'react'
import type { PokeInstance } from '@/data/pokes'
import { escolherFace, faceUrlsDaEspecie, FACE_NEUTRA, type FaceEscolhida } from '@/data/faceEmotions'
import { primeImage } from '@/render/sprites'
import { useWorldStore } from '@/stores/worldStore'

/**
 * Quanto tempo a comemoracao dura. Perto do splash de LVL UP de proposito: as
 * duas coisas falam do mesmo instante.
 */
export const FESTEJO_MS = 2200

/**
 * Piso de permanencia de uma face.
 *
 * Sem isso o retrato tremia: `chase` -> `wander` -> `chase` acontece varias
 * vezes por segundo quando o alvo morre e outro nasce perto, e cada ida e volta
 * trocava a imagem. Meio segundo e o suficiente pra cada expressao ser LIDA — e
 * o atraso maximo que uma face nova pode sofrer, imperceptivel ao lado dos 2s de
 * um turno.
 */
export const PISO_DE_FACE_MS = 500

export function useFaceDoPoke(poke: PokeInstance | null): FaceEscolhida {
  // Seletores estreitos, um por campo, todos primitivos (menos o status, cuja
  // referencia o immer mantem estavel). Ler `s.player` inteiro re-renderizaria
  // este componente 60x/s de graca: x/y do jogador mudam a cada tick.
  const doJogador = useWorldStore((s) => (poke != null && s.player?.poke.uid === poke.uid))
  const fainted = useWorldStore((s) => s.player?.fainted ?? false)
  const emCombate = useWorldStore((s) => s.player?.state === 'chase' || s.player?.state === 'engaged')
  const statusVolatil = useWorldStore((s) => s.player?.statusVolatil ?? null)

  const festejando = useFestejando(poke?.uid ?? null, poke?.level ?? 0)
  useFacesQuentes(poke?.speciesId ?? null, poke?.isShiny ?? false)

  const face = poke == null
    ? FACE_NEUTRA
    : escolherFace({
      hpFrac: poke.stats.hp > 0 ? poke.hp / poke.stats.hp : 0,
      // Quem esta no trilho pode ser a copia do TIME (fora de hunt, ou POKE que
      // nao e o que esta em campo): nesse caso `fainted`/`state`/volatil sao de
      // outro POKE e nao valem. O `status` nao-volatil viaja no proprio
      // PokeInstance, entao ele vale sempre.
      fainted: doJogador ? fainted : poke.hp <= 0,
      status: poke.status ?? null,
      statusVolatil: doJogador ? statusVolatil : null,
      emCombate: doJogador && emCombate,
      festejando,
    })

  return useFaceEstavel(face)
}

/**
 * Aquece TODAS as faces da especie assim que ela entra em campo.
 *
 * A troca de face acontece no pior momento possivel pra um download: o POKE
 * chegando a 20% de vida, no meio de um combate. Sem isto o retrato ficaria em
 * branco por alguns frames exatamente ai. Sao 7 PNGs de ~4kB — mais barato que
 * um unico sprite de batalha, e por especie em campo, nao por especie do pool
 * (inimigo nao tem face no HUD).
 */
function useFacesQuentes(speciesId: string | null, isShiny: boolean): void {
  useEffect(() => {
    if (speciesId == null) return
    for (const url of faceUrlsDaEspecie(speciesId, isShiny)) void primeImage(url)
  }, [speciesId, isShiny])
}

/**
 * `true` durante FESTEJO_MS depois de o nivel SUBIR.
 *
 * So conta subida do MESMO POKE: trocar o POKE em campo muda o nivel exibido
 * sem que ninguem tenha subido, e a penalidade de morte o faz DESCER — nenhum
 * dos dois e motivo de festa.
 */
function useFestejando(uid: string | null, level: number): boolean {
  const anterior = useRef({ uid, level })
  const [festejandoAte, setFestejandoAte] = useState(0)

  useEffect(() => {
    const antes = anterior.current
    anterior.current = { uid, level }
    if (antes.uid === uid && level > antes.level) setFestejandoAte(performance.now() + FESTEJO_MS)
  }, [uid, level])

  useEffect(() => {
    if (festejandoAte === 0) return
    const restante = Math.max(0, festejandoAte - performance.now())
    const timer = setTimeout(() => setFestejandoAte(0), restante)
    return () => clearTimeout(timer)
  }, [festejandoAte])

  return festejandoAte > 0
}

/** Segura a face atual por PISO_DE_FACE_MS antes de aceitar a proxima. */
function useFaceEstavel(face: FaceEscolhida): FaceEscolhida {
  const [mostrada, setMostrada] = useState(face)
  const trocadaEm = useRef(0)

  useEffect(() => {
    if (face === mostrada) return
    const agora = performance.now()
    const espera = PISO_DE_FACE_MS - (agora - trocadaEm.current)
    if (espera <= 0) {
      trocadaEm.current = agora
      setMostrada(face)
      return
    }
    const timer = setTimeout(() => {
      trocadaEm.current = performance.now()
      setMostrada(face)
    }, espera)
    // A limpeza cobre o caso que motivou o piso: se a face volta a ser a que
    // esta na tela antes do prazo, a troca agendada e CANCELADA em vez de
    // acontecer atrasada.
    return () => clearTimeout(timer)
  }, [face, mostrada])

  return mostrada
}
