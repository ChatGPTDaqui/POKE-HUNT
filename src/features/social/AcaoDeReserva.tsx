// Reservar o anúncio pra quem está do outro lado da conversa (PH-437).
//
// POR QUE AQUI, E NÃO NA ABA DE ANÚNCIOS ATIVOS
//
// A reserva precisa de duas coisas: um preço e um destinatário. Em "Anúncios
// Ativos" o vendedor tem o preço mas não tem destinatário — teria que escolher
// um jogador de uma lista, digitando um nick de cor. Dentro do fio a contraparte
// é inequívoca: é a pessoa com quem ele acabou de combinar o valor.
//
// O caminho pela oferta não substitui isto, e não é por acaso: `reservar_anuncio`
// RECUSA anúncio com lance pendente, porque lance pendente é ouro de terceiro em
// escrow. Quem negociou por lance responde o lance; quem negociou conversando
// reserva aqui.
//
// Liberar a reserva fica em "Anúncios Ativos", e não aqui: lá é a lista de tudo
// que está prometido, e é de lá que o vendedor enxerga o que precisa soltar.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookmarkSimple } from '@phosphor-icons/react'
import { GameButton, GameInput } from '@/components/game/controls'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { ErroServidor, detalheDeErro, type ContextoAnuncioSocial } from '@/data/remote/servidor'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'

function toast(mensagem: string, tipo: 'success' | 'error' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'trade', undefined, erroDetalhe)
}

interface Props {
  ctx: ContextoAnuncioSocial
  /** O outro lado do fio: quem recebe a reserva. */
  paraId: string
  nick: string
}

export function AcaoDeReserva({ ctx, paraId, nick }: Props) {
  // Nasce com o preço ANUNCIADO, não vazio nem zero: na maioria das
  // negociações o desconto é pequeno, então partir do valor atual é menos
  // digitação. Zero seria pior que vazio — um clique afobado reservaria o POKE
  // de graça.
  const [preco, setPreco] = useState<number>(ctx.price ?? 0)
  const [enviando, setEnviando] = useState(false)
  const qc = useQueryClient()

  async function confirmar() {
    if (preco <= 0 || enviando) return
    setEnviando(true)
    try {
      const { mensagem } = await mercadoRpc.reservarAnuncio({
        anuncioId: ctx.anuncioId,
        paraId,
        price: preco,
      })
      if (mensagem) toast(mensagem)
      // A vitrine e a aba de anúncios mudaram: o anúncio saiu da lista pública
      // e ganhou selo na do vendedor.
      void qc.invalidateQueries({ queryKey: ['mercado'] })
    } catch (e) {
      toast(
        e instanceof ErroServidor ? e.message : 'Não foi possível reservar.',
        'error',
        detalheDeErro(e),
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-[.2em]">
      <div className="flex flex-wrap items-end gap-[.35em]">
        <label className="flex flex-col gap-[.15em] text-[.72em] text-n400">
          Reservar por
          <GameInput
            type="number"
            className="w-[7.5em]"
            min={1}
            max={100_000_000}
            aria-label={`Preço da reserva para ${nick}`}
            value={preco || ''}
            onChange={(e) => setPreco(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </label>
        <GameButton
          variant="secondary"
          carregando={enviando}
          disabled={preco <= 0}
          onClick={() => void confirmar()}
        >
          <BookmarkSimple /> Reservar para {nick}
        </GameButton>
      </div>
      <span className="text-[.7em] text-n400">
        Sai da vitrine: só {nick} consegue comprar, pelo valor acima.
      </span>
    </div>
  )
}
