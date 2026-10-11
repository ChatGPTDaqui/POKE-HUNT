import type { Icon } from '@phosphor-icons/react'
import { MarcaDeCadeado } from '@/features/primeirosPassos/MarcaDeCadeado'
import { NotificationBadge } from './NotificationBadge'

/** Acesso compacto; o chamador conserva navegação e explicação de bloqueios. */
export function JourneyDestination({
  label, Icon, badge = 0, detalhe, trancado, onClick,
}: {
  label: string
  Icon: Icon
  badge?: number
  trancado?: string | null
  detalhe?: string | null
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="journey-destination" data-locked={!!trancado}>
      {trancado && <MarcaDeCadeado passoId={trancado} />}
      <Icon className="journey-destination-icon" aria-hidden />
      <span className="journey-destination-label">{label}</span>
      {detalhe && <span className="journey-destination-detail">{detalhe}</span>}
      <NotificationBadge
        count={badge}
        titulo={detalhe ? `${label}: ${detalhe}` : `${badge} pendência(s) em ${label}`}
      />
    </button>
  )
}
