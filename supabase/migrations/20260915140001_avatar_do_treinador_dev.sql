-- Gemeo dev de 20260915140000_avatar_do_treinador_public.sql.
-- PH-548 — foto de perfil do treinador.
--
-- Aditiva: coluna `avatar` em dev.players, RPC `definir_avatar`, a view
-- `treinadores_publico` passa a expor o avatar (coluna nova no FIM, como
-- `create or replace view` exige), e cada bot do PvP recebe o retrato do
-- proprio slug. O catalogo de ids vive no cliente (src/data/avatares.ts): a
-- RPC valida so o FORMATO, para a mesma lista nao existir em duas linguagens
-- (PH-492 mordeu por isso em `configurar_auto`). Id que o cliente nao conhece
-- cai no icone padrao.

alter table dev.players add column if not exists avatar text;

alter table dev.players drop constraint if exists players_avatar_formato;
alter table dev.players add constraint players_avatar_formato
  check (avatar is null or avatar ~ '^[a-z0-9-]{1,32}$');

create or replace view dev.treinadores_publico as
  select p.user_id, p.trainer_name, p.trainer_level, p.trainer_exp,
         exists (select 1 from dev.pvp_bots b where b.user_id = p.user_id) as eh_bot,
         p.avatar
  from dev.players p;

create or replace function dev.definir_avatar(p_avatar text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_avatar text := nullif(trim(coalesce(p_avatar, '')), '');
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if v_avatar is not null and v_avatar !~ '^[a-z0-9-]{1,32}$' then
    raise exception 'Avatar invalido.' using errcode = 'P0001';
  end if;
  -- PH-67: serializa contra o flush e as outras escritas em players do mesmo
  -- usuario; o trigger de updated_at faz o flush em voo recusar e reler.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  update dev.players set avatar = v_avatar where user_id = v_user_id;
  if not found then raise exception 'jogador nao encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'avatar', v_avatar);
end;
$$;
revoke all on function dev.definir_avatar(text) from public;
grant execute on function dev.definir_avatar(text) to authenticated;

-- Cada bot do PvP com o retrato do proprio slug (scripts/pvp/seed-bots.mjs:
-- e-mail bot-<slug>@bots.pokehunt.local). Idempotente e so preenche quem
-- ainda nao tem avatar, para nao sobrescrever escolha futura.
update dev.players p
   set avatar = substring(u.email from '^bot-([a-z0-9-]+)@')
  from auth.users u
 where u.id = p.user_id
   and p.user_id in (select user_id from dev.pvp_bots)
   and p.avatar is null
   and u.email ~ '^bot-[a-z0-9-]+@bots\.pokehunt\.local$';
