import { useState } from 'react'
import { aceitaTm, TM_ITEMS } from '@/data/maquinas'
import { SPECIES } from '@/data/pokes'
import { pedirAcao } from '@/data/remote/autoridade'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { GameButton, GameSelect } from '@/components/game/controls'
import { useMochila } from './useMochila'

export function EnsinarTm({ itemId }: { itemId: string }) {
  const { carregada, erro } = useMochila()
  const team = useGameStateStore(s => s.team)
  const bag = useGameStateStore(s => s.bagPokes)
  const mapa = useGameStateStore(s => s.currentMapId)
  const locked = useGameStateStore(s => Boolean(s.lockedItems[itemId]))
  const [uid, setUid] = useState('')
  const acao = useAcaoPendente()
  const tm = TM_ITEMS[itemId]
  const candidatos = [...team, ...bag].filter(p => aceitaTm(p.speciesId, itemId) && !p.unlockedAbilities.includes(tm.golpe))
  const selecionado = candidatos.find(p => p.uid === uid)
  return <div className="flex flex-col gap-[.4em]">
    <p className="text-[.8em] text-n400">Consome uma TM e ensina o golpe permanentemente. Escolha o POKE e depois ative o golpe na ficha dele.</p>
    {erro && <p role="alert">{erro}</p>}
    {!carregada && <p>Carregando mochila…</p>}
    {mapa && <p>Volte ao Hospital para ensinar.</p>}
    {carregada && !candidatos.length && <p>Nenhum POKE compatível precisa deste golpe.</p>}
    <GameSelect aria-label="POKE que aprenderá a TM" value={uid} onChange={e => setUid(e.target.value)}>
      <option value="">Escolha um POKE compatível</option>
      {candidatos.map(p => <option key={p.uid} value={p.uid}>{SPECIES[p.speciesId]?.name ?? p.speciesId} · Nv. {p.level} · {p.uid.slice(-6)}</option>)}
    </GameSelect>
    <GameButton disabled={!selecionado || Boolean(mapa) || locked || acao.pendingKey != null}
      onClick={() => void acao.run('ensinar', () => pedirAcao({ tipo: 'ensinarTm', itemId, pokeUid: uid }, () => {
        const state = useGameStateStore.getState()
        const poke = [...state.team, ...state.bagPokes].find(p => p.uid === uid)
        if (!poke || !aceitaTm(poke.speciesId, itemId) || poke.unlockedAbilities.includes(tm.golpe)
          || state.lockedItems[itemId] || !(state.items[itemId] > 0) || state.currentMapId) return false
        state.removeItem(itemId, 1)
        state.updatePokeInstance(uid, atual => ({ ...atual, golpesDeMaquina: [...(atual.golpesDeMaquina ?? []), tm.golpe], unlockedAbilities: [...atual.unlockedAbilities, tm.golpe] }))
      }))}>Ensinar · consumir 1 TM</GameButton>
  </div>
}
