import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Compass, Heart, Storefront, FirstAid, Scales, BookBookmark, Sparkle, CheckSquare, Calculator, Sword } from '@phosphor-icons/react'
import { EquipmentArt, Portrait } from './Artwork'
import { PRIMARY, SHORTCUTS, ART, TEAM } from './data'
import type { ArtKind, Primary, View, TeamMember } from './data'
import { PanelHeader, Meter } from './primitives'
import { Adventure, ReserveStrip } from './Adventure'
import { TeamPanel } from './TeamPanel'
import { BagPanel } from './BagPanel'
import { GuidePanel } from './GuidePanel'
import { ExplorePanel } from './ExplorePanel'
import { DexPanel } from './DexPanel'
import { ServicePanel } from './ServicePanel'

const DESCRIPTIONS: Partial<Record<Primary, { eyebrow: string; subtitle: string }>> = {
  Equipe: { eyebrow: 'PREPARAR A JORNADA', subtitle: 'Grandes aventuras começam com bons companheiros.' },
  Mochila: { eyebrow: 'EQUIPAMENTO DO TREINADOR', subtitle: 'Tudo o que você precisa, no lugar certo.' },
  Hunt: { eyebrow: 'MAPA DA HUNT', subtitle: 'Consulte os locais e prepare sua próxima hunt.' },
  Pokédex: { eyebrow: 'CADERNO DE DESCOBERTAS', subtitle: 'Cada Pokémon, uma nova história.' },
  Mais: { eyebrow: 'GUIA DO TREINADOR', subtitle: 'Outras ferramentas para sua hunt.' },
}
const NAV_ICONS = { Loja: Storefront, Hospital: FirstAid, Mercado: Scales }
const SHORTCUT_ICONS = { Diário: BookBookmark, Especialidades: Sparkle, Tasks: CheckSquare, Calculadora: Calculator, PvP: Sword }
function isPrimary(view: View): view is Primary { return PRIMARY.some(name => name === view) }

export function App() {
  const [view, setView] = useState<View>('hunt')
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
    setView('hunt')
    const fallback = document.querySelector<HTMLElement>('.primary-nav button[aria-current], .primary-nav button:last-child')
    if (lastTrigger.current?.isConnected) lastTrigger.current.focus()
    else fallback?.focus()
  }
  useEffect(() => {
    if (view !== 'hunt') mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [view])
  const description = (isPrimary(view) ? DESCRIPTIONS[view] : undefined) ?? { eyebrow: 'GUIA DO TREINADOR', subtitle: 'Ferramentas que acompanham sua hunt.' }
  const art: ArtKind = (isPrimary(view) ? ART[view] : undefined) ?? 'guide'
  return <div className="journey-prototype" onKeyDown={event => { if (event.key === 'Escape') close() }}>
    <a className="skip-link" href="#journey-main">Pular para o conteúdo</a>
    <div className="prototype-banner"><span><i />PROTÓTIPO VISUAL</span><span>Dados demonstrativos · sem conexão com saves</span></div>
    <div className="game-frame" data-panel={view !== 'hunt'}>
      <div className="world-backdrop" aria-hidden="true" />
      <header className="game-header">
        <div className="brand"><span className="brand-ball" /><span>POKE<span>HUNT</span><small>JORNADA DO TREINADOR</small></span></div>
        <div className="active-companion"><Portrait id={active.id} /><div><span><strong>{active.name}</strong><small>Lv. {active.level}</small></span><div className="active-hp"><Heart size={12} aria-hidden="true" /><Meter value={active.hp} max={active.maxHp} label="HP do Pokémon em campo demonstrativo" /><small>{active.hp}/{active.maxHp}</small></div></div></div>
        <button className="trainer-access" aria-label="Abrir perfil do treinador" onClick={() => navigate('Treinador')}><img src="/assets/treinadores/rosto/red.png" alt="" width="40" height="40" /><span><strong>Treinador</strong><small>12.480 moedas · exemplo</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>
      </header>
      <ReserveStrip active={active} />
      <nav className="trainer-shortcuts" aria-label="Atalhos do treinador">{SHORTCUTS.map(destination => {
        const Icon = SHORTCUT_ICONS[destination]
        return <button key={destination} aria-label={destination} title={destination} aria-current={view === destination ? 'page' : undefined} onClick={() => view === destination ? close() : navigate(destination)}><Icon size={23} weight="duotone" aria-hidden="true" /></button>
      })}</nav>
      <main id="journey-main" className="journey-main" ref={mainRef}>
        {view === 'hunt' ? <Adventure navigate={navigate} notify={setNotice} active={active} /> : <section className="journey-panel" aria-labelledby="panel-title">
          <PanelHeader title={view} eyebrow={description.eyebrow} subtitle={description.subtitle} kind={art} onClose={close} onBack={isPrimary(view) || SHORTCUTS.some(name => name === view) ? undefined : () => navigate('Mais')} />
          <div className="panel-body" key={view}>
            {view === 'Equipe' ? <TeamPanel notify={setNotice} active={active} onActive={setActive} /> : view === 'Mochila' ? <BagPanel notify={setNotice} /> : view === 'Mais' ? <GuidePanel navigate={navigate} /> : view === 'Hunt' ? <ExplorePanel notify={setNotice} /> : view === 'Pokédex' ? <DexPanel /> : <ServicePanel view={view} notify={setNotice} />}
          </div>
          <footer className="panel-footnote"><span className="status-dot" />Estudo de interface · ações somente locais<Compass size={16} aria-hidden="true" /></footer>
        </section>}
      </main>
      <footer className="game-footer">
        <nav className="primary-nav" aria-label="Navegação principal">{PRIMARY.map(destination => {
          const kind = ART[destination]
          const Icon = destination in NAV_ICONS ? NAV_ICONS[destination as keyof typeof NAV_ICONS] : Compass
          return <button key={destination} aria-current={view === destination ? 'page' : undefined} onClick={() => view === destination ? close() : navigate(destination)}>{kind ? <EquipmentArt kind={kind} /> : <Icon className="nav-icon" size={32} weight="duotone" aria-hidden="true" />}<span>{destination}</span><i aria-hidden="true" /></button>
        })}</nav>
      </footer>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dispensar aviso">×</button></div>}
    </div>
  </div>
}
