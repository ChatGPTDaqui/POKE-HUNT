-- Mural de lideres (24/10/2026, pedido do dono): quem lidera cada ginasio agora
-- e o hall da fama (defesas vencidas e mandatos, de `player_contador`). So o
-- que ja e publico: nome do treinador, ginasio, mandato e os dois numeros.

begin;

create or replace function public.mural_de_lideres()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  return jsonb_build_object(
    'atuais', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ginasioId', l.ginasio_id, 'liderId', l.lider_id, 'liderNome', l.lider_nome, 'mandatoAte', l.mandato_ate
      ) order by g.faixa desc, g.tipo)
      from public.ginasio_lider l join public.ginasio g on g.id = l.ginasio_id
      where l.lider_id is not null
    ), '[]'::jsonb),
    'hall', coalesce((
      select jsonb_agg(h order by (h->>'defesas')::bigint desc, (h->>'mandatos')::bigint desc, h->>'nome')
      from (
        select jsonb_build_object(
          'userId', p.user_id, 'nome', p.trainer_name,
          'defesas', coalesce(sum(c.valor) filter (where c.chave = 'ginasio_defesas'), 0),
          'mandatos', coalesce(sum(c.valor) filter (where c.chave = 'ginasio_mandatos'), 0),
          'ginasiosAtuais', (select count(*) from public.ginasio_lider l where l.lider_id = p.user_id)
        ) as h
        from public.player_contador c join public.players p on p.user_id = c.user_id
        where c.chave in ('ginasio_defesas', 'ginasio_mandatos')
        group by p.user_id, p.trainer_name
        order by coalesce(sum(c.valor) filter (where c.chave = 'ginasio_defesas'), 0) desc,
          coalesce(sum(c.valor) filter (where c.chave = 'ginasio_mandatos'), 0) desc
        limit 10
      ) t
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.mural_de_lideres() from public, anon;
grant execute on function public.mural_de_lideres() to authenticated;

-- O hall le so duas chaves de player_contador (tabela de todos os contadores).
create index if not exists player_contador_lideranca
  on public.player_contador (chave, user_id) where chave in ('ginasio_defesas', 'ginasio_mandatos');

commit;
