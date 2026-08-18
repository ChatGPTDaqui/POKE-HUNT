// Leitura da mochila (POKEs guardados) sob demanda.
//
// Por que ela nao vem mais no `GET /estado`: numa conta grande a mochila E o
// estado. Medido em 2026-08-17 na conta de 456 POKEs, `/estado` custava 226 KB
// e 97,8% disso era mochila — o resto do jogo inteiro (time, itens, Pokedex,
// carteira, automacoes) cabe em 5 KB. Numa conta de 5 mil POKEs a conta vira
// megabytes por carregamento de pagina, e o jogador paga isso mesmo que nunca
// abra a Mochila naquela sessao.
//
// Vai DIRETO ao PostgREST, sem passar pela Edge Function, de proposito: assim a
// leitura atravessa uma perna de egress em vez de duas (o servico teria que ler
// do banco e reescrever tudo na resposta). Escrita continua proibida pro
// cliente — RLS de escrita nas tabelas de jogador segue revogada, aqui e so
// `select` das linhas do proprio usuario.
import { supabase } from '@/lib/supabase'
import { rowToPoke } from './playerMapper'
import type { PokeInstance } from '@/data/pokes'

// O PostgREST corta em 1000 linhas por request SEM ERRO NENHUM — 200 OK com a
// lista mutilada (ver "Gotchas conhecidos" no CLAUDE.md). Duas contas reais ja
// passam disso hoje. Entao: paginar, e conferir o total que o proprio servidor
// declarou em vez de confiar no tamanho do que chegou.
const TAMANHO_DA_PAGINA = 1000

export async function carregarMochilaRemota(): Promise<PokeInstance[]> {
  const { data: sessao } = await supabase.auth.getSession()
  const userId = sessao.session?.user.id
  if (!userId) throw new Error('sem sessao — faca login de novo')

  const acumulado: PokeInstance[] = []
  let total: number | null = null

  for (let inicio = 0; ; inicio += TAMANHO_DA_PAGINA) {
    const { data, error, count } = await supabase
      .from('pokemon_instances')
      .select('*', { count: inicio === 0 ? 'exact' : undefined })
      .eq('user_id', userId)
      .eq('location', 'bag')
      // Ordem estavel entre paginas. Sem ela o Postgres nao garante posicao
      // fixa entre duas requests e uma linha pode aparecer em duas paginas (ou
      // em nenhuma) — o mesmo cuidado que `selecionarTudo` toma no servidor.
      .order('id', { ascending: true })
      .range(inicio, inicio + TAMANHO_DA_PAGINA - 1)

    if (error) throw new Error(`Falha ao carregar a mochila: ${error.message}`)
    if (inicio === 0 && typeof count === 'number') total = count

    const pagina = data ?? []
    acumulado.push(...pagina.map(rowToPoke))
    if (pagina.length < TAMANHO_DA_PAGINA) break
    // Guarda contra loop infinito se o `count` vier maior que o que o banco de
    // fato entrega (linha apagada no meio da paginacao).
    if (total != null && acumulado.length >= total) break
  }

  // Falha ALTA em vez de devolver lista curta: uma mochila silenciosamente
  // truncada e indistinguivel de "o jogador vendeu tudo", e as telas que leem
  // daqui oferecem venda em lote.
  if (total != null && acumulado.length !== total) {
    throw new Error(
      `Mochila incompleta: o banco declarou ${total} POKEs e chegaram ${acumulado.length}`,
    )
  }
  return acumulado
}

/**
 * As N aquisicoes mais recentes, pro "Log de capturas" do Perfil.
 *
 * Consulta propria em vez de `carregarMochilaRemota()`: o log mostra DEZ linhas,
 * e puxar 5 mil POKEs pra ordenar e cortar no cliente seria pagar a mochila
 * inteira por uma listinha. O conjunto e o mesmo que a tela usava antes
 * (`team` + `bag`) — POKE anunciado no Mercado continua fora.
 */
export async function carregarCapturasRecentes(limite: number): Promise<PokeInstance[]> {
  const { data: sessao } = await supabase.auth.getSession()
  const userId = sessao.session?.user.id
  if (!userId) throw new Error('sem sessao — faca login de novo')

  const { data, error } = await supabase
    .from('pokemon_instances')
    .select('*')
    .eq('user_id', userId)
    .in('location', ['team', 'bag'])
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(`Falha ao carregar as capturas: ${error.message}`)
  return (data ?? []).map(rowToPoke)
}
