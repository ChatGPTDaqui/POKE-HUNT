// PH-164 — as invariantes da concessao do Eevee, lidas do SQL que vai pro banco.
//
// POR QUE UM TESTE DE FONTE, e nao um teste de comportamento: a concessao mora
// inteira em PL/pgSQL, e a suite nao tem Postgres. Um teste que montasse mocks
// de banco provaria que os mocks concordam entre si, nao que a migration esta
// certa — e as tres coisas que podem quebrar aqui (dupla concessao, presente
// perdido com o time cheio, carta invisivel) sao exatamente as que um mock nao
// pega. O que da pra travar de graca e o que da: que as clausulas que fazem cada
// invariante valer nao desaparecam num `create or replace` futuro.
//
// A prova de comportamento de verdade e `scripts/harness/eevee-do-lance.mjs`,
// que roda contra o schema ja publicado com dois tokens.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function migration(sufixo: string): string {
  const chave = Object.keys(MIGRATIONS).find((c) => c.endsWith(sufixo))
  if (!chave) throw new Error(`migration nao encontrada: ${sufixo}`)
  return MIGRATIONS[chave]
}

const PUBLICO = migration('20260828230000_eevee_do_lance_public.sql')
const DEV = migration('20260828230001_eevee_do_lance_dev.sql')
const RETROATIVO_PUBLICO = migration('20260828233000_eevee_retroativo_public.sql')
const RETROATIVO_DEV = migration('20260828233001_eevee_retroativo_dev.sql')

/** Sem comentario e sem espaco duplicado — o que o Postgres de fato le. */
function semComentario(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
}

const CORPO = { public: semComentario(PUBLICO), dev: semComentario(DEV) }
const RETRO = { public: semComentario(RETROATIVO_PUBLICO), dev: semComentario(RETROATIVO_DEV) }

describe('o glob enxergou o par de migrations (PH-164)', () => {
  it('os dois arquivos existem e nao estao vazios', () => {
    // Guarda anti-vacuo: com o glob quebrado, `''.includes(...)` seria falso e
    // todo caso abaixo reprovaria — mas um `find` que devolvesse o arquivo
    // ERRADO passaria calado. Ancorar no cabecalho de cada um resolve os dois.
    expect(PUBLICO).toContain('create trigger hall_da_fama_recompensa')
    expect(PUBLICO).not.toContain('espelho de')
    expect(DEV).toContain('espelho de 20260828230000_eevee_do_lance_public.sql')
  })
})

describe.each(['public', 'dev'] as const)('invariantes da concessao em %s', (schema) => {
  const sql = CORPO[schema]
  const s = schema === 'public' ? 'public' : 'dev'

  it('a concessao pendura no INSERT de hall_da_fama, que so o servidor escreve', () => {
    // AFTER INSERT (e nao AFTER INSERT OR UPDATE) e o que faz a segunda vitoria
    // nao conceder: o upsert da autoridade cai em ON CONFLICT DO UPDATE, que nao
    // dispara trigger de INSERT.
    expect(sql).toContain(`after insert on ${s}.hall_da_fama`)
    expect(sql).not.toMatch(/after insert or update on \w+\.hall_da_fama/)
  })

  it('so a conquista do Lance concede', () => {
    expect(sql).toContain("if new.conquista <> 'boss_lance' then")
  })

  it('o marcador de recompensa e a trava real da concessao unica', () => {
    // As duas metades importam: o `on conflict do nothing` nao levanta erro na
    // segunda vez, e o `if not found` e o que IMPEDE a segunda carta. Sem a
    // segunda linha, o insert engolido seguiria direto pro `mail_messages`.
    expect(sql).toContain(`insert into ${s}.recompensa_concedida (user_id, chave)`)
    expect(sql).toContain('on conflict do nothing')
    expect(sql).toMatch(/if not found then return false;/)
  })

  it('a concessao mora numa funcao propria, com os dois chamadores em mente', () => {
    // Trigger e migration retroativa chamam a MESMA funcao. Duas copias da
    // receita divergiriam no dia em que so uma fosse reafinada, e o veterano
    // receberia um Eevee diferente do de quem venceu depois.
    expect(sql).toContain(`create or replace function ${s}._conceder_eevee_do_lance(p_user_id uuid)`)
    expect(sql).toContain(`perform ${s}._conceder_eevee_do_lance(new.user_id)`)
  })

  it('a funcao de concessao nao e executavel por nenhum papel do cliente', () => {
    // Um grant aqui seria rota direta pra se auto-conceder o presente, sem
    // passar por conquista nenhuma. Ela e SECURITY DEFINER: o grant e a UNICA
    // coisa que separa "helper interno" de "RPC publica".
    expect(sql).toContain(`revoke execute on function ${s}._conceder_eevee_do_lance(uuid) from authenticated`)
    expect(sql).toContain(`revoke execute on function ${s}._conceder_eevee_do_lance(uuid) from anon`)
    expect(sql).not.toMatch(/grant execute on function \w+\._conceder_eevee_do_lance/)
  })

  it('o marcador tem chave primaria composta, e ninguem ganha insert nele', () => {
    expect(sql).toContain('primary key (user_id, chave)')
    expect(sql).toContain(`grant select on ${s}.recompensa_concedida to authenticated`)
    // Um grant de insert pra `authenticated` deixaria o cliente se declarar
    // premiado — e a partir dai a carta sairia por rota paralela.
    expect(sql).not.toMatch(/grant[^;]*insert[^;]*recompensa_concedida to authenticated/)
  })

  it('a carta vem do sistema, nunca de um jogador', () => {
    expect(sql).toContain("'Centro Pokemon'")
    expect(sql).toContain("'sistema'")
  })

  it('o claim da coleta continua atomico', () => {
    // `where anexo_coletado_em is null ... returning` e o que faz duas abas
    // coletarem uma vez so: a segunda nao acha linha.
    expect(sql).toContain('anexo_coletado_em is null')
    expect(sql).toContain('returning * into v_msg')
  })

  it('a coleta enxerga carta que so tem POKE', () => {
    // Antes o `where` exigia `anexo_itens != '[]'`, entao uma carta so-com-POKE
    // era invisivel pra RPC e o botao Coletar respondia "Nada para coletar".
    expect(sql).toContain("(anexo_itens != '[]'::jsonb or anexo_poke is not null)");
  })

  it('time cheio ABORTA antes de criar o POKE', () => {
    // A ordem e o ponto: a checagem tem que vir antes do insert, e a excecao
    // desfaz o claim junto — e assim que o presente continua no correio.
    const posChecagem = sql.indexOf('if v_team_count >= 6 then')
    const posInsert = sql.indexOf(`insert into ${s}.pokemon_instances`)
    expect(posChecagem).toBeGreaterThan(-1)
    expect(posInsert).toBeGreaterThan(posChecagem)
    expect(sql).toContain('Sua equipe esta cheia')
  })

  it('os stats sao derivados, nao congelados no anexo', () => {
    expect(sql).toContain(`${s}._calcular_stats(`)
  })

  it('marcar como lida continua recusando carta com POKE preso', () => {
    expect(sql).toContain(
      "not ( anexo_coletado_em is null and (anexo_itens <> '[]'::jsonb or anexo_poke is not null) )",
    )
  })

  it('o indice de anexo pendente cobre o POKE', () => {
    expect(sql).toContain(`drop index if exists ${s}.mail_messages_anexo_pendente_idx`)
    expect(sql).toContain("(anexo_itens <> '[]'::jsonb or anexo_poke is not null)")
  })
})

describe('a receita do presente (PH-164)', () => {
  it('e um Eevee, e o par de schemas concorda em tudo dela', () => {
    for (const sql of [CORPO.public, CORPO.dev]) {
      expect(sql).toContain("'speciesId', 'eevee'")
      expect(sql).toContain("'level', 25")
      expect(sql).toContain("'rarity', 'comum'")
      // IV 23 e o padrao do proprio time do Lance (data/nightmareMaps.ts).
      expect(sql).toContain("'hp', 23, 'atkFis', 23, 'atkEsp', 23, 'def', 23, 'defEsp', 23, 'speed', 23")
    }
  })

  it('raridade acima de `comum` seria pico de poder, e nao e o que o presente e', () => {
    // `_calcular_stats` multiplica por 1,35 em `raro` e 2,2 em `legendary`. Um
    // Eevee nivel 25 com esse multiplicador chegaria mais forte que boa parte da
    // equipe que acabou de vencer o Lance.
    for (const sql of [CORPO.public, CORPO.dev]) {
      expect(sql).not.toContain("'rarity', 'raro'")
      expect(sql).not.toContain("'rarity', 'legendary'")
    }
  })
})

describe.each(['public', 'dev'] as const)('concessao retroativa aos veteranos em %s', (schema) => {
  const sql = RETRO[schema]
  const s = schema === 'public' ? 'public' : 'dev'

  it('varre quem ja tem a conquista — o trigger AFTER INSERT nunca alcanca esses', () => {
    expect(sql).toContain(`from ${s}.hall_da_fama h`)
    expect(sql).toContain("where h.conquista = 'boss_lance'")
  })

  it('chama a MESMA funcao de concessao, e nao uma segunda copia da carta', () => {
    // A prova de que nao ha receita duplicada: a migration retroativa nao pode
    // conter `insert into ... mail_messages` nenhum.
    expect(sql).toContain(`${s}._conceder_eevee_do_lance(v_user_id)`)
    expect(sql).not.toContain('mail_messages')
    expect(sql).not.toContain('anexo_poke')
  })

  it('a idempotencia vem do marcador, nao de um `where not exists` escrito aqui', () => {
    // Migration de dado que roda duas vezes e duplica linha e bug, nao
    // migration. Aqui quem segura e o `on conflict do nothing` de dentro da
    // funcao — por isso NAO ha uma segunda trava improvisada neste arquivo.
    expect(sql).not.toContain('recompensa_concedida')
    expect(sql).toContain('if ' + `${s}._conceder_eevee_do_lance(v_user_id) then`)
  })

  it('linha orfa no Hall nao aborta a migration inteira', () => {
    // `recompensa_concedida.user_id` referencia `players`. Uma conquista de
    // conta apagada estouraria a FK e travaria a fila de deploy de todo mundo
    // por causa de um jogador que nem existe mais.
    expect(sql).toContain(`exists (select 1 from ${s}.players p where p.user_id = h.user_id)`)
  })

  it('o RAISE usa % sozinho — `%s` deixaria o "s" literal na mensagem', () => {
    expect(sql).toContain('raise notice')
    expect(sql).not.toMatch(/raise notice[^;]*%s/)
  })
})

describe('simetria do par public/dev (PH-164)', () => {
  it('o dev e o public com o schema trocado, e nada mais', () => {
    // Divergencia entre os dois e o modo de falha classico do repo: o bug
    // aparece so no ambiente que ninguem testou. Comparar o corpo inteiro
    // (menos o cabecalho e o search_path, que sao a diferenca legitima) e o
    // unico jeito de trancar isso sem revisar dois arquivos a mao.
    const normalizar = (sql: string, de: string) => semComentario(sql.slice(sql.indexOf('begin;')))
      .split(`${de}.`).join('ESQUEMA.')
      .split('set search_path = dev, public').join('SEARCH_PATH')
      .split('set search_path = public').join('SEARCH_PATH')
    expect(normalizar(DEV, 'dev')).toBe(normalizar(PUBLICO, 'public'))
    expect(normalizar(RETROATIVO_DEV, 'dev')).toBe(normalizar(RETROATIVO_PUBLICO, 'public'))
  })

  it('os dois pares tem carimbo N / N+1, e nenhum deles colide', () => {
    // `carimboDeMigration.test.ts` ja varre o diretorio inteiro; isto ancora o
    // par DESTA feature, que e onde a ordem importa: a retroativa (233000)
    // chama uma funcao que a 230000 cria, entao ela TEM que rodar depois.
    // `migration()` ja localiza os quatro pelo nome do arquivo — o que falta
    // travar e a DEPENDENCIA entre os pares, que so o carimbo garante.
    expect(RETROATIVO_DEV).toContain('espelho de 20260828233000_eevee_retroativo_public.sql')
    expect(PUBLICO).toContain('20260828233000')
    expect(Number('20260828233000')).toBeGreaterThan(Number('20260828230001'))
  })

  it('as funcoes de dev enxergam public no search_path, como as que ja existem', () => {
    // Conferido no banco com `pg_get_functiondef`: toda funcao de `dev` roda com
    // `search_path = dev, public`. So `dev` deixaria de resolver o resto.
    expect(DEV).toContain('set search_path = dev, public')
    expect(DEV).not.toMatch(/set search_path = dev\s*$/m)
  })
})
