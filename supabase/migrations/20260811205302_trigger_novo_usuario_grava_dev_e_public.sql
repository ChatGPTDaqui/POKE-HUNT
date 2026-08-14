create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'trainer_name', '')), '');
  escolhido_public text;
  escolhido_dev text;
begin
  escolhido_public := coalesce(pedido, 'Treinador');
  if exists (select 1 from public.players where lower(trainer_name) = lower(escolhido_public)) then
    escolhido_public := escolhido_public || '#' || left(new.id::text, 4);
  end if;
  insert into public.players (user_id, trainer_name, unlocked_maps)
  values (new.id, escolhido_public, public.hunts_iniciais());
  insert into public.player_items (user_id, item_id, quantity)
  select new.id, c.item_id, c.quantity from public.concessao_inicial_de_itens() c;

  escolhido_dev := coalesce(pedido, 'Treinador');
  if exists (select 1 from dev.players where lower(trainer_name) = lower(escolhido_dev)) then
    escolhido_dev := escolhido_dev || '#' || left(new.id::text, 4);
  end if;
  insert into dev.players (user_id, trainer_name, unlocked_maps)
  values (new.id, escolhido_dev, dev.hunts_iniciais());
  insert into dev.player_items (user_id, item_id, quantity)
  select new.id, c.item_id, c.quantity from dev.concessao_inicial_de_itens() c;

  return new;
end;
$$;
