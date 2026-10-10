import { useRef, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { TEAM } from './data'
import type { TeamMember } from './data'
import { TypePill } from './primitives'

export function DexPanel() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TeamMember>(TEAM[0])
  const detailRef = useRef<HTMLElement>(null)
  const entries = TEAM.filter(poke => poke.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  return <div className="dex-workspace"><section>
    <label className="search-field"><MagnifyingGlass size={20} aria-hidden="true" /><span className="sr-only">Buscar Pokémon</span><input placeholder="Nome do Pokémon" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="section-line"><h2>Registros de exemplo</h2><span>{entries.length} registros</span></div>
    <div className="dex-grid">{entries.map(poke => <button key={poke.id} className="dex-entry" aria-label={`Consultar ${poke.name} na Pokédex`} aria-pressed={selected.id === poke.id} onClick={() => { setSelected(poke); detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }) }}><span>#{poke.number}</span><img src={`/assets/gen5ani/${poke.id}.gif`} alt="" /><strong>{poke.name}</strong><small>Consultar ficha</small></button>)}</div>
    {entries.length === 0 && <div className="empty-state"><h2>Nenhum registro encontrado</h2><p>Tente outro nome.</p></div>}
  </section><section ref={detailRef} className="dex-detail" aria-label={`Registro de ${selected.name}`}><span className="eyebrow">REGISTRO DE CAMPO · #{selected.number}</span><img src={`/assets/gen5ani/${selected.id}.gif`} alt={selected.name} /><h2>{selected.name}</h2><div>{selected.types.map(type => <TypePill key={type} type={type} />)}</div><p>Um espaço para conhecer cada descoberta, com identidade e informações bem organizadas.</p><p className="demo-caption">Estudo visual. Os registros reais continuam no jogo atual.</p></section></div>
}
