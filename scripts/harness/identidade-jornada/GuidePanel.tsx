import {
  Storefront, FirstAid, Sparkle, CheckSquare, ChatsCircle, ArrowsLeftRight, Scales,
  Sword, Trophy, BookBookmark, Books, GraduationCap, Calculator, Gear, ArrowUpRight,
} from '@phosphor-icons/react'
import { GUIDE_GROUPS } from './data'
import type { View } from './data'
import { EquipmentArt } from './Artwork'

const ICONS = { Storefront, FirstAid, Sparkle, CheckSquare, ChatsCircle, ArrowsLeftRight, Scales, Sword, Trophy, BookBookmark, Books, GraduationCap, Calculator, Gear }

export function GuidePanel({ navigate }: { navigate: (view: View) => void }) {
  return <div className="guide-workspace">
    <aside className="guide-intro"><EquipmentArt kind="guide" /><span className="eyebrow">SEU GUIA DE BOLSO</span><h2>Uma jornada.<br />Muitas possibilidades.</h2><p>Prepare-se, encontre outros treinadores e continue descobrindo.</p><span className="guide-stamp">POKE-HUNT<br /><strong>CLUBE DOS TREINADORES</strong></span></aside>
    <div className="guide-groups">{GUIDE_GROUPS.map((group, index) => <section key={group.title}>
      <div className="group-heading"><span>0{index + 1}</span><div><h2>{group.title}</h2><p>{group.note}</p></div></div>
      <div className="destination-grid">{group.destinations.map(destination => {
        const Icon = ICONS[destination.icon]
        return <button key={destination.name} className="destination-card" aria-label={`${destination.name}: ${destination.description}`} onClick={() => navigate(destination.name)}><span className="destination-icon"><Icon size={25} weight="duotone" aria-hidden="true" /></span><span><strong>{destination.name}</strong><small>{destination.description}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button>
      })}</div>
    </section>)}</div>
  </div>
}
