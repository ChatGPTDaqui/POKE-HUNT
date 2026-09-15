// Foto de perfil do treinador (PH-548), onde quer que um nome de jogador
// apareca. Duas formas de uso:
//
//   <AvatarDoTreinador userId={id} />         — pede ao cache (lote) e desenha
//   <AvatarDoTreinador avatar="lance" />      — id ja conhecido (bot, preview)
//
// Sem foto (ou id fora do catalogo) cai no icone generico, que e o que a HUD
// sempre mostrou. Tamanho em `em` pra acompanhar a escala da HUD e dos menus.
import { useEffect } from 'react'
import { User } from '@phosphor-icons/react'
import { avatarUrl } from '@/data/avatares'
import { useAvatarStore } from '@/stores/avatarStore'

interface Props {
  userId?: string | null
  avatar?: string | null
  /** Lado do quadrado, em `em`. */
  tamanho?: number
  className?: string
  /** Nome do jogador, so pra acessibilidade; a imagem e decorativa ao lado do nome. */
  nome?: string
}

export function AvatarDoTreinador({ userId, avatar, tamanho = 2, className = '', nome }: Props) {
  const pedir = useAvatarStore((s) => s.pedir)
  const doCache = useAvatarStore((s) => (userId ? s.porUsuario[userId] : undefined))
  useEffect(() => {
    if (userId && avatar === undefined) pedir(userId)
  }, [userId, avatar, pedir])
  const id = avatar !== undefined ? avatar : doCache
  const url = avatarUrl(id)
  const estilo = { width: `${tamanho}em`, height: `${tamanho}em` }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[.5em] bg-n800 text-n300 ${className}`}
      style={estilo}
      aria-hidden={nome ? undefined : true}
      role={nome ? 'img' : undefined}
      aria-label={nome ? `Foto de ${nome}` : undefined}
    >
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" draggable={false} />
        : <User weight="fill" style={{ fontSize: `${tamanho * 0.55}em` }} />}
    </span>
  )
}
