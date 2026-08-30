-- PH-284: `gravar_progresso` nunca gravou `bioma_progress` — vencer o Lord da
-- sala 10 creditava o progresso no motor e o flush jogava fora em silencio.
--
-- O QUE ESTAVA ERRADO, E POR QUE NAO APARECEU ANTES
--
-- `gravar_progresso` (20260822120000, corrigida em 20260822130000) escreve a
-- linha de `players` com uma LISTA FIXA de colunas, montada em 22/08. A coluna
-- `bioma_progress` nasceu depois (20260827000000, PH-200) e ninguem voltou aqui.
-- O lado TypeScript esta certo desde sempre: `gameStateToPlayerRow`
-- (src/data/remote/playerMapper.ts) monta `bioma_progress` no patch, e o motor
-- credita em `handleEnemyDefeated` -> `avancarBiomaProgressSeForOProximo`
-- (src/engine/simulation.ts), caminho coberto por src/engine/protetor.test.ts.
-- A chave simplesmente chegava no `p_patch` e nao era lida.
--
-- Falha silenciosa nos dois sentidos: nenhum erro, nenhum log, e o unico
-- sintoma e o menu de hunt dizendo "Bloqueado" pra sempre — PH-206/226/227
-- liberam o bioma N+1 lendo exatamente esta coluna. Evidencia no banco antes
-- do fix: conta com `ciclos = 5` em `campo_aberto_faixa1` e
-- `bioma_progress = {"faixa1": 0, "faixa2": 0, "faixa3": 0}`.
--
-- `coalesce(..., bioma_progress)` e nao `p_patch->'bioma_progress'` cru: a
-- coluna e `not null`, e um chamador que omitisse a chave derrubaria o UPDATE
-- inteiro com violacao de not-null em vez de so nao mexer no valor.
--
-- `create or replace` basta (assinatura inalterada), e os grants sobrevivem —
-- ao contrario de 20260822130000, que precisou de `drop` porque MUDOU a lista
-- de parametros.
--
-- O reincidente esta fechado por teste, nao por disciplina:
-- src/data/gravarProgressoCobreOMapper.test.ts compara as colunas atribuidas
-- nesta funcao contra as chaves que `gameStateToPlayerRow` monta, e reprova o
-- CI na PROXIMA coluna nova que esquecerem aqui.
create or replace function public.gravar_progresso(p_user_id uuid, p_patch jsonb, p_updated_at_esperado timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_novo_updated_at timestamptz;
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) != 'object' then
    raise exception 'patch invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  update public.players set
    trainer_name = p_patch->>'trainer_name',
    trainer_level = (p_patch->>'trainer_level')::int,
    trainer_exp = (p_patch->>'trainer_exp')::bigint,
    gold = (p_patch->>'gold')::bigint,
    diamonds = (p_patch->>'diamonds')::int,
    active_team_index = (p_patch->>'active_team_index')::smallint,
    current_map_id = p_patch->>'current_map_id',
    unlocked_maps = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch->'unlocked_maps') x),
    unlocked_continents = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch->'unlocked_continents') x),
    auto_toggles = p_patch->'auto_toggles',
    auto_pot_rules = p_patch->'auto_pot_rules',
    auto_catch_config = p_patch->'auto_catch_config',
    auto_sell_config = p_patch->'auto_sell_config',
    auto_status_config = p_patch->'auto_status_config',
    perf_stats = p_patch->'perf_stats',
    bioma_progress = coalesce(p_patch->'bioma_progress', bioma_progress)
  where user_id = p_user_id and updated_at = p_updated_at_esperado
  returning updated_at into v_novo_updated_at;

  if v_novo_updated_at is null then
    return jsonb_build_object('ok', false, 'conflito', true);
  end if;

  return jsonb_build_object('ok', true, 'updatedAt', v_novo_updated_at);
end;
$function$;

revoke execute on function public.gravar_progresso(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.gravar_progresso(uuid, jsonb, timestamptz) to service_role;
