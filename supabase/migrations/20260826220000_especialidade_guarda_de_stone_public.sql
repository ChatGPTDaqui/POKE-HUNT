-- PH-198 — correcao pos-auditoria: `subir_nivel_especialidade` deduzia a
-- Stone sem guarda de quantidade NA PROPRIA update, so num pre-check que le
-- um snapshot antes do advisory lock. Gemeo public de
-- `20260826220001_especialidade_guarda_de_stone_dev.sql`.
--
-- O RISCO CONCRETO: duas chamadas concorrentes da MESMA conta (duas abas,
-- duplo-clique que escapou do `useAcaoPendente` client-side) podiam
-- ambas passar pelo pre-check com o MESMO snapshot antes de o advisory lock
-- serializar. A dedução de ouro ja tinha guarda live (`where gold >= v_gold`),
-- entao a segunda chamada sempre falhava ali — MAS so quando o ouro
-- acabava primeiro que a Stone. Com ouro sobrando pra 2 compras e Stone
-- pra so 1, a segunda chamada passava do ouro e so estourava no CHECK
-- CONSTRAINT `quantity >= 0` da tabela (erro feio do Postgres em vez da
-- mensagem 'Stones insuficientes.', mas SEM saldo negativo real — o
-- constraint ja protegia a integridade, so a mensagem que saia errada).
--
-- `create or replace function`, nao um `create function` novo: a assinatura
-- (nome, parametros) nao muda, so o corpo.
begin;

create or replace function public.subir_nivel_especialidade(p_tipo text, p_trilha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nivel_atual int;
  v_stone_qtd_por_nivel int[] := array[15, 35, 70, 130, 220];
  v_gold_por_nivel bigint[] := array[500, 1500, 4000, 10000, 25000];
  v_stone_qtd int;
  v_gold bigint;
  v_stone_id text;
  v_stone_atual int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_trilha not in ('dano', 'defesa') then
    raise exception 'trilha invalida' using errcode = 'P0001';
  end if;
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  insert into public.player_especialidades (user_id, tipo) values (v_user_id, p_tipo)
    on conflict (user_id, tipo) do nothing;

  select case p_trilha when 'dano' then dano_nivel else defesa_nivel end into v_nivel_atual
    from public.player_especialidades where user_id = v_user_id and tipo = p_tipo;

  if v_nivel_atual >= 5 then
    raise exception 'Especialidade ja esta no nivel maximo.' using errcode = 'P0001';
  end if;

  v_stone_qtd := v_stone_qtd_por_nivel[v_nivel_atual + 1];
  v_gold := v_gold_por_nivel[v_nivel_atual + 1];
  v_stone_id := 'stone_' || lower(p_tipo);

  select quantity into v_stone_atual from public.player_items
    where user_id = v_user_id and item_id = v_stone_id;
  if coalesce(v_stone_atual, 0) < v_stone_qtd then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update public.players set gold = gold - v_gold
    where user_id = v_user_id and gold >= v_gold;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  -- Guarda live, e nao so o pre-check acima — ver a nota do topo do arquivo.
  update public.player_items set quantity = quantity - v_stone_qtd, updated_at = now()
    where user_id = v_user_id and item_id = v_stone_id and quantity >= v_stone_qtd;
  if not found then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update public.player_especialidades set
    dano_nivel = case when p_trilha = 'dano' then dano_nivel + 1 else dano_nivel end,
    defesa_nivel = case when p_trilha = 'defesa' then defesa_nivel + 1 else defesa_nivel end,
    updated_at = now()
    where user_id = v_user_id and tipo = p_tipo;

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Especialidade %s (%s) subiu para o nivel %s.', p_tipo, p_trilha, v_nivel_atual + 1)
  );
end;
$$;

commit;
