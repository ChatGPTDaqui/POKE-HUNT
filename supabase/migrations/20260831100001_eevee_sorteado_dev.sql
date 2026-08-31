-- PH-330 — espelho de 20260831100000_eevee_sorteado_public.sql no schema dev.
-- O raciocinio completo esta na migration irma em public.
--
-- Uma diferenca de forma, e ela e da casa: as funcoes de `dev` rodam com
-- `search_path = dev, public` (e nao so `dev`) — e assim que as ja existentes
-- estao no banco hoje, conferido com `pg_get_functiondef`. Sem o `public` na
-- lista, os tipos compartilhados deixariam de resolver.
begin;

-- ---------------------------------------------------------------------------
-- 1. O sorteio
-- ---------------------------------------------------------------------------
-- Funcao propria, e nao inline na concessao, por dois motivos: ela e o que o
-- teste de fonte precisa achar por nome, e ela e chamada tambem pela migration
-- retroativa do par 20260831110000.
create or replace function dev._sortear_eevee_do_lance()
returns jsonb
language plpgsql
volatile
set search_path = dev, public
as $$
declare
  v_sorteio_raridade numeric := random() * 100;
  v_rarity text;
  v_nature text;
  v_trait text;
  v_shiny boolean;
  v_catch_rate int;
begin
  -- RARIDADE. Os pesos sao os de `src/data/rarity.ts#RARITIES` e somam 100.
  -- O acumulado e calculado AQUI (window function) em vez de escrito a mao:
  -- cumulativo escrito a mao e um segundo lugar pra errar, e o teste teria que
  -- refazer a mesma soma pra conferir.
  select q.chave into v_rarity
  from (
    select p.chave, sum(p.peso) over (order by p.ord rows between unbounded preceding and current row) as ate
    from (values
      (1, 'comum',     69.0::numeric),
      (2, 'incomum',   22.7),
      (3, 'raro',       7.0),
      (4, 'ultra',      1.0),
      (5, 'legendary',  0.25),
      (6, 'mythic',     0.05)
    ) as p(ord, chave, peso)
  ) q
  where q.ate > v_sorteio_raridade
  order by q.ate
  limit 1;
  -- Ponto flutuante no ultimo passo poderia deixar `v_rarity` nulo. `comum` e o
  -- fallback pelo mesmo motivo que `rarityOf` usa no cliente.
  v_rarity := coalesce(v_rarity, 'comum');

  -- NATUREZA: uniforme entre as 25, como nos jogos e como
  -- `createPokeInstance` faz (`NATURE_LIST[randInt(0, 24)]`). As chaves sao o
  -- nome em minusculas, igual `data/natures.ts`.
  select t.n into v_nature from (values
    ('hardy'), ('lonely'), ('brave'), ('adamant'), ('naughty'),
    ('bold'), ('docile'), ('relaxed'), ('impish'), ('lax'),
    ('timid'), ('hasty'), ('serious'), ('jolly'), ('naive'),
    ('modest'), ('mild'), ('quiet'), ('bashful'), ('rash'),
    ('calm'), ('gentle'), ('sassy'), ('careful'), ('quirky')
  ) as t(n) order by random() limit 1;

  -- HABILIDADE: 5% de chance da OCULTA, senao uniforme entre os slots normais.
  -- Mesma regra de `data/traits.ts#sortearTrait`, com a lista de UMA especie
  -- (`traits.generated.ts#eevee`) — ver a nota do topo sobre por que ela esta
  -- repetida aqui.
  v_trait := case
    when random() < 0.05 then 'anticipation'
    else (select t.a from (values ('run_away'), ('adaptability')) as t(a) order by random() limit 1)
  end;

  -- SHINY: a formula do jogo escala com a facilidade de captura da especie —
  -- `(catch_rate / 255) * (1/8192) * SHINY_RATE_MULTIPLIER`, com o
  -- multiplicador em 100 (`data/pokes.ts`). `catch_rate` vem da tabela e nao de
  -- um literal: se o catalogo reafinar o Eevee, a chance acompanha.
  select s.catch_rate into v_catch_rate from dev.species s where s.id = 'eevee';
  v_shiny := random() < (coalesce(v_catch_rate, 45)::numeric / 255) * (1.0 / 8192) * 100;

  return jsonb_build_object(
    'speciesId', 'eevee',
    -- NIVEL 1 (PH-330). Era 25.
    'level', 1,
    'ivs', jsonb_build_object(
      -- 0 a 31 inclusive, um sorteio independente por atributo — `IV_MAX` = 31.
      'hp',      floor(random() * 32)::int,
      'atkFis',  floor(random() * 32)::int,
      'atkEsp',  floor(random() * 32)::int,
      'def',     floor(random() * 32)::int,
      'defEsp',  floor(random() * 32)::int,
      'speed',   floor(random() * 32)::int
    ),
    'rarity', v_rarity,
    'isShiny', v_shiny,
    'nature', v_nature,
    'trait', v_trait
  );
end;
$$;

revoke all on function dev._sortear_eevee_do_lance() from public;
revoke execute on function dev._sortear_eevee_do_lance() from anon;
revoke execute on function dev._sortear_eevee_do_lance() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. A concessao usa o sorteio
-- ---------------------------------------------------------------------------
-- Corpo inteiro reescrito porque `create or replace` nao troca so um pedaco. O
-- que muda em relacao a 20260828230000 e SO o `anexo_poke`: as travas (marcador
-- `recompensa_concedida`, `on conflict do nothing`, `if not found then return
-- false`) e o remetente do sistema continuam iguais, e continuam sendo o que
-- impede a segunda carta.
--
-- `p_substitui_poke_uid` e novo e existe pela concessao retroativa: quando
-- presente, ele viaja na receita e diz a `coletar_anexo_correio` qual POKE
-- apagar NA MESMA TRANSACAO em que o novo nasce. O porque disso nao ser um
-- `delete` solto na migration esta explicado no par 20260831110000.
--
-- O DROP VEM PRIMEIRO, e a ordem nao e estetica. A assinatura nova tem DEFAULT
-- no segundo argumento, entao enquanto as duas coexistissem uma chamada de um
-- argumento so seria ambigua ("function is not unique"). Criar antes e dropar
-- depois deixaria essa janela aberta dentro da propria transacao.
drop function if exists dev._conceder_eevee_do_lance(uuid);

create or replace function dev._conceder_eevee_do_lance(
  p_user_id uuid,
  p_substitui_poke_uid uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_receita jsonb;
begin
  insert into dev.recompensa_concedida (user_id, chave)
  values (p_user_id, 'eevee_do_lance')
  on conflict do nothing;
  -- `found` e falso quando o ON CONFLICT engoliu o insert: ja foi concedido
  -- antes, e sair aqui e o que impede a segunda carta.
  if not found then
    return false;
  end if;

  v_receita := dev._sortear_eevee_do_lance();
  if p_substitui_poke_uid is not null then
    v_receita := v_receita || jsonb_build_object('substituiPokeUid', p_substitui_poke_uid);
  end if;

  insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, anexo_poke)
  values (
    p_user_id,
    -- `de_id` NULO e o remetente do sistema: nao ha jogador por tras disso, e
    -- apontar pra um usuario real faria a carta parecer mandada por alguem.
    null,
    'Centro Pokemon',
    'sistema',
    'Um presente do Campeao Lance',
    'Voce derrotou o Campeao Lance. Ele deixou um Eevee aos seus cuidados — '
      || 'um POKE que pode seguir cinco caminhos diferentes. Colete abaixo.',
    v_receita
  );

  return true;
end;
$$;

revoke all on function dev._conceder_eevee_do_lance(uuid, uuid) from public;
revoke execute on function dev._conceder_eevee_do_lance(uuid, uuid) from anon;
revoke execute on function dev._conceder_eevee_do_lance(uuid, uuid) from authenticated;

-- O trigger e o mesmo; so a assinatura chamada mudou.
create or replace function dev._recompensa_do_hall_da_fama()
returns trigger
language plpgsql
security definer
set search_path = dev, public
as $$
begin
  if new.conquista <> 'boss_lance' then
    return new;
  end if;

  perform dev._conceder_eevee_do_lance(new.user_id, null);
  return new;
end;
$$;

drop trigger if exists hall_da_fama_recompensa on dev.hall_da_fama;
create trigger hall_da_fama_recompensa
  after insert on dev.hall_da_fama
  for each row execute function dev._recompensa_do_hall_da_fama();

-- ---------------------------------------------------------------------------
-- 3. A coleta grava natureza e habilidade, e substitui o POKE antigo
-- ---------------------------------------------------------------------------
-- Tres mudancas em relacao a 20260828230000, e as tres sao correcao:
--
--   * le `nature` e `trait` da receita e GRAVA os dois em `pokemon_instances`.
--     Sem isso, sortear a habilidade nao teria efeito nenhum — ela era
--     descartada na fronteira.
--   * chama `_calcular_stats` com ONZE argumentos (a sobrecarga com natureza,
--     20260823020000). A de 10 passa `null` de natureza e os stats saiam sem o
--     multiplicador — divergindo do que o cliente calcula pro mesmo POKE.
--   * honra `substituiPokeUid`: apaga o POKE indicado ANTES de contar a equipe,
--     na mesma transacao. A ordem importa duas vezes — pelo `v_team_count` (o
--     slot livre) e pelo indice unico `one_pokemon_per_team_slot`.
create or replace function dev.coletar_anexo_correio(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
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
      unlocked_abilities, original_trainer, nature, trait
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
      v_trait
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
$$;

revoke all on function dev.coletar_anexo_correio(uuid) from public;
revoke execute on function dev.coletar_anexo_correio(uuid) from anon;
grant execute on function dev.coletar_anexo_correio(uuid) to authenticated;

comment on column dev.mail_messages.anexo_poke is
  'Receita do POKE anexado: {speciesId, level, ivs:{hp,atkFis,atkEsp,def,defEsp,speed}, rarity, isShiny, nature, trait, substituiPokeUid}. '
  'Nulo na esmagadora maioria das mensagens. Os stats NAO ficam aqui — sao derivados na coleta. '
  '`substituiPokeUid` (PH-330) e opcional: quando presente, a coleta apaga esse POKE na mesma transacao.';

commit;
