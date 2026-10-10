-- Espelho de 20261010120000_primeiros_passos_public.sql no schema `dev`.
-- O raciocínio completo está na migration irmã em `public`.
begin;

create or replace function dev.reivindicar_passo(p_passo text)
returns jsonb
language plpgsql
security definer
set search_path = dev
as $$
declare
  v_user_id uuid := auth.uid();
  v_ordem text[] := array[
    'primeiros_abates', 'nivel_5', 'primeira_captura', 'equipe_de_dois', 'primeiro_lord',
    'primeira_missao', 'primeira_especialidade', 'estagio_2', 'primeira_evolucao',
    'treinador_10', 'tres_biomas'
  ];
  v_biomas text[] := array[
    'campo_aberto', 'mata', 'marinho', 'aguas_interiores', 'aridos', 'subterraneo',
    'gelido', 'igneo', 'urbano', 'industrial', 'sagrado', 'sombrio'
  ];
  v_posicao int;
  v_reivindicados int;
  v_atual bigint;
  v_alvo int;
  v_ouro bigint;
  v_itens jsonb;
  v_item jsonb;
  v_player dev.players%rowtype;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  v_posicao := array_position(v_ordem, p_passo);
  if v_posicao is null then
    raise exception 'Passo desconhecido.' using errcode = 'P0001';
  end if;

  -- Lock ANTES da leitura de negócio (mesmo motivo de `reivindicar_missao`):
  -- duas chamadas concorrentes não podem ler o mesmo snapshot.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  if exists (select 1 from dev.recompensa_concedida where user_id = v_user_id and chave = 'passo:' || p_passo) then
    raise exception 'Passo ja reivindicado.' using errcode = 'P0001';
  end if;

  select count(*) into v_reivindicados from dev.recompensa_concedida
    where user_id = v_user_id and chave = any (select 'passo:' || x from unnest(v_ordem[1:v_posicao - 1]) x);
  if v_reivindicados <> v_posicao - 1 then
    raise exception 'Reivindique o passo anterior primeiro.' using errcode = 'P0001';
  end if;

  select * into v_player from dev.players where user_id = v_user_id;
  if not found then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  case p_passo
    when 'primeiros_abates' then
      v_alvo := 10;
      select coalesce(sum(normal_kills + shiny_kills), 0) into v_atual from dev.player_pokedex where user_id = v_user_id;
      v_ouro := 500; v_itens := '[{"itemId":"poke_ball","quantidade":50}]';
    when 'nivel_5' then
      v_alvo := 5;
      select coalesce(max(level), 0) into v_atual from dev.pokemon_instances where user_id = v_user_id and location = 'team';
      v_ouro := 0; v_itens := '[{"itemId":"super_potion","quantidade":10}]';
    when 'primeira_captura' then
      v_alvo := 2;
      select count(*) into v_atual from dev.pokemon_instances where user_id = v_user_id and location in ('team', 'bag');
      v_ouro := 0; v_itens := '[{"itemId":"great_ball","quantidade":25}]';
    when 'equipe_de_dois' then
      v_alvo := 2;
      select count(*) into v_atual from dev.pokemon_instances where user_id = v_user_id and location = 'team';
      v_ouro := 1000; v_itens := '[{"itemId":"super_potion","quantidade":10}]';
    when 'primeiro_lord' then
      v_alvo := 1;
      v_atual := least(1, coalesce((v_player.bioma_progress->>'campo_aberto')::int, 0));
      v_ouro := 2500; v_itens := '[{"itemId":"ultra_ball","quantidade":25}]';
    when 'primeira_missao' then
      v_alvo := 1;
      select count(*) into v_atual from dev.player_missoes_reivindicadas where user_id = v_user_id;
      v_ouro := 0; v_itens := '[{"itemId":"revive","quantidade":3},{"itemId":"great_ball","quantidade":25}]';
    when 'primeira_especialidade' then
      v_alvo := 1;
      select coalesce(sum(dano_nivel + defesa_nivel), 0) into v_atual from dev.player_especialidades where user_id = v_user_id;
      v_ouro := 2000; v_itens := '[{"itemId":"great_ball","quantidade":50}]';
    when 'estagio_2' then
      v_alvo := 1;
      select least(1, count(*)) into v_atual from unnest(v_biomas) b
        where coalesce((v_player.bioma_progress->>b)::int, 0) >= 2;
      v_ouro := 3000; v_itens := '[{"itemId":"ultra_ball","quantidade":50}]';
    when 'primeira_evolucao' then
      v_alvo := 1;
      select least(1, count(*)) into v_atual from dev.pokemon_instances pi
        where pi.user_id = v_user_id and pi.location in ('team', 'bag')
          and exists (select 1 from dev.species_evolution_options o where o.evolves_to = pi.species_id);
      v_ouro := 4000; v_itens := '[{"itemId":"revive","quantidade":5}]';
    when 'treinador_10' then
      v_alvo := 10;
      v_atual := v_player.trainer_level;
      v_ouro := 0; v_itens := '[{"itemId":"ultra_ball","quantidade":50}]';
    when 'tres_biomas' then
      v_alvo := 3;
      select count(*) into v_atual from unnest(v_biomas) b
        where coalesce((v_player.bioma_progress->>b)::int, 0) >= 1;
      v_ouro := 6000; v_itens := '[{"itemId":"max_revive","quantidade":5}]';
  end case;

  if v_atual < v_alvo then
    raise exception 'Passo ainda nao cumprido (% de %).', v_atual, v_alvo using errcode = 'P0001';
  end if;

  -- SEMPRE toca `players`, mesmo quando o passo só dá itens: o trigger avança
  -- `updated_at`, e é isso que faz o CAS de `gravar_progresso` falhar e o flush
  -- da caçada reler o inventário. Sem o update, um flush que leu as bolas antes
  -- desta chamada gravaria a quantidade antiga por cima do presente.
  update dev.players set gold = gold + v_ouro where user_id = v_user_id;
  for v_item in select * from jsonb_array_elements(v_itens) loop
    insert into dev.player_items (user_id, item_id, quantity)
    values (v_user_id, v_item->>'itemId', (v_item->>'quantidade')::int)
    on conflict (user_id, item_id) do update
      set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();
  end loop;

  insert into dev.recompensa_concedida (user_id, chave) values (v_user_id, 'passo:' || p_passo);

  return jsonb_build_object('ok', true, 'mensagem', 'Recompensa do passo coletada!');
end;
$$;

revoke all on function dev.reivindicar_passo(text) from public;
revoke execute on function dev.reivindicar_passo(text) from anon;
grant execute on function dev.reivindicar_passo(text) to authenticated;

commit;
