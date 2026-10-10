import { useState } from 'react'
import { ArrowRight, CaretDown, ChatCircle, FirstAid, Lightning, Robot, Sun, MapPin } from '@phosphor-icons/react'
import { Portrait } from './Artwork'
import { TEAM } from './data'
import type { View, TeamMember } from './data'

export function Adventure({ navigate, notify, active }: { navigate: (view: View) => void; notify: (message: string) => void; active: TeamMember }) {
  const [collapsed, setCollapsed] = useState(false)
  const [automatic, setAutomatic] = useState(true)
  return <div className="adventure">
    <div className="adventure-location"><span><MapPin size={16} aria-hidden="true" />Mata · expedição demonstrativa</span><Sun size={20} aria-label="Condição de exemplo: ensolarado" /></div>
    <div className="objective"><button className="objective-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><span className="objective-symbol">!</span><span><small>PRÓXIMO PASSO</small><strong>Continue sua jornada</strong></span><CaretDown size={19} aria-hidden="true" /></button>{!collapsed && <button className="objective-action" onClick={() => navigate('Tasks')}><span>Consulte seus objetivos e recompensas</span><ArrowRight size={18} aria-hidden="true" /></button>}</div>
    <div className="encounter-scene" aria-label="Composição ilustrativa do campo; não é combate em execução">
      <div className="wild-poke"><span>Caterpie <small>Lv. 12</small></span><img src="/assets/gen5ani/caterpie.gif" alt="Caterpie" /></div>
      <div className="player-poke"><img src={`/assets/gen5ani/${active.id}.gif`} alt={active.name} /><span>{active.name}</span></div>
    </div>
    <div className="adventure-bottom"><div className="field-actions"><button onClick={() => navigate('Hospital')}><FirstAid size={19} aria-hidden="true" />Hospital</button><button onClick={() => navigate('Social')}><ChatCircle size={19} aria-hidden="true" />Conversas</button></div>
      <div className="combat-strip"><div className="move-buttons">{['Ember', 'Scratch', 'Growl'].map(move => <button key={move} onClick={() => notify(`${move}: demonstração visual, sem executar golpe.`)}><Lightning size={18} aria-hidden="true" /><span>{move}</span></button>)}</div><button className="auto-button" aria-pressed={automatic} onClick={() => { setAutomatic(!automatic); notify('Automação alterada somente nesta prévia.') }}><Robot size={21} aria-hidden="true" /><span>Auto <small>{automatic ? 'Ligado' : 'Pausado'}</small></span></button></div>
      <p className="field-caption">Cenário e encontros ilustrativos · nenhum combate está rodando</p>
    </div>
  </div>
}

export function ReserveStrip({ active }: { active: TeamMember }) {
  return <div className="reserve-strip" aria-label="Equipe demonstrativa"><span>COMPANHEIROS</span>{TEAM.filter(poke => poke.id !== active.id).map(poke => <Portrait key={poke.id} id={poke.id} name={poke.name} />)}<span>6 / 6</span></div>
}
