-- PH-139 -- espelho do 20260825010000 no schema `dev`. O raciocinio completo
-- (por que tabela e nao coluna, e por que a lista branca e o ponto de seguranca
-- desta migration) esta na migration irma em `public`.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA, E NAO MAIS UMA COLUNA EM `species`
-- ---------------------------------------------------------------------------
-- `species.evolves_to` e uma coluna unica, e e ela que a RPC lia pra decidir o
-- alvo sozinha. Ramo nao cabe ali: seriam `evolves_to_2`, `evolves_at_level_2`,
-- `is_special_evolution_2`, e o terceiro destino (Eevee tem cinco na faixa
-- Gen1/Gen2) pediria mais tres colunas.
--
-- `species_evolution_options` guarda uma LINHA por destino, com o gate proprio
-- de cada um. Gate POR OPCAO importa de verdade: Slowpoke vira Slowbro no nivel
-- 37 e Slowking so com pedras — sao caminhos com precos diferentes.
--
-- ---------------------------------------------------------------------------
-- A LISTA BRANCA E O PONTO DE SEGURANCA DESTA MIGRATION
-- ---------------------------------------------------------------------------
-- `evoluir_poke` passa a RECEBER o alvo do cliente. Sem validar contra as opcoes
-- cadastradas da especie, o cliente pediria pra evoluir Tyrogue em Mewtwo e o
-- servidor obedeceria — a especie de destino entra direto no `update` de
-- `pokemon_instances`.
--
-- E o padrao "limite de negocio so no cliente vira 502" que ja e regra critica
-- deste projeto, na sua forma mais direta: aqui nem 502 seria, seria sucesso.
--
-- ---------------------------------------------------------------------------
-- COMPATIBILIDADE COM `species.evolves_to`
-- ---------------------------------------------------------------------------
-- A coluna CONTINUA valendo e continua sendo a fonte pra toda especie de ramo
-- unico — que sao quase todas. A tabela nova so tem linha pra quem tem ramo, e
-- a funcao consulta os dois: primeiro a tabela, e se ela nao disser nada, a
-- coluna. Migrar as 226 especies pra tabela nova seria trabalho sem ganho e com
-- risco de divergir do catalogo gerado.

create table if not exists dev.species_evolution_options (
  species_id text not null references dev.species(id) on delete cascade,
  evolves_to text not null references dev.species(id) on delete cascade,
  evolves_at_level int not null,
  is_special_evolution boolean not null default false,
  -- Ordem de exibicao, e tambem qual e o destino "padrao" quando o cliente nao
  -- manda alvo nenhum (servidor antigo, ou cliente que ainda nao sabe escolher).
  ordem int not null default 0,
  primary key (species_id, evolves_to)
);

comment on table dev.species_evolution_options is
  'PH-139: destinos de evolucao de uma especie que tem MAIS DE UM. Especie de ramo unico continua so em species.evolves_to.';

alter table dev.species_evolution_options enable row level security;

-- Catalogo e dado publico de leitura, igual `species` — a tela precisa saber
-- quais sao as opcoes antes de chamar a RPC.
drop policy if exists "opcoes de evolucao sao publicas" on dev.species_evolution_options;
create policy "opcoes de evolucao sao publicas" on dev.species_evolution_options
  for select to authenticated using (true);
grant select on dev.species_evolution_options to authenticated;

-- ---------------------------------------------------------------------------
-- O RAMO DO TYROGUE
-- ---------------------------------------------------------------------------
-- Unico ramo cadastrado por enquanto, e nao por escolha de escopo: e o unico
-- cujos DOIS destinos ja existem no elenco. Poliwhirl (Politoed/Poliwrath) e
-- Slowpoke (Slowbro/Slowking) entram quando `poliwrath` e `slowking` entrarem
-- no catalogo — ver PH-145, que levantou as 18 evolucoes de Gen1/Gen2 ausentes.
--
-- `where exists` em vez de insert direto: banco novo (ou schema `dev` recem
-- clonado) pode nao ter as tres especies, e a migration nao pode estourar por
-- causa disso.
insert into dev.species_evolution_options (species_id, evolves_to, evolves_at_level, is_special_evolution, ordem)
select v.species_id, v.evolves_to, v.evolves_at_level, v.is_special_evolution, v.ordem
from (values
  ('tyrogue', 'hitmonlee', 20, false, 0),
  ('tyrogue', 'hitmonchan', 20, false, 1)
) as v(species_id, evolves_to, evolves_at_level, is_special_evolution, ordem)
where exists (select 1 from dev.species s where s.id = v.species_id)
  and exists (select 1 from dev.species s where s.id = v.evolves_to)
on conflict (species_id, evolves_to) do update
  set evolves_at_level = excluded.evolves_at_level,
      is_special_evolution = excluded.is_special_evolution,
      ordem = excluded.ordem;

-- ---------------------------------------------------------------------------
-- evoluir_poke passa a receber o ALVO
-- ---------------------------------------------------------------------------
-- Copia fiel da versao vigente (20260824040000), com tres mudancas:
--   1. parametro `p_alvo`, com DEFAULT null — cliente antigo continua chamando
--      com um argumento so e recebe o destino padrao;
--   2. o alvo e resolvido contra `species_evolution_options` e, na falta dela,
--      contra `species.evolves_to`;
--   3. alvo que nao esta na lista da especie e RECUSADO.
create or replace function dev.evoluir_poke(p_poke_id uuid, p_alvo text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke dev.pokemon_instances;
  v_species dev.species;
  v_new_species dev.species;
  v_opcao record;
  v_tem_opcoes boolean;
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

  select * into v_poke from dev.pokemon_instances where id = p_poke_id and user_id = v_user_id;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select * into v_species from dev.species where id = v_poke.species_id;

  select exists (
    select 1 from dev.species_evolution_options o where o.species_id = v_species.id
  ) into v_tem_opcoes;

  if v_tem_opcoes then
    -- ESPECIE COM RAMO. Alvo ausente cai na opcao de menor `ordem` — e o que
    -- mantem o cliente antigo funcionando.
    if p_alvo is null then
      select * into v_opcao from dev.species_evolution_options
        where species_id = v_species.id order by ordem limit 1;
    else
      select * into v_opcao from dev.species_evolution_options
        where species_id = v_species.id and evolves_to = p_alvo;
      -- A LISTA BRANCA. Sem esta linha o cliente escolhe qualquer especie do
      -- catalogo, e o `update` la embaixo obedece.
      if not found then
        raise exception 'Este POKE nao evolui para isso.' using errcode = 'P0001';
      end if;
    end if;
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
  end if;

  if v_poke.level < v_opcao.evolves_at_level then
    raise exception 'este POKE ainda nao pode evoluir' using errcode = 'P0001';
  end if;

  -- O gate de pedras e da OPCAO, e nao da especie: com ramo, um caminho pode
  -- cobrar pedras e o outro nao.
  if v_opcao.is_special_evolution then
    v_stone_item_id := 'stone_' || lower(v_species.type1::text);
    select quantity >= v_stone_count into v_tem_stone from dev.player_items
      where user_id = v_user_id and item_id = v_stone_item_id;
    if not coalesce(v_tem_stone, false) then
      select name into v_stone_nome from dev.items where id = v_stone_item_id;
      raise exception 'precisa de %x %', v_stone_count, coalesce(v_stone_nome, v_stone_item_id) using errcode = 'P0001';
    end if;
  end if;

  select * into v_new_species from dev.species where id = v_opcao.evolves_to;
  if v_new_species is null then
    raise exception 'especie de destino desconhecida' using errcode = 'P0001';
  end if;

  v_hp_ratio := v_poke.hp::numeric / v_poke.stat_hp;
  select * into v_stats from dev._calcular_stats(v_new_species, v_poke.level,
    v_poke.iv_hp, v_poke.iv_atk_fis, v_poke.iv_atk_esp, v_poke.iv_def, v_poke.iv_def_esp, v_poke.iv_speed,
    v_poke.rarity::text, v_poke.is_shiny, v_poke.nature);
  v_new_hp := greatest(1, round(v_stats.stat_hp * v_hp_ratio));

  select array_agg(distinct move_id) into v_new_abilities
    from dev.species_moves
    where species_id = v_new_species.id and level_req <= v_poke.level
      and move_id != all(coalesce(v_poke.unlocked_abilities, '{}'));

  if v_opcao.is_special_evolution then
    update dev.player_items set quantity = quantity - v_stone_count, updated_at = now()
      where user_id = v_user_id and item_id = v_stone_item_id;
  end if;

  update dev.pokemon_instances set
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

revoke all on function dev.evoluir_poke(uuid, text) from public;
grant execute on function dev.evoluir_poke(uuid, text) to authenticated;

-- A SOBRECARGA DE UM ARGUMENTO SO CONTINUA EXISTINDO, e nao e descuido: o
-- cliente publicado hoje chama `evoluir_poke(p_poke_id)`, e os dois sobem por
-- pipelines diferentes (Cloudflare Pages e supabase-deploy). Derrubar a versao
-- antiga aqui quebraria a evolucao na janela entre um deploy e o outro.
create or replace function dev.evoluir_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  return dev.evoluir_poke(p_poke_id, null);
end;
$$;

revoke all on function dev.evoluir_poke(uuid) from public;
grant execute on function dev.evoluir_poke(uuid) to authenticated;
