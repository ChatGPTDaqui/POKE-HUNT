// PH-310 (PH-120, fatia 2) — a oferta de troca no banco bate com o que o
// TypeScript diz, e as decisoes que impedem o golpe continuam escritas no SQL.
//
// Nada aqui executa SQL: o teste LE as migrations. E o mesmo mecanismo de
// `sessaoDeTrocaNoBanco.test.ts` (fatia 1), `limiteDeSessaoInativa` (PH-277) e
// `tiposDoCatalogo` (PH-247).
//
// AS ARMADILHAS QUE ELE GUARDA
//
//   ENUM NA MESMA        Postgres proibe USAR um valor de enum na transacao em
//   TRANSACAO            que ele foi adicionado. O repositorio ja pagou por isso
//                        com 'market' (20260808200000). Se alguem juntar os dois
//                        arquivos, o deploy quebra — e quebra DEPOIS do merge,
//                        com a PR verde.
//   VERSAO POR CHAMADA   Se o contador subisse dentro de cada RPC em vez de por
//                        trigger, o `delete` em cascata (reiniciar_jogo apaga os
//                        POKEs do jogador) mudaria a mesa sem mudar a versao — e
//                        a confirmacao do outro lado continuaria valendo sobre
//                        uma oferta que sumiu. Esse e o golpe.
//   SAIDA QUE NAO        Cancelar ou expirar sem devolver deixa POKE preso em
//   DEVOLVE              'troca' pra sempre, invisivel pro dono e pra todo mundo.
//   NUMERO EM DOIS       teto no SQL e teto no TS divergem em silencio.
//   LUGARES
//   PAR PUBLIC/DEV       migration que so existe num schema deixa o outro sem a
//                        feature, e o gate de CI reprova a PR seguinte.
import { describe, expect, it } from 'vitest'
import { TROCA_MAX_LINHAS_POR_LADO, TIPOS_DE_OFERTA } from './troca'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function chave(sufixo: string): string {
  const achada = Object.keys(MIGRATIONS).find((k) => k.endsWith(sufixo))
  if (!achada) throw new Error(`migration nao encontrada: ${sufixo}`)
  return achada
}

function migration(sufixo: string): string {
  return MIGRATIONS[chave(sufixo)]
}

function carimbo(sufixo: string): string {
  return chave(sufixo).split('/').pop()!.split('_')[0]
}

const ENUM_PUB = migration('_troca_e_um_lugar_do_poke_public.sql')
const ENUM_DEV = migration('_troca_e_um_lugar_do_poke_dev.sql')
const PUBLICO = migration('_oferta_de_troca_public.sql')
const DEV = migration('_oferta_de_troca_dev.sql')

describe('a varredura enxergou os quatro arquivos (PH-310)', () => {
  it('o glob casou com as migrations de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado, todo caso abaixo passaria medindo
    // string vazia.
    expect(ENUM_PUB).toContain("alter type pokemon_location add value if not exists 'troca'")
    expect(ENUM_DEV).toContain("alter type dev.pokemon_location add value if not exists 'troca'")
    expect(PUBLICO).toContain('create table if not exists public.troca_oferta')
    expect(DEV).toContain('create table if not exists dev.troca_oferta')
  })

  it('os quatro carimbos sao distintos', () => {
    // Mesmo prefixo = mesma versao pro CLI, e isso trava TODO deploy (PH-249).
    const carimbos = [
      carimbo('_troca_e_um_lugar_do_poke_public.sql'),
      carimbo('_troca_e_um_lugar_do_poke_dev.sql'),
      carimbo('_oferta_de_troca_public.sql'),
      carimbo('_oferta_de_troca_dev.sql'),
    ]
    expect(new Set(carimbos).size).toBe(4)
  })
})

describe('o valor de enum nasce numa transacao e e usado em outra (PH-310)', () => {
  it('o arquivo do enum nao GRAVA o valor novo', () => {
    // "unsafe use of new value of enum type" — o erro so aparece no deploy, com
    // a PR ja verde e mesclada.
    for (const sql of [ENUM_PUB, ENUM_DEV]) {
      expect(sql).not.toContain("location = 'troca'")
      expect(sql).not.toContain('create table')
    }
  })

  it('o arquivo que usa o valor nao ADICIONA enum', () => {
    for (const sql of [PUBLICO, DEV]) {
      expect(sql).not.toContain('alter type')
    }
  })

  it('o enum vem ANTES no carimbo', () => {
    // Ordem de arquivo e ordem de aplicacao. Invertida, a tabela tentaria gravar
    // um valor que ainda nao existe.
    expect(carimbo('_troca_e_um_lugar_do_poke_public.sql') < carimbo('_oferta_de_troca_public.sql')).toBe(true)
    expect(carimbo('_troca_e_um_lugar_do_poke_dev.sql') < carimbo('_oferta_de_troca_dev.sql')).toBe(true)
  })
})

describe('a reserva e um LUGAR, nao uma flag (PH-310)', () => {
  it('por na mesa exige mochila e destravado, e move o POKE', () => {
    // Sao as mesmas tres condicoes de `anunciar_poke`/`vender_poke`. O
    // `location = 'bag'` cobre de uma vez o POKE em campo, o ja reservado em
    // outra mesa e o anunciado no Mercado.
    expect(PUBLICO).toContain("set location = 'troca', team_slot = null")
    expect(PUBLICO).toContain("and location = 'bag'")
    expect(PUBLICO).toContain('and coalesce(locked, false) = false')
  })

  it('tirar da mesa devolve pra mochila', () => {
    expect(PUBLICO).toContain("set location = 'bag', team_slot = null, updated_at = now()")
  })

  it('item reserva por debito, com o piso que torna o claim atomico', () => {
    // Sem `quantity >= p_quantidade` no WHERE, duas chamadas simultaneas pedindo
    // o saldo inteiro passariam as duas e o saldo iria a negativo — ou estouraria
    // o `check (quantity >= 0)` com 502 em vez de mensagem.
    expect(PUBLICO).toContain('set quantity = quantity - p_quantidade')
    expect(PUBLICO).toContain('and quantity >= p_quantidade')
  })
})

describe('a versao sobe por TRIGGER, e nao por chamada (PH-310)', () => {
  it('o gatilho cobre insert, update E delete, linha a linha', () => {
    // `delete` e o que importa: e por ele que a cascata de um POKE apagado
    // chega. `for each statement` nao serviria — o cascade pode levar linhas de
    // sessoes diferentes na mesma sentenca.
    expect(PUBLICO).toContain('after insert or update or delete on public.troca_oferta')
    expect(PUBLICO).toContain('for each row execute function public.troca_oferta_sobe_versao()')
  })

  it('o gatilho le a sessao do NEW ou do OLD', () => {
    expect(PUBLICO).toContain('where id = coalesce(new.sessao_id, old.sessao_id)')
  })

  it('nenhuma RPC sobe a versao na mao', () => {
    // Uma soma solta dentro de uma RPC seria a segunda fonte da verdade, e ela
    // ficaria de fora justamente no caminho que o trigger existe pra cobrir.
    const somasNaMao = PUBLICO.match(/set versao = versao \+ 1/g) ?? []
    expect(somasNaMao).toHaveLength(1)
  })

  it('a coluna nasce com default, pra linha antiga nao virar nula', () => {
    expect(PUBLICO).toContain('add column if not exists versao integer not null default 0')
  })
})

describe('o mesmo POKE nao fica em duas mesas (PH-310)', () => {
  it('o indice e UNIQUE e global, com o parcial que o torna reusavel', () => {
    // Global porque um indice por sessao deixaria o mesmo POKE em duas mesas.
    // Parcial em `poke_uid is not null` porque linha de item nao ocupa lugar.
    expect(PUBLICO).toContain('create unique index if not exists troca_oferta_poke_unico')
    expect(PUBLICO).toContain('on public.troca_oferta (poke_uid)')
    expect(PUBLICO).toContain('where poke_uid is not null')
  })

  it('uma pilha por item por lado', () => {
    // Sem isto o teto de linhas seria contornavel botando o mesmo item varias
    // vezes.
    expect(PUBLICO).toContain('create unique index if not exists troca_oferta_item_por_lado')
    expect(PUBLICO).toContain('on public.troca_oferta (sessao_id, dono_id, item_id)')
  })
})

describe('toda saida devolve o que estava reservado (PH-310)', () => {
  it('cancelar, expirar e o aceite vencido passam por _devolver_oferta', () => {
    // Tres caminhos, um so lugar que devolve. Repetir a devolucao em cada um
    // daria tres lugares pra esquecer — e o esquecido vira POKE preso.
    const chamadas = PUBLICO.match(/perform public\._devolver_oferta\(/g) ?? []
    expect(chamadas.length).toBeGreaterThanOrEqual(3)
  })

  it('devolver esvazia a oferta, que e o que faz o indice global funcionar', () => {
    // Guardando historico, o mesmo POKE nunca mais poderia ser ofertado depois
    // da primeira troca.
    expect(PUBLICO).toContain('delete from public.troca_oferta where sessao_id = p_sessao_id')
  })

  it('expirar virou laco por sessao, e nao update em massa', () => {
    // Devolver e por sessao; um `update ... where expira_em <= now()` marcaria
    // tudo como expirado sem devolver nada.
    expect(PUBLICO).toContain('for update skip locked')
    expect(PUBLICO).toContain('perform public._devolver_oferta(v_id)')
  })

  it('o item volta somando, e nao sobrescrevendo', () => {
    // A linha pode ter sido apagada por chegar a zero, ou o jogador pode ter
    // ganhado mais do mesmo item enquanto a mesa estava aberta. `do update set
    // quantity = excluded.quantity` apagaria o que ele juntou nesse meio tempo.
    expect(PUBLICO).toContain('do update set quantity = public.player_items.quantity + excluded.quantity')
  })
})

describe('tirar item nao estoura o check de quantidade (PH-310)', () => {
  it('tirar tudo APAGA a linha em vez de zerar', () => {
    // `check (quantidade > 0)`: um update pra zero viraria 502 em vez de "tirei
    // da mesa".
    expect(PUBLICO).toContain('if v_na_mesa = p_quantidade then')
    expect(PUBLICO).toContain('quantidade = quantidade - p_quantidade')
  })
})

describe('o teto por lado e um numero so (PH-310)', () => {
  it('o SQL devolve o mesmo teto que o TypeScript', () => {
    const noSql = PUBLICO.match(/_troca_teto_por_lado\(\)\s*\nreturns integer language sql immutable as \$function\$ select (\d+) \$function\$/)
    expect(noSql).not.toBeNull()
    expect(Number(noSql![1])).toBe(TROCA_MAX_LINHAS_POR_LADO)
  })

  it('somar numa pilha que ja existe nao gasta linha', () => {
    // Sem esta distincao, por mais 1 Pocao numa pilha existente seria recusado
    // com a mesa cheia de pilhas que ja estavam la.
    expect(PUBLICO).toContain('if not v_ja then')
  })
})

describe('so as RPCs escrevem (PH-310)', () => {
  it('a tabela tem RLS e so policy de leitura', () => {
    expect(PUBLICO).toContain('alter table public.troca_oferta enable row level security')
    expect(PUBLICO).toContain('for select to authenticated')
    // Uma policy de INSERT deixaria inserir oferta sem reservar nada.
    expect(PUBLICO).not.toContain('for insert to authenticated')
    expect(PUBLICO).not.toContain('for update to authenticated')
  })

  it('authenticated so recebe SELECT na tabela', () => {
    expect(PUBLICO).toContain('grant select on public.troca_oferta to authenticated')
    expect(PUBLICO).not.toContain('grant insert on public.troca_oferta to authenticated')
  })

  it('os auxiliares nao vao pro cliente', () => {
    // `_devolver_oferta` devolve sem perguntar de quem e a mesa.
    expect(PUBLICO).toContain('grant execute on function public._devolver_oferta(uuid) to service_role')
    expect(PUBLICO).not.toContain('grant execute on function public._devolver_oferta(uuid) to authenticated')
  })

  it('as quatro RPCs da mesa sao concedidas ao jogador', () => {
    for (const rpc of ['por_poke_na_mesa(uuid, uuid)', 'tirar_poke_da_mesa(uuid, uuid)',
      'por_item_na_mesa(uuid, text, integer)', 'tirar_item_da_mesa(uuid, text, integer)']) {
      expect(PUBLICO).toContain(`grant execute on function public.${rpc} to authenticated`)
    }
  })
})

describe('as armadilhas velhas continuam fechadas (PH-310)', () => {
  it('existencia se testa com `found`, nunca com `record is not null`', () => {
    // Em PL/pgSQL um record com qualquer campo nulo compara falso. Quebrou o
    // escrow do leilao.
    expect(PUBLICO).not.toMatch(/v_sessao is not null/)
    expect(PUBLICO).toContain('if not found then')
  })

  it('por na mesa so vale com a mesa ABERTA e dentro do prazo', () => {
    // 'convidada' nao serve: reservar POKE num convite que ninguem viu seria
    // POKE preso de graca.
    expect(PUBLICO).toContain("if v_sessao.estado <> 'aberta' then")
    expect(PUBLICO).toContain('if v_sessao.expira_em <= now() then')
  })

  it('o RAISE com argumento usa % sozinho', () => {
    // `%s` deixaria o "s" literal na mensagem do jogador (PH-190).
    expect(PUBLICO).not.toMatch(/raise exception '[^']*%s/)
  })
})

describe('o espelho dev nao ficou pra tras (PH-310)', () => {
  it('o dev nao referencia o schema public', () => {
    // Uma referencia solta a `public.` faria o staging escrever em producao.
    expect(DEV).not.toMatch(/\bpublic\./)
    expect(DEV).toContain("set search_path to 'dev'")
  })

  it('o dev tem as mesmas RPCs, a mesma tabela e o mesmo trigger', () => {
    for (const nome of ['por_poke_na_mesa', 'tirar_poke_da_mesa', 'por_item_na_mesa',
      'tirar_item_da_mesa', '_devolver_oferta', 'troca_oferta_sobe_versao']) {
      expect(DEV).toContain(`function dev.${nome}(`)
    }
    expect(DEV).toContain('after insert or update or delete on dev.troca_oferta')
  })

  it('os dois lados tem o mesmo numero de funcoes', () => {
    const conta = (sql: string) => (sql.match(/create or replace function/g) ?? []).length
    expect(conta(DEV)).toBe(conta(PUBLICO))
  })
})

describe('o vocabulario do TypeScript (PH-310)', () => {
  it('os tipos de linha da mesa sao os mesmos do CHECK do banco', () => {
    expect([...TIPOS_DE_OFERTA]).toEqual(['poke', 'item'])
    expect(PUBLICO).toContain("check (tipo in ('poke', 'item'))")
  })
})
