-- Skins desbloqueaveis (decisao do dono, 17/10/2026).
--
-- Ate aqui `definir_skin_treinador` so validava o FORMATO do id: qualquer
-- jogador vestia qualquer skin. Agora so as gratis da franquia (protagonistas
-- jogaveis + o Mochileiro) sao livres; as outras pedem a conquista do jogador.
--
-- A REGRA DE CADA SKIN ESTA AQUI E EM src/data/skinsDoTreinador.ts, e
-- `skinsDesbloqueaveis.test.ts` compara os dois. Id desconhecido continua
-- aceito (skin nova cuja arte chegou antes da regra cai no padrao no cliente),
-- mas so se nao for uma das trancadas abaixo.
--
-- O RESET: jogador (bot de PvP fica de fora) que veste uma skin trancada sem ter a conquista volta pro padrao
-- (`null` = Mochileiro). Quem ja tem a conquista fica com a dela — volta-la
-- pro padrao so obrigaria a escolher de novo a mesma coisa.
begin;

create or replace function public.definir_skin_treinador(p_skin text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_skin text := nullif(trim(coalesce(p_skin, '')), '');
  v_conquista text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if v_skin is not null and v_skin !~ '^[a-z0-9-]{1,32}$' then
    raise exception 'Skin invalida.' using errcode = 'P0001';
  end if;
  v_conquista := case v_skin
    when 'carvalho' then 'assistente_do_professor'
    when 'jessie' then 'decolando_de_novo'
    when 'lance' then 'campeao'
    when 'cynthia' then 'mestre_pokemon'
    else null
  end;
  if v_conquista is not null and not exists (
    select 1 from public.player_conquistas c
    where c.user_id = v_user_id and c.conquista_id = v_conquista
  ) then
    raise exception 'Skin ainda nao desbloqueada.' using errcode = 'P0001';
  end if;
  -- PH-67: serializa contra o flush e as outras escritas em players do mesmo
  -- usuario; o trigger de updated_at faz o flush em voo recusar e reler.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  update public.players set skin_treinador = v_skin where user_id = v_user_id;
  if not found then raise exception 'jogador nao encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'skin', v_skin);
end;
$$;

revoke all on function public.definir_skin_treinador(text) from public;
grant execute on function public.definir_skin_treinador(text) to authenticated;

update public.players p
set skin_treinador = null
where p.skin_treinador in ('carvalho', 'jessie', 'lance', 'cynthia')
  -- Bot de PvP fica com a skin dele: ele nao conquista nada, e a skin e a
  -- identidade visual do bot no duelo (o bot do Lance veste o Lance).
  and not exists (select 1 from public.pvp_bots b where b.user_id = p.user_id)
  and not exists (
    select 1 from public.player_conquistas c
    where c.user_id = p.user_id
      and c.conquista_id = case p.skin_treinador
        when 'carvalho' then 'assistente_do_professor'
        when 'jessie' then 'decolando_de_novo'
        when 'lance' then 'campeao'
        when 'cynthia' then 'mestre_pokemon'
      end
  );

commit;
