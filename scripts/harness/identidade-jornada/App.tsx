import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Compass, Heart } from '@phosphor-icons/react'
import { EquipmentArt, Portrait } from './Artwork'
import { PRIMARY, ART, TEAM } from './data'
import type { ArtKind, Primary, View, TeamMember } from './data'
import { PanelHeader, Meter } from './primitives'
import { Adventure, ReserveStrip } from './Adventure'
import { TeamPanel } from './TeamPanel'
import { BagPanel } from './BagPanel'
import { GuidePanel } from './GuidePanel'
import { ExplorePanel } from './ExplorePanel'
import { DexPanel } from './DexPanel'
import { ServicePanel } from './ServicePanel'

const DESCRIPTIONS: Record<Primary, { eyebrow: string; subtitle: string }> = {
  Equipe: { eyebrow: 'PREPARAR A JORNADA', subtitle: 'Grandes aventuras começam com bons companheiros.' },
  Mochila: { eyebrow: 'EQUIPAMENTO DO TREINADOR', subtitle: 'Tudo o que você precisa, no lugar certo.' },
  Explorar: { eyebrow: 'MAPA DA JORNADA', subtitle: 'O próximo encontro está logo ali.' },
  Pokédex: { eyebrow: 'CADERNO DE DESCOBERTAS', subtitle: 'Cada Pokémon, uma nova história.' },
  Menu: { eyebrow: 'GUIA DO TREINADOR', subtitle: 'Escolha seu próximo passo.' },
}
function isPrimary(view: View): view is Primary { return PRIMARY.some(name => name === view) }

export function App() {
  const [view, setView] = useState<View>('aventura')
  const [notice, setNotice] = useState('')
  const [active, setActive] = useState<TeamMember>(TEAM[0])
  const lastTrigger = useRef<HTMLElement | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  function navigate(next: View) {
    if (document.activeElement instanceof HTMLElement) lastTrigger.current = document.activeElement
    setNotice('')
    setView(next)
  }
  function close() {
    setView('aventura')
    const fallback = document.querySelector<HTMLElement>('.primary-nav button[aria-current], .primary-nav button:last-child')
    if (lastTrigger.current?.isConnected) lastTrigger.current.focus()
    else fallback?.focus()
  }
  useEffect(() => {
    if (view !== 'aventura') mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [view])
  const description = isPrimary(view) ? DESCRIPTIONS[view] : { eyebrow: 'GUIA DO TREINADOR', subtitle: 'Um lugar para cada parte da aventura.' }
  const art: ArtKind = isPrimary(view) ? ART[view] : 'guide'
  return <div className="journey-prototype" onKeyDown={event => { if (event.key === 'Escape') close() }}>
    <a className="skip-link" href="#journey-main">Pular para o conteúdo</a>
    <div className="prototype-banner"><span><i />PROTÓTIPO VISUAL</span><span>Dados demonstrativos · sem conexão com saves</span></div>
    <div className="game-frame" data-panel={view !== 'aventura'}>
      <div className="world-backdrop" aria-hidden="true" />
      <header className="game-header">
        <button className="brand" aria-label="POKE-HUNT: voltar à aventura" onClick={close}><span className="brand-ball" /><span>POKE<span>HUNT</span><small>JORNADA DO TREINADOR</small></span></button>
        <div className="active-companion"><Portrait id={active.id} /><div><span><strong>{active.name}</strong><small>Lv. {active.level}</small></span><div className="active-hp"><Heart size={12} aria-hidden="true" /><Meter value={active.hp} max={active.maxHp} label="HP do Pokémon em campo demonstrativo" /><small>{active.hp}/{active.maxHp}</small></div></div></div>
        <button className="trainer-access" aria-label="Abrir perfil do treinador" onClick={() => navigate('Treinador')}><img src="/assets/treinadores/rosto/red.png" alt="" width="40" height="40" /><span><strong>Treinador</strong><small>12.480 moedas · exemplo</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>
      </header>
      <ReserveStrip active={active} />
      <main id="journey-main" className="journey-main" ref={mainRef}>
        {view === 'aventura' ? <Adventure navigate={navigate} notify={setNotice} active={active} /> : <section className="journey-panel" aria-labelledby="panel-title">
          <PanelHeader title={view} eyebrow={description.eyebrow} subtitle={description.subtitle} kind={art} onClose={close} onBack={isPrimary(view) ? undefined : () => navigate('Menu')} />
          <div className="panel-body" key={view}>
            {view === 'Equipe' ? <TeamPanel notify={setNotice} active={active} onActive={setActive} /> : view === 'Mochila' ? <BagPanel notify={setNotice} /> : view === 'Menu' ? <GuidePanel navigate={navigate} /> : view === 'Explorar' ? <ExplorePanel notify={setNotice} /> : view === 'Pokédex' ? <DexPanel /> : <ServicePanel view={view} notify={setNotice} />}
          </div>
          <footer className="panel-footnote"><span className="status-dot" />Estudo de interface · ações somente locais<Compass size={16} aria-hidden="true" /></footer>
        </section>}
      </main>
      <footer className="game-footer">
        <button className="return-to-field" onClick={close}><ArrowLeft size={16} aria-hidden="true" /><span>Voltar à aventura</span></button>
        <nav className="primary-nav" aria-label="Navegação principal">{PRIMARY.map(destination => <button key={destination} aria-current={view === destination ? 'page' : undefined} onClick={() => view === destination ? close() : navigate(destination)}><EquipmentArt kind={ART[destination]} /><span>{destination}</span><i aria-hidden="true" /></button>)}</nav>
        <span className="footer-brand">SEU PRÓXIMO PASSO COMEÇA AQUI.</span>
      </footer>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dispensar aviso">×</button></div>}
    </div>
  </div>
}
