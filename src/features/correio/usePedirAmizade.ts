// Pedir amizade a partir de um NICK que ja esta na tela (PH-214).
//
// POR QUE UM HOOK, E NAO UM COMPONENTE
//
// Os dois lugares que precisam disso mostram o nick de formas diferentes: no
// Ranking ele e uma coluna de uma lista, e o gatilho vira um icone no fim da
// linha; no Chat o nick E o texto, e o gatilho e ele mesmo. Um componente unico
// teria que aceitar `children` e classe pra os dois casos, e ai ele nao seria
// mais nada alem deste hook com invólucro. O que os dois COMPARTILHAM e a
// chamada e o tratamento de resposta — e e so isso que mora aqui.
//
// TODA a regra fica no SERVIDOR, de proposito. `pedir_amizade(p_nick)` recusa,
// com mensagem propria pra cada caso: adicionar a si mesmo, ja ser amigo, haver
// bloqueio entre os dois, pedido ja pendente, nick inexistente. O cliente so
// repassa a mensagem. Reimplementar essas regras aqui criaria uma segunda fonte
// pra elas divergirem — e o CLAUDE.md ja registra que limite de negocio so no
// cliente vira bypass.
//
// O nick e a chave porque foi assim que o Correio ja funcionava; esta issue nao
// precisou de nada novo no servidor. O que faltava era o jogador ter de onde
// tirar o nick sem saber de cor, que e a queixa que a abriu.
import { useMutation } from '@tanstack/react-query'
import * as correioRpc from '@/data/remote/correioRealtime'
import { ErroServidor } from '@/data/remote/servidor'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'

export interface PedidoDeAmizade {
  /** Dispara o pedido. Ignora chamada enquanto a anterior nao respondeu. */
  pedir: (nick: string) => void
  enviando: boolean
  /**
   * Este nick e o do proprio jogador?
   *
   * So pra a tela nao OFERECER a acao — e apresentacao, nao regra. O servidor
   * continua recusando ("Voce nao pode adicionar a si mesmo."); esconder aqui
   * evita fazer o jogador clicar pra descobrir o obvio.
   */
  souEu: (nick: string) => boolean
}

/**
 * Dois nicks sao a mesma pessoa?
 *
 * Funcao pura e exportada pra poder ser testada sem montar componente — e
 * porque a comparacao tem duas sutilezas que erram calado: `pedir_amizade`
 * compara com `lower()` no servidor, entao o cliente tambem tem que ignorar
 * caixa (senao ele OFERECE a acao na propria linha quando o nick aparece com
 * outra capitalizacao), e o nick pode chegar com espaco nas pontas.
 */
export function mesmoNick(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function usePedirAmizade(): PedidoDeAmizade {
  const meuNick = useGameStateStore((s) => s.trainer.name)
  const mutacao = useMutation({
    mutationFn: (nick: string) => correioRpc.pedirAmizade(nick),
    onSuccess: (r) => useToastStore.getState().pushToast(r.mensagem, 'success', 'world'),
    onError: (e: unknown) => useToastStore.getState().pushToast(
      e instanceof ErroServidor ? e.message : 'Não foi possível enviar o pedido.',
      'error',
      'world',
    ),
  })

  return {
    pedir: (nick) => { if (!mutacao.isPending) mutacao.mutate(nick) },
    enviando: mutacao.isPending,
    souEu: (nick) => mesmoNick(meuNick, nick),
  }
}
