-- Historico do ginasio (24/10/2026, pedido do dono): os ultimos desafios
-- resolvidos de um ginasio, pra qualquer jogador ver no painel. A tabela
-- `ginasio_desafio` so mostra os PROPRIOS desafios (RLS); esta RPC expoe so o
-- que e publico: nomes, duelo, resultado, tempo e o repasse do lider.

begin;

create or replace function public.historico_do_ginasio(p_ginasio text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'desafiante', d.desafiante_nome,
    'lider', d.lider_nome,
    'liderHumano', d.lider_id is not null,
    'duelo', d.tipo,
    'resultado', d.estado,
    'ticks', d.ticks,
    'repasse', case when d.estado = 'derrota' and d.lider_id is not null and d.lider_id <> d.user_id
      then floor(d.taxa * 0.3)::bigint else 0 end,
    'quando', d.resolvido_em
  ) order by d.resolvido_em desc), '[]'::jsonb)
  from (
    select * from public.ginasio_desafio
    where ginasio_id = p_ginasio and estado <> 'aberto' and auth.uid() is not null
    order by resolvido_em desc
    limit 10
  ) d
$$;
revoke all on function public.historico_do_ginasio(text) from public, anon;
grant execute on function public.historico_do_ginasio(text) to authenticated;

create index if not exists ginasio_desafio_historico
  on public.ginasio_desafio (ginasio_id, resolvido_em desc) where estado <> 'aberto';

commit;
