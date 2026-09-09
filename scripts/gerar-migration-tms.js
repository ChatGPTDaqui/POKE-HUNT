// PH-512: gera catálogo e RPCs nos dois schemas sem acesso remoto.
const fs = require('fs');
const path = require('path');
const fonte = require('./usum/maquinas.json');
const catalogo = require('./usum/catalog.json');
const extra = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/generated/golpesTm.generated.ts'), 'utf8').split(' = ')[1]);
const nomes = Object.fromEntries(catalogo.golpes.map(g => [g.chave, g.nome]));
for (const g of Object.values(extra)) nomes[g.id] = g.name;
const q = s => "'" + s.replaceAll("'", "''") + "'";
let sql = '-- PH-512. Gerado por node scripts/gerar-migration-tms.js.\n';
for (const schema of ['public', 'dev']) {
  sql += `
create table ${schema}.maquinas (
  item_id text primary key references ${schema}.items(id),
  golpe text not null unique,
  especies text[] not null
);
alter table ${schema}.maquinas enable row level security;
create policy leitura_maquinas on ${schema}.maquinas for select using (true);
grant select on ${schema}.maquinas to authenticated, anon;
grant all on ${schema}.maquinas to service_role;
-- O preço de venda é independente; buy_price continua NULL, logo comprar_item recusa.
alter table ${schema}.items alter column sell_price set expression as (
  case when kind = 'tm' then 1000 when kind = 'stone' then 500
  when kind in ('ball','potion','status_heal') then greatest(1, round(greatest(1, round(buy_price * 0.3)) * 0.5))
  else greatest(1, round(buy_price * 0.5)) end
);
create function ${schema}.preservar_golpes_de_maquina() returns trigger
language plpgsql set search_path=${schema},pg_temp as $$
begin
  new.golpes_de_maquina := array(select distinct g from unnest(old.golpes_de_maquina || coalesce(new.golpes_de_maquina,'{}')) g order by g);
  return new;
end;
$$;
create trigger preservar_golpes_de_maquina before update of golpes_de_maquina on ${schema}.pokemon_instances
  for each row execute function ${schema}.preservar_golpes_de_maquina();
`;
  for (const tm of fonte.tms) {
    const id = `tm_${String(tm.numero).padStart(2, '0')}`;
    const nome = `TM${String(tm.numero).padStart(2, '0')} — ${nomes[tm.golpe]}`;
    if (!nomes[tm.golpe]) throw new Error(`Sem golpe ${tm.golpe}`);
    const especies = Object.keys(fonte.especies).filter(e => fonte.especies[e].tm.includes(tm.numero));
    sql += `insert into ${schema}.items(id,name,kind,description,buy_price) values (${q(id)},${q(nome)},'tm',${q(`Ensina ${nomes[tm.golpe]} permanentemente. Consumida ao usar.`)},null) on conflict(id) do update set name=excluded.name, kind=excluded.kind, description=excluded.description, buy_price=null;\n`;
    sql += `insert into ${schema}.maquinas values (${q(id)},${q(tm.golpe)},array[${especies.map(q).join(',')}]::text[]);\n`;
  }
  sql += `
create function ${schema}.ensinar_tm(p_item_id text, p_poke_id uuid) returns jsonb
language plpgsql security definer set search_path = ${schema}, pg_temp as $$
declare
  usuario uuid := auth.uid();
  maquina ${schema}.maquinas;
  poke ${schema}.pokemon_instances;
begin
  if usuario is null then raise exception 'Não autenticado' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtext(usuario::text));
  if exists(select 1 from ${schema}.game_sessions where user_id=usuario and (closed_at is null or flushing_since > now()-interval '2 minutes')) then
    raise exception 'Volte ao Hospital antes de ensinar uma TM.';
  end if;
  select * into maquina from ${schema}.maquinas where item_id=p_item_id;
  if not found then raise exception 'TM desconhecida.'; end if;
  select * into poke from ${schema}.pokemon_instances where id=p_poke_id and user_id=usuario and location in ('team','bag') for update;
  if not found then raise exception 'POKE não pertence à sua equipe ou mochila.'; end if;
  if not (poke.species_id=any(maquina.especies)) then raise exception 'Este POKE não aprende esta TM.'; end if;
  if maquina.golpe=any(poke.golpes_de_maquina) then
    return jsonb_build_object('ok',true,'mensagem','Este POKE já aprendeu esta TM. Nenhum item consumido.');
  end if;
  if exists(select 1 from ${schema}.species_moves where species_id=poke.species_id and move_id=maquina.golpe and level_req<=poke.level) then
    raise exception 'Este POKE já conhece o golpe.';
  end if;
  update ${schema}.player_items set quantity=quantity-1,updated_at=now()
    where user_id=usuario and item_id=p_item_id and quantity>0 and not locked;
  if not found then raise exception 'TM ausente ou trancada.'; end if;
  update ${schema}.pokemon_instances set
    golpes_de_maquina=array_append(golpes_de_maquina,maquina.golpe),
    unlocked_abilities=array_append(coalesce(unlocked_abilities,'{}'),maquina.golpe)
    where id=p_poke_id;
  update ${schema}.players set updated_at=now() where user_id=usuario;
  return jsonb_build_object('ok',true,'mensagem','TM consumida. Golpe aprendido permanentemente; selecione-o na ficha do POKE.');
end;
$$;
revoke all on function ${schema}.ensinar_tm(text,uuid) from public,anon;
grant execute on function ${schema}.ensinar_tm(text,uuid) to authenticated;

create table ${schema}.creditos_tm (
  user_id uuid not null references ${schema}.players(user_id) on delete cascade,
  origem text not null,
  item_id text not null references ${schema}.maquinas(item_id),
  primary key(user_id,origem,item_id)
);
alter table ${schema}.creditos_tm enable row level security;
grant all on ${schema}.creditos_tm to service_role;
create function ${schema}.creditar_drop_tm(p_user_id uuid,p_item_id text,p_qtd integer,p_origem text)
returns void language plpgsql security definer set search_path=${schema},pg_temp as $$
begin
  if p_qtd is null or p_qtd<=0 or p_qtd>1000000 or p_origem is null then raise exception 'Crédito inválido'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  insert into ${schema}.creditos_tm values(p_user_id,p_origem,p_item_id) on conflict do nothing;
  if not found then return; end if;
  insert into ${schema}.player_items(user_id,item_id,quantity) values(p_user_id,p_item_id,p_qtd)
    on conflict(user_id,item_id) do update set quantity=${schema}.player_items.quantity+excluded.quantity,updated_at=now();
end;
$$;
revoke all on function ${schema}.creditar_drop_tm(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function ${schema}.creditar_drop_tm(uuid,text,integer,text) to service_role;
`;
}
fs.writeFileSync(path.join(__dirname, '../supabase/migrations/20260909010100_catalogo_e_ensino_tm.sql'), sql);
