-- Espelho de 20261021130000_titulos_de_especialidade_public.sql no schema `dev`.
-- Titulos de Especialidade (21/10/2026, design aprovado pelo dono). Alem dos
-- titulos de conquista (Ouro/Impossivel/Platina), `definir_titulo` aceita
-- `esp:<TIPO>:<3|7|10>` quando o MAIOR nivel entre dano e defesa daquele tipo ja
-- alcancou o degrau. Catalogo e nomes: src/data/titulos.ts (titulos.test.ts le
-- este arquivo e confere os degraus e os tipos).
create or replace function dev.definir_titulo(p_conquista text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id text := nullif(trim(coalesce(p_conquista, '')), '');
  v_tipo text;
  v_degrau int;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if v_id is not null and v_id like 'esp:%' then
    v_tipo := split_part(v_id, ':', 2);
    v_degrau := case when split_part(v_id, ':', 3) ~ '^[0-9]{1,2}$' then split_part(v_id, ':', 3)::int end;
    if v_degrau is null or v_degrau not in (3, 7, 10) or v_tipo not in (
      'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
      'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
    ) then
      raise exception 'Titulo desconhecido.' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from dev.player_especialidades e
      where e.user_id = v_user_id and e.tipo = v_tipo and greatest(e.dano_nivel, e.defesa_nivel) >= v_degrau
    ) then
      raise exception 'Esse titulo ainda nao e seu.' using errcode = 'P0001';
    end if;
  elsif v_id is not null and not exists (
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
