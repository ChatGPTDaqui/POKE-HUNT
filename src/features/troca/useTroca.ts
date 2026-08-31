// PH-314 (PH-120, fatia 4) — o estado da mesa de troca para a tela.
//
// TUDO O QUE IMPORTA VEM DO SERVIDOR, E ISSO NAO E DOGMA
// ---------------------------------------------------------------------------
// A troca inteira e uma maquina de estados que vive no Postgres: quem pode
// aceitar, quem pode cancelar, o que pode entrar na mesa, e — a parte que
// impede o golpe — se a confirmacao ainda vale. Este hook nao reimplementa nada
// disso; ele le, chama e repassa a mensagem de erro que o banco mandou.
//
// A UNICA regra que mora aqui e de APRESENTACAO: `confirmacaoValida` compara a
// versao confirmada com a versao atual pra decidir se o check aparece marcado.
// O servidor faz a mesma comparacao pra decidir se executa. Sao dois usos da
// mesma regra, e nao duas regras — por isso a funcao e uma so, em `data/troca`.
//
// O REFETCH NAO E OTIMIZACAO PERDIDA
// ---------------------------------------------------------------------------
// Toda mudanca (minha ou do outro) recarrega sessao e mesa em vez de aplicar
// diff a partir do payload do Realtime. Duas razoes:
//
//  1. a `versao` que vai na confirmacao precisa ser a que o SERVIDOR tem. Uma
//     versao montada a partir de evento perdido ou fora de ordem viraria
//     "A oferta mudou" na cara do jogador, ou pior, uma confirmacao valida
//     sobre uma mesa que ele nao viu;
//  2. a mesa tem no maximo 20 linhas (teto de 10 por lado). Nao ha o que
//     economizar.
import { useCallback, useEffect, useState } from 'react'
import * as trocaRpc from '@/data/remote/trocaRpc'
import type { LinhaDaMesa, SessaoDeTroca } from '@/data/remote/trocaRpc'
import { ErroServidor } from '@/data/remote/servidor'
import { confirmacaoValida } from '@/data/troca'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useMochilaStore } from '@/stores/mochilaStore'

export type PapelNaMesa = 'anfitriao' | 'convidado'

export interface EstadoDaTroca {
  carregando: boolean
  sessao: SessaoDeTroca | null
  mesa: LinhaDaMesa[]
  /** Qual lado eu sou. `null` quando nao ha mesa. */
  papel: PapelNaMesa | null
  /** O id do outro jogador, pra mostrar o nome dele. */
  outroId: string | null
  minhaOferta: LinhaDaMesa[]
  ofertaDoOutro: LinhaDaMesa[]
  euConfirmei: boolean
  eleConfirmou: boolean
  ocupado: boolean
  recarregar: () => Promise<void>
  aceitar: () => Promise<void>
  encerrar: () => Promise<void>
  porPoke: (pokeUid: string) => Promise<void>
  tirarPoke: (pokeUid: string) => Promise<void>
  porItem: (itemId: string, quantidade: number) => Promise<void>
  tirarItem: (itemId: string, quantidade: number) => Promise<void>
  confirmar: () => Promise<void>
  desconfirmar: () => Promise<void>
}

/**
 * A mensagem do `raise exception` E a mensagem do jogador — as do SQL foram
 * escritas assim de proposito ("Este jogador ja esta em outra troca."). Traduzir
 * de novo aqui criaria duas frases pro mesmo caso, e a de fora envelheceria
 * calada.
 */
function avisarErro(e: unknown): void {
  useToastStore.getState().pushToast(
    e instanceof ErroServidor ? e.message : 'Nao foi possivel falar com a mesa de troca.',
    'error',
    'world',
  )
}

export function useTroca(): EstadoDaTroca {
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const [sessao, setSessao] = useState<SessaoDeTroca | null>(null)
  const [mesa, setMesa] = useState<LinhaDaMesa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      const viva = await trocaRpc.minhaTrocaViva()
      setSessao(viva)
      // A mesa so existe depois do aceite. Pedir a oferta de um convite ainda
      // nao aceito seria uma request garantidamente vazia a cada evento.
      setMesa(viva && viva.estado === 'aberta' ? await trocaRpc.lerMesa(viva.id) : [])
    } catch (e) {
      avisarErro(e)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  // O outro lado tem que ver a oferta mudar sem recarregar — e o pedido
  // literal da issue-mae. Ver `assinarMinhaTroca` pra por que uma tabela so
  // basta.
  useEffect(() => {
    if (!meuId) return
    return trocaRpc.assinarMinhaTroca(meuId, () => { void recarregar() })
  }, [meuId, recarregar])

  /**
   * Toda acao passa por aqui: uma de cada vez, erro vira toast, e o estado e
   * relido do servidor no fim.
   *
   * `ocupado` nao e so anti-duplo-clique de conforto. Duas chamadas em voo
   * podem voltar fora de ordem, e a segunda resposta sobrescreveria a mesa com
   * um retrato ANTERIOR — incluindo uma `versao` velha, que e o numero que a
   * confirmacao carrega.
   */
  const agir = useCallback(async (acao: () => Promise<SessaoDeTroca>) => {
    if (ocupado) return
    setOcupado(true)
    try {
      const nova = await acao()
      setSessao(nova.estado === 'concluida' || nova.estado === 'cancelada' || nova.estado === 'expirada' ? null : nova)
      setMesa(nova.estado === 'aberta' ? await trocaRpc.lerMesa(nova.id) : [])
      if (nova.estado === 'concluida') {
        useToastStore.getState().pushToast('Troca concluida.', 'success', 'world')
        // O que chegou de POKE mudou de dono no servidor, em linhas que este
        // cliente nunca leu. A Mochila reancora na proxima abertura.
        useMochilaStore.getState().invalidar()
      }
    } catch (e) {
      avisarErro(e)
      // Recarrega mesmo no erro: metade das recusas ("A oferta mudou") existem
      // justamente porque o servidor tem um estado que a tela nao tem.
      await recarregar()
    } finally {
      setOcupado(false)
    }
  }, [ocupado, recarregar])

  const papel: PapelNaMesa | null = sessao && meuId
    ? (sessao.anfitriaoId === meuId ? 'anfitriao' : 'convidado')
    : null
  const outroId = sessao && meuId ? (sessao.anfitriaoId === meuId ? sessao.convidadoId : sessao.anfitriaoId) : null

  const minhaOferta = mesa.filter((l) => l.donoId === meuId)
  const ofertaDoOutro = mesa.filter((l) => l.donoId !== meuId)

  const minhaVersaoConfirmada = sessao && papel === 'anfitriao'
    ? sessao.versaoConfirmadaAnfitriao
    : sessao?.versaoConfirmadaConvidado ?? null
  const versaoDele = sessao && papel === 'anfitriao'
    ? sessao.versaoConfirmadaConvidado
    : sessao?.versaoConfirmadaAnfitriao ?? null

  return {
    carregando,
    sessao,
    mesa,
    papel,
    outroId,
    minhaOferta,
    ofertaDoOutro,
    euConfirmei: !!sessao && confirmacaoValida(sessao.versao, minhaVersaoConfirmada),
    eleConfirmou: !!sessao && confirmacaoValida(sessao.versao, versaoDele),
    ocupado,
    recarregar,
    aceitar: () => agir(() => trocaRpc.aceitarTroca(sessao!.id)),
    encerrar: () => agir(() => trocaRpc.encerrarTroca(sessao!.id)),
    porPoke: (pokeUid) => agir(() => trocaRpc.porPokeNaMesa(sessao!.id, pokeUid)),
    tirarPoke: (pokeUid) => agir(() => trocaRpc.tirarPokeDaMesa(sessao!.id, pokeUid)),
    porItem: (itemId, quantidade) => agir(() => trocaRpc.porItemNaMesa(sessao!.id, itemId, quantidade)),
    tirarItem: (itemId, quantidade) => agir(() => trocaRpc.tirarItemDaMesa(sessao!.id, itemId, quantidade)),
    // A versao vai do estado que a TELA desenhou, e nao de uma releitura na
    // hora do clique — reler seria concordar com a mudanca sem olhar, que e
    // exatamente o golpe.
    confirmar: () => agir(() => trocaRpc.confirmarTroca(sessao!.id, sessao!.versao)),
    desconfirmar: () => agir(() => trocaRpc.desconfirmarTroca(sessao!.id)),
  }
}
