// O card do anúncio que PRECEDE a negociação (PH-435).
//
// Antes disto, a conversa aberta pela vitrine chegava sem contexto nenhum: o
// vendedor recebia "aceita 1.8M?" e não sabia de qual dos seus anúncios o
// sujeito estava falando. O caminho do PH-119 (vitrine → perfil → conversa)
// levava id e nick e largava o resto na primeira tela.
//
// Ele desenha um SNAPSHOT, não o anúncio ao vivo. É a diferença que faz o card
// continuar dizendo a verdade depois de o anúncio ser vendido ou retirado — e o
// motivo de `contexto_anuncio` ser jsonb copiado, não uma referência por id.
// Detalhe completo no cabeçalho da migration `..._contexto_do_anuncio_na_mensagem_public.sql`.
import { Coin, Diamond, Gavel, Storefront } from '@phosphor-icons/react'
import { SPECIES } from '@/data/pokes'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { faceIconUrl } from '@/data/sprites'
import type { ContextoAnuncioCorreio } from '@/data/remote/servidor'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('pt-BR')

interface Props {
  ctx: ContextoAnuncioCorreio
  /** Quem está lendo. Decide entre "seu anúncio" e "anúncio de quem você está falando". */
  meuId: string
  /**
   * Card do que AINDA NÃO FOI enviado — o chip que fica sobre o campo de texto
   * enquanto o jogador escreve a primeira mensagem. Muda a moldura e o rótulo,
   * porque prometer "veio pelo anúncio" antes de a mensagem sair seria mentira:
   * fechar o fio sem enviar não deixa registro nenhum.
   */
  pendente?: boolean
  /** Só no modo pendente: desistir de levar o anúncio junto. */
  aoDescartar?: () => void
}

export function CardDoAnuncio({ ctx, meuId, pendente, aoDescartar }: Props) {
  const especie = SPECIES[ctx.speciesId]
  const cor = RARITIES[ctx.rarity as RarityKey]?.color
  const meu = ctx.sellerId === meuId
  const semPreco = ctx.price == null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-[.4em] rounded-[.5em] border px-[.45em] py-[.35em] text-[.8em]',
        pendente ? 'border-primary/50 bg-primary/10' : 'border-n700 bg-n800',
      )}
    >
      <span className="flex shrink-0 items-center gap-[.25em] text-[.85em] text-n400">
        {ctx.modo === 'leilao' ? <Gavel aria-hidden /> : <Storefront aria-hidden />}
        {/* A frase é a razão de o card existir: os dois lados leem a MESMA
            linha e sabem que a conversa saiu do Mercado, não do nada. */}
        {pendente
          ? 'Vai junto: anúncio'
          : meu ? 'Sobre o seu anúncio' : 'Veio pelo anúncio'}
      </span>

      <img
        src={faceIconUrl(ctx.speciesId, ctx.isShiny) ?? undefined}
        alt=""
        aria-hidden
        className="h-[1.9em] w-[1.9em] shrink-0 rounded-[.35em] object-cover"
        style={cor ? { border: `2px solid ${cor}` } : undefined}
      />

      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate">
          <b className={cn('font-medium', ctx.isShiny && 'text-shiny')}>
            {ctx.isShiny ? '✨ ' : ''}{especie?.name ?? ctx.speciesId}
          </b>
          <span className="text-n400"> Lv{ctx.level}</span>
        </span>
        <span className="text-[.85em] text-n400">
          IV {ctx.ivPercent}%
          {cor && <> · <span style={{ color: cor }}>{RARITIES[ctx.rarity as RarityKey]?.label ?? ctx.rarity}</span></>}
        </span>
      </div>

      {/* Leilão e somente-lance não têm preço fixo (`price` é null nos dois, por
          check no banco), e escrever "0" ali seria dizer que o POKE é de graça. */}
      {semPreco ? (
        <span className="shrink-0 text-warn">{ctx.modo === 'leilao' ? 'leilão' : 'somente lance'}</span>
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center gap-[.2em]',
            ctx.currency === 'gold' ? 'text-gold' : 'text-diamond',
          )}
        >
          {ctx.currency === 'gold' ? <Coin weight="fill" aria-hidden /> : <Diamond weight="fill" aria-hidden />}
          {fmt.format(ctx.price as number)}
        </span>
      )}

      {pendente && aoDescartar && (
        <button
          type="button"
          className="shrink-0 text-n400 underline decoration-dotted underline-offset-2 hover:text-n200"
          onClick={aoDescartar}
        >
          tirar
        </button>
      )}
    </div>
  )
}
