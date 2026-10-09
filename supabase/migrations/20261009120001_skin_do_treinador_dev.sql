-- Gemeo dev de 20261009120000_skin_do_treinador_public.sql.
-- Skin do treinador em campo (09/10) — agora no servidor, pra o RIVAL ver.
--
-- Ate a 7.88 a escolha vivia so no localStorage de cada jogador: bastava pro
-- treinador que anda atras do proprio POKE. Nos duelos de PvP o treinador do
-- rival tambem aparece, e ninguem le o navegador do outro — entao a skin vira
-- dado social, no mesmo molde da foto de perfil (PH-548): coluna em players,
-- RPC de escrita e a view `treinadores_publico` expondo (coluna nova no FIM,
-- como `create or replace view` exige). O catalogo vive no cliente
-- (src/data/skinsDoTreinador.ts): a RPC valida so o FORMATO; id que o cliente
-- nao conhece cai na skin padrao.

alter table dev.players add column if not exists skin_treinador text;

alter table dev.players drop constraint if exists players_skin_treinador_formato;
alter table dev.players add constraint players_skin_treinador_formato
  check (skin_treinador is null or skin_treinador ~ '^[a-z0-9-]{1,32}$');

create or replace view dev.treinadores_publico as
  select p.user_id, p.trainer_name, p.trainer_level, p.trainer_exp,
         exists (select 1 from dev.pvp_bots b where b.user_id = p.user_id) as eh_bot,
         p.avatar,
         p.skin_treinador
  from dev.players p;

create or replace function dev.definir_skin_treinador(p_skin text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_skin text := nullif(trim(coalesce(p_skin, '')), '');
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if v_skin is not null and v_skin !~ '^[a-z0-9-]{1,32}$' then
    raise exception 'Skin invalida.' using errcode = 'P0001';
  end if;
  -- PH-67: serializa contra o flush e as outras escritas em players do mesmo
  -- usuario; o trigger de updated_at faz o flush em voo recusar e reler.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  update dev.players set skin_treinador = v_skin where user_id = v_user_id;
  if not found then raise exception 'jogador nao encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'skin', v_skin);
end;
$$;
revoke all on function dev.definir_skin_treinador(text) from public;
grant execute on function dev.definir_skin_treinador(text) to authenticated;

-- Bot do PvP cujo slug ja e uma skin (hoje so o Lance) entra com ela; os
-- outros ficam sem skin e o cliente mostra a padrao ate existir a deles.
-- Idempotente e so preenche quem ainda nao tem skin.
update dev.players p
   set skin_treinador = substring(u.email from '^bot-([a-z0-9-]+)@')
  from auth.users u
 where u.id = p.user_id
   and p.user_id in (select user_id from dev.pvp_bots)
   and p.skin_treinador is null
   and substring(u.email from '^bot-([a-z0-9-]+)@') in ('lance');
