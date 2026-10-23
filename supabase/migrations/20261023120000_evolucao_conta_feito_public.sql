-- Feitos de Especialidade (23/10/2026): o gatilho de evolucao passa a contar
-- tambem `evolucao_tipo:<TIPO>` (os dois tipos da especie NOVA), lido pelas
-- missoes de Especialidade (src/data/especialidadeMissoes.ts). POKE nascido de
-- ovo tambem e merito proprio. Resto igual a 20261014130000_conquistas_fundacao.
create or replace function public.contar_evolucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipos jsonb := '{}'::jsonb;
  v_t1 text;
  v_t2 text;
begin
  if new.species_id is distinct from old.species_id
     and new.user_id = old.user_id
     and new.origem in ('captura', 'inicial', 'recompensa', 'ovo') then
    select s.type1::text, s.type2::text into v_t1, v_t2 from public.species s where s.id = new.species_id;
    if v_t1 is not null then v_tipos := v_tipos || jsonb_build_object('evolucao_tipo:' || v_t1, 1); end if;
    if v_t2 is not null then v_tipos := v_tipos || jsonb_build_object('evolucao_tipo:' || v_t2, 1); end if;
    perform public.somar_contadores(new.user_id, jsonb_build_object(
      'evolucao_total', 1,
      'evolucao:' || new.species_id, 1
    ) || v_tipos);
  end if;
  return null;
exception when others then
  -- Contar conquista nunca pode desfazer a evolucao.
  return null;
end;
$$;

revoke all on function public.contar_evolucao() from public, anon, authenticated;
