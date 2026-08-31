// PH-314 (PH-120, fatia 4) — o que o banco precisa entregar pra tela existir.
//
// Duas migrations pequenas e uma consequencia grande cada:
//
//   O RETRATO DO POKE   `troca_oferta` copia especie, nivel, shiny, raridade e
//                       IV no momento em que o POKE entra na mesa. Sem isso, a
//                       RLS de `pokemon_instances` ("o jogador le os proprios
//                       POKEs") deixaria cada lado vendo um uuid opaco na
//                       oferta do outro — e ver o que se vai RECEBER e o ponto
//                       da troca.
//   UMA TABELA SO NO    Publicar `troca_sessao` basta porque o trigger de
//   REALTIME            versao (fatia 2) faz um UPDATE nela a cada mudanca da
//                       oferta. Publicar `troca_oferta` junto exigiria
//                       `replica identity full` pra o DELETE passar pela RLS —
//                       custo real, ganho nenhum.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function migration(sufixo: string): string {
  const achada = Object.keys(MIGRATIONS).find((k) => k.endsWith(sufixo))
  if (!achada) throw new Error(`migration nao encontrada: ${sufixo}`)
  return MIGRATIONS[achada]
}

/** Sem os comentarios — as afirmacoes negativas explicam justamente o que o SQL
 *  NAO faz, e um `not.toContain` cru reprovaria por causa da explicacao. */
function semComentarios(sql: string): string {
  return sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
}

const TEMPO_REAL = migration('_troca_em_tempo_real_public.sql')
const TEMPO_REAL_DEV = migration('_troca_em_tempo_real_dev.sql')
const RETRATO = migration('_oferta_mostra_o_poke_public.sql')
const RETRATO_DEV = migration('_oferta_mostra_o_poke_dev.sql')

describe('a mesa entra no Realtime, e so ela (PH-314)', () => {
  it('publica troca_sessao nos dois schemas', () => {
    expect(TEMPO_REAL).toContain('alter publication supabase_realtime add table public.troca_sessao')
    expect(TEMPO_REAL_DEV).toContain('alter publication supabase_realtime add table dev.troca_sessao')
  })

  it('NAO publica troca_oferta', () => {
    // O trigger de versao ja faz a sessao mudar a cada alteracao da oferta.
    // Publicar as duas exigiria `replica identity full` pra o DELETE sobreviver
    // a RLS, e isso passa a mandar a linha inteira em toda escrita.
    expect(semComentarios(TEMPO_REAL)).not.toContain('troca_oferta')
    expect(semComentarios(TEMPO_REAL_DEV)).not.toContain('troca_oferta')
  })

  it('e idempotente', () => {
    // `alter publication ... add table` estoura se a tabela ja for membro, e
    // migration que so roda uma vez nao e migration.
    expect(TEMPO_REAL).toContain('if not exists (')
    expect(TEMPO_REAL).toContain("from pg_publication_tables")
  })
})

describe('a linha da oferta descreve o POKE (PH-314)', () => {
  it('as cinco colunas do retrato existem', () => {
    for (const coluna of ['species_id', 'level', 'is_shiny', 'rarity', 'iv_percent']) {
      expect(RETRATO).toContain(`add column if not exists ${coluna}`)
    }
  })

  it('por_poke_na_mesa grava o retrato a partir do RETURNING do update', () => {
    // Uma segunda leitura pra copiar os campos poderia pegar a linha ja mexida
    // por outra transacao — o `returning` traz o estado que o proprio update
    // travou.
    expect(RETRATO).toContain('returning * into v_poke')
    expect(RETRATO).toContain('v_poke.species_id, v_poke.level, v_poke.is_shiny, v_poke.rarity')
  })

  it('o IV usa a mesma conta de anunciar_poke', () => {
    // Duas contas para "porcentagem de IV" divergiriam no primeiro ajuste, e a
    // do Mercado e a que o jogador ja conhece.
    expect(RETRATO).toContain('(31.0 * 6) * 100')
  })

  it('NAO abre a RLS de pokemon_instances', () => {
    // A alternativa descartada: uma policy liberando o POKE que esta numa mesa
    // de que eu participo. Ela abriria a linha INTEIRA (IV cru, natureza,
    // trait, locked) pra ler cinco campos — e rodaria em toda leitura de POKE
    // do jogo, inclusive no boot.
    expect(semComentarios(RETRATO)).not.toContain('create policy')
    expect(semComentarios(RETRATO)).not.toContain('pokemon_instances enable row level security')
  })

  it('o espelho dev nao referencia o schema public', () => {
    expect(semComentarios(RETRATO_DEV)).not.toMatch(/\bpublic\./)
    expect(RETRATO_DEV).toContain("set search_path to 'dev'")
  })
})
