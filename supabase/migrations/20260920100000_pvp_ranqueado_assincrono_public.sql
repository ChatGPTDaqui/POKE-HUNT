-- PH-565: ranqueado ASSINCRONO. Procurar partida vira "atacar a defesa salva
-- de outro jogador com MMR proximo", esteja ele online ou nao. A luta e
-- automatica (arena headless na Edge), entao nao precisa dos dois presentes.
--
-- Decisoes do dono (19/09/2026):
--   * fila ao vivo (`pvp_fila`, polling de 15 s) morre;
--   * so repete o mesmo defensor depois de 5 outras partidas ranqueadas
--     (bot nao conta pro cooldown);
--   * sem defensor elegivel -> bot (sem MMR/PDL, mas CONTA em partidas_hoje);
--   * defensor ganha/perde metade (calculado na Edge, pvpElo.ts#FATOR_DEFENSOR);
--   * limite diario so pro atacante.
--
-- `pvp_time`, `salvar_time_pvp`, `pvp_snapshot_time` e `pvp_time_pronto_ranqueado`
-- eram a transicao da PH-563; o cliente publicado antes desta migration ainda
-- chama `salvar_time_pvp`/le `pvp_time`, entao ELES FICAM por mais uma fase
-- (espelho continua valido). A fila (`pvp_fila`, `entrar_fila_ranqueada`,
-- `tentar_parear_ranqueado`, `sair_da_fila_ranqueada`) sai agora: o cliente
-- antigo que ainda chamar recebe erro claro em vez de parear com ninguem.

-- 1. Defensor pode ser atacado por N atacantes ao mesmo tempo: o indice
--    unico de "convidado vivo" passa a valer so pro amistoso (que precisa dele
--    pra nao ter dois convites pendentes pro mesmo jogador).
drop index if exists public.pvp_sessao_convidado_viva;
create unique index if not exists pvp_sessao_convidado_viva
  on public.pvp_sessao (convidado_id)
  where estado in ('convidada', 'aberta') and modo = 'amistoso';

-- 2. Preset pronto pro ranqueado. RELAXADO (>= 1 POKE valido) como o gate
--    temporario da 20260914210000; a regra estrita (6/6, nivel 80+, 4 golpes)
--    volta quando o dono mandar — ver 20260913140000 `pvp_time_pronto_ranqueado`.
create or replace function public.pvp_preset_pronto_ranqueado(p_user uuid, p_tipo text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_array_length(public.pvp_snapshot_preset(p_user, p_tipo)) >= 1;
$function$;
revoke execute on function public.pvp_preset_pronto_ranqueado(uuid, text) from public;

-- 3. Atacar.
create or replace function public.atacar_ranqueado()
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_rank public.pvp_rank;
  v_janela integer;
  v_cand record;
  v_alvo uuid;
  v_ataque jsonb;
  v_defesa jsonb;
  v_modo text;
  v_s public.pvp_sessao;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;

  update public.pvp_sessao
     set estado = 'expirada', encerrada_em = now()
   where estado in ('convidada', 'aberta') and expira_em <= now();

  -- Ser DEFENSOR numa sessao assincrona em voo nao me impede de atacar.
  if exists (
    select 1 from public.pvp_sessao
     where estado in ('convidada', 'aberta')
       and (anfitriao_id = v_eu or (convidado_id = v_eu and modo = 'amistoso'))
  ) then
    raise exception 'Voce ja esta em um duelo PvP.';
  end if;

  if not public.pvp_preset_pronto_ranqueado(v_eu, 'ataque') then
    raise exception 'Seu time de ataque esta vazio. Monte e ative um na aba Equipe PvP.';
  end if;

  -- `pvp_garantir_rank` faz `for update` na linha: duas abas clicando juntas
  -- serializam aqui e a segunda ve a sessao aberta da primeira.
  v_rank := public.pvp_garantir_rank(v_eu);
  if v_rank.partidas_hoje >= 5 then
    raise exception 'Limite de 5 partidas ranqueadas hoje atingido. Volta amanha.';
  end if;

  v_ataque := public.pvp_snapshot_preset(v_eu, 'ataque');

  -- Alvo humano: defesa ativa com slot, MMR na janela, fora dos ultimos 5
  -- defensores que enfrentei. Janela 150, depois 300. O snapshot e conferido
  -- por candidato porque o preset pode apontar pra POKE que o dono soltou.
  foreach v_janela in array array[150, 300] loop
    for v_cand in
      select r.user_id
        from public.pvp_rank r
       where r.user_id <> v_eu
         and not exists (select 1 from public.pvp_bots b where b.user_id = r.user_id)
         and abs(r.mmr - v_rank.mmr) <= v_janela
         and exists (
               select 1 from public.pvp_preset d
                where d.user_id = r.user_id and d.tipo = 'defesa' and d.ativo
                  and jsonb_array_length(d.slots) > 0
             )
         and r.user_id not in (
               select s.convidado_id from public.pvp_sessao s
                where s.anfitriao_id = v_eu and s.modo = 'ranqueado'
                  and s.estado in ('aberta', 'concluida')
                order by s.criada_em desc
                limit 5
             )
       order by abs(r.mmr - v_rank.mmr), random()
       limit 10
    loop
      v_defesa := public.pvp_snapshot_preset(v_cand.user_id, 'defesa');
      if jsonb_array_length(v_defesa) > 0 then
        v_alvo := v_cand.user_id;
        exit;
      end if;
    end loop;
    exit when v_alvo is not null;
  end loop;

  if v_alvo is not null then
    v_modo := 'ranqueado';
  else
    select b.user_id into v_alvo
      from public.pvp_bots b
     where exists (
             select 1 from public.pvp_preset d
              where d.user_id = b.user_id and d.tipo = 'defesa' and d.ativo
                and jsonb_array_length(d.slots) = 6
           )
     order by random()
     limit 1;
    if v_alvo is null then
      raise exception 'Nenhum oponente disponivel agora. Tente de novo em instantes.';
    end if;
    v_defesa := public.pvp_snapshot_preset(v_alvo, 'defesa');
    v_modo := 'ranqueado_bot';
  end if;

  -- Sessao assincrona nasce 'aberta' e o atacante resolve na hora; 2 min de
  -- validade bastam e evitam que um ataque abandonado prenda o defensor no
  -- amistoso (abrir_pvp checa "sessao viva" dos dois lados).
  insert into public.pvp_sessao (
    anfitriao_id, convidado_id, estado, modo, expira_em,
    anfitriao_time, convidado_time,
    anfitriao_pokemon_id, convidado_pokemon_id
  )
  values (
    v_eu, v_alvo, 'aberta', v_modo, now() + interval '2 minutes',
    v_ataque, v_defesa,
    null, null
  )
  returning * into v_s;

  -- Consome o limite diario na criacao (nao na resolucao): quem abandona o
  -- ataque depois de ver o adversario nao ganha uma tentativa de graca.
  update public.pvp_rank set partidas_hoje = partidas_hoje + 1 where user_id = v_eu;

  return v_s;
end
$function$;
grant execute on function public.atacar_ranqueado() to authenticated;

-- 4. A fila morre.
drop function if exists public.tentar_parear_ranqueado();
drop function if exists public.entrar_fila_ranqueada();
drop function if exists public.sair_da_fila_ranqueada();
drop table if exists public.pvp_fila;
