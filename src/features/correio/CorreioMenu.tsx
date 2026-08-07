// Correio — shell da tela no desenho novo, sem dado fabricado.
//
// POR QUE ESTA VAZIA: nao existe nada social no jogo. Nao ha tabela de amigos,
// de mensagens nem de recompensas resgataveis no Postgres; o servidor de
// autoridade (server/src/acoes.ts) nao tem manipulador pra nenhuma delas, e o
// jogador so enxerga a propria linha em `players` (a RLS so libera select do
// proprio registro). "Ash_K — Online — Rota 32" seria um nome inventado numa
// lista que nao consulta ninguem.
import { Envelope } from '@phosphor-icons/react'
import { ComingSoon } from '@/components/game/controls'

export function CorreioMenu() {
  return (
    <ComingSoon icon={<Envelope />} title="Correio ainda não existe">
      Amigos, conversas e recompensas resgatáveis dependem de tabelas e de rotas no servidor que ainda não
      foram criadas — não há como listar ninguém sem inventar. A tela fica reservada; o resgate de
      recompensa é o primeiro pedaço que faz sentido ligar quando houver o que resgatar.
    </ComingSoon>
  )
}
