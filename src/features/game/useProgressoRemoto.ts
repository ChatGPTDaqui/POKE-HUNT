// Liga a sessao autenticada ao progresso no Postgres.
//
// Ordem que importa e nao e obvia: o `persist` do gameStateStore roda com
// `skipHydration`, porque no carregamento do modulo ainda nao se sabe QUEM
// esta logado — hidratar antes disso leria a linha de ninguem. Este hook e
// quem, depois da sessao existir, configura o adaptador com o `user_id` e so
// entao dispara a hidratacao.
//
// Enquanto nao hidratar, o jogo NAO pode montar: o GameCanvas construiria o
// mundo a partir do estado default (equipe vazia) e o primeiro save
// sobrescreveria o progresso real do jogador com um save em branco.
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useGameStateStore, defaultGameStateData } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import {
  configurarPersistencia, limparPersistencia, flushAgora, erroDaUltimaCarga,
} from '@/data/remote/gameStatePersistence'

export type EstadoProgresso =
  | { fase: 'carregando' }
  | { fase: 'pronto' }
  | { fase: 'erro'; mensagem: string }

export function useProgressoRemoto(): EstadoProgresso {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const [estado, setEstado] = useState<EstadoProgresso>({ fase: 'carregando' })

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    setEstado({ fase: 'carregando' })

    const minhaGeracao = configurarPersistencia(userId, defaultGameStateData())

    // A mochila e carregada sob demanda e vive FORA do save (ver mochilaStore).
    // Sem zerar aqui, entrar noutra conta na mesma aba encontraria a mochila
    // "ja carregada" e a tela mostraria os POKEs do jogador ANTERIOR: o modulo
    // sobrevive a troca de sessao, o jogador nao.
    useMochilaStore.getState().reiniciar()

    useGameStateStore.persist
      .rehydrate()
      ?.then(() => {
        if (cancelado) return
        // O `.catch` abaixo NAO cobre falha de leitura: o `persist` do zustand
        // engole o erro do storage e resolve mesmo assim (ver a nota em
        // gameStatePersistence.ts). Por isso a falha e consultada, nao capturada.
        //
        // Falhar visivelmente e obrigatorio aqui: sem isto o store fica com o
        // DEFAULT e o jogo entra apresentando a conta como nova — pedindo nome e
        // inicial pra quem ja tem equipe no servidor. Reproduzido com um
        // bloqueador de anuncios barrando o servico.
        const falha = erroDaUltimaCarga()
        setEstado(falha ? { fase: 'erro', mensagem: falha } : { fase: 'pronto' })
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setEstado({ fase: 'erro', mensagem: err instanceof Error ? err.message : String(err) })
        }
      })

    return () => {
      cancelado = true
      // Troca de conta (ou logout) no meio da sessao: grava o que estiver
      // pendente antes de desligar, senao os ultimos segundos do jogador
      // anterior se perdem — e pior, poderiam ser gravados na conta nova.
      //
      // Passa a GERACAO capturada, nao o userId: esta limpeza e assincrona e
      // pode resolver depois de um remonte ja ter reconfigurado a
      // persistencia (StrictMode faz exatamente isso). Comparar o userId nao
      // resolveria — nos dois ciclos ele e o mesmo. Ver a nota longa em
      // gameStatePersistence.ts.
      void flushAgora().finally(() => limparPersistencia(minhaGeracao))
    }
  }, [userId])

  return estado
}
