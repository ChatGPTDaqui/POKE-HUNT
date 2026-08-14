import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ErroServidor } from '@/data/remote/servidor'
import { toast } from '../utils'

/** Toda mutacao do Mercado segue o mesmo ciclo: manda intencao, sobrescreve o
 *  estado local com a resposta, invalida a vitrine. Centralizado pra nenhuma
 *  acao esquecer um dos tres passos — esquecer o segundo faria o ouro na HUD
 *  ficar defasado ate o proximo flush. */
export function useAcaoMercado<T>(fn: (arg: T) => Promise<{ mensagem?: string }>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (r.mensagem) toast(r.mensagem)
      void qc.invalidateQueries({ queryKey: ['mercado'] })
    },
    onError: (erro) => {
      toast(erro instanceof ErroServidor ? erro.message : 'Nao foi possivel falar com o Mercado.', 'error')
    },
  })
}
