// PH-314 — convidar alguem pra trocar a partir de um jogador que JA esta na
// tela.
//
// POR QUE UM HOOK, E POR QUE POR `userId` E NAO POR NICK
//
// Mesmo motivo de `usePedirAmizade` (PH-214): os dois lugares que oferecem isto
// mostram o outro jogador de formas diferentes — no Ranking ele e uma linha de
// lista, no Social e um contato de conversa. O que os dois compartilham e a
// chamada e o tratamento da resposta.
//
// A chave e o `userId`, e nao o nick, porque `abrir_troca` recebe uuid — e os
// dois lugares ja tem o id em maos. Uma variante por nick precisaria de
// `id_por_nome_de_treinador`, que NAO e concedida a `authenticated` (conferido
// no banco), entao ela viraria uma RPC nova pra resolver um problema que nao
// existe.
//
// TODA a regra fica no servidor: bloqueio nos dois sentidos, sessao dupla de
// qualquer um dos dois lados, trocar consigo mesmo. O cliente repassa a
// mensagem — reimplementar isso aqui criaria uma segunda fonte pra divergir.
import { useMutation } from '@tanstack/react-query'
import * as trocaRpc from '@/data/remote/trocaRpc'
import { ErroServidor } from '@/data/remote/servidor'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useUiStore } from '@/stores/uiStore'

export interface ConviteDeTroca {
  /** Dispara o convite. Ignora chamada enquanto a anterior nao respondeu. */
  convidar: (userId: string) => void
  enviando: boolean
  /** Este id e o meu? So pra a tela nao OFERECER a acao — o servidor recusa. */
  souEu: (userId: string) => boolean
}

export function useConvidarTroca(): ConviteDeTroca {
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const abrirTela = useUiStore((s) => s.openScreen)
  const mutacao = useMutation({
    mutationFn: (userId: string) => trocaRpc.abrirTroca(userId),
    onSuccess: () => {
      useToastStore.getState().pushToast('Convite de troca enviado.', 'success', 'world')
      // Leva pra mesa: o convite abre uma sessao que ja tem prazo correndo, e
      // deixar o jogador na lista faria o relogio andar numa tela que nao
      // mostra relogio nenhum.
      abrirTela('troca')
    },
    onError: (e: unknown) => useToastStore.getState().pushToast(
      e instanceof ErroServidor ? e.message : 'Não foi possível abrir a troca.',
      'error',
      'world',
    ),
  })

  return {
    convidar: (userId) => { if (!mutacao.isPending) mutacao.mutate(userId) },
    enviando: mutacao.isPending,
    souEu: (userId) => !!meuId && meuId === userId,
  }
}
