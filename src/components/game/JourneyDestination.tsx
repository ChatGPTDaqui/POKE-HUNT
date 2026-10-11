import type { Icon } from '@phosphor-icons/react'
import { useId } from 'react'
import { MarcaDeCadeado } from '@/features/primeirosPassos/MarcaDeCadeado'
import { NotificationBadge } from './NotificationBadge'

/** Acesso compacto; o chamador conserva navegação e explicação de bloqueios. */
export function JourneyDestination({
  label, Icon, badge = 0, detalhe, description, trancado, onClick,
}: {
  label: string
  Icon: Icon
  badge?: number
  trancado?: string | null
  detalhe?: string | null
  description?: string
  onClick: () => void
}) {
  const descriptionId = useId()
  return (
    <button type="button" aria-label={label} aria-describedby={descriptionId} onClick={onClick} className="journey-destination" data-locked={!!trancado}>
      {trancado && <MarcaDeCadeado passoId={trancado} />}
      <Icon className="journey-destination-icon" weight="duotone" aria-hidden />
      <span id={descriptionId} className="journey-destination-copy"><span className="journey-destination-label">{label}</span>
      {description && <span className="journey-destination-description">{description}</span>}
      {detalhe && <span className="journey-destination-detail">{detalhe}</span>}
      </span>
      <NotificationBadge
        count={badge}
        titulo={detalhe ? `${label}: ${detalhe}` : `${badge} pendência(s) em ${label}`}
      />
    </button>
  )
}
