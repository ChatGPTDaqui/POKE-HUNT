-- Executado exclusivamente no Postgres descartável do check de schema.
begin;
do $$
declare
  s text;
  dono uuid := '05120000-0000-4000-8000-000000000001';
  comprador uuid := '05120000-0000-4000-8000-000000000002';
  poke uuid := '05120000-0000-4000-8000-000000000003';
  qtd integer;
  ouro bigint;
  conhecido boolean;
  recusou boolean;
begin
  -- Catálogo mínimo para o provisionamento normal das contas fictícias.
  foreach s in array array['public','dev'] loop
    execute format('insert into %I.items(id,name,kind,buy_price,heal_amount,revive_hp_percent) values(''poke_ball'',''Bola fixture'',''ball'',200,null,null),(''potion'',''Poção fixture'',''potion'',300,20,null),(''revive'',''Revive fixture'',''revive'',1500,null,0.5) on conflict do nothing',s);
  end loop;
  insert into auth.users(id,raw_user_meta_data) values(dono,'{"trainer_name":"TM Fixture A"}'),(comprador,'{"trainer_name":"TM Fixture B"}');
  foreach s in array array['public','dev'] loop
    execute format('insert into %I.players(user_id,trainer_name,gold) values($1,''TM Fixture A'',100000),($2,''TM Fixture B'',100000) on conflict(user_id) do update set gold=100000',s) using dono,comprador;
    execute format('insert into %I.spawn_tiers(key,weight,sort_order) values(''raro'',5,4)',s);
    execute format('insert into %I.species(id,dex_number,name,type1,base_hp,base_atk_fis,base_atk_esp,base_def,base_def_esp,base_speed,catch_rate,base_exp,growth_curve,spawn_tier) values(''charizard'',6,''Charizard'',''FIRE'',78,84,109,78,85,100,45,240,''MEDIUM_SLOW'',''raro'')',s);
    execute format('insert into %I.pokemon_instances(id,user_id,species_id,location,level,hp,iv_hp,iv_atk_fis,iv_atk_esp,iv_def,iv_def_esp,iv_speed,stat_hp,stat_atk_fis,stat_atk_esp,stat_def,stat_def_esp,stat_speed) values($1,$2,''charizard'',''bag'',60,100,15,15,15,15,15,15,100,100,100,100,100,100)',s) using poke,dono;
  end loop;
  foreach s in array array['public','dev'] loop
    execute format('select %I.creditar_drop_tm($1,''tm_26'',4,''fixture'')',s) using dono;
    execute format('select %I.creditar_drop_tm($1,''tm_26'',4,''fixture'')',s) using dono;
    execute format('select quantity from %I.player_items where user_id=$1 and item_id=''tm_26''',s) into qtd using dono;
    assert qtd=4, 'Crédito duplicado';
    perform set_config('request.jwt.claim.sub',dono::text,true);
    execute format('select %I.ensinar_tm(''tm_26'',$1)',s) using poke;
    execute format('select %I.ensinar_tm(''tm_26'',$1)',s) using poke;
    execute format('select quantity from %I.player_items where user_id=$1 and item_id=''tm_26''',s) into qtd using dono;
    assert qtd=3, 'Ensino repetido consumiu outra TM';
    execute format('update %I.pokemon_instances set golpes_de_maquina=''{}'',unlocked_abilities=''{}'' where id=$1',s) using poke;
    execute format('select ''earthquake''=any(golpes_de_maquina) from %I.pokemon_instances where id=$1',s) into conhecido using poke;
    assert conhecido, 'Flush apagou golpe permanente';
    execute format('select %I.definir_golpes_ativos($1,array[''earthquake''])',s) using poke;
    execute format('select ''earthquake''=any(active_abilities) from %I.pokemon_instances where id=$1',s) into conhecido using poke;
    assert conhecido, 'Golpe ensinado não pôde ser equipado';
    recusou := false;
    begin execute format('select %I.comprar_item(''tm_26'',1)',s); exception when others then recusou := true; end;
    assert recusou, 'NPC vendeu TM';
    execute format('select %I.vender_item(''tm_26'',1)',s);
    execute format('select gold from %I.players where user_id=$1',s) into ouro using dono;
    assert ouro=101000, 'Preço de venda incorreto';
    execute format('select %I.criar_ordem_mercado(''tm_26'',''venda'',2000,1)',s);
    perform set_config('request.jwt.claim.sub',comprador::text,true);
    recusou := false;
    begin execute format('select %I.ensinar_tm(''tm_26'',$1)',s) using poke; exception when others then recusou := true; end;
    assert recusou, 'Ensinou em POKE de outro jogador';
    execute format('select %I.criar_ordem_mercado(''tm_26'',''compra'',2000,1)',s);
    execute format('select quantity from %I.player_items where user_id=$1 and item_id=''tm_26''',s) into qtd using comprador;
    assert qtd=1, 'Mercado não entregou TM';
    assert not has_function_privilege('authenticated',format('%I.creditar_drop_tm(uuid,text,integer,text)',s),'execute'), 'Jogador pode fabricar drop';
  end loop;
end $$;
rollback;
