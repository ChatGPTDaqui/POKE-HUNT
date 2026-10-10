import { useRef, useState } from 'react'
import { Check, Heart, Shield, Lightning, Sword } from '@phosphor-icons/react'
import { Portrait } from './Artwork'
import { TEAM } from './data'
import type { TeamMember } from './data'
import { Meter, PrimaryButton, TypePill } from './primitives'

export function TeamPanel({ notify, active, onActive }: { notify: (message: string) => void; active: TeamMember; onActive: (poke: TeamMember) => void }) {
  const [selected, setSelected] = useState<TeamMember>(TEAM[0])
  const detailRef = useRef<HTMLElement>(null)
  return <div className="team-workspace">
    <section className="roster" aria-label="Integrantes da equipe">
      <div className="section-line"><h2>Seus companheiros</h2><span>6 / 6</span></div>
      {TEAM.map((poke, i) => <button key={poke.id} className="roster-card" aria-label={`Ver ficha de ${poke.name}, nível ${poke.level}`} aria-pressed={selected.id === poke.id} onClick={() => { setSelected(poke); detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }) }}>
        <span className="roster-number">0{i + 1}</span>
        <Portrait id={poke.id} />
        <span className="roster-info"><span className="roster-name">{poke.name}<small>Lv. {poke.level}</small></span>
          <span className="roster-hp"><Heart size={12} aria-hidden="true" />{poke.hp} / {poke.maxHp} HP</span>
          <Meter value={poke.hp} max={poke.maxHp} label={`HP de ${poke.name}`} />
        </span>
        {active.id === poke.id ? <span className="field-indicator"><Check size={14} aria-hidden="true" /><span>Em campo</span></span> : <span className="roster-dot" aria-hidden="true" />}
      </button>)}
    </section>
    <section ref={detailRef} className="pokemon-detail" aria-label={`Ficha de ${selected.name}`}>
      <div className="detail-top"><span className="eyebrow">FICHA DO COMPANHEIRO</span><span>#{selected.number}</span></div>
      <div className="pokemon-stage"><span className="stage-ring" /><img src={`/assets/gen5ani/${selected.id}.gif`} alt={selected.name} /><span className="stage-marker">Lv. {selected.level}</span></div>
      <div className="pokemon-identity"><h2>{selected.name}</h2><div>{selected.types.map(type => <TypePill key={type} type={type} />)}</div><p>{selected.note}</p></div>
      <div className="detail-vitals"><div><span>Saúde</span><strong>{selected.hp}<small> / {selected.maxHp}</small></strong></div><Meter value={selected.hp} max={selected.maxHp} label="Saúde do selecionado" /></div>
      <div className="stat-row">{[Sword, Shield, Lightning].map((Icon, i) => <div key={i}><Icon size={19} aria-hidden="true" /><strong>{selected.stats[i]}</strong><span>{['Ataque', 'Defesa', 'Velocidade'][i]}</span></div>)}</div>
      <PrimaryButton onClick={() => { onActive(selected); notify(`${selected.name} em campo na demonstração. Nenhum save foi alterado.`) }}>{active.id === selected.id ? 'Parceiro em campo' : 'Colocar em campo'}</PrimaryButton>
      <p className="demo-caption">Valores ilustrativos · seleção local, sem combate real.</p>
    </section>
  </div>
}
