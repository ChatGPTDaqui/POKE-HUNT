-- Recompensas por nível de treinador (10/10/2026).
--
-- `reivindicar_niveis_de_treinador()` paga, numa chamada, todo marco já
-- alcançado e ainda não coletado (marco a cada 5 níveis até o 100, a cada 25
-- até o 1000). Idempotência por `recompensa_concedida` (chave `nivel:<n>`),
-- mesma tabela dos Primeiros Passos. Conta antiga coleta o retroativo
-- (decisão do dono). O cliente liquida a caçada antes de chamar, para o
-- nível recém-subido já estar gravado.
begin;

create or replace function public.reivindicar_niveis_de_treinador()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  -- Lista gerada de src/data/recompensasDeNivel.ts (MARCOS_DE_TREINADOR).
  -- recompensasDeNivel.test.ts reprova se divergir do cliente.
  v_marcos jsonb := '[
    {"nivel":5,"ouro":625,"itens":[{"itemId":"great_ball","quantidade":25}]},
    {"nivel":10,"ouro":1500,"itens":[{"itemId":"great_ball","quantidade":25}]},
    {"nivel":15,"ouro":2625,"itens":[{"itemId":"great_ball","quantidade":25}]},
    {"nivel":20,"ouro":4000,"itens":[{"itemId":"great_ball","quantidade":25}]},
    {"nivel":25,"ouro":5625,"itens":[{"itemId":"great_ball","quantidade":25},{"itemId":"revive","quantidade":3}]},
    {"nivel":30,"ouro":7500,"itens":[{"itemId":"ultra_ball","quantidade":25}]},
    {"nivel":35,"ouro":9625,"itens":[{"itemId":"ultra_ball","quantidade":25}]},
    {"nivel":40,"ouro":12000,"itens":[{"itemId":"ultra_ball","quantidade":25}]},
    {"nivel":45,"ouro":14625,"itens":[{"itemId":"ultra_ball","quantidade":25}]},
    {"nivel":50,"ouro":17500,"itens":[{"itemId":"ultra_ball","quantidade":25},{"itemId":"revive","quantidade":3}]},
    {"nivel":55,"ouro":20625,"itens":[{"itemId":"ultra_ball","quantidade":25}]},
    {"nivel":60,"ouro":24000,"itens":[{"itemId":"ultra_ball","quantidade":25}]},
    {"nivel":65,"ouro":27625,"itens":[{"itemId":"ultra_ball","quantidade":50}]},
    {"nivel":70,"ouro":31500,"itens":[{"itemId":"ultra_ball","quantidade":50}]},
    {"nivel":75,"ouro":35625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"revive","quantidade":3}]},
    {"nivel":80,"ouro":40000,"itens":[{"itemId":"ultra_ball","quantidade":50}]},
    {"nivel":85,"ouro":44625,"itens":[{"itemId":"ultra_ball","quantidade":50}]},
    {"nivel":90,"ouro":49500,"itens":[{"itemId":"ultra_ball","quantidade":50}]},
    {"nivel":95,"ouro":54625,"itens":[{"itemId":"ultra_ball","quantidade":50}]},
    {"nivel":100,"ouro":60000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"revive","quantidade":3}]},
    {"nivel":125,"ouro":90625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":150,"ouro":127500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":175,"ouro":170625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":200,"ouro":220000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":225,"ouro":275625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":250,"ouro":337500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":275,"ouro":405625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":300,"ouro":480000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":325,"ouro":560625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":350,"ouro":647500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":375,"ouro":740625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":400,"ouro":840000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":425,"ouro":945625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":450,"ouro":1057500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":475,"ouro":1175625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":500,"ouro":1300000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":525,"ouro":1430625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":550,"ouro":1567500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":575,"ouro":1710625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":600,"ouro":1860000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":625,"ouro":2015625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":650,"ouro":2177500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":675,"ouro":2345625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":700,"ouro":2520000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":725,"ouro":2700625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":750,"ouro":2887500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":775,"ouro":3080625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":800,"ouro":3280000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":825,"ouro":3485625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":850,"ouro":3697500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":875,"ouro":3915625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":900,"ouro":4140000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":925,"ouro":4370625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":950,"ouro":4607500,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":975,"ouro":4850625,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]},
    {"nivel":1000,"ouro":5100000,"itens":[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]}
  ]';
  v_nivel int;
  v_marco jsonb;
  v_item jsonb;
  v_ouro bigint := 0;
  v_coletados int := 0;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  -- Lock ANTES da leitura (mesmo motivo de reivindicar_passo).
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select trainer_level into v_nivel from public.players where user_id = v_user_id;
  if v_nivel is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  for v_marco in select * from jsonb_array_elements(v_marcos) loop
    continue when (v_marco->>'nivel')::int > v_nivel;
    -- O marcador é quem impede pagar duas vezes: só segue quando inseriu.
    insert into public.recompensa_concedida (user_id, chave)
    values (v_user_id, 'nivel:' || (v_marco->>'nivel'))
    on conflict do nothing;
    continue when not found;

    v_coletados := v_coletados + 1;
    v_ouro := v_ouro + (v_marco->>'ouro')::bigint;
    for v_item in select * from jsonb_array_elements(v_marco->'itens') loop
      insert into public.player_items (user_id, item_id, quantity)
      values (v_user_id, v_item->>'itemId', (v_item->>'quantidade')::int)
      on conflict (user_id, item_id) do update
        set quantity = public.player_items.quantity + excluded.quantity, updated_at = now();
    end loop;
  end loop;

  if v_coletados = 0 then
    raise exception 'Nenhuma recompensa de nivel pendente.' using errcode = 'P0001';
  end if;

  -- SEMPRE toca players (mesmo motivo de reivindicar_passo): o trigger avança
  -- updated_at e o flush da caçada relê o inventário em vez de gravar por cima.
  update public.players set gold = gold + v_ouro where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s recompensa(s) de treinador coletada(s).', v_coletados));
end;
$$;

revoke all on function public.reivindicar_niveis_de_treinador() from public;
revoke execute on function public.reivindicar_niveis_de_treinador() from anon;
grant execute on function public.reivindicar_niveis_de_treinador() to authenticated;

commit;
