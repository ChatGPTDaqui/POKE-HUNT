import { useState } from 'react'
import { aceitaTm, TM_ITEMS } from '@/data/maquinas'
import { DANO_SEM_PODER_BASE, OHKO_DESLIGADO, getAbility, isDamagingAbility } from '@/data/abilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import {
  AVISO_DANO_POR_REGRA_PROPRIA,
  AVISO_OHKO_DESLIGADO,
  AVISO_SEM_DANO,
  golpeTemEfeitoReal,
} from '@/data/moveDescriptions'
import { SPECIES } from '@/data/pokes'
import { pedirAcao } from '@/data/remote/autoridade'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { GameButton, GameSelect } from '@/components/game/controls'
import { TypeChip } from '@/components/shared/TypeChip'
import { descricaoDoGolpe, efeitosDoGolpe } from '@/components/shared/AbilityTooltip'
import { recargaEfetivaDoGolpe, VELOCIDADE_DE_REFERENCIA } from '@/engine/systems/combatSystem'
import { useMochila } from './useMochila'

const ROTULO_CATEGORIA: Record<string, string> = {
  physical: 'Fisico',
  special: 'Especial',
  status: 'Status',
}

function rotuloDoPoke(poke: { speciesId: string; level: number; uid: string }): string {
  return `${SPECIES[poke.speciesId]?.name ?? poke.speciesId} · Nv. ${poke.level} · ${poke.uid.slice(-6)}`
}

export function EnsinarTm({ itemId }: { itemId: string }) {
  const { carregada, erro } = useMochila()
  const team = useGameStateStore(s => s.team)
  const bag = useGameStateStore(s => s.bagPokes)
  const mapa = useGameStateStore(s => s.currentMapId)
  const locked = useGameStateStore(s => Boolean(s.lockedItems[itemId]))
  const [uid, setUid] = useState('')
  const acao = useAcaoPendente()
  const tm = TM_ITEMS[itemId]
  const ability = getAbility(tm.golpe)
  const equipeCompativel = team.filter(p => aceitaTm(p.speciesId, itemId) && !p.unlockedAbilities.includes(tm.golpe))
  const mochilaCompativel = bag.filter(p => aceitaTm(p.speciesId, itemId) && !p.unlockedAbilities.includes(tm.golpe))
  const candidatos = [...equipeCompativel, ...mochilaCompativel]
  const selecionado = candidatos.find(p => p.uid === uid)
  const categoria = ability && selecionado ? resolveAbilityCategory(ability, selecionado) : ability?.category
  const efeitos = ability ? efeitosDoGolpe(ability) : []
  const aviso = ability && ability.power <= 0 && !golpeTemEfeitoReal(ability)
    ? AVISO_SEM_DANO
    : ability && DANO_SEM_PODER_BASE.has(ability.id)
      ? AVISO_DANO_POR_REGRA_PROPRIA
      : ability && OHKO_DESLIGADO.has(ability.id) ? AVISO_OHKO_DESLIGADO : null
  const motivoBloqueio = mapa
    ? 'Volte ao Hospital para ensinar esta TM.'
    : locked ? 'Destranque a TM para poder usá-la.'
      : !candidatos.length && carregada ? 'Nenhum POKE compatível ainda precisa aprender este golpe.' : null

  return <div className="flex flex-col gap-[.4em]">
    {ability && (
      <section aria-label={`Detalhes de ${ability.name}`} className="overflow-hidden rounded-[.4em] border border-n700 bg-n900">
        <div className="flex flex-wrap items-center gap-[.4em] border-b border-n800 px-[.55em] py-[.4em]">
          <b className="mr-auto">{ability.name}</b>
          <TypeChip type={ability.type} full />
          <span className="text-[.78em] text-n300">{ROTULO_CATEGORIA[String(categoria)] ?? categoria}</span>
        </div>
        <div className="grid grid-cols-3 gap-px bg-n800 text-center text-[.75em]">
          <div className="bg-n900 px-[.35em] py-[.4em]"><span className="block text-n500">Dano base</span>{DANO_SEM_PODER_BASE.has(ability.id) || ability.power <= 0 ? '—' : ability.power}</div>
          <div className="bg-n900 px-[.35em] py-[.4em]"><span className="block text-n500">Precisão</span>{isDamagingAbility(ability) ? `${ability.accuracy ?? 100}%` : '—'}</div>
          <div className="bg-n900 px-[.35em] py-[.4em]"><span className="block text-n500">Recarga</span>{ability.cooldown != null ? `${recargaEfetivaDoGolpe(ability, selecionado?.stats.speed ?? VELOCIDADE_DE_REFERENCIA).toFixed(1)}s` : '—'}</div>
        </div>
        <div className="flex flex-col gap-[.3em] px-[.55em] py-[.45em] text-[.78em]">
          <p className="text-n300">{descricaoDoGolpe(ability)}</p>
          {ability.target === 'aoe' && <p className="text-sky-300">Atinge vários inimigos próximos.</p>}
          {efeitos.length > 0 && <div className="flex flex-wrap gap-[.3em]">{efeitos.map(efeito => <span key={efeito} className="rounded-[.3em] bg-n800 px-[.4em] py-[.12em]">{efeito}</span>)}</div>}
          {aviso && <p className="text-warn">{aviso}</p>}
        </div>
      </section>
    )}

    <div className="rounded-[.4em] border border-n800 px-[.55em] py-[.45em] text-[.78em] text-n300">
      <b className="text-foreground">Como funciona:</b> a TM é consumida uma vez e o POKE aprende o golpe para sempre. Depois, abra o perfil dele e escolha o golpe entre os quatro ativos.
    </div>
    {erro && <p role="alert">{erro}</p>}
    {!carregada && <p>Carregando mochila…</p>}
    {motivoBloqueio && <p role="status" className="text-[.8em] text-warn">{motivoBloqueio}</p>}
    <label className="flex flex-col gap-[.2em] text-[.78em] text-n300">
      Quem vai aprender?
      <GameSelect aria-label="POKE que aprenderá a TM" value={uid} disabled={!carregada || !candidatos.length} onChange={e => setUid(e.target.value)}>
        <option value="">Escolha um POKE compatível</option>
        {equipeCompativel.length > 0 && <optgroup label="Equipe — recomendado">
          {equipeCompativel.map(p => <option key={p.uid} value={p.uid}>{rotuloDoPoke(p)}</option>)}
        </optgroup>}
        {mochilaCompativel.length > 0 && <optgroup label="Mochila">
          {mochilaCompativel.map(p => <option key={p.uid} value={p.uid}>{rotuloDoPoke(p)}</option>)}
        </optgroup>}
      </GameSelect>
    </label>
    {selecionado && <p className="text-[.75em] text-n400">A recarga acima já considera a Velocidade deste POKE.</p>}
    <GameButton disabled={!selecionado || Boolean(mapa) || locked || acao.pendingKey != null}
      carregando={acao.isPending('ensinar')}
      onClick={() => void acao.run('ensinar', () => pedirAcao({ tipo: 'ensinarTm', itemId, pokeUid: uid }, () => {
        const state = useGameStateStore.getState()
        const poke = [...state.team, ...state.bagPokes].find(p => p.uid === uid)
        if (!poke || !aceitaTm(poke.speciesId, itemId) || poke.unlockedAbilities.includes(tm.golpe)
          || state.lockedItems[itemId] || !(state.items[itemId] > 0) || state.currentMapId) return false
        state.removeItem(itemId, 1)
        state.updatePokeInstance(uid, atual => ({ ...atual, golpesDeMaquina: [...(atual.golpesDeMaquina ?? []), tm.golpe], unlockedAbilities: [...atual.unlockedAbilities, tm.golpe] }))
      }))} block variant="primary">Ensinar {ability?.name ?? 'golpe'} · consumir 1 TM</GameButton>
  </div>
}
