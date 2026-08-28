-- PH-164 — espelho de 20260828230000_eevee_do_lance_public.sql no schema dev.
-- O raciocinio completo esta na migration irma em public.
--
-- Uma diferenca de forma, e ela e da casa: as funcoes de `dev` rodam com
-- `search_path = dev, public` (e nao so `dev`) — e assim que as ja existentes
-- estao no banco hoje, conferido com `pg_get_functiondef`. Sem o `public` na
-- lista, os tipos compartilhados deixariam de resolver.

begin;

-- ---------------------------------------------------------------------------
-- 1. O anexo aprende a carregar POKE
-- ---------------------------------------------------------------------------
alter table dev.mail_messages
  add column if not exists anexo_poke jsonb;

comment on column dev.mail_messages.anexo_poke is
  'Receita do POKE anexado: {speciesId, level, ivs:{hp,atkFis,atkEsp,def,defEsp,speed}, rarity, isShiny}. '
  'Nulo na esmagadora maioria das mensagens. Os stats NAO ficam aqui — sao derivados na coleta.';

-- O indice de "tem coisa pra pegar" tinha o predicado amarrado so a
-- `anexo_itens`, entao uma mensagem so-com-POKE ficava de fora dele. Predicado
-- parcial nao se altera no lugar: cai e sobe de novo.
drop index if exists dev.mail_messages_anexo_pendente_idx;
create index mail_messages_anexo_pendente_idx
  on dev.mail_messages (para_id)
  where anexo_coletado_em is null
    and (anexo_itens <> '[]'::jsonb or anexo_poke is not null);

-- ---------------------------------------------------------------------------
-- 2. Marcador de recompensa unica
-- ---------------------------------------------------------------------------
-- A chave primaria composta E o indice unico que a issue pediu; nao precisa ser
-- parcial porque a tabela so guarda recompensa JA concedida — nao ha estado
-- "pendente" pra excluir do indice.
--
-- Sem grant de INSERT pra ninguem: quem escreve e a funcao do trigger, que e
-- SECURITY DEFINER e roda como dona da tabela. Um grant aqui abriria rota
-- paralela pro cliente se declarar premiado.
create table if not exists dev.recompensa_concedida (
  user_id uuid not null references dev.players(user_id) on delete cascade,
  chave text not null,
  concedido_em timestamptz not null default now(),
  primary key (user_id, chave)
);

alter table dev.recompensa_concedida enable row level security;

drop policy if exists "recompensa leitura propria" on dev.recompensa_concedida;
create policy "recompensa leitura propria" on dev.recompensa_concedida
  for select to authenticated using (user_id = auth.uid());

grant select on dev.recompensa_concedida to authenticated;
grant select, insert on dev.recompensa_concedida to service_role;

-- ---------------------------------------------------------------------------
-- 3. A concessao, no INSERT da conquista
-- ---------------------------------------------------------------------------
-- O NIVEL E OS IVs sao a unica coisa aqui que e escolha de balanceamento, e a
-- issue nao os especifica. Escolhido: nivel 25 com IV 23 em tudo e raridade
-- `comum`.
--
--   - IV 23 e o padrao declarado do proprio time do Lance
--     (`data/nightmareMaps.ts#LANCE_IVS`) — o presente carrega a marca de quem
--     deu, e o numero ja existia no jogo em vez de ser inventado aqui.
--   - raridade `comum` (multiplicador 1,0) de proposito: `raro` ou acima
--     multiplicaria os stats em 1,35x ou mais e o presente viraria pico de
--     poder. O valor do Eevee e ele ser a porta das cinco evolucoes, nao ser
--     forte de saida.
--   - nivel 25 contra o nivel 80 que a evolucao exige (ver `pokes.generated.ts`):
--     e um POKE de projeto, e o jogador cria ele. Comecar no nivel do time do
--     Lance entregaria o fim junto com o comeco.
--
-- Se esse trio for reafinado, muda AQUI e em nenhum outro lugar: o cliente le a
-- receita da mensagem, nao a repete.
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

  insert into dev.recompensa_concedida (user_id, chave)
  values (new.user_id, 'eevee_do_lance')
  on conflict do nothing;
  -- `found` e falso quando o ON CONFLICT engoliu o insert: ja foi concedido
  -- antes, e sair aqui e o que impede a segunda carta.
  if not found then
    return new;
  end if;

  insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, anexo_poke)
  values (
    new.user_id,
    -- `de_id` NULO e o remetente do sistema: nao ha jogador por tras disso, e
    -- apontar pra um usuario real faria a carta parecer mandada por alguem.
    -- Mesma decisao de 20260809140000.
    null,
    'Centro Pokemon',
    'sistema',
    'Um presente do Campeao Lance',
    'Voce derrotou o Campeao Lance. Ele deixou um Eevee aos seus cuidados — '
      || 'um POKE que pode seguir cinco caminhos diferentes. Colete abaixo.',
    jsonb_build_object(
      'speciesId', 'eevee',
      'level', 25,
      'ivs', jsonb_build_object(
        'hp', 23, 'atkFis', 23, 'atkEsp', 23, 'def', 23, 'defEsp', 23, 'speed', 23
      ),
      'rarity', 'comum',
      'isShiny', false
    )
  );

  return new;
end;
$$;

drop trigger if exists hall_da_fama_recompensa on dev.hall_da_fama;
create trigger hall_da_fama_recompensa
  after insert on dev.hall_da_fama
  for each row execute function dev._recompensa_do_hall_da_fama();

-- ---------------------------------------------------------------------------
-- 4. A coleta sabe entregar POKE
-- ---------------------------------------------------------------------------
-- Corpo inteiro reescrito (nao da pra `create or replace` so um pedaco). O que
-- e NOVO em relacao a 20260823010000:
--
--   * o `where` do claim aceita mensagem so-com-POKE (antes exigia
--     `anexo_itens != '[]'`, entao ela era invisivel pra RPC);
--   * o bloco do POKE, com a checagem de espaco na equipe ANTES de criar;
--   * o retorno leva `poke` e `mensagem`.
--
-- A CHECAGEM DE TIME CHEIO E DO SERVIDOR, e nao so da UI: limite de negocio que
-- vive so no cliente vira 502 em vez de erro tratado — foi exatamente o que
-- `MAX_TEAM_SIZE` fez ao bater na constraint do banco direto. O `6` aqui e o
-- mesmo numero que `por_na_equipe` ja usa.
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
      -- que `enviar_mensagem` usa para DEBITAR. Os dois lados precisam
      -- concordar sobre onde o ouro vive; foi a discordancia que criou o
      -- PH-87.
      if v_item_id = 'gold' then
        update dev.players set gold = gold + v_quantity where user_id = v_user_id;
        -- Sem linha em `players` o credito sumiria em silencio e a coleta
        -- ainda responderia `ok`. Abortar devolve a mensagem ao estado
        -- pendente, que e recuperavel; responder ok seria perder o ouro pela
        -- segunda vez.
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
      -- Receita apontando pra especie que nao existe mais (catalogo recortado
      -- depois do envio). Abortar mantem a carta coletavel pra quando/se a
      -- especie voltar; entregar "nada" e responder ok apagaria o presente.
      raise exception 'A especie deste presente nao existe mais no catalogo.' using errcode = 'P0001';
    end if;

    select count(*) into v_team_count
      from dev.pokemon_instances
      where user_id = v_user_id and location = 'team';
    if v_team_count >= 6 then
      -- A excecao desfaz o claim la de cima junto com tudo: a mensagem volta a
      -- ficar pendente e o POKE continua no correio. E o comportamento que a
      -- issue pede — erro legivel, nada perdido, coleta depois.
      raise exception 'Sua equipe esta cheia. Libere um espaco e colete de novo — o presente continua aqui.'
        using errcode = 'P0001';
    end if;

    v_level := greatest(1, coalesce((v_poke->>'level')::int, 1));
    v_rarity := coalesce(v_poke->>'rarity', 'comum');
    v_shiny := coalesce((v_poke->>'isShiny')::boolean, false);
    v_ivs := coalesce(v_poke->'ivs', '{}'::jsonb);

    select * into v_stats from dev._calcular_stats(
      v_species, v_level,
      coalesce((v_ivs->>'hp')::int, 0),
      coalesce((v_ivs->>'atkFis')::int, 0),
      coalesce((v_ivs->>'atkEsp')::int, 0),
      coalesce((v_ivs->>'def')::int, 0),
      coalesce((v_ivs->>'defEsp')::int, 0),
      coalesce((v_ivs->>'speed')::int, 0),
      v_rarity, v_shiny
    );

    select trainer_name into v_nome_treinador from dev.players where user_id = v_user_id;

    insert into dev.pokemon_instances (
      user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
      iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
      stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
      unlocked_abilities, original_trainer
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
      v_nome_treinador
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
    -- O cliente ja fazia `toast(r.mensagem)` numa chave que a RPC nunca
    -- devolvia — o aviso saia vazio. Agora sai preenchido nos dois casos.
    'mensagem', coalesce(v_mensagem, 'Anexo coletado.')
  );
end;
$$;

revoke all on function dev.coletar_anexo_correio(uuid) from public;
revoke execute on function dev.coletar_anexo_correio(uuid) from anon;
grant execute on function dev.coletar_anexo_correio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. "Marcar como lida" continua recusando mensagem com anexo pendente
-- ---------------------------------------------------------------------------
-- O filtro do PH-22 olhava so `anexo_itens`, entao uma carta so-com-POKE podia
-- ser marcada lida com o presente ainda preso — e sumia da contagem de
-- pendentes sem nunca ter sido entregue.
create or replace function dev.marcar_correio_lido(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  -- PH-22: mesma exclusao ja aplicada a pedido_amizade (nao marca lido o que
  -- ainda precisa de acao) -- estendida pra anexo de item ainda nao coletado,
  -- senao a mensagem sai da contagem `naoLidas` mas o HUD (usePendenciasDoCorreio,
  -- que soma temAnexoPendente OU pendente) continua contando, badges divergem.
  --
  -- PH-164: o `anexo_poke` entra na mesma exclusao. Sem ele uma carta
  -- so-com-POKE podia ser marcada lida com o presente ainda preso.
  update dev.mail_messages
    set estado = 'lido', read_at = now()
    where id = p_mensagem_id
      and para_id = v_user_id
      and estado = 'pendente'
      and tipo != 'pedido_amizade'
      and not (
        anexo_coletado_em is null
        and (anexo_itens <> '[]'::jsonb or anexo_poke is not null)
      );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dev.marcar_correio_lido(uuid) from public;
revoke execute on function dev.marcar_correio_lido(uuid) from anon;
grant execute on function dev.marcar_correio_lido(uuid) to authenticated;

commit;
