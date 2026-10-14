-- Conquistas: titulo, vitrine e ranking — schema dev (14/10/2026).
--
-- Spec 2026-10-14-conquistas-design: a recompensa de conquista e SO cosmetica.
--  * TITULO: uma conquista Ouro, Impossivel ou a Platina, escolhida pelo jogador,
--    aparece sob o nome no perfil publico e no ranking;
--  * VITRINE: ate 3 conquistas que o jogador escolhe exibir no perfil publico;
--  * RANKING por Score (soma dos pontos), so jogadores (sem bots).
-- A MOLDURA do retrato sai do percentual da platina e e calculada na tela com
-- o que `player_conquistas` (leitura publica) ja diz — nao precisa de coluna.
--
-- Gerado de scripts/conquistas/molde-titulos.sql (o par do outro schema sai do
-- mesmo molde). Mesmo padrao da skin/foto: coluna em players, RPC de escrita
-- que valida, e `treinadores_publico` expondo (colunas novas no FIM, como
-- `create or replace view` exige).
begin;

alter table dev.players add column if not exists titulo text;
alter table dev.players add column if not exists vitrine text[] not null default '{}';

alter table dev.players drop constraint if exists players_vitrine_ate_3;
alter table dev.players add constraint players_vitrine_ate_3
  check (cardinality(vitrine) <= 3);

create or replace view dev.treinadores_publico as
  select p.user_id, p.trainer_name, p.trainer_level, p.trainer_exp,
         exists (select 1 from dev.pvp_bots b where b.user_id = p.user_id) as eh_bot,
         p.avatar,
         p.skin_treinador,
         p.titulo,
         p.vitrine
  from dev.players p;

-- Titulo: so conquista que o jogador TEM, e so dos niveis que dao titulo.
-- `null` tira o titulo.
create or replace function dev.definir_titulo(p_conquista text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id text := nullif(trim(coalesce(p_conquista, '')), '');
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if v_id is not null and not exists (
    select 1 from dev.player_conquistas pc
    join dev.conquista_catalogo c on c.id = pc.conquista_id
    where pc.user_id = v_user_id and pc.conquista_id = v_id
      and c.nivel in ('ouro', 'impossivel', 'platina')
  ) then
    raise exception 'Esse titulo ainda nao e seu.' using errcode = 'P0001';
  end if;
  -- Mesmo lock das outras escritas em players (PH-67).
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  update dev.players set titulo = v_id where user_id = v_user_id;
  if not found then raise exception 'jogador nao encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'titulo', v_id);
end;
$$;
revoke all on function dev.definir_titulo(text) from public, anon;
grant execute on function dev.definir_titulo(text) to authenticated;

-- Vitrine: ate 3 conquistas que o jogador TEM, sem repetir. Lista vazia limpa.
create or replace function dev.definir_vitrine(p_conquistas text[])
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  -- Sem repetir e NA ORDEM que o jogador escolheu (`distinct` sozinho
  -- embaralha): a primeira aparece primeiro no perfil.
  v_ids text[] := array(
    select x from unnest(coalesce(p_conquistas, '{}')) with ordinality as t(x, ord)
    where x <> '' group by x order by min(ord)
  );
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if cardinality(v_ids) > 3 then
    raise exception 'A vitrine mostra no maximo 3 conquistas.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from dev.player_conquistas pc
                      where pc.user_id = v_user_id and pc.conquista_id = x)
  ) then
    raise exception 'So da pra exibir conquista que voce tem.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  update dev.players set vitrine = v_ids where user_id = v_user_id;
  if not found then raise exception 'jogador nao encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true, 'vitrine', to_jsonb(v_ids));
end;
$$;
revoke all on function dev.definir_vitrine(text[]) from public, anon;
grant execute on function dev.definir_vitrine(text[]) to authenticated;

-- Ranking por Score. Bots fora (eles nao jogam a hunt). `feitas` e o
-- numerador da platina (bronze/prata/ouro, secretas incluidas).
create or replace function dev.ranking_conquistas(p_limite integer default 50)
returns table (
  user_id uuid, trainer_name text, titulo text, pontos bigint, feitas bigint, lendas bigint, platinado boolean
)
language sql
stable
security definer
set search_path = dev, public
as $$
  select p.user_id, p.trainer_name, p.titulo,
         coalesce(sum(c.pontos), 0)::bigint as pontos,
         count(*) filter (where c.nivel in ('bronze', 'prata', 'ouro'))::bigint as feitas,
         count(*) filter (where c.nivel = 'impossivel')::bigint as lendas,
         bool_or(c.nivel = 'platina') as platinado
  from dev.player_conquistas pc
  join dev.conquista_catalogo c on c.id = pc.conquista_id
  join dev.players p on p.user_id = pc.user_id
  where not exists (select 1 from dev.pvp_bots b where b.user_id = pc.user_id)
  group by p.user_id, p.trainer_name, p.titulo
  order by pontos desc, feitas desc, p.trainer_name
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
$$;
revoke all on function dev.ranking_conquistas(integer) from public, anon;
grant execute on function dev.ranking_conquistas(integer) to authenticated;

commit;
