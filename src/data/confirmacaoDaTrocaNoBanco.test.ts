// PH-312 (PH-120, fatia 3) — a confirmacao dupla e a execucao atomica no banco.
//
// Nada aqui executa SQL: o teste LE as migrations, como
// `ofertaDeTrocaNoBanco` (fatia 2) e `sessaoDeTrocaNoBanco` (fatia 1).
//
// AS ARMADILHAS QUE ELE GUARDA
//
//   CONFIRMACAO COMO       Com booleano, toda alteracao da oferta precisaria
//   BOOLEANO               LEMBRAR de apagar as duas confirmacoes. O caminho que
//                          esquecesse deixaria valendo um "sim" dado sobre outra
//                          mesa — que E o golpe que a issue-mae descreve.
//   RPC DE "EXECUTAR"      Uma terceira chamada e uma terceira janela pra oferta
//                          mudar entre a confirmacao e o efeito.
//   DEADLOCK               A transacao toca as DUAS contas. Sem ordem
//                          deterministica nos locks, duas trocas concorrentes
//                          com um jogador em comum travam uma na outra.
//   CREDITO FORA DO        `savePlayerState` reescreve `player_items` com o
//   SNAPSHOT               numero LOCAL. Creditar direto na tabela some sem erro
//                          nenhum quando o destinatario esta jogando (ou nem
//                          esta online). E a razao de `market_deliveries`
//                          existir, e o Mercado ja credita assim.
//   LOG QUE CASCATEIA      `troca_oferta` e apagada ao concluir. Se o log
//                          tivesse FK, apagar uma conta levaria junto a prova da
//                          reclamacao da OUTRA.
import { describe, expect, it } from 'vitest'
import { confirmacaoValida } from './troca'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function chave(sufixo: string): string {
  const achada = Object.keys(MIGRATIONS).find((k) => k.endsWith(sufixo))
  if (!achada) throw new Error(`migration nao encontrada: ${sufixo}`)
  return achada
}
const migration = (sufixo: string) => MIGRATIONS[chave(sufixo)]
const carimbo = (sufixo: string) => chave(sufixo).split('/').pop()!.split('_')[0]

const PUBLICO = migration('_confirmacao_e_execucao_da_troca_public.sql')
const DEV = migration('_confirmacao_e_execucao_da_troca_dev.sql')

/**
 * O SQL sem os comentarios.
 *
 * Toda afirmacao NEGATIVA precisa disto. Estas migrations explicam por que NAO
 * fazem certas coisas ("`_devolver_oferta` desfaria a troca", "`original_trainer`
 * nao e tocado"), e um `not.toContain` sobre o texto cru reprova por causa da
 * propria explicacao — o teste passaria a exigir que a decisao ficasse sem
 * registro, que e o oposto do que se quer.
 */
function semComentarios(sql: string): string {
  return sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
}

const CODIGO = semComentarios(PUBLICO)
const CODIGO_DEV = semComentarios(DEV)

describe('a varredura enxergou o par (PH-312)', () => {
  it('o glob casou com as migrations de verdade', () => {
    expect(PUBLICO).toContain('create or replace function public.confirmar_troca')
    expect(DEV).toContain('create or replace function dev.confirmar_troca')
  })

  it('o par nao compartilha carimbo, e vem depois da fatia 2', () => {
    // Mesmo prefixo trava TODO deploy (PH-249); carimbo menor que o da base
    // reprova no gate de ordem (PH-289).
    expect(carimbo('_confirmacao_e_execucao_da_troca_public.sql'))
      .not.toBe(carimbo('_confirmacao_e_execucao_da_troca_dev.sql'))
    expect(carimbo('_confirmacao_e_execucao_da_troca_public.sql') > carimbo('_oferta_de_troca_dev.sql')).toBe(true)
  })
})

describe('a confirmacao guarda a VERSAO, nao um sim (PH-312)', () => {
  it('as duas colunas sao integer e nascem nulas', () => {
    expect(PUBLICO).toContain('add column if not exists versao_confirmada_anfitriao integer')
    expect(PUBLICO).toContain('add column if not exists versao_confirmada_convidado integer')
    // Booleano com default false seria a forma que exige lembrar de limpar.
    expect(PUBLICO).not.toMatch(/confirmado_\w+ boolean/)
  })

  it('confirmar com versao diferente da atual e recusado', () => {
    expect(PUBLICO).toContain('if p_versao is null or p_versao <> v_sessao.versao then')
    expect(PUBLICO).toContain('A oferta mudou. Confira a mesa de novo antes de confirmar.')
  })

  it('nenhuma RPC apaga confirmacao a cada alteracao da oferta', () => {
    // Se alguem acrescentar isso, a forma "envelhece sozinha" virou forma
    // "lembre de limpar" — e o esquecimento volta a ser possivel.
    expect(PUBLICO).not.toMatch(/set versao_confirmada_anfitriao = null,\s*versao_confirmada_convidado = null/)
  })

  it('as duas confirmacoes sao comparadas contra a versao ATUAL', () => {
    // Comparar uma contra a outra provaria que as duas valeram em ALGUM
    // momento, nao que valem agora.
    expect(PUBLICO).toContain('if v_sessao.versao_confirmada_anfitriao = v_sessao.versao')
    expect(PUBLICO).toContain('and v_sessao.versao_confirmada_convidado = v_sessao.versao then')
  })

  it('o helper do TypeScript concorda com a regra do SQL', () => {
    expect(confirmacaoValida(3, 3)).toBe(true)
    expect(confirmacaoValida(3, 2)).toBe(false)
    expect(confirmacaoValida(3, null)).toBe(false)
    // `0` e versao valida (mesa nunca alterada), e nao "nao confirmou".
    expect(confirmacaoValida(0, 0)).toBe(true)
  })
})

describe('quem confirma por ultimo executa, na mesma transacao (PH-312)', () => {
  it('a execucao e chamada de dentro de confirmar_troca', () => {
    expect(PUBLICO).toContain('v_sessao := public._executar_troca(p_sessao_id)')
  })

  it('a execucao NAO e concedida ao cliente', () => {
    // Chamada solta, ela executaria sem passar pela conferencia de versao.
    expect(PUBLICO).toContain('grant execute on function public._executar_troca(uuid) to service_role')
    expect(CODIGO).not.toContain('grant execute on function public._executar_troca(uuid) to authenticated')
  })

  it('confirmar e desconfirmar sao concedidas ao cliente', () => {
    expect(PUBLICO).toContain('grant execute on function public.confirmar_troca(uuid, integer) to authenticated')
    expect(PUBLICO).toContain('grant execute on function public.desconfirmar_troca(uuid) to authenticated')
  })
})

describe('os locks das duas contas tem ordem determinista (PH-312)', () => {
  it('least e greatest, e nao "primeiro o meu"', () => {
    expect(PUBLICO).toContain('perform pg_advisory_xact_lock(hashtext(least(v_a, v_b)::text))')
    expect(PUBLICO).toContain('perform pg_advisory_xact_lock(hashtext(greatest(v_a, v_b)::text))')
  })
})

describe('a transferencia revalida enquanto move (PH-312)', () => {
  it('o UPDATE do POKE carrega dono e lugar ANTIGOS no WHERE', () => {
    // E a revalidacao e a transferencia na mesma sentenca: se algo mudou por
    // fora, ele nao acha linha.
    expect(PUBLICO).toContain('where id = v_linha.poke_uid')
    expect(PUBLICO).toContain('and user_id = v_linha.dono_id')
    expect(PUBLICO).toContain("and location = 'troca'")
  })

  it('linha nao encontrada aborta a troca inteira', () => {
    expect(PUBLICO).toContain('A oferta mudou durante a troca. Nada foi movido — refaca a mesa.')
  })

  it('o POKE chega destravado e sem slot de equipe', () => {
    // A trava era do dono anterior; mantida, quem recebeu nao usaria o POKE sem
    // descobrir por que.
    expect(PUBLICO).toContain('locked = false')
    expect(PUBLICO).toContain('team_slot = null')
  })

  it('original_trainer NAO e tocado', () => {
    // E o registro de quem capturou, e e o que da sentido a trocar POKE de
    // outro treinador.
    expect(CODIGO).not.toContain('original_trainer')
  })
})

describe('item recebido vai pela caixa de entregas (PH-312)', () => {
  it('a execucao credita market_deliveries, e nao player_items', () => {
    // Credito direto em `player_items` e escrita fora do snapshot: o proximo
    // flush do destinatario grava por cima o numero que ele tinha em memoria.
    const trecho = CODIGO.slice(CODIGO.indexOf('function public._executar_troca'))
    expect(trecho).toContain('insert into public.market_deliveries')
    expect(trecho).not.toContain('insert into public.player_items')
  })

  it('a DEVOLUCAO tambem passou a usar a caixa', () => {
    // O caminho de expiracao roda no pg_cron, com o dono provavelmente offline
    // — que e exatamente quando a escrita fora do snapshot se perde.
    const trecho = CODIGO.slice(
      CODIGO.indexOf('function public._devolver_oferta'),
      CODIGO.indexOf('function public._executar_troca'),
    )
    expect(trecho).toContain('insert into public.market_deliveries')
    expect(trecho).not.toContain('insert into public.player_items')
  })

  it('POKE continua indo direto, e a assimetria e deliberada', () => {
    // O flush so escreve linha que esta no estado local e so apaga id do
    // dominio conhecido: um POKE que mudou de dono nao esta em nenhum dos dois
    // na conta que recebeu.
    expect(PUBLICO).toContain('set user_id = v_destino')
  })

  it('a execucao NAO reaproveita _devolver_oferta', () => {
    // Devolver desfaria a troca no instante em que ela acontece.
    const trecho = CODIGO.slice(CODIGO.indexOf('function public._executar_troca'))
    expect(trecho).not.toContain('_devolver_oferta')
  })
})

describe('o log sobrevive a tudo (PH-312)', () => {
  it('as tres colunas de id nao tem FK', () => {
    const criacao = CODIGO.slice(
      CODIGO.indexOf('create table if not exists public.troca_log'),
      CODIGO.indexOf('comment on table public.troca_log'),
    )
    expect(criacao).not.toContain('references')
  })

  it('o retrato da oferta e tirado ANTES de qualquer coisa mudar', () => {
    const trecho = CODIGO.slice(CODIGO.indexOf('function public._executar_troca'))
    const posRetrato = trecho.indexOf('into v_oferta')
    const posDelete = trecho.indexOf('delete from public.troca_oferta')
    expect(posRetrato).toBeGreaterThan(-1)
    expect(posRetrato).toBeLessThan(posDelete)
  })

  it('so os participantes leem o proprio log', () => {
    expect(PUBLICO).toContain('using (anfitriao_id = auth.uid() or convidado_id = auth.uid())')
    expect(PUBLICO).toContain('alter table public.troca_log enable row level security')
  })

  it('mesa vazia nao executa', () => {
    expect(PUBLICO).toContain('A mesa esta vazia.')
  })
})

describe('o espelho dev nao ficou pra tras (PH-312)', () => {
  it('o dev nao referencia o schema public', () => {
    expect(CODIGO_DEV).not.toMatch(/\bpublic\./)
    expect(DEV).toContain("set search_path to 'dev'")
  })

  it('as mesmas funcoes existem dos dois lados', () => {
    for (const nome of ['confirmar_troca', 'desconfirmar_troca', '_executar_troca', '_devolver_oferta']) {
      expect(DEV).toContain(`function dev.${nome}(`)
    }
    const conta = (sql: string) => (sql.match(/create or replace function/g) ?? []).length
    expect(conta(DEV)).toBe(conta(PUBLICO))
  })

  it('o dev credita a caixa de entregas do proprio schema', () => {
    expect(DEV).toContain('insert into dev.market_deliveries')
  })
})
