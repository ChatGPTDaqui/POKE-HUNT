-- PH-81 — o correio deixa de ser caixa de cartas avulsas e vira CONVERSA por
-- contato, com historico salvo, no formato de aplicativo de mensagem.
--
-- ===========================================================================
-- POR QUE `friend_messages` SAI, E NAO `mail_messages`
-- ===========================================================================
-- Ate aqui havia DUAS tabelas de mensagem entre jogadores, e a mesma pessoa
-- tinha duas caixas com o mesmo interlocutor: a carta numa aba, o DM em outra,
-- a resposta numa terceira. Nao havia conversa, havia tres listas.
--
-- `mail_messages` e superconjunto de `friend_messages`: tem anexo de
-- ouro/item, exclusao independente por lado, e `de_nome` — que sobrevive a
-- exclusao da conta, porque `de_id` e `on delete set null`. `friend_messages`
-- so acrescentava um limite menor de caracteres e um gatilho de rate limit,
-- os dois reimplementaveis. Entao quem sai e ela.
--
-- E POSSIVEL FAZER ISSO SEM MIGRAR DADO porque as duas estao VAZIAS em
-- producao (contagem exata por `Content-Range` em 2026-08-22: 0 e 0).
-- `friend_messages` tinha um dia de vida. Depois que existir conversa de
-- jogador de verdade, unificar duas timelines vira migracao com risco de
-- perder ou duplicar mensagem — esta e a janela.
--
-- ===========================================================================
-- POLITICA: CONVERSA VALE PRA QUALQUER UM, NAO SO PRA AMIGO
-- ===========================================================================
-- `enviar_dm` exigia amizade, e a justificativa escrita la continua verdadeira
-- em tese: `user_id` vaza em toda view publica (ranking, mercado, chat), entao
-- sem a trava qualquer conta manda mensagem pra qualquer id conhecido.
--
-- Mas a exposicao JA EXISTE pelo outro lado: `enviar_correio` sempre aceitou
-- qualquer nick, com 3 segundos de intervalo como unica trava. Unificar nao
-- abre porta nova — para de ter duas portas com regras diferentes. O controle
-- continua sendo o BLOQUEIO, e o rate limit de 3s do correio passa a valer pra
-- TODA mensagem de conversa, inclusive as que entravam pelo caminho do DM (que
-- era mais frouxo: 1,2s).

begin;

-- ===========================================================================
-- 1. `assunto` deixa de ser obrigatorio
-- ===========================================================================
-- Conversa nao tem assunto — carta tem. O campo fica pro aviso de SISTEMA, que
-- continua precisando de um titulo. Mensagem de pessoa passa a mandar nulo.
alter table public.mail_messages alter column assunto drop not null;

-- ===========================================================================
-- 2. Indices do FIO
-- ===========================================================================
-- A consulta da conversa e "tudo entre eu e fulano, mais recente primeiro", e
-- ela toca os DOIS sentidos do par — dai dois indices, um por sentido, em vez
-- de um so. E exatamente o desenho que `friend_messages` ja tinha e que se
-- perderia junto com ela.
--
-- Sem eles, abrir uma conversa varre a caixa inteira por `para_id` e filtra
-- `de_id` em memoria; com a caixa vazia de hoje nao se nota, e com caixa cheia
-- e a consulta mais frequente da tela.
create index if not exists mail_messages_fio_recebidas_idx
  on public.mail_messages (para_id, de_id, created_at desc);
create index if not exists mail_messages_fio_enviadas_idx
  on public.mail_messages (de_id, para_id, created_at desc);
-- Parcial: o contador de nao lidas POR CONTATO e o que a lista de conversas
-- pede, e so olha linha com `read_at` nulo, que e minoria.
create index if not exists mail_messages_fio_nao_lidas_idx
  on public.mail_messages (para_id, de_id)
  where read_at is null and tipo = 'texto';

-- ===========================================================================
-- 3. `amigos_detalhados` para de depender de `friend_messages`
-- ===========================================================================
-- TEM QUE VIR ANTES DO DROP. O corpo de uma funcao plpgsql nao e validado
-- quando a tabela que ela le desaparece — o `drop table` passa limpo e a
-- funcao so estoura na primeira CHAMADA, com "relation friend_messages does
-- not exist". Ou seja: a lista de amigos quebraria em producao, nao aqui.
--
-- A contagem passa a sair de `mail_messages`, e ganha de brinde a exclusao por
-- lado: mensagem que EU apaguei nao pode continuar contando como nao lida no
-- badge do amigo — era um furo que `friend_messages` nem tinha como ter,
-- porque la nao havia exclusao nenhuma.
create or replace function public.amigos_detalhados()
returns jsonb
language plpgsql
security definer
set search_path = public
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
      'online', public.esta_online(p.user_id),
      -- Mesma regra do client (playerMapper.ts): a equipe e `location='team'`
      -- ordenada por `team_slot`, e o ativo e o slot em
      -- `players.active_team_index`. `coalesce` no order by porque `team_slot`
      -- e nullable no schema.
      'pokeAtivo', (
        select jsonb_build_object('speciesId', pi.species_id, 'nivel', pi.level, 'shiny', pi.is_shiny)
        from public.pokemon_instances pi
        where pi.user_id = p.user_id and pi.location = 'team'
        order by coalesce(pi.team_slot, 0)
        offset greatest(p.active_team_index, 0)
        limit 1
      ),
      'naoLidas', (
        select count(*) from public.mail_messages m
        where m.para_id = v_user_id
          and m.de_id = p.user_id
          and m.tipo = 'texto'
          and m.read_at is null
          and m.excluido_destinatario_em is null
      )
    ) as a
    from public.friendships f
    join public.players p on p.user_id = f.amigo_id
    where f.user_id = v_user_id
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', b.bloqueado_id,
    'nome', coalesce(pl.trainer_name, 'Treinador')
  ) order by pl.trainer_name), '[]'::jsonb) into v_bloqueados
  from public.blocks b
  left join public.players pl on pl.user_id = b.bloqueado_id
  where b.user_id = v_user_id;

  return jsonb_build_object('amigos', v_amigos, 'bloqueados', v_bloqueados);
end;
$$;

revoke all on function public.amigos_detalhados() from public;
revoke execute on function public.amigos_detalhados() from anon;
grant execute on function public.amigos_detalhados() to authenticated;

-- ===========================================================================
-- 4. `friend_messages` sai
-- ===========================================================================
-- O trigger vai junto: `dm_rate_limit` so existia pra ela, e o limite agora
-- mora em `enviar_mensagem`, num lugar so pros dois caminhos.
drop trigger if exists dm_rate_limit_trigger on public.friend_messages;
drop function if exists public.dm_rate_limit();
drop function if exists public.enviar_dm(uuid, text);
drop function if exists public.marcar_dm_lidas(uuid);
drop table if exists public.friend_messages;

-- ===========================================================================
-- 5. `enviar_mensagem` — o unico caminho de envio de conversa
-- ===========================================================================
-- Substitui `enviar_correio` (que exigia assunto e so aceitava nick) e
-- `enviar_dm` (que so aceitava amigo e nao levava anexo). Aceita QUALQUER UM
-- dos dois jeitos de apontar o destinatario:
--
--   `p_para_id`   quando a conversa ja esta aberta (o caminho normal, e o que
--                 a lista de conversas usa — ela ja tem o id em maos)
--   `p_para_nick` quando o jogador esta comecando conversa nova pelo nick
--
-- Um dos dois e obrigatorio. Dois caminhos numa funcao so, e nao duas funcoes,
-- porque TUDO o que vem depois de resolver o destinatario e identico: bloqueio,
-- rate limit, anexo, insert. Duas funcoes divergiriam na primeira mexida — foi
-- exatamente o que aconteceu entre `enviar_correio` e `enviar_dm`.
create or replace function public.enviar_mensagem(
  p_corpo text,
  p_para_id uuid default null,
  p_para_nick text default null,
  p_anexos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_eu record;
  v_destino record;
  v_destino_id uuid;
  v_ultima timestamptz;
  v_item jsonb;
  v_item_id text;
  v_qtd int;
  v_tem int;
  v_anexos jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
  v_ouro bigint := 0;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_corpo is null or length(trim(p_corpo)) = 0 or length(p_corpo) > 1000 then
    raise exception 'A mensagem precisa ter de 1 a 1000 caracteres.' using errcode = 'P0001';
  end if;

  select trainer_name into v_eu from public.players where user_id = v_user_id;
  if v_eu is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  -- Resolve o destinatario por id ou por nick, nesta ordem.
  if p_para_id is not null then
    v_destino_id := p_para_id;
  elsif p_para_nick is not null and length(trim(p_para_nick)) between 1 and 40 then
    v_destino_id := public.id_por_nome_de_treinador(trim(p_para_nick));
    if v_destino_id is null then
      raise exception 'Nao existe treinador chamado "%".', trim(p_para_nick) using errcode = 'P0001';
    end if;
  else
    raise exception 'destinatario invalido' using errcode = 'P0001';
  end if;

  if v_destino_id = v_user_id then
    raise exception 'Voce nao pode mandar mensagem pra si mesmo.' using errcode = 'P0001';
  end if;

  select user_id, trainer_name into v_destino from public.players where user_id = v_destino_id;
  if v_destino is null then
    raise exception 'destinatario invalido' using errcode = 'P0001';
  end if;

  if public.bloqueio_entre(v_user_id, v_destino.user_id) then
    raise exception 'Nao e possivel enviar mensagem para %.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  -- Rate limit unico pros dois caminhos. Serializa por usuario com advisory
  -- lock: sem isso duas requisicoes simultaneas leem o mesmo `max(created_at)`
  -- e as duas passam.
  perform pg_advisory_xact_lock(hashtextextended('correio:' || v_user_id::text, 0));
  select max(created_at) into v_ultima
    from public.mail_messages where de_id = v_user_id and tipo = 'texto';
  if v_ultima is not null and now() - v_ultima < interval '3 seconds' then
    raise exception 'Aguarde um instante antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;

  -- Anexos: normaliza, recusa duplicata e DEBITA NO ENVIO. Debitar so na
  -- coleta deixaria o remetente prometer item que ele gastou nesse meio tempo.
  if p_anexos is not null and jsonb_typeof(p_anexos) = 'array' then
    if jsonb_array_length(p_anexos) > 5 then
      raise exception 'No maximo 5 itens diferentes por mensagem.' using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_anexos) loop
      v_item_id := v_item->>'itemId';
      v_qtd := floor(coalesce((v_item->>'quantity')::numeric, 0));
      if v_item_id is null or v_qtd <= 0 then
        raise exception 'anexo invalido' using errcode = 'P0001';
      end if;
      if v_item_id = any(v_vistos) then
        raise exception 'Item repetido no anexo.' using errcode = 'P0001';
      end if;
      v_vistos := array_append(v_vistos, v_item_id);

      if v_item_id = 'gold' then
        v_ouro := v_qtd;
        update public.players set gold = gold - v_qtd
          where user_id = v_user_id and gold >= v_qtd;
        if not found then
          raise exception 'Ouro insuficiente pro anexo.' using errcode = 'P0001';
        end if;
      else
        select quantity into v_tem from public.player_items
          where user_id = v_user_id and item_id = v_item_id;
        if coalesce(v_tem, 0) < v_qtd then
          raise exception 'Voce nao tem % de %.', v_qtd, v_item_id using errcode = 'P0001';
        end if;
        update public.player_items set quantity = quantity - v_qtd
          where user_id = v_user_id and item_id = v_item_id;
        delete from public.player_items
          where user_id = v_user_id and item_id = v_item_id and quantity <= 0;
      end if;

      v_anexos := v_anexos || jsonb_build_array(jsonb_build_object('itemId', v_item_id, 'quantity', v_qtd));
    end loop;
  end if;

  insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, estado, anexo_itens)
  values (v_destino.user_id, v_user_id, v_eu.trainer_name, 'texto', null, trim(p_corpo), 'pendente', v_anexos)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'paraId', v_destino.user_id, 'paraNome', v_destino.trainer_name);
end;
$$;

revoke all on function public.enviar_mensagem(text, uuid, text, jsonb) from public;
revoke execute on function public.enviar_mensagem(text, uuid, text, jsonb) from anon;
grant execute on function public.enviar_mensagem(text, uuid, text, jsonb) to authenticated;

-- `enviar_correio` e `responder_correio` saem: os dois viraram casos de
-- `enviar_mensagem`. Manter os tres seria manter tres lugares pra corrigir a
-- mesma regra de bloqueio ou de anexo.
drop function if exists public.enviar_correio(text, text, text, jsonb);
drop function if exists public.responder_correio(uuid, text);

-- ===========================================================================
-- 6. `conversas` — a lista de fios
-- ===========================================================================
-- Um registro por CONTATO: quem e, o trecho da ultima mensagem, quando foi, e
-- quantas nao lidas. O que a tela inicial do correio mostra.
--
-- `distinct on (contato)` sobre a uniao dos dois sentidos e o jeito barato de
-- pegar "a ultima por par" no Postgres — a alternativa (window function com
-- row_number) le o mesmo tanto e ainda ordena duas vezes.
--
-- Mensagem excluida POR MIM nao conta em lugar nenhum: nem como ultima, nem no
-- contador. Quem apagou a conversa nao quer ela de volta no topo da lista.
create or replace function public.conversas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_resultado jsonb;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  with minhas as (
    select
      case when m.de_id = v_user_id then m.para_id else m.de_id end as contato,
      m.corpo,
      m.created_at,
      m.read_at,
      m.de_id,
      m.anexo_itens,
      m.anexo_coletado_em
    from public.mail_messages m
    where m.tipo = 'texto'
      and (
        (m.de_id = v_user_id and m.excluido_remetente_em is null)
        or (m.para_id = v_user_id and m.excluido_destinatario_em is null)
      )
      -- Conversa precisa dos dois lados identificaveis; carta de conta apagada
      -- (`de_id` nulo) vira aviso, nao fio.
      and m.de_id is not null and m.para_id is not null
  ),
  ultima as (
    select distinct on (contato) contato, corpo, created_at, de_id
    from minhas
    order by contato, created_at desc
  ),
  nao_lidas as (
    select contato, count(*)::int as total
    from minhas
    where read_at is null and de_id <> v_user_id
    group by contato
  ),
  pendentes as (
    -- Anexo esperando coleta, por contato: o ponto vermelho que diz "tem coisa
    -- pra pegar aqui dentro" sem precisar abrir o fio.
    select contato, count(*)::int as total
    from minhas
    where de_id <> v_user_id
      and anexo_coletado_em is null
      and anexo_itens <> '[]'::jsonb
    group by contato
  )
  select coalesce(jsonb_agg(linha order by linha->>'ultimaEm' desc), '[]'::jsonb)
    into v_resultado
  from (
    select jsonb_build_object(
      'userId', u.contato,
      'nick', coalesce(p.trainer_name, 'Treinador'),
      'ultimoTrecho', left(u.corpo, 120),
      'ultimaEm', u.created_at,
      'ultimaMinha', u.de_id = v_user_id,
      'naoLidas', coalesce(n.total, 0),
      'anexosPendentes', coalesce(a.total, 0),
      'online', public.esta_online(u.contato),
      'bloqueado', public.bloqueio_entre(v_user_id, u.contato)
    ) as linha
    from ultima u
    left join public.players p on p.user_id = u.contato
    left join nao_lidas n on n.contato = u.contato
    left join pendentes a on a.contato = u.contato
  ) t;

  return v_resultado;
end;
$$;

revoke all on function public.conversas() from public;
revoke execute on function public.conversas() from anon;
grant execute on function public.conversas() to authenticated;

-- ===========================================================================
-- 7. `marcar_conversa_lida` — substitui `marcar_dm_lidas`
-- ===========================================================================
-- Zera as nao lidas de UM contato so. Antes eram duas marcacoes diferentes
-- (`marcar_lida` por mensagem no correio, `marcar_dm_lidas` por amigo no DM),
-- e o badge do HUD somava as duas.
create or replace function public.marcar_conversa_lida(p_contato_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_marcadas int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_contato_id is null then
    raise exception 'contato invalido' using errcode = 'P0001';
  end if;

  update public.mail_messages
    set read_at = now(),
        estado = case when estado = 'pendente' then 'lido' else estado end
    where para_id = v_user_id
      and de_id = p_contato_id
      and tipo = 'texto'
      and read_at is null;
  get diagnostics v_marcadas = row_count;

  return jsonb_build_object('ok', true, 'marcadas', v_marcadas);
end;
$$;

revoke all on function public.marcar_conversa_lida(uuid) from public;
revoke execute on function public.marcar_conversa_lida(uuid) from anon;
grant execute on function public.marcar_conversa_lida(uuid) to authenticated;

-- ===========================================================================
-- 8. `excluir_conversa` — apagar o fio inteiro, do meu lado
-- ===========================================================================
-- Mesma semantica de `excluir_correio`, so que em lote: marca o meu lado de
-- TODAS as mensagens daquele contato. O outro lado continua com a copia dele.
create or replace function public.excluir_conversa(p_contato_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_apagadas int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_contato_id is null then
    raise exception 'contato invalido' using errcode = 'P0001';
  end if;

  update public.mail_messages
    set excluido_destinatario_em = case
          when para_id = v_user_id and excluido_destinatario_em is null then now()
          else excluido_destinatario_em end,
        excluido_remetente_em = case
          when de_id = v_user_id and excluido_remetente_em is null then now()
          else excluido_remetente_em end
    where tipo = 'texto'
      and (
        (para_id = v_user_id and de_id = p_contato_id)
        or (de_id = v_user_id and para_id = p_contato_id)
      );
  get diagnostics v_apagadas = row_count;

  return jsonb_build_object('ok', true, 'apagadas', v_apagadas);
end;
$$;

revoke all on function public.excluir_conversa(uuid) from public;
revoke execute on function public.excluir_conversa(uuid) from anon;
grant execute on function public.excluir_conversa(uuid) to authenticated;

commit;
