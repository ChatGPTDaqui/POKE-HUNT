-- PH-246 — o custo em Stone da especialidade passa a escalar com a OFERTA
-- de Stone de cada tipo.
--
-- O QUE ESTAVA QUEBRADO: o custo era um array unico (15/35/70/130/220) pros 18
-- tipos, mas a Stone so cai de POKE daquele tipo e os tipos nao aparecem na
-- mesma frequencia. Medido em 28/08, os abates pra fechar as duas trilhas iam
-- de 18.800 (FIRE/WATER/ELECTRIC/PSYCHIC) a 162.933 (STEEL) — nove vezes de
-- diferenca. E FLYING era literalmente incompravel: nenhuma especie do
-- catalogo tem FLYING como tipo primario, o drop so olhava o primario, e a
-- Pedra FLYING nao caia de lugar nenhum enquanto a tela anunciava o preco dos
-- 10 niveis.
--
-- A correcao tem duas metades. A outra esta no motor: awardKillLoot passa a
-- sortear entre tipo primario e secundario, o que da fonte ao FLYING. Esta
-- aqui iguala o ESFORCO — o custo de cada tipo sai de um alvo unico de abates
-- multiplicado pela oferta medida daquele tipo.
--
-- Gerado por scripts/gerar-custo-de-especialidade.ts, o mesmo laco que emite
-- src/data/generated/custoEspecialidade.generated.ts. Um teste reprova se os
-- dois divergirem — a licao de PH-245, onde duas derivacoes da mesma coisa
-- sairam de sincronia em producao.
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
  -- Custo POR TIPO. Antes era um array unico pros 18 — ver o cabecalho.
  v_stone_qtd_por_nivel int[];
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

  -- O `case` tambem faz o papel de validar o tipo: nome fora da lista cai no
  -- `else` implicito e deixa a variavel nula.
  v_stone_qtd_por_nivel := case p_tipo
    when 'NORMAL' then array[8, 18, 35, 66, 111]
    when 'FIRE' then array[16, 37, 75, 138, 234]
    when 'WATER' then array[16, 37, 75, 138, 234]
    when 'ELECTRIC' then array[16, 37, 75, 138, 234]
    when 'GRASS' then array[8, 19, 37, 69, 117]
    when 'ICE' then array[16, 37, 75, 138, 234]
    when 'FIGHTING' then array[5, 12, 25, 45, 77]
    when 'POISON' then array[6, 13, 26, 48, 82]
    when 'GROUND' then array[16, 37, 75, 138, 234]
    when 'FLYING' then array[8, 19, 37, 69, 117]
    when 'PSYCHIC' then array[16, 37, 75, 138, 234]
    when 'BUG' then array[4, 10, 20, 36, 62]
    when 'ROCK' then array[16, 37, 75, 138, 234]
    when 'GHOST' then array[6, 14, 28, 53, 89]
    when 'DRAGON' then array[8, 19, 37, 69, 117]
    when 'DARK' then array[4, 9, 19, 35, 58]
    when 'STEEL' then array[16, 37, 75, 138, 234]
    when 'FAIRY' then array[2, 5, 11, 19, 33]
  end;
  if v_stone_qtd_por_nivel is null then
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

  -- Guarda live, e nao so o pre-check acima (PH-198, ver a migration
  -- ..._especialidade_guarda_de_stone_*): duas chamadas concorrentes da mesma
  -- conta passavam as duas pelo pre-check com o mesmo snapshot.
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
