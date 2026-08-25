// Emite o PAR de migrations que leva as arestas de evolucao do catalogo pro
// banco: `<carimbo>_todas_as_evolucoes_public.sql` e `..._dev.sql`.
//
//   node scripts/gerar-migration-evolucoes.mjs --carimbo=20260825020000
//
// POR QUE GERADO, E NAO ESCRITO A MAO
//
// Sao 122 arestas, 36 delas com gate de pedra e 5 especies com ramo. Digitar
// isso a mao erra em silencio: uma linha com o nivel errado nao quebra nada, so
// deixa uma especie inevoluivel ou barata demais, e nenhum teste de arquivo
// pega — o teste compara o SQL com o catalogo, entao o jeito de os dois
// concordarem e um sair do outro.
//
// IDEMPOTENTE de proposito (`on conflict do update`, `where exists`): schema
// `dev` recem-clonado pode nao ter todas as especies, e a migration nao pode
// estourar por isso.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const CARIMBO = (() => {
  const a = process.argv.find((x) => x.startsWith('--carimbo='))
  if (!a) throw new Error('passe --carimbo=YYYYMMDDHHMMSS')
  const v = a.slice('--carimbo='.length)
  if (!/^\d{14}$/.test(v)) throw new Error(`carimbo invalido: ${v}`)
  return v
})()

const catalogo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'usum', 'catalog.json'), 'utf8'))

// So o que esta no ELENCO do cliente. O banco tem as 251 especies, mas cadastrar
// aresta pra especie que o jogo nao desenha produziria uma opcao que a tela nao
// sabe mostrar — e a RPC aceitaria.
const elenco = new Set(
  [...readFileSync(join(RAIZ, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
    .matchAll(/"id": "([a-z0-9_]+)"/g)].map((m) => m[1]),
)

const comEvolucao = catalogo.especies
  .filter((e) => elenco.has(e.chave) && e.evolucoes.length)
  .map((e) => ({ ...e, evolucoes: e.evolucoes.filter((o) => elenco.has(o.to)) }))
  .filter((e) => e.evolucoes.length)
  .sort((a, b) => a.dex - b.dex)

const unicas = comEvolucao.filter((e) => e.evolucoes.length === 1)
const comRamo = comEvolucao.filter((e) => e.evolucoes.length > 1)

const sql = (v) => (v === null || v === undefined ? 'null' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v))

function corpo(schema) {
  const irma = schema === 'dev'
    ? '-- PH-145 -- espelho do ' + CARIMBO + '_todas_as_evolucoes_public no schema `dev`.\n' +
      '-- O raciocinio completo esta na migration irma em `public`.\n'
    : '-- PH-145 -- todas as evolucoes reais chegam ao servidor.\n'

  const linhasUnicas = unicas
    .map((e) => `  (${sql(e.chave)}, ${sql(e.evolucoes[0].to)}, ${e.evolucoes[0].atLevel}, ${e.evolucoes[0].isSpecial})`)
    .join(',\n')

  const linhasRamo = comRamo
    .flatMap((e) => e.evolucoes.map((o, i) =>
      `  (${sql(e.chave)}, ${sql(o.to)}, ${o.atLevel}, ${o.isSpecial}, ${i}, ${sql(o.stoneType ?? null)})`))
    .join(',\n')

  return `${irma}--
-- ---------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
-- ---------------------------------------------------------------------------
-- \`species.evolves_to\` estava NULL pra toda especie cuja evolucao real depende
-- de pedra, troca ou amizade: pikachu, eevee, gloom, growlithe, staryu,
-- shellder, golbat, togepi, exeggcute, weepinbell, sunkern, nidorina, nidorino,
-- pichu, igglybuff, cleffa e jigglypuff, entre outras. O gerador do catalogo so
-- lia gatilho de NIVEL, entao a aresta nunca chegava aqui.
--
-- O efeito visivel: o jogador subia um Growlithe ate o fim e ele nunca virava
-- Arcanine, com Arcanine spawnando em hunt na mesma tela. Nada explicava.
--
-- ---------------------------------------------------------------------------
-- O GATE ESCOLHIDO
-- ---------------------------------------------------------------------------
-- Pedra, troca e amizade nao existem como mecanica neste jogo. As tres caem no
-- gate que ja existe — nivel 80 + 40 pedras do tipo (\`evoluir_poke\`) —, que e o
-- mesmo criterio que as nove evolucoes de troca ja usavam. Decisao de produto
-- do usuario, registrada em PH-145.
--
-- ---------------------------------------------------------------------------
-- \`stone_type\`: DE QUE TIPO E A PEDRA
-- ---------------------------------------------------------------------------
-- Coluna NOVA, e NULLABLE de proposito.
--
--   null  -> pedra do tipo primario da especie de ORIGEM. E como a evolucao
--            especial sempre funcionou, e e o valor de toda especie de destino
--            unico.
--   valor -> pedra deste tipo. So em especie com RAMO, e ai vale o tipo
--            primario do DESTINO.
--
-- O ramo e o unico lugar onde isso muda alguma coisa, e o caso que pede e o
-- Eevee: cinco destinos, e sem o tipo do destino os cinco custariam 40 pedras
-- NORMAIS e a escolha nao teria leitura nenhuma. Com ele, Flareon custa FOGO,
-- Vaporeon AGUA, Jolteon ELETRICO, Espeon PSIQUICO e Umbreon SOMBRIO.
--
-- Aplicar "tipo do destino" a TODO MUNDO seria mais simples e esta errado:
-- \`onix -> steelix\` passaria de pedra de ROCHA pra ACO, encarecendo no meio do
-- caminho quem ja estava juntando. O default preserva quem existe.
--
-- ---------------------------------------------------------------------------
-- GERADO
-- ---------------------------------------------------------------------------
-- Por \`node scripts/gerar-migration-evolucoes.mjs\` a partir de
-- scripts/usum/catalog.json, recortado pelo elenco de pokes.generated.ts.
-- \`src/data/escolhaDeEvolucao.test.ts\` compara os dois — editar este arquivo a
-- mao faz o teste reprovar, e e essa a intencao.

alter table ${schema}.species_evolution_options
  add column if not exists stone_type ${schema === 'public' ? 'public' : 'public'}.element_type;

comment on column ${schema}.species_evolution_options.stone_type is
  'PH-145: tipo da pedra cobrada por ESTA opcao. NULL = tipo primario da especie de origem (o comportamento historico).';

-- ---------------------------------------------------------------------------
-- Destino unico -> a coluna de \`species\`
-- ---------------------------------------------------------------------------
-- Continua sendo a fonte pra quem tem um caminho so, que e a maioria. Cadastrar
-- essas ${unicas.length} na tabela de opcoes seria duplicar o catalogo sem ganho.
update ${schema}.species s set
  evolves_to = v.evolves_to,
  evolves_at_level = v.evolves_at_level,
  is_special_evolution = v.is_special_evolution
from (values
${linhasUnicas}
) as v(species_id, evolves_to, evolves_at_level, is_special_evolution)
where s.id = v.species_id
  and exists (select 1 from ${schema}.species d where d.id = v.evolves_to)
  and (s.evolves_to is distinct from v.evolves_to
       or s.evolves_at_level is distinct from v.evolves_at_level
       or s.is_special_evolution is distinct from v.is_special_evolution);

-- ---------------------------------------------------------------------------
-- Ramo -> a tabela de opcoes
-- ---------------------------------------------------------------------------
-- ${comRamo.map((e) => `${e.chave} (${e.evolucoes.length})`).join(', ')}.
--
-- \`ordem\` decide o destino padrao de quem chamar a RPC sem alvo — cliente
-- antigo, ou save que evolui sozinho. E a ordem de Pokedex do destino.
insert into ${schema}.species_evolution_options
  (species_id, evolves_to, evolves_at_level, is_special_evolution, ordem, stone_type)
select v.species_id, v.evolves_to, v.evolves_at_level, v.is_special_evolution, v.ordem, v.stone_type
from (values
${linhasRamo}
) as v(species_id, evolves_to, evolves_at_level, is_special_evolution, ordem, stone_type)
where exists (select 1 from ${schema}.species s where s.id = v.species_id)
  and exists (select 1 from ${schema}.species s where s.id = v.evolves_to)
on conflict (species_id, evolves_to) do update
  set evolves_at_level = excluded.evolves_at_level,
      is_special_evolution = excluded.is_special_evolution,
      ordem = excluded.ordem,
      stone_type = excluded.stone_type;

-- Especie que GANHOU ramo deixa de valer pela coluna: a RPC consulta a tabela
-- primeiro, e um \`evolves_to\` sobrando ali so confundiria quem lesse o banco.
-- Fica apontando pro destino de menor \`ordem\`, que e o mesmo padrao da RPC.
update ${schema}.species s set
  evolves_to = o.evolves_to,
  evolves_at_level = o.evolves_at_level,
  is_special_evolution = o.is_special_evolution
from (
  select distinct on (species_id) species_id, evolves_to, evolves_at_level, is_special_evolution
  from ${schema}.species_evolution_options order by species_id, ordem
) o
where s.id = o.species_id
  and (s.evolves_to is distinct from o.evolves_to
       or s.evolves_at_level is distinct from o.evolves_at_level
       or s.is_special_evolution is distinct from o.is_special_evolution);

-- ---------------------------------------------------------------------------
-- \`evoluir_poke\`: a pedra passa a poder vir da OPCAO
-- ---------------------------------------------------------------------------
-- Copia fiel da versao vigente (20260825010000), com UMA mudanca: o item da
-- pedra sai de \`coalesce(v_opcao.stone_type, v_species.type1)\` em vez de
-- \`v_species.type1\` direto.
--
-- O \`coalesce\` e o que mantem as nove evolucoes de troca cobrando exatamente o
-- que cobravam: elas nao tem linha em \`species_evolution_options\`, entao
-- \`v_opcao\` e montado da coluna e \`stone_type\` nem existe ali.
create or replace function ${schema}.evoluir_poke(p_poke_id uuid, p_alvo text default null)
returns jsonb
language plpgsql security definer set search_path = ${schema}
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke ${schema}.pokemon_instances;
  v_species ${schema}.species;
  v_new_species ${schema}.species;
  v_opcao record;
  v_tem_opcoes boolean;
  v_stone_type public.element_type;
  v_stone_item_id text;
  v_stone_count int := 40;
  v_stone_nome text;
  v_tem_stone boolean;
  v_hp_ratio numeric;
  v_stats record;
  v_new_hp int;
  v_new_abilities text[];
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select * into v_poke from ${schema}.pokemon_instances where id = p_poke_id and user_id = v_user_id;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select * into v_species from ${schema}.species where id = v_poke.species_id;

  select exists (
    select 1 from ${schema}.species_evolution_options o where o.species_id = v_species.id
  ) into v_tem_opcoes;

  if v_tem_opcoes then
    -- ESPECIE COM RAMO. Alvo ausente cai na opcao de menor \`ordem\` — e o que
    -- mantem o cliente antigo funcionando.
    if p_alvo is null then
      select * into v_opcao from ${schema}.species_evolution_options
        where species_id = v_species.id order by ordem limit 1;
    else
      select * into v_opcao from ${schema}.species_evolution_options
        where species_id = v_species.id and evolves_to = p_alvo;
      -- A LISTA BRANCA. Sem esta linha o cliente escolhe qualquer especie do
      -- catalogo, e o \`update\` la embaixo obedece.
      if not found then
        raise exception 'Este POKE nao evolui para isso.' using errcode = 'P0001';
      end if;
    end if;
    v_stone_type := coalesce(v_opcao.stone_type, v_species.type1);
  else
    -- ESPECIE DE RAMO UNICO: a coluna continua sendo a fonte.
    if v_species.evolves_to is null or v_species.evolves_at_level is null then
      raise exception 'este POKE ainda nao pode evoluir' using errcode = 'P0001';
    end if;
    -- Alvo pedido que nao bate com o unico destino tambem e recusado: aceitar
    -- caladamente evoluiria pra outra coisa que o jogador nao escolheu.
    if p_alvo is not null and p_alvo <> v_species.evolves_to then
      raise exception 'Este POKE nao evolui para isso.' using errcode = 'P0001';
    end if;
    select v_species.evolves_to as evolves_to,
           v_species.evolves_at_level as evolves_at_level,
           coalesce(v_species.is_special_evolution, false) as is_special_evolution
      into v_opcao;
    v_stone_type := v_species.type1;
  end if;

  if v_poke.level < v_opcao.evolves_at_level then
    raise exception 'este POKE ainda nao pode evoluir' using errcode = 'P0001';
  end if;

  -- O gate de pedras e da OPCAO, e nao da especie: com ramo, um caminho pode
  -- cobrar pedras e o outro nao.
  if v_opcao.is_special_evolution then
    v_stone_item_id := 'stone_' || lower(v_stone_type::text);
    select quantity >= v_stone_count into v_tem_stone from ${schema}.player_items
      where user_id = v_user_id and item_id = v_stone_item_id;
    if not coalesce(v_tem_stone, false) then
      select name into v_stone_nome from ${schema}.items where id = v_stone_item_id;
      raise exception 'precisa de %x %', v_stone_count, coalesce(v_stone_nome, v_stone_item_id) using errcode = 'P0001';
    end if;
  end if;

  select * into v_new_species from ${schema}.species where id = v_opcao.evolves_to;
  if v_new_species is null then
    raise exception 'especie de destino desconhecida' using errcode = 'P0001';
  end if;

  v_hp_ratio := v_poke.hp::numeric / v_poke.stat_hp;
  select * into v_stats from ${schema}._calcular_stats(v_new_species, v_poke.level,
    v_poke.iv_hp, v_poke.iv_atk_fis, v_poke.iv_atk_esp, v_poke.iv_def, v_poke.iv_def_esp, v_poke.iv_speed,
    v_poke.rarity::text, v_poke.is_shiny, v_poke.nature);
  v_new_hp := greatest(1, round(v_stats.stat_hp * v_hp_ratio));

  select array_agg(distinct move_id) into v_new_abilities
    from ${schema}.species_moves
    where species_id = v_new_species.id and level_req <= v_poke.level
      and move_id != all(coalesce(v_poke.unlocked_abilities, '{}'));

  if v_opcao.is_special_evolution then
    update ${schema}.player_items set quantity = quantity - v_stone_count, updated_at = now()
      where user_id = v_user_id and item_id = v_stone_item_id;
  end if;

  update ${schema}.pokemon_instances set
    species_id = v_new_species.id,
    stat_hp = v_stats.stat_hp, stat_atk_fis = v_stats.stat_atk_fis, stat_atk_esp = v_stats.stat_atk_esp,
    stat_def = v_stats.stat_def, stat_def_esp = v_stats.stat_def_esp, stat_speed = v_stats.stat_speed,
    hp = v_new_hp,
    unlocked_abilities = v_poke.unlocked_abilities || coalesce(v_new_abilities, '{}'),
    updated_at = now()
  where id = p_poke_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s evoluiu para %s!', v_species.name, v_new_species.name));
end;
$$;
`
}

for (const schema of ['public', 'dev']) {
  const sufixo = schema === 'public' ? '0' : '1'
  const nome = `${CARIMBO.slice(0, 13)}${sufixo}_todas_as_evolucoes_${schema}.sql`
  const caminho = join(RAIZ, 'supabase', 'migrations', nome)
  writeFileSync(caminho, corpo(schema).replace(/\n/g, '\r\n'))
  console.log(`-> supabase/migrations/${nome}`)
}
console.log(`${unicas.length} especies com destino unico, ${comRamo.length} com ramo ` +
  `(${comRamo.reduce((n, e) => n + e.evolucoes.length, 0)} linhas de opcao)`)
