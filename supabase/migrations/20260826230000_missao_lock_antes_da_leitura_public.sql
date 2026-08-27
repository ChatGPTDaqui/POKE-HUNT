-- PH-199 — correcao pos-auditoria: `reivindicar_missao` so pegava o advisory
-- lock logo antes da escrita em `players`, depois de JA ter lido
-- "ja reivindicada?"/posicao/sequencial/abates. Gemeo public de
-- `20260826230001_missao_lock_antes_da_leitura_dev.sql`.
--
-- O RISCO CONCRETO (menor que o de Especialidades/PH-198, mas real): duas
-- chamadas concorrentes da MESMA conta pra reivindicar a MESMA missao liam o
-- mesmo snapshot ("ja reivindicada" = false pras duas) antes de uma
-- commitar. A PRIMARY KEY (user_id, tipo, species_id) ja impedia o dano real
-- — o `insert` da segunda chamada estourava violacao de unicidade, a
-- transacao INTEIRA dela dava rollback (inclusive o credito de ouro que
-- tinha acabado de rodar), entao NUNCA houve pagamento duplicado. O problema
-- era so a mensagem: a segunda chamada via um erro cru de constraint do
-- Postgres em vez de 'Missao ja reivindicada.'.
--
-- A correcao move o `pg_advisory_xact_lock` pra ANTES de qualquer leitura de
-- negocio — mesmo lugar que `coletar_anexo_correio` (PH-67/PH-87) ja usa.
-- Com isto a segunda chamada REFAZ as leituras depois de esperar a primeira
-- commitar, ve o estado real, e cai na mensagem certa — sem depender de um
-- raciocinio sutil sobre por que a ordem antiga ja era segura.
--
-- `create or replace function`: assinatura identica, so o corpo muda.
begin;

create or replace function public.reivindicar_missao(p_tipo text, p_species_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_posicao int;
  v_total int;
  v_reivindicadas int;
  v_abates bigint;
  v_alvo int;
  v_recompensa bigint;
  v_ja_reivindicada boolean;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  -- Lock ANTES de qualquer leitura de negocio — ver a nota do topo do arquivo.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select exists(
    select 1 from public.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo and species_id = p_species_id
  ) into v_ja_reivindicada;
  if v_ja_reivindicada then
    raise exception 'Missao ja reivindicada.' using errcode = 'P0001';
  end if;

  with cadeia as (
    select id, (row_number() over (order by dex_number) - 1)::int as posicao
    from public.species
    where type1 = p_tipo::public.element_type or type2 = p_tipo::public.element_type
  )
  select posicao into v_posicao from cadeia where id = p_species_id;
  if v_posicao is null then
    raise exception 'Essa especie nao pertence a cadeia desse tipo.' using errcode = 'P0001';
  end if;

  select count(*) into v_total from public.species
    where type1 = p_tipo::public.element_type or type2 = p_tipo::public.element_type;

  select count(*) into v_reivindicadas from public.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo;
  if v_reivindicadas != v_posicao then
    raise exception 'Complete a missao anterior da cadeia primeiro.' using errcode = 'P0001';
  end if;

  select coalesce(normal_kills, 0) + coalesce(shiny_kills, 0) into v_abates
    from public.player_pokedex where user_id = v_user_id and species_id = p_species_id;
  v_alvo := 50 + v_posicao * 25;
  if coalesce(v_abates, 0) < v_alvo then
    raise exception 'Abates insuficientes para reivindicar esta missao.' using errcode = 'P0001';
  end if;

  v_recompensa := 100 + v_posicao * 50;
  if v_posicao + 1 = v_total then
    v_recompensa := v_recompensa + 5000;
  end if;

  update public.players set gold = gold + v_recompensa where user_id = v_user_id;
  if not found then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  insert into public.player_missoes_reivindicadas (user_id, tipo, species_id)
  values (v_user_id, p_tipo, p_species_id);

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Missao de %s (posicao %s) reivindicada — %s de ouro.', p_tipo, v_posicao + 1, v_recompensa)
  );
end;
$$;

commit;
