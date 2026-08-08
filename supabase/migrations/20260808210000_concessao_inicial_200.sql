-- Concessao inicial: 200 Poke Ball e 200 Potion (era 100 de cada).
--
-- Pedido explicito do usuario. O Revive nao foi citado e fica nos 10.
--
-- So a funcao muda: `handle_new_user` (conta nova), `wipe_todos_os_saves`
-- (reset total) e `wipe_inventario_e_economia` (reset parcial) ja leem daqui,
-- entao os tres passam a valer o valor novo sem serem tocados. Era exatamente
-- pra isso que a lista virou funcao na migration 20260808150000.
--
-- Conta que JA existe nao e afetada: o pedido fala de jogador novo e de conta
-- resetada, e regravar inventario de quem esta jogando apagaria o que a pessoa
-- juntou.
create or replace function public.concessao_inicial_de_itens()
returns table (item_id text, quantity int)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('poke_ball', 200),
    ('potion',    200),
    ('revive',     10)
  ) as concessao(item_id, quantity)
$$;

-- Toda funcao no schema `public` e chamavel por RPC com a anon key que vai no
-- bundle do jogo. Esta so devolve constantes (nao ha estrago possivel), mas o
-- `revoke` acompanha as outras da familia: a regra e "funcao de servidor nao
-- fica exposta", nao "funcao perigosa nao fica exposta".
revoke all on function public.concessao_inicial_de_itens() from public;
revoke all on function public.concessao_inicial_de_itens() from anon;
revoke all on function public.concessao_inicial_de_itens() from authenticated;
grant execute on function public.concessao_inicial_de_itens() to service_role;
