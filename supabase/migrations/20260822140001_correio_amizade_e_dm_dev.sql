-- PH-74: correio de verdade, amizade com saida, e conversa privada entre amigos.
--
-- O social do jogo estava pela metade:
--   * `mail_messages` so tinha rota de LEITURA pro destinatario. `tipo='texto'`
--     ja existia no tipo do client e NADA no banco produzia esse valor — nao
--     havia como um jogador escrever pro outro.
--   * `friendships` so crescia. Sem remover e sem bloquear, recusar um pedido
--     apenas liberava o remetente pra mandar de novo (o indice parcial
--     `mail_messages_um_pedido_pendente` so barra enquanto o pedido esta
--     `pendente`), entao nao havia defesa nenhuma contra pedido repetido.
--   * Conversa privada nao existia: so o chat mundial, que todo mundo le.
--
-- Par obrigatorio deste arquivo: 20260822140000_correio_amizade_e_dm_public.sql.
-- Ver docs/11-operacao.md#fluxo-de-mudanca-de-schema.


-- ===========================================================================
-- 1. blocks — quem eu nao quero que fale comigo
-- ===========================================================================
-- Guardado em UMA linha por bloqueio (nao em par, ao contrario de
-- `friendships`): "A bloqueou B" e "B bloqueou A" sao fatos diferentes, e
-- desbloquear tem que desfazer so o proprio. O corte de contato e bilateral,
-- mas isso e regra das RPCs de envio (`bloqueio_entre`), nao da tabela.
create table if not exists dev.blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  bloqueado_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bloqueado_id),
  constraint blocks_nao_bloqueia_si_mesmo check (user_id <> bloqueado_id)
);

alter table dev.blocks enable row level security;
grant select on dev.blocks to authenticated;
grant select, insert, update, delete on dev.blocks to service_role;

drop policy if exists "bloqueio leitura propria" on dev.blocks;
create policy "bloqueio leitura propria" on dev.blocks
  for select to authenticated using (user_id = auth.uid());

-- Quem me bloqueou NAO e legivel por mim de proposito: saber disso e o mesmo
-- que receber aviso de bloqueio, que e exatamente o que a pessoa que bloqueou
-- nao quer. A recusa de envio vem da RPC (security definer), que enxerga a
-- tabela inteira sem passar pela policy.


-- ===========================================================================
-- 2. friend_messages — conversa privada entre dois amigos
-- ===========================================================================
-- Tabela propria em vez de reaproveitar `mail_messages`: correio e assincrono e
-- tem assunto/anexo/estado; DM e um fio continuo de linhas curtas sem nada
-- disso. Enfiar os dois na mesma tabela obrigaria metade das colunas a ficar
-- nula e faria toda consulta de caixa de entrada filtrar o fio de conversa
-- fora.
create table if not exists dev.friend_messages (
  id uuid primary key default gen_random_uuid(),
  de_id uuid not null references auth.users(id) on delete cascade,
  para_id uuid not null references auth.users(id) on delete cascade,
  corpo text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint friend_messages_corpo_tamanho check (char_length(corpo) between 1 and 500),
  constraint friend_messages_nao_para_si_mesmo check (de_id <> para_id)
);

-- A consulta real e "a conversa entre eu e fulano, mais recentes primeiro", que
-- toca as duas direcoes — dai dois indices, um por sentido, em vez de um so.
create index if not exists friend_messages_recebidas_idx
  on dev.friend_messages (para_id, de_id, created_at desc);
create index if not exists friend_messages_enviadas_idx
  on dev.friend_messages (de_id, para_id, created_at desc);
-- Parcial: o badge de nao-lidas por conversa e a consulta mais frequente da
-- tela e so olha linhas com read_at nulo, que sao minoria.
create index if not exists friend_messages_nao_lidas_idx
  on dev.friend_messages (para_id, de_id)
  where read_at is null;

alter table dev.friend_messages enable row level security;
grant select on dev.friend_messages to authenticated;
grant select, insert, update, delete on dev.friend_messages to service_role;

drop policy if exists "dm leitura das minhas conversas" on dev.friend_messages;
create policy "dm leitura das minhas conversas" on dev.friend_messages
  for select to authenticated using (para_id = auth.uid() or de_id = auth.uid());

-- Sem policy de INSERT/UPDATE de proposito: escrita so por RPC
-- (`enviar_dm`/`marcar_dm_lidas`), que e onde amizade, bloqueio e rate limit
-- sao verificados. Policy de insert daria rota paralela sem nenhuma dessas
-- checagens — o mesmo furo que PH-23 abriu no chat mundial.

-- Rate limit no mesmo padrao do chat mundial (20260812004640): advisory lock
-- por usuario, porque SELECT max(created_at) FOR UPDATE trava a linha ANTIGA,
-- nao a que esta sendo inserida — duas transacoes concorrentes veriam a mesma
-- ultima mensagem e as duas passariam.
create or replace function dev.dm_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_ultima timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('dm:' || new.de_id::text, 0));

  select max(created_at) into v_ultima
    from dev.friend_messages where de_id = new.de_id;
  if v_ultima is not null and now() - v_ultima < interval '1200 milliseconds' then
    raise exception 'Aguarde um instante antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists dm_rate_limit_trigger on dev.friend_messages;
create trigger dm_rate_limit_trigger
  before insert on dev.friend_messages
  for each row execute function dev.dm_rate_limit();


-- ===========================================================================
-- 3. mail_messages — enviados e exclusao por lado
-- ===========================================================================
-- Exclusao e SOFT e independente por lado. Delete de verdade apagaria a
-- mensagem tambem pra quem nao pediu nada, e uma coluna unica de "excluida"
-- teria o mesmo efeito. Duas colunas mantem os dois lados donos da propria
-- caixa.
alter table dev.mail_messages
  add column if not exists excluido_destinatario_em timestamptz,
  add column if not exists excluido_remetente_em timestamptz;

-- A caixa de ENVIADOS le por `de_id`; o unico indice existente
-- (`mail_messages_caixa_idx`) e por `para_id`.
create index if not exists mail_messages_enviados_idx
  on dev.mail_messages (de_id, created_at desc);

-- A policy existente ("correio leitura propria") so enxerga `para_id =
-- auth.uid()` — sem isto a caixa de enviados volta vazia mesmo com o indice.
drop policy if exists "correio leitura de enviados" on dev.mail_messages;
create policy "correio leitura de enviados" on dev.mail_messages
  for select to authenticated using (de_id = auth.uid());


-- ===========================================================================
-- 4. Helpers
-- ===========================================================================

-- Bloqueio vale nos DOIS sentidos. Quem bloqueia esta cortando contato, nao
-- montando um canal de mao unica onde ainda pode escrever pro bloqueado.
create or replace function dev.bloqueio_entre(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = dev, public
as $$
  select exists(
    select 1 from dev.blocks
    where (user_id = p_a and bloqueado_id = p_b)
       or (user_id = p_b and bloqueado_id = p_a)
  );
$$;

-- Online = sessao de jogo aberta E com flush recente. So `closed_at is null`
-- nao basta: aba fechada no tranco (crash, energia) deixa a linha aberta pra
-- sempre e o amigo apareceria online eternamente. A janela e 3 min porque o
-- flush hoje e de 30s fixos (PH-62 quer torna-lo adaptativo, e a folga de 6x
-- absorve isso sem precisar mexer aqui de novo).
create or replace function dev.esta_online(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = dev, public
as $$
  select exists(
    select 1 from dev.game_sessions
    where user_id = p_user_id
      and closed_at is null
      and last_flush_at > now() - interval '3 minutes'
  );
$$;

-- Helpers e trigger sao chamados de DENTRO das RPCs (que rodam como dono, entao
-- nao precisam de grant nenhum) — ficam fechados pra chamada direta.
--
-- `revoke ... from public` sozinho NAO basta neste projeto: ha `alter default
-- privileges ... grant execute on functions to anon, authenticated,
-- service_role`, entao toda funcao nova nasce com grant EXPLICITO e NOMEADO
-- pra essas roles, e revoke de PUBLIC nao alcanca grant nominal. Achado
-- confirmado com has_function_privilege() em PH-67 (20260822130100).
--
-- `bloqueio_entre` em especial: exposta, ela deixaria qualquer jogador
-- descobrir se foi bloqueado — exatamente o que as mensagens de erro acima
-- evitam contar.
revoke all on function dev.bloqueio_entre(uuid, uuid) from public;
revoke execute on function dev.bloqueio_entre(uuid, uuid) from anon, authenticated;
revoke all on function dev.esta_online(uuid) from public;
revoke execute on function dev.esta_online(uuid) from anon, authenticated;
revoke all on function dev.dm_rate_limit() from public;
revoke execute on function dev.dm_rate_limit() from anon, authenticated;


-- ===========================================================================
-- 5. RPCs de correio
-- ===========================================================================

-- Escrever mensagem livre pra outro jogador, com anexo de item opcional.
--
-- O anexo e DEBITADO NO ENVIO, nao na coleta. Debitar so na coleta deixaria o
-- remetente anexar item que ele nao tem mais (gastou depois de enviar) e a
-- coleta falharia na cara do destinatario, que nao fez nada errado. Aqui o item
-- ja saiu do inventario quando a mensagem existe; `coletar_anexo_correio`
-- (inalterada) so credita.
create or replace function dev.enviar_correio(
  p_para_nick text,
  p_assunto text,
  p_corpo text,
  p_anexos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_eu record;
  v_destino_id uuid;
  v_destino record;
  v_ultima timestamptz;
  v_item jsonb;
  v_item_id text;
  v_qtd int;
  v_tem int;
  v_travado boolean;
  v_anexos jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_assunto is null or length(trim(p_assunto)) = 0 or length(p_assunto) > 60 then
    raise exception 'O assunto precisa ter de 1 a 60 caracteres.' using errcode = 'P0001';
  end if;
  if p_corpo is null or length(trim(p_corpo)) = 0 or length(p_corpo) > 1000 then
    raise exception 'A mensagem precisa ter de 1 a 1000 caracteres.' using errcode = 'P0001';
  end if;
  if p_para_nick is null or length(trim(p_para_nick)) = 0 or length(p_para_nick) > 40 then
    raise exception 'nick invalido' using errcode = 'P0001';
  end if;

  select trainer_name into v_eu from dev.players where user_id = v_user_id;
  if v_eu is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;
  if lower(v_eu.trainer_name) = lower(trim(p_para_nick)) then
    raise exception 'Voce nao pode mandar mensagem pra si mesmo.' using errcode = 'P0001';
  end if;

  v_destino_id := dev.id_por_nome_de_treinador(trim(p_para_nick));
  if v_destino_id is null then
    raise exception 'Nao existe treinador chamado "%".', trim(p_para_nick) using errcode = 'P0001';
  end if;
  select user_id, trainer_name into v_destino from dev.players where user_id = v_destino_id;

  if dev.bloqueio_entre(v_user_id, v_destino.user_id) then
    raise exception 'Nao e possivel enviar mensagem para %.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  -- Rate limit proprio: sem isto o correio vira o furo de spam que PH-23
  -- fechou no chat mundial, com o agravante de a mensagem ficar guardada.
  -- Serializa por usuario pelo mesmo motivo do trigger de DM acima.
  perform pg_advisory_xact_lock(hashtextextended('correio:' || v_user_id::text, 0));
  select max(created_at) into v_ultima
    from dev.mail_messages where de_id = v_user_id and tipo = 'texto';
  if v_ultima is not null and now() - v_ultima < interval '3 seconds' then
    raise exception 'Aguarde um instante antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;

  -- Anexos: normaliza, recusa duplicata e debita.
  if p_anexos is not null and jsonb_typeof(p_anexos) = 'array' then
    if jsonb_array_length(p_anexos) > 5 then
      raise exception 'No maximo 5 itens diferentes por mensagem.' using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_anexos) loop
      v_item_id := v_item->>'itemId';
      v_qtd := floor(coalesce((v_item->>'quantity')::numeric, 0));
      if v_item_id is null or v_qtd <= 0 then
        raise exception 'Anexo invalido.' using errcode = 'P0001';
      end if;
      -- Duas entradas do mesmo item burlariam a checagem de saldo: cada uma
      -- passaria sozinha contra o mesmo estoque.
      if v_item_id = any(v_vistos) then
        raise exception 'Item "%" aparece duas vezes no anexo.', v_item_id using errcode = 'P0001';
      end if;
      v_vistos := v_vistos || v_item_id;

      select quantity, locked into v_tem, v_travado
        from dev.player_items
        where user_id = v_user_id and item_id = v_item_id
        for update;

      if v_tem is null or v_tem < v_qtd then
        raise exception 'Voce nao tem % de "%".', v_qtd, v_item_id using errcode = 'P0001';
      end if;
      if v_travado then
        raise exception 'O item "%" esta travado. Destrave antes de anexar.', v_item_id using errcode = 'P0001';
      end if;

      update dev.player_items
        set quantity = quantity - v_qtd, updated_at = now()
        where user_id = v_user_id and item_id = v_item_id;

      v_anexos := v_anexos || jsonb_build_array(
        jsonb_build_object('itemId', v_item_id, 'quantity', v_qtd)
      );
    end loop;
  end if;

  insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, anexo_itens)
  values (v_destino.user_id, v_user_id, v_eu.trainer_name, 'texto',
          trim(p_assunto), trim(p_corpo), v_anexos);

  return jsonb_build_object('mensagem', 'Mensagem enviada para ' || v_destino.trainer_name || '.');
end;
$$;

revoke all on function dev.enviar_correio(text, text, text, jsonb) from public;
revoke execute on function dev.enviar_correio(text, text, text, jsonb) from anon;
grant execute on function dev.enviar_correio(text, text, text, jsonb) to authenticated;


-- Responder: deriva destinatario e assunto da mensagem original em vez de
-- confiar no client. Sem isto, "responder" seria `enviar_correio` com o nick
-- vindo da tela — e um client adulterado responderia pra qualquer um alegando
-- ser resposta.
create or replace function dev.responder_correio(p_mensagem_id uuid, p_corpo text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_original dev.mail_messages;
  v_destino record;
  v_assunto text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_original from dev.mail_messages
    where id = p_mensagem_id and para_id = v_user_id;
  if v_original is null then
    raise exception 'Mensagem nao encontrada.' using errcode = 'P0001';
  end if;
  if v_original.de_id is null then
    raise exception 'Esta mensagem nao tem remetente para responder.' using errcode = 'P0001';
  end if;

  select trainer_name into v_destino from dev.players where user_id = v_original.de_id;
  if v_destino is null then
    raise exception 'Quem enviou esta mensagem nao existe mais.' using errcode = 'P0001';
  end if;

  -- "Re: Re: Re:" nao acumula.
  v_assunto := case
    when v_original.assunto like 'Re: %' then v_original.assunto
    else 'Re: ' || v_original.assunto
  end;
  v_assunto := left(v_assunto, 60);

  return dev.enviar_correio(v_destino.trainer_name, v_assunto, p_corpo, '[]'::jsonb);
end;
$$;

revoke all on function dev.responder_correio(uuid, text) from public;
revoke execute on function dev.responder_correio(uuid, text) from anon;
grant execute on function dev.responder_correio(uuid, text) to authenticated;


-- Excluir: marca so o proprio lado. Anexo ainda nao coletado bloqueia a
-- exclusao — o item ja saiu do inventario do remetente, entao excluir aqui o
-- destruiria sem ninguem ficar com ele.
create or replace function dev.excluir_correio(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg dev.mail_messages;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_msg from dev.mail_messages
    where id = p_mensagem_id and (para_id = v_user_id or de_id = v_user_id);
  if v_msg is null then
    raise exception 'Mensagem nao encontrada.' using errcode = 'P0001';
  end if;

  if v_msg.para_id = v_user_id then
    if v_msg.anexo_itens != '[]'::jsonb and v_msg.anexo_coletado_em is null then
      raise exception 'Colete o anexo antes de excluir esta mensagem.' using errcode = 'P0001';
    end if;
    if v_msg.tipo = 'pedido_amizade' and v_msg.estado = 'pendente' then
      raise exception 'Responda ao pedido de amizade antes de excluir.' using errcode = 'P0001';
    end if;
    update dev.mail_messages
      set excluido_destinatario_em = now(),
          estado = case when estado = 'pendente' then 'lido' else estado end,
          read_at = coalesce(read_at, now())
      where id = p_mensagem_id;
  else
    update dev.mail_messages
      set excluido_remetente_em = now()
      where id = p_mensagem_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dev.excluir_correio(uuid) from public;
revoke execute on function dev.excluir_correio(uuid) from anon;
grant execute on function dev.excluir_correio(uuid) to authenticated;


-- ===========================================================================
-- 6. RPCs de amizade
-- ===========================================================================

-- Remove os DOIS lados. `friendships` guarda o par em duas linhas (ver
-- 20260808201000); apagar so a minha deixaria o outro me vendo como amigo.
create or replace function dev.remover_amizade(p_amigo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nome text;
  v_apagadas int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_amigo_id is null then
    raise exception 'amigo invalido' using errcode = 'P0001';
  end if;

  delete from dev.friendships
    where (user_id = v_user_id and amigo_id = p_amigo_id)
       or (user_id = p_amigo_id and amigo_id = v_user_id);
  get diagnostics v_apagadas = row_count;

  if v_apagadas = 0 then
    raise exception 'Voces nao sao amigos.' using errcode = 'P0001';
  end if;

  select trainer_name into v_nome from dev.players where user_id = p_amigo_id;
  return jsonb_build_object('mensagem', coalesce(v_nome, 'Treinador') || ' saiu da sua lista de amigos.');
end;
$$;

revoke all on function dev.remover_amizade(uuid) from public;
revoke execute on function dev.remover_amizade(uuid) from anon;
grant execute on function dev.remover_amizade(uuid) to authenticated;


-- Bloquear tambem DESFAZ a amizade e limpa pedido pendente entre os dois.
-- Bloquear alguem e continuar amigo dele e um estado sem sentido: a lista de
-- amigos mostraria uma pessoa com quem nao da pra trocar nada.
create or replace function dev.bloquear_jogador(p_alvo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nome text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_alvo_id is null then
    raise exception 'alvo invalido' using errcode = 'P0001';
  end if;
  if p_alvo_id = v_user_id then
    raise exception 'Voce nao pode bloquear a si mesmo.' using errcode = 'P0001';
  end if;

  select trainer_name into v_nome from dev.players where user_id = p_alvo_id;
  if v_nome is null then
    raise exception 'Treinador nao encontrado.' using errcode = 'P0001';
  end if;

  insert into dev.blocks (user_id, bloqueado_id)
  values (v_user_id, p_alvo_id)
  on conflict (user_id, bloqueado_id) do nothing;

  delete from dev.friendships
    where (user_id = v_user_id and amigo_id = p_alvo_id)
       or (user_id = p_alvo_id and amigo_id = v_user_id);

  -- Pedido pendente nos dois sentidos vira recusado: deixar pendente manteria
  -- botao de "Aceitar" numa amizade que a RPC vai recusar de qualquer jeito.
  update dev.mail_messages
    set estado = 'recusado', read_at = coalesce(read_at, now())
    where tipo = 'pedido_amizade' and estado = 'pendente'
      and ((para_id = v_user_id and de_id = p_alvo_id)
        or (para_id = p_alvo_id and de_id = v_user_id));

  return jsonb_build_object('mensagem', v_nome || ' foi bloqueado.');
end;
$$;

revoke all on function dev.bloquear_jogador(uuid) from public;
revoke execute on function dev.bloquear_jogador(uuid) from anon;
grant execute on function dev.bloquear_jogador(uuid) to authenticated;


create or replace function dev.desbloquear_jogador(p_alvo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nome text;
  v_apagadas int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  delete from dev.blocks where user_id = v_user_id and bloqueado_id = p_alvo_id;
  get diagnostics v_apagadas = row_count;
  if v_apagadas = 0 then
    raise exception 'Este treinador nao esta bloqueado.' using errcode = 'P0001';
  end if;

  select trainer_name into v_nome from dev.players where user_id = p_alvo_id;
  return jsonb_build_object('mensagem', coalesce(v_nome, 'Treinador') || ' foi desbloqueado.');
end;
$$;

revoke all on function dev.desbloquear_jogador(uuid) from public;
revoke execute on function dev.desbloquear_jogador(uuid) from anon;
grant execute on function dev.desbloquear_jogador(uuid) to authenticated;


-- `pedir_amizade` reescrita so pra respeitar bloqueio. O resto do corpo e
-- identico a 20260812180000 — a mudanca e o bloco `bloqueio_entre`, que fecha
-- o caso de "recusei e a pessoa mandou de novo".
create or replace function dev.pedir_amizade(p_nick text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_eu record;
  v_destino_id uuid;
  v_destino record;
  v_ja_amigos boolean;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_nick is null or length(trim(p_nick)) = 0 or length(p_nick) > 40 then
    raise exception 'nick invalido' using errcode = 'P0001';
  end if;

  select trainer_name into v_eu from dev.players where user_id = v_user_id;
  if v_eu is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;
  if lower(v_eu.trainer_name) = lower(p_nick) then
    raise exception 'Voce nao pode adicionar a si mesmo.' using errcode = 'P0001';
  end if;

  v_destino_id := dev.id_por_nome_de_treinador(p_nick);
  if v_destino_id is null then
    raise exception 'Nao existe treinador chamado "%".', p_nick using errcode = 'P0001';
  end if;
  select user_id, trainer_name into v_destino from dev.players where user_id = v_destino_id;

  -- Mensagem deliberadamente igual pros dois lados do bloqueio: dizer "voce foi
  -- bloqueado" entrega o bloqueio pra quem foi bloqueado, que e justamente o
  -- que quem bloqueou nao quer.
  if dev.bloqueio_entre(v_user_id, v_destino.user_id) then
    raise exception 'Nao e possivel enviar pedido para %.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  select exists(
    select 1 from dev.friendships where user_id = v_user_id and amigo_id = v_destino.user_id
  ) into v_ja_amigos;
  if v_ja_amigos then
    raise exception '% ja e seu amigo.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  begin
    insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
    values (v_destino.user_id, v_user_id, v_eu.trainer_name, 'pedido_amizade', 'Pedido de amizade',
            v_eu.trainer_name || ' quer ser seu amigo.');
  exception when unique_violation then
    raise exception 'Voce ja tem um pedido pendente com %.', v_destino.trainer_name using errcode = 'P0001';
  end;

  return jsonb_build_object('mensagem', 'Pedido enviado para ' || v_destino.trainer_name || '.');
end;
$$;

revoke all on function dev.pedir_amizade(text) from public;
revoke execute on function dev.pedir_amizade(text) from anon;
grant execute on function dev.pedir_amizade(text) to authenticated;


-- Lista de amigos com tudo que a tela precisa, numa chamada. A alternativa
-- (client junta treinadores_publico + game_sessions + pokemon_instances +
-- contagem de nao lidas) sao 4 idas ao banco por render da lista.
create or replace function dev.amigos_detalhados()
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_amigos jsonb;
  v_bloqueados jsonb;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(a order by a->>'nome'), '[]'::jsonb) into v_amigos
  from (
    select jsonb_build_object(
      'userId', p.user_id,
      'nome', p.trainer_name,
      'nivel', p.trainer_level,
      'online', dev.esta_online(p.user_id),
      -- Mesma regra do client (playerMapper.ts:167-171): a equipe e
      -- `location='team'` ordenada por `team_slot`, e o ativo e o slot em
      -- `players.active_team_index`. `coalesce` no order by porque `team_slot`
      -- e nullable no schema.
      'pokeAtivo', (
        select jsonb_build_object('speciesId', pi.species_id, 'nivel', pi.level, 'shiny', pi.is_shiny)
        from dev.pokemon_instances pi
        where pi.user_id = p.user_id and pi.location = 'team'
        order by coalesce(pi.team_slot, 0)
        offset greatest(p.active_team_index, 0)
        limit 1
      ),
      'naoLidas', (
        select count(*) from dev.friend_messages fm
        where fm.para_id = v_user_id and fm.de_id = p.user_id and fm.read_at is null
      )
    ) as a
    from dev.friendships f
    join dev.players p on p.user_id = f.amigo_id
    where f.user_id = v_user_id
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', b.bloqueado_id,
    'nome', coalesce(pl.trainer_name, 'Treinador')
  ) order by pl.trainer_name), '[]'::jsonb) into v_bloqueados
  from dev.blocks b
  left join dev.players pl on pl.user_id = b.bloqueado_id
  where b.user_id = v_user_id;

  return jsonb_build_object('amigos', v_amigos, 'bloqueados', v_bloqueados);
end;
$$;

revoke all on function dev.amigos_detalhados() from public;
revoke execute on function dev.amigos_detalhados() from anon;
grant execute on function dev.amigos_detalhados() to authenticated;


-- ===========================================================================
-- 7. RPCs de conversa privada
-- ===========================================================================

create or replace function dev.enviar_dm(p_para_id uuid, p_corpo text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_amigos boolean;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_para_id is null or p_para_id = v_user_id then
    raise exception 'destinatario invalido' using errcode = 'P0001';
  end if;
  if p_corpo is null or length(trim(p_corpo)) = 0 or length(p_corpo) > 500 then
    raise exception 'A mensagem precisa ter de 1 a 500 caracteres.' using errcode = 'P0001';
  end if;

  -- Conversa privada e SO entre amigos. Sem esta checagem qualquer conta nova
  -- manda DM pra qualquer user_id conhecido, e user_id vaza em toda view
  -- publica (ranking, mercado, chat) — viraria spam direto na tela.
  select exists(
    select 1 from dev.friendships where user_id = v_user_id and amigo_id = p_para_id
  ) into v_amigos;
  if not v_amigos then
    raise exception 'Voce so pode conversar com amigos.' using errcode = 'P0001';
  end if;

  if dev.bloqueio_entre(v_user_id, p_para_id) then
    raise exception 'Nao e possivel enviar mensagem para este treinador.' using errcode = 'P0001';
  end if;

  insert into dev.friend_messages (de_id, para_id, corpo)
  values (v_user_id, p_para_id, trim(p_corpo))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function dev.enviar_dm(uuid, text) from public;
revoke execute on function dev.enviar_dm(uuid, text) from anon;
grant execute on function dev.enviar_dm(uuid, text) to authenticated;


create or replace function dev.marcar_dm_lidas(p_amigo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_marcadas int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update dev.friend_messages
    set read_at = now()
    where para_id = v_user_id and de_id = p_amigo_id and read_at is null;
  get diagnostics v_marcadas = row_count;

  return jsonb_build_object('ok', true, 'marcadas', v_marcadas);
end;
$$;

revoke all on function dev.marcar_dm_lidas(uuid) from public;
revoke execute on function dev.marcar_dm_lidas(uuid) from anon;
grant execute on function dev.marcar_dm_lidas(uuid) to authenticated;


-- ===========================================================================
-- 8. Realtime
-- ===========================================================================
-- `add table` estoura se a tabela ja estiver na publication; o bloco torna a
-- migration re-executavel.
do $$
begin
  alter publication supabase_realtime add table dev.friend_messages;
exception when duplicate_object then
  null;
end;
$$;
