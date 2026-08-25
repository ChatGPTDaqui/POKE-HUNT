-- PH-145 -- todas as evolucoes reais chegam ao servidor.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
-- ---------------------------------------------------------------------------
-- `species.evolves_to` estava NULL pra toda especie cuja evolucao real depende
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
-- gate que ja existe — nivel 80 + 40 pedras do tipo (`evoluir_poke`) —, que e o
-- mesmo criterio que as nove evolucoes de troca ja usavam. Decisao de produto
-- do usuario, registrada em PH-145.
--
-- ---------------------------------------------------------------------------
-- `stone_type`: DE QUE TIPO E A PEDRA
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
-- `onix -> steelix` passaria de pedra de ROCHA pra ACO, encarecendo no meio do
-- caminho quem ja estava juntando. O default preserva quem existe.
--
-- ---------------------------------------------------------------------------
-- GERADO
-- ---------------------------------------------------------------------------
-- Por `node scripts/gerar-migration-evolucoes.mjs` a partir de
-- scripts/usum/catalog.json, recortado pelo elenco de pokes.generated.ts.
-- `src/data/escolhaDeEvolucao.test.ts` compara os dois — editar este arquivo a
-- mao faz o teste reprovar, e e essa a intencao.

alter table public.species_evolution_options
  add column if not exists stone_type public.element_type;

comment on column public.species_evolution_options.stone_type is
  'PH-145: tipo da pedra cobrada por ESTA opcao. NULL = tipo primario da especie de origem (o comportamento historico).';

-- ---------------------------------------------------------------------------
-- Destino unico -> a coluna de `species`
-- ---------------------------------------------------------------------------
-- Continua sendo a fonte pra quem tem um caminho so, que e a maioria. Cadastrar
-- essas 106 na tabela de opcoes seria duplicar o catalogo sem ganho.
update public.species s set
  evolves_to = v.evolves_to,
  evolves_at_level = v.evolves_at_level,
  is_special_evolution = v.is_special_evolution
from (values
  ('bulbasaur', 'ivysaur', 16, false),
  ('ivysaur', 'venusaur', 32, false),
  ('charmander', 'charmeleon', 16, false),
  ('charmeleon', 'charizard', 36, false),
  ('squirtle', 'wartortle', 16, false),
  ('wartortle', 'blastoise', 36, false),
  ('caterpie', 'metapod', 7, false),
  ('metapod', 'butterfree', 10, false),
  ('weedle', 'kakuna', 7, false),
  ('kakuna', 'beedrill', 10, false),
  ('pidgey', 'pidgeotto', 18, false),
  ('pidgeotto', 'pidgeot', 36, false),
  ('rattata', 'raticate', 20, false),
  ('spearow', 'fearow', 20, false),
  ('ekans', 'arbok', 22, false),
  ('pikachu', 'raichu', 80, true),
  ('sandshrew', 'sandslash', 22, false),
  ('nidoran_f', 'nidorina', 16, false),
  ('nidorina', 'nidoqueen', 80, true),
  ('nidoran_m', 'nidorino', 16, false),
  ('nidorino', 'nidoking', 80, true),
  ('clefairy', 'clefable', 80, true),
  ('jigglypuff', 'wigglytuff', 80, true),
  ('zubat', 'golbat', 22, false),
  ('golbat', 'crobat', 80, true),
  ('oddish', 'gloom', 21, false),
  ('paras', 'parasect', 24, false),
  ('venonat', 'venomoth', 31, false),
  ('diglett', 'dugtrio', 26, false),
  ('meowth', 'persian', 28, false),
  ('psyduck', 'golduck', 33, false),
  ('mankey', 'primeape', 28, false),
  ('growlithe', 'arcanine', 80, true),
  ('poliwag', 'poliwhirl', 25, false),
  ('abra', 'kadabra', 16, false),
  ('kadabra', 'alakazam', 80, true),
  ('machop', 'machoke', 28, false),
  ('machoke', 'machamp', 80, true),
  ('bellsprout', 'weepinbell', 21, false),
  ('weepinbell', 'victreebel', 80, true),
  ('tentacool', 'tentacruel', 30, false),
  ('geodude', 'graveler', 25, false),
  ('graveler', 'golem', 80, true),
  ('ponyta', 'rapidash', 40, false),
  ('magnemite', 'magneton', 30, false),
  ('doduo', 'dodrio', 31, false),
  ('seel', 'dewgong', 34, false),
  ('grimer', 'muk', 38, false),
  ('shellder', 'cloyster', 80, true),
  ('gastly', 'haunter', 25, false),
  ('haunter', 'gengar', 80, true),
  ('onix', 'steelix', 80, true),
  ('drowzee', 'hypno', 26, false),
  ('krabby', 'kingler', 28, false),
  ('voltorb', 'electrode', 30, false),
  ('exeggcute', 'exeggutor', 80, true),
  ('cubone', 'marowak', 28, false),
  ('koffing', 'weezing', 35, false),
  ('rhyhorn', 'rhydon', 42, false),
  ('horsea', 'seadra', 32, false),
  ('seadra', 'kingdra', 80, true),
  ('goldeen', 'seaking', 33, false),
  ('staryu', 'starmie', 80, true),
  ('scyther', 'scizor', 80, true),
  ('magikarp', 'gyarados', 20, false),
  ('porygon', 'porygon2', 80, true),
  ('omanyte', 'omastar', 40, false),
  ('kabuto', 'kabutops', 40, false),
  ('dratini', 'dragonair', 30, false),
  ('dragonair', 'dragonite', 55, false),
  ('chikorita', 'bayleef', 16, false),
  ('bayleef', 'meganium', 32, false),
  ('cyndaquil', 'quilava', 14, false),
  ('quilava', 'typhlosion', 36, false),
  ('totodile', 'croconaw', 18, false),
  ('croconaw', 'feraligatr', 30, false),
  ('sentret', 'furret', 15, false),
  ('hoothoot', 'noctowl', 20, false),
  ('ledyba', 'ledian', 18, false),
  ('spinarak', 'ariados', 22, false),
  ('chinchou', 'lanturn', 27, false),
  ('pichu', 'pikachu', 80, true),
  ('cleffa', 'clefairy', 80, true),
  ('igglybuff', 'jigglypuff', 80, true),
  ('togepi', 'togetic', 80, true),
  ('natu', 'xatu', 25, false),
  ('mareep', 'flaaffy', 15, false),
  ('flaaffy', 'ampharos', 30, false),
  ('marill', 'azumarill', 18, false),
  ('hoppip', 'skiploom', 18, false),
  ('skiploom', 'jumpluff', 27, false),
  ('sunkern', 'sunflora', 80, true),
  ('wooper', 'quagsire', 20, false),
  ('pineco', 'forretress', 31, false),
  ('snubbull', 'granbull', 23, false),
  ('teddiursa', 'ursaring', 30, false),
  ('slugma', 'magcargo', 38, false),
  ('swinub', 'piloswine', 33, false),
  ('remoraid', 'octillery', 25, false),
  ('houndour', 'houndoom', 24, false),
  ('phanpy', 'donphan', 25, false),
  ('smoochum', 'jynx', 30, false),
  ('elekid', 'electabuzz', 30, false),
  ('magby', 'magmar', 30, false),
  ('larvitar', 'pupitar', 30, false),
  ('pupitar', 'tyranitar', 55, false)
) as v(species_id, evolves_to, evolves_at_level, is_special_evolution)
where s.id = v.species_id
  and exists (select 1 from public.species d where d.id = v.evolves_to)
  and (s.evolves_to is distinct from v.evolves_to
       or s.evolves_at_level is distinct from v.evolves_at_level
       or s.is_special_evolution is distinct from v.is_special_evolution);

-- ---------------------------------------------------------------------------
-- Ramo -> a tabela de opcoes
-- ---------------------------------------------------------------------------
-- gloom (2), poliwhirl (2), slowpoke (2), eevee (5), tyrogue (3).
--
-- `ordem` decide o destino padrao de quem chamar a RPC sem alvo — cliente
-- antigo, ou save que evolui sozinho. E a ordem de Pokedex do destino.
insert into public.species_evolution_options
  (species_id, evolves_to, evolves_at_level, is_special_evolution, ordem, stone_type)
-- `stone_type` com CAST EXPLICITO, e isto NAO e estilo: sem ele o deploy
-- morre com
--
--   ERROR: column "stone_type" is of type element_type but expression is of
--          type text (SQLSTATE 42804)
--
-- O Postgres infere `text` para a coluna de um `values` literal e NAO faz cast
-- implicito de text para enum num `insert ... select`. Os outros tipos passam
-- (inteiro e booleano tem cast implicito); enum nao.
--
-- Custou o deploy da `dev` de 25/08: a migration mergeou, o deploy falhou aqui,
-- e todo push seguinte falhou junto — o deploy tenta a migration pendente
-- primeiro, entao um erro nela trava a fila inteira.
select v.species_id, v.evolves_to, v.evolves_at_level, v.is_special_evolution, v.ordem,
       v.stone_type::public.element_type
from (values
  ('gloom', 'vileplume', 80, true, 0, 'GRASS'::public.element_type),
  ('gloom', 'bellossom', 80, true, 1, 'GRASS'::public.element_type),
  ('poliwhirl', 'poliwrath', 80, true, 0, 'WATER'::public.element_type),
  ('poliwhirl', 'politoed', 80, true, 1, 'WATER'::public.element_type),
  ('slowpoke', 'slowbro', 37, false, 0, null::public.element_type),
  ('slowpoke', 'slowking', 80, true, 1, 'WATER'::public.element_type),
  ('eevee', 'vaporeon', 80, true, 0, 'WATER'::public.element_type),
  ('eevee', 'jolteon', 80, true, 1, 'ELECTRIC'::public.element_type),
  ('eevee', 'flareon', 80, true, 2, 'FIRE'::public.element_type),
  ('eevee', 'espeon', 80, true, 3, 'PSYCHIC'::public.element_type),
  ('eevee', 'umbreon', 80, true, 4, 'DARK'::public.element_type),
  ('tyrogue', 'hitmonlee', 20, false, 0, null::public.element_type),
  ('tyrogue', 'hitmonchan', 20, false, 1, null::public.element_type),
  ('tyrogue', 'hitmontop', 20, false, 2, null::public.element_type)
) as v(species_id, evolves_to, evolves_at_level, is_special_evolution, ordem, stone_type)
where exists (select 1 from public.species s where s.id = v.species_id)
  and exists (select 1 from public.species s where s.id = v.evolves_to)
on conflict (species_id, evolves_to) do update
  set evolves_at_level = excluded.evolves_at_level,
      is_special_evolution = excluded.is_special_evolution,
      ordem = excluded.ordem,
      stone_type = excluded.stone_type;

-- Especie que GANHOU ramo deixa de valer pela coluna: a RPC consulta a tabela
-- primeiro, e um `evolves_to` sobrando ali so confundiria quem lesse o banco.
-- Fica apontando pro destino de menor `ordem`, que e o mesmo padrao da RPC.
update public.species s set
  evolves_to = o.evolves_to,
  evolves_at_level = o.evolves_at_level,
  is_special_evolution = o.is_special_evolution
from (
  select distinct on (species_id) species_id, evolves_to, evolves_at_level, is_special_evolution
  from public.species_evolution_options order by species_id, ordem
) o
where s.id = o.species_id
  and (s.evolves_to is distinct from o.evolves_to
       or s.evolves_at_level is distinct from o.evolves_at_level
       or s.is_special_evolution is distinct from o.is_special_evolution);

-- ---------------------------------------------------------------------------
-- `evoluir_poke`: a pedra passa a poder vir da OPCAO
-- ---------------------------------------------------------------------------
-- Copia fiel da versao vigente (20260825010000), com UMA mudanca: o item da
-- pedra sai de `coalesce(v_opcao.stone_type, v_species.type1)` em vez de
-- `v_species.type1` direto.
--
-- O `coalesce` e o que mantem as nove evolucoes de troca cobrando exatamente o
-- que cobravam: elas nao tem linha em `species_evolution_options`, entao
-- `v_opcao` e montado da coluna e `stone_type` nem existe ali.
create or replace function public.evoluir_poke(p_poke_id uuid, p_alvo text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_species public.species;
  v_new_species public.species;
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

  select * into v_poke from public.pokemon_instances where id = p_poke_id and user_id = v_user_id;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select * into v_species from public.species where id = v_poke.species_id;

  select exists (
    select 1 from public.species_evolution_options o where o.species_id = v_species.id
  ) into v_tem_opcoes;

  if v_tem_opcoes then
    -- ESPECIE COM RAMO. Alvo ausente cai na opcao de menor `ordem` — e o que
    -- mantem o cliente antigo funcionando.
    if p_alvo is null then
      select * into v_opcao from public.species_evolution_options
        where species_id = v_species.id order by ordem limit 1;
    else
      select * into v_opcao from public.species_evolution_options
        where species_id = v_species.id and evolves_to = p_alvo;
      -- A LISTA BRANCA. Sem esta linha o cliente escolhe qualquer especie do
      -- catalogo, e o `update` la embaixo obedece.
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
    select quantity >= v_stone_count into v_tem_stone from public.player_items
      where user_id = v_user_id and item_id = v_stone_item_id;
    if not coalesce(v_tem_stone, false) then
      select name into v_stone_nome from public.items where id = v_stone_item_id;
      raise exception 'precisa de %x %', v_stone_count, coalesce(v_stone_nome, v_stone_item_id) using errcode = 'P0001';
    end if;
  end if;

  select * into v_new_species from public.species where id = v_opcao.evolves_to;
  if v_new_species is null then
    raise exception 'especie de destino desconhecida' using errcode = 'P0001';
  end if;

  v_hp_ratio := v_poke.hp::numeric / v_poke.stat_hp;
  select * into v_stats from public._calcular_stats(v_new_species, v_poke.level,
    v_poke.iv_hp, v_poke.iv_atk_fis, v_poke.iv_atk_esp, v_poke.iv_def, v_poke.iv_def_esp, v_poke.iv_speed,
    v_poke.rarity::text, v_poke.is_shiny, v_poke.nature);
  v_new_hp := greatest(1, round(v_stats.stat_hp * v_hp_ratio));

  select array_agg(distinct move_id) into v_new_abilities
    from public.species_moves
    where species_id = v_new_species.id and level_req <= v_poke.level
      and move_id != all(coalesce(v_poke.unlocked_abilities, '{}'));

  if v_opcao.is_special_evolution then
    update public.player_items set quantity = quantity - v_stone_count, updated_at = now()
      where user_id = v_user_id and item_id = v_stone_item_id;
  end if;

  update public.pokemon_instances set
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
