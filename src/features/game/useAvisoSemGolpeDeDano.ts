// Fim do Ataque Basico (19/10/2026, pedido do dono): o POKE em campo sem golpe
// de dano usa o que tem ate acabar o PP e depois luta com Struggle. O jogo avisa
// UMA vez por POKE (por sessao) pra o jogador ensinar um golpe com TM. O selo
// fixo fica na Equipe (TeamMenu).
import { useEffect } from 'react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { SPECIES } from '@/data/pokes'
import { semGolpeDeDano } from '@/data/activeAbilities'

const avisados = new Set<string>()

export function useAvisoSemGolpeDeDano(): void {
  const poke = useGameStateStore((s) => s.team[s.activeIndex])
  const species = poke ? SPECIES[poke.speciesId] : undefined
  const precisa = !!poke && !!species && semGolpeDeDano(poke, species, false)
  const uid = poke?.uid
  useEffect(() => {
    if (!precisa || !uid || avisados.has(uid)) return
    avisados.add(uid)
    useToastStore.getState().pushToast(
      `${species!.name} não tem golpe de dano: vai usar o que tem até acabar o PP e depois o Struggle, que o machuca. Ensine um golpe com um TM.`,
      'info', 'world',
    )
  }, [precisa, uid, species])
}
