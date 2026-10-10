import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, X } from '@phosphor-icons/react'
import { EquipmentArt, RouteDecoration } from './Artwork'
import type { ArtKind } from './data'

export function Meter({ value, max, label, variant = 'hp' }: { value: number; max: number; label: string; variant?: 'hp' | 'exp' }) {
  return <div className={`meter meter--${variant}`} role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
    <span style={{ '--meter-fill': `${value / max * 100}%` } as CSSProperties} />
  </div>
}
export function PrimaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="primary-button" onClick={onClick}>{children}<ArrowRight size={19} aria-hidden="true" /></button>
}
export function PanelHeader({ title, eyebrow, kind, subtitle, onClose, onBack }: {
  title: string; eyebrow: string; kind: ArtKind; subtitle: string; onClose: () => void; onBack?: () => void
}) {
  return <header className="panel-header">
    <RouteDecoration />
    <div className="panel-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1 tabIndex={-1} id="panel-title">{title}</h1>
      <p>{subtitle}</p>
    </div>
    <EquipmentArt kind={kind} className="header-art" />
    <div className="panel-close">
      {onBack && <button className="icon-button" aria-label="Voltar a Mais" onClick={onBack}><ArrowLeft size={20} /></button>}
      <button className="icon-button" aria-label="Fechar painel" onClick={onClose}><X size={21} /></button>
    </div>
  </header>
}
export function TypePill({ type }: { type: string }) {
  return <span className="type-pill" data-type={type}>{type}</span>
}
