// Canais ao vivo por BROADCAST privado — no lugar de `postgres_changes`.
//
// POR QUE SAIU DE postgres_changes: com qualquer assinatura desse tipo aberta,
// o Realtime fica consultando o slot de replicacao por SQL
// (`realtime.list_changes`) sem parar. Medido em producao em 12/10/2026: 4,4 M
// chamadas e ~7,5 h de CPU do banco em 53 dias, de longe a consulta mais cara —
// e cada chamada decodifica o WAL de TODAS as escritas, inclusive as do flush.
// Alem disso, cada mudanca passava pela RLS uma vez por assinante.
//
// No lugar, triggers no banco chamam `realtime.send` pra um TOPICO por jogador
// (`<schema>:pvp:<uid>`, `<schema>:troca:<uid>`, `<schema>:social:<uid>`) ou o
// do chat (`<schema>:chat`). O Broadcast le tudo isso por um slot que ja fica
// ligado de qualquer jeito, e a autorizacao acontece UMA vez, ao entrar no
// canal (policy em `realtime.messages`, migration 20261012180000).
//
// O schema entra no topico porque dev e public dividem o mesmo projeto, e o
// Realtime e um so: sem ele o staging receberia o chat de producao.
//
// UM CANAL POR TOPICO, com varios ouvintes. `supabase.channel(nome)` devolve o
// canal ja existente pra um nome repetido, e registrar callback num canal ja
// inscrito estoura ("cannot add callbacks after subscribe()"). Antes isso era
// contornado com sufixos no nome; aqui o topico e fixo (e o que a policy
// autoriza), entao os ouvintes compartilham o canal e ele so fecha quando o
// ultimo sai.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { schema, supabase } from '@/lib/supabase'

export interface EventoAoVivo {
  /** INSERT, UPDATE ou DELETE — a operacao que disparou o aviso. */
  evento: string
  payload: Record<string, unknown>
}

type Ouvinte = (e: EventoAoVivo) => void

const canais = new Map<string, { canal: RealtimeChannel; ouvintes: Set<Ouvinte> }>()

/** Topico com o schema do ambiente na frente. */
export function topico(...partes: string[]): string {
  return [schema, ...partes].join(':')
}

/** Assina um topico privado. Devolve a funcao de cancelar. */
export function assinarTopico(nome: string, aoReceber: Ouvinte): () => void {
  let entrada = canais.get(nome)
  if (!entrada) {
    const ouvintes = new Set<Ouvinte>()
    const canal = supabase
      .channel(nome, { config: { private: true } })
      .on('broadcast', { event: '*' }, (mensagem) => {
        const e: EventoAoVivo = {
          evento: String(mensagem.event),
          payload: (mensagem.payload ?? {}) as Record<string, unknown>,
        }
        for (const ouvinte of [...ouvintes]) ouvinte(e)
      })
      .subscribe()
    entrada = { canal, ouvintes }
    canais.set(nome, entrada)
  }
  entrada.ouvintes.add(aoReceber)

  let ativo = true
  return () => {
    if (!ativo) return
    ativo = false
    const atual = canais.get(nome)
    if (!atual) return
    atual.ouvintes.delete(aoReceber)
    if (atual.ouvintes.size === 0) {
      canais.delete(nome)
      void supabase.removeChannel(atual.canal)
    }
  }
}
