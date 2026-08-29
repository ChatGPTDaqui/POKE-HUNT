-- PH-164 — espelho de 20260828233000_eevee_retroativo_public.sql no schema dev.
-- O raciocinio completo esta na migration irma em public.
--
-- Em dev ela e um NO-OP esperado: `dev.hall_da_fama` tinha 0 linhas com
-- `boss_lance` na data desta migration. Ela existe aqui pelo mesmo motivo que
-- todo par existe — os dois schemas tem que sair do deploy com o MESMO
-- comportamento, senao o proximo veterano que vencer o Lance em dev cairia num
-- caminho que ninguem exercitou.

begin;

do $$
declare
  v_user_id uuid;
  v_concedidos int := 0;
  v_vistos int := 0;
begin
  for v_user_id in
    select h.user_id
      from dev.hall_da_fama h
      where h.conquista = 'boss_lance'
        and exists (select 1 from dev.players p where p.user_id = h.user_id)
      order by h.conquistado_em
  loop
    v_vistos := v_vistos + 1;
    if dev._conceder_eevee_do_lance(v_user_id) then
      v_concedidos := v_concedidos + 1;
    end if;
  end loop;

  -- `%` sozinho, nao `%s`: o `RAISE` do PL/pgSQL usa `%` como marcador e
  -- deixaria o "s" literal na mensagem.
  raise notice 'eevee retroativo: % veterano(s) no Hall, % carta(s) enviada(s)',
    v_vistos, v_concedidos;
end
$$;

commit;
