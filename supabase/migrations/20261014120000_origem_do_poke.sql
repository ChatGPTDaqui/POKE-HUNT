-- De onde veio cada POKE (14/10/2026) — base da regra de MERITO PROPRIO das
-- conquistas (spec 2026-10-14-conquistas-design, decisao do dono): POKE comprado
-- no Mercado ou recebido em troca nao desbloqueia conquista.
--
-- Ate aqui nada dizia isso. `original_trainer` nao serve: em 14/10 ele nao batia
-- com o `user_id` em nenhuma das 888 linhas de producao.
--
-- VALORES
--   captura      nasceu de uma captura na hunt (servidor de sessoes)
--   inicial      o inicial escolhido em `escolher_starter`
--   recompensa   presente do jogo coletado no correio (`coletar_anexo_correio`)
--   transferido  mudou de dono (Mercado, leilao, troca, qualquer caminho)
--   desconhecida linha anterior a esta migration, ou insert por caminho que nao
--                declara a origem. Nunca conta como merito.
--
-- COMO E GARANTIDO, sem depender de cada RPC lembrar:
--  * INSERT: vale a origem que o INSERT declara. As duas RPCs que criam POKE
--    (redefinidas no fim deste arquivo, corpo identico ao vigente em 14/10 fora
--    a coluna) declaram `inicial` e `recompensa`. Sem declaracao, fica
--    `desconhecida` — o lado seguro.
--    (Tentado antes: `alter function ... set jogo.origem_poke`. O Supabase
--    recusa — "permission denied to set parameter" — porque o papel das
--    migrations nao e superuser.)
--  * UPDATE: a origem e IMUTAVEL. Se o `user_id` mudar, vira `transferido`, seja
--    qual for o caminho (comprar_anuncio, leilao, _executar_troca, futuros).
--    O upsert do servidor de sessoes manda `captura` em toda linha que grava; o
--    trigger e o que impede isso de "promover" um POKE ja existente.
--
-- O cliente nao insere em `pokemon_instances` (nao ha policy de escrita); so o
-- servidor de sessoes (service_role) e RPCs security definer escrevem.
--
-- ATENCAO PARA QUEM REESCREVER `escolher_starter` OU `coletar_anexo_correio`:
-- o INSERT precisa continuar declarando `origem` — `origemDoPoke.test.ts`
-- reprova se a ultima definicao perder isso.
begin;

alter table public.pokemon_instances
  add column if not exists origem text not null default 'desconhecida';
alter table dev.pokemon_instances
  add column if not exists origem text not null default 'desconhecida';

alter table public.pokemon_instances drop constraint if exists pokemon_instances_origem_valida;
alter table public.pokemon_instances add constraint pokemon_instances_origem_valida
  check (origem in ('captura', 'inicial', 'recompensa', 'transferido', 'desconhecida'));
alter table dev.pokemon_instances drop constraint if exists pokemon_instances_origem_valida;
alter table dev.pokemon_instances add constraint pokemon_instances_origem_valida
  check (origem in ('captura', 'inicial', 'recompensa', 'transferido', 'desconhecida'));

-- Uma funcao so pros dois schemas: ela so le NEW/OLD.
create or replace function public.proteger_origem_do_poke()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- INSERT: fica a origem que o proprio INSERT declarou (ou o default).
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- UPDATE
  if new.user_id is distinct from old.user_id then
    new.origem := 'transferido';
  else
    new.origem := old.origem;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_origem_do_poke() from public, anon, authenticated;

drop trigger if exists origem_do_poke on public.pokemon_instances;
create trigger origem_do_poke before insert or update on public.pokemon_instances
  for each row execute function public.proteger_origem_do_poke();
drop trigger if exists origem_do_poke on dev.pokemon_instances;
create trigger origem_do_poke before insert or update on dev.pokemon_instances
  for each row execute function public.proteger_origem_do_poke();

-- As duas RPCs que criam POKE, com o corpo VIGENTE em 14/10 (pg_get_functiondef)
-- e uma unica mudanca: a coluna `origem` no INSERT.

CREATE OR REPLACE FUNCTION public.escolher_starter(p_species_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ja_tem boolean;
  v_species public.species;
  v_stats record;
  v_nome_treinador text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_species_id not in ('charmander', 'squirtle', 'bulbasaur') then
    raise exception 'essa especie nao e um inicial' using errcode = 'P0001';
  end if;

  select exists(select 1 from public.pokemon_instances where user_id = v_user_id) into v_ja_tem;
  if v_ja_tem then
    raise exception 'voce ja tem um POKE' using errcode = 'P0001';
  end if;

  select * into v_species from public.species where id = p_species_id;
  select * into v_stats from public._calcular_stats(v_species, 1, 23, 23, 23, 23, 23, 23, 'comum', false);
  select trainer_name into v_nome_treinador from public.players where user_id = v_user_id;

  insert into public.pokemon_instances (
    user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
    iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
    stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
    unlocked_abilities, original_trainer, origem
  ) values (
    v_user_id, p_species_id, 'team', 0, 1, 0, v_stats.stat_hp, false, 'comum', false,
    23, 23, 23, 23, 23, 23,
    v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp, v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
    (select coalesce(array_agg(move_id), '{}') from public.species_moves where species_id = p_species_id and level_req <= 1),
    v_nome_treinador, 'inicial'
  );

  update public.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na sua equipe!', v_species.name));
end;
$function$;

CREATE OR REPLACE FUNCTION dev.escolher_starter(p_species_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ja_tem boolean;
  v_species dev.species;
  v_stats record;
  v_nome_treinador text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_species_id not in ('charmander', 'squirtle', 'bulbasaur') then
    raise exception 'essa especie nao e um inicial' using errcode = 'P0001';
  end if;

  select exists(select 1 from dev.pokemon_instances where user_id = v_user_id) into v_ja_tem;
  if v_ja_tem then
    raise exception 'voce ja tem um POKE' using errcode = 'P0001';
  end if;

  select * into v_species from dev.species where id = p_species_id;
  select * into v_stats from dev._calcular_stats(v_species, 1, 23, 23, 23, 23, 23, 23, 'comum', false);
  select trainer_name into v_nome_treinador from dev.players where user_id = v_user_id;

  insert into dev.pokemon_instances (
    user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
    iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
    stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
    unlocked_abilities, original_trainer, origem
  ) values (
    v_user_id, p_species_id, 'team', 0, 1, 0, v_stats.stat_hp, false, 'comum', false,
    23, 23, 23, 23, 23, 23,
    v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp, v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
    (select coalesce(array_agg(move_id), '{}') from dev.species_moves where species_id = p_species_id and level_req <= 1),
    v_nome_treinador, 'inicial'
  );

  update dev.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na sua equipe!', v_species.name));
end;
$function$;

CREATE OR REPLACE FUNCTION public.coletar_anexo_correio(p_mensagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_msg public.mail_messages;
  v_item jsonb;
  v_item_id text;
  v_quantity int;
  v_poke jsonb;
  v_species public.species;
  v_stats record;
  v_level int;
  v_rarity text;
  v_shiny boolean;
  v_ivs jsonb;
  v_nature text;
  v_trait text;
  v_substitui uuid;
  v_team_count int;
  v_nome_treinador text;
  v_poke_criado jsonb := null;
  v_mensagem text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  update public.mail_messages
    set anexo_coletado_em = now(), estado = 'lido', read_at = now()
    where id = p_mensagem_id and para_id = v_user_id
      and anexo_coletado_em is null
      and (anexo_itens != '[]'::jsonb or anexo_poke is not null)
    returning * into v_msg;

  if v_msg is null then
    raise exception 'Nada para coletar nesta mensagem.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_msg.anexo_itens) loop
    v_item_id := v_item->>'itemId';
    v_quantity := floor(coalesce((v_item->>'quantity')::numeric, 0));
    if v_item_id is not null and v_quantity > 0 then
      -- `gold` mora em `players.gold`, nao em `player_items` — mesma divisao
      -- que `enviar_mensagem` usa para DEBITAR (PH-87).
      if v_item_id = 'gold' then
        update public.players set gold = gold + v_quantity where user_id = v_user_id;
        if not found then
          raise exception 'jogador sem linha em players' using errcode = 'P0001';
        end if;
      else
        insert into public.player_items (user_id, item_id, quantity)
        values (v_user_id, v_item_id, v_quantity)
        on conflict (user_id, item_id) do update
          set quantity = public.player_items.quantity + excluded.quantity, updated_at = now();
      end if;
    end if;
  end loop;

  v_poke := v_msg.anexo_poke;
  if v_poke is not null then
    select * into v_species from public.species where id = v_poke->>'speciesId';
    if v_species is null then
      raise exception 'A especie deste presente nao existe mais no catalogo.' using errcode = 'P0001';
    end if;

    -- SUBSTITUICAO (PH-330): apaga o POKE que este presente vem trocar, ANTES
    -- de contar a equipe. Filtrado por `user_id` de proposito — a receita e dado
    -- e nao pode virar rota pra apagar POKE de outra pessoa, mesmo que alguem
    -- consiga escrever nela.
    v_substitui := nullif(v_poke->>'substituiPokeUid', '')::uuid;
    if v_substitui is not null then
      delete from public.pokemon_instances where id = v_substitui and user_id = v_user_id;
    end if;

    select count(*) into v_team_count
      from public.pokemon_instances
      where user_id = v_user_id and location = 'team';
    if v_team_count >= 6 then
      -- A excecao desfaz o claim la de cima junto com tudo (o delete acima
      -- incluido): a mensagem volta a ficar pendente e o POKE continua no
      -- correio.
      raise exception 'Sua equipe esta cheia. Libere um espaco e colete de novo — o presente continua aqui.'
        using errcode = 'P0001';
    end if;

    v_level := greatest(1, coalesce((v_poke->>'level')::int, 1));
    v_rarity := coalesce(v_poke->>'rarity', 'comum');
    v_shiny := coalesce((v_poke->>'isShiny')::boolean, false);
    v_ivs := coalesce(v_poke->'ivs', '{}'::jsonb);
    -- `nullif(..., '')`: receita antiga (sem os campos) devolve NULL, e NULL e
    -- exatamente o que a coluna aceita como "sem natureza/habilidade" — o
    -- cliente cai no fallback de sempre. Carta ja no correio nao quebra.
    v_nature := nullif(v_poke->>'nature', '');
    v_trait := nullif(v_poke->>'trait', '');

    select * into v_stats from public._calcular_stats(
      v_species, v_level,
      coalesce((v_ivs->>'hp')::int, 0),
      coalesce((v_ivs->>'atkFis')::int, 0),
      coalesce((v_ivs->>'atkEsp')::int, 0),
      coalesce((v_ivs->>'def')::int, 0),
      coalesce((v_ivs->>'defEsp')::int, 0),
      coalesce((v_ivs->>'speed')::int, 0),
      v_rarity, v_shiny, v_nature
    );

    select trainer_name into v_nome_treinador from public.players where user_id = v_user_id;

    insert into public.pokemon_instances (
      user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
      iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
      stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
      unlocked_abilities, original_trainer, nature, trait, origem
    ) values (
      v_user_id, v_species.id, 'team', v_team_count, v_level, 0, v_stats.stat_hp, v_shiny, v_rarity::public.rarity_tier, false,
      coalesce((v_ivs->>'hp')::int, 0),
      coalesce((v_ivs->>'atkFis')::int, 0),
      coalesce((v_ivs->>'atkEsp')::int, 0),
      coalesce((v_ivs->>'def')::int, 0),
      coalesce((v_ivs->>'defEsp')::int, 0),
      coalesce((v_ivs->>'speed')::int, 0),
      v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp,
      v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
      (select coalesce(array_agg(move_id), '{}')
         from public.species_moves
         where species_id = v_species.id and level_req <= v_level),
      v_nome_treinador,
      v_nature,
      v_trait,
      'recompensa'
    );

    v_poke_criado := jsonb_build_object(
      'speciesId', v_species.id,
      'nome', v_species.name,
      'level', v_level,
      'isShiny', v_shiny
    );
    v_mensagem := format('%s entrou na sua equipe!', v_species.name);
  end if;

  return jsonb_build_object(
    'ok', true,
    'itens', v_msg.anexo_itens,
    'poke', v_poke_criado,
    'mensagem', coalesce(v_mensagem, 'Anexo coletado.')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION dev.coletar_anexo_correio(p_mensagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_msg dev.mail_messages;
  v_item jsonb;
  v_item_id text;
  v_quantity int;
  v_poke jsonb;
  v_species dev.species;
  v_stats record;
  v_level int;
  v_rarity text;
  v_shiny boolean;
  v_ivs jsonb;
  v_nature text;
  v_trait text;
  v_substitui uuid;
  v_team_count int;
  v_nome_treinador text;
  v_poke_criado jsonb := null;
  v_mensagem text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  update dev.mail_messages
    set anexo_coletado_em = now(), estado = 'lido', read_at = now()
    where id = p_mensagem_id and para_id = v_user_id
      and anexo_coletado_em is null
      and (anexo_itens != '[]'::jsonb or anexo_poke is not null)
    returning * into v_msg;

  if v_msg is null then
    raise exception 'Nada para coletar nesta mensagem.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_msg.anexo_itens) loop
    v_item_id := v_item->>'itemId';
    v_quantity := floor(coalesce((v_item->>'quantity')::numeric, 0));
    if v_item_id is not null and v_quantity > 0 then
      -- `gold` mora em `players.gold`, nao em `player_items` — mesma divisao
      -- que `enviar_mensagem` usa para DEBITAR (PH-87).
      if v_item_id = 'gold' then
        update dev.players set gold = gold + v_quantity where user_id = v_user_id;
        if not found then
          raise exception 'jogador sem linha em players' using errcode = 'P0001';
        end if;
      else
        insert into dev.player_items (user_id, item_id, quantity)
        values (v_user_id, v_item_id, v_quantity)
        on conflict (user_id, item_id) do update
          set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();
      end if;
    end if;
  end loop;

  v_poke := v_msg.anexo_poke;
  if v_poke is not null then
    select * into v_species from dev.species where id = v_poke->>'speciesId';
    if v_species is null then
      raise exception 'A especie deste presente nao existe mais no catalogo.' using errcode = 'P0001';
    end if;

    -- SUBSTITUICAO (PH-330): apaga o POKE que este presente vem trocar, ANTES
    -- de contar a equipe. Filtrado por `user_id` de proposito — a receita e dado
    -- e nao pode virar rota pra apagar POKE de outra pessoa, mesmo que alguem
    -- consiga escrever nela.
    v_substitui := nullif(v_poke->>'substituiPokeUid', '')::uuid;
    if v_substitui is not null then
      delete from dev.pokemon_instances where id = v_substitui and user_id = v_user_id;
    end if;

    select count(*) into v_team_count
      from dev.pokemon_instances
      where user_id = v_user_id and location = 'team';
    if v_team_count >= 6 then
      -- A excecao desfaz o claim la de cima junto com tudo (o delete acima
      -- incluido): a mensagem volta a ficar pendente e o POKE continua no
      -- correio.
      raise exception 'Sua equipe esta cheia. Libere um espaco e colete de novo — o presente continua aqui.'
        using errcode = 'P0001';
    end if;

    v_level := greatest(1, coalesce((v_poke->>'level')::int, 1));
    v_rarity := coalesce(v_poke->>'rarity', 'comum');
    v_shiny := coalesce((v_poke->>'isShiny')::boolean, false);
    v_ivs := coalesce(v_poke->'ivs', '{}'::jsonb);
    -- `nullif(..., '')`: receita antiga (sem os campos) devolve NULL, e NULL e
    -- exatamente o que a coluna aceita como "sem natureza/habilidade" — o
    -- cliente cai no fallback de sempre. Carta ja no correio nao quebra.
    v_nature := nullif(v_poke->>'nature', '');
    v_trait := nullif(v_poke->>'trait', '');

    select * into v_stats from dev._calcular_stats(
      v_species, v_level,
      coalesce((v_ivs->>'hp')::int, 0),
      coalesce((v_ivs->>'atkFis')::int, 0),
      coalesce((v_ivs->>'atkEsp')::int, 0),
      coalesce((v_ivs->>'def')::int, 0),
      coalesce((v_ivs->>'defEsp')::int, 0),
      coalesce((v_ivs->>'speed')::int, 0),
      v_rarity, v_shiny, v_nature
    );

    select trainer_name into v_nome_treinador from dev.players where user_id = v_user_id;

    insert into dev.pokemon_instances (
      user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
      iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
      stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
      unlocked_abilities, original_trainer, nature, trait, origem
    ) values (
      v_user_id, v_species.id, 'team', v_team_count, v_level, 0, v_stats.stat_hp, v_shiny, v_rarity::dev.rarity_tier, false,
      coalesce((v_ivs->>'hp')::int, 0),
      coalesce((v_ivs->>'atkFis')::int, 0),
      coalesce((v_ivs->>'atkEsp')::int, 0),
      coalesce((v_ivs->>'def')::int, 0),
      coalesce((v_ivs->>'defEsp')::int, 0),
      coalesce((v_ivs->>'speed')::int, 0),
      v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp,
      v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
      (select coalesce(array_agg(move_id), '{}')
         from dev.species_moves
         where species_id = v_species.id and level_req <= v_level),
      v_nome_treinador,
      v_nature,
      v_trait,
      'recompensa'
    );

    v_poke_criado := jsonb_build_object(
      'speciesId', v_species.id,
      'nome', v_species.name,
      'level', v_level,
      'isShiny', v_shiny
    );
    v_mensagem := format('%s entrou na sua equipe!', v_species.name);
  end if;

  return jsonb_build_object(
    'ok', true,
    'itens', v_msg.anexo_itens,
    'poke', v_poke_criado,
    'mensagem', coalesce(v_mensagem, 'Anexo coletado.')
  );
end;
$function$;

commit;
