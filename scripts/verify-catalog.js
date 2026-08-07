// Confere o catalogo migrado por VALOR, nao so por contagem — contagem certa
// com dado errado e o modo de falha classico de import em lote.
// Fecha tambem o ciclo do bloqueio que motivou a migracao: um insert real de
// progresso (pokemon_instances / player_items) precisa passar.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

async function rest(pathname, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const out = [];
const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

async function main() {
  // --- species: stats reais do Charizard (Gen2: 78/84/78/109/85/100) ---
  const charizard = (await rest('species?id=eq.charizard&select=*')).body?.[0];
  check('charizard existe', Boolean(charizard));
  if (charizard) {
    check('charizard stats base corretos',
      charizard.base_hp === 78 && charizard.base_atk_fis === 84 && charizard.base_def === 78 &&
      charizard.base_atk_esp === 109 && charizard.base_def_esp === 85 && charizard.base_speed === 100,
      `${charizard.base_hp}/${charizard.base_atk_fis}/${charizard.base_def}/${charizard.base_atk_esp}/${charizard.base_def_esp}/${charizard.base_speed}`);
    check('charizard tipos e dex', charizard.type1 === 'FIRE' && charizard.type2 === 'FLYING' && charizard.dex_number === 6,
      `${charizard.type1}/${charizard.type2} #${charizard.dex_number}`);
    check('charizard altura (hand-authored)', charizard.height_m === 1.7, String(charizard.height_m));
  }

  // --- cadeia de evolucao (FK auto-referente resolvida no 2o passe) ---
  const charmander = (await rest('species?id=eq.charmander&select=id,evolves_to,evolves_at_level')).body?.[0];
  check('evolucao normal ligada', charmander?.evolves_to === 'charmeleon' && charmander?.evolves_at_level === 16,
    `${charmander?.evolves_to} @${charmander?.evolves_at_level}`);

  // --- evolucao especial (patch hand-authored: nivel 80 + Stones) ---
  const kadabra = (await rest('species?id=eq.kadabra&select=id,evolves_to,evolves_at_level,is_special_evolution')).body?.[0];
  check('evolucao especial marcada',
    kadabra?.evolves_to === 'alakazam' && kadabra?.evolves_at_level === 80 && kadabra?.is_special_evolution === true,
    `${kadabra?.evolves_to} @${kadabra?.evolves_at_level} special=${kadabra?.is_special_evolution}`);

  const specials = (await rest('species?is_special_evolution=eq.true&select=id')).body || [];
  check('9 evolucoes especiais', specials.length === 9, `${specials.length}: ${specials.map((s) => s.id).join(',')}`);

  const legend = (await rest('species?is_legendary=eq.true&select=id')).body || [];
  check('11 lendarios marcados', legend.length === 11, `${legend.length}`);

  // --- items: os dois bugs que a auditoria apontou ---
  const maxPotion = (await rest('items?id=eq.max_potion&select=*')).body?.[0];
  check('max_potion heals_full=true e heal_amount=null',
    maxPotion?.heals_full === true && maxPotion?.heal_amount === null,
    `heals_full=${maxPotion?.heals_full} heal_amount=${maxPotion?.heal_amount}`);

  const potion = (await rest('items?id=eq.potion&select=*')).body?.[0];
  check('potion normal com heal_amount numerico', potion?.heal_amount === 20 && potion?.heals_full === false,
    `heal=${potion?.heal_amount}`);

  const revive = (await rest('items?id=eq.revive&select=*')).body?.[0];
  const maxRevive = (await rest('items?id=eq.max_revive&select=*')).body?.[0];
  check('revive_hp_percent gravado', Number(revive?.revive_hp_percent) === 0.5 && Number(maxRevive?.revive_hp_percent) === 1,
    `revive=${revive?.revive_hp_percent} max=${maxRevive?.revive_hp_percent}`);

  const stone = (await rest('items?id=eq.stone_fire&select=*')).body?.[0];
  check('stone com stone_type e kind corretos',
    stone?.kind === 'stone' && stone?.stone_type === 'FIRE',
    `${stone?.kind}/${stone?.stone_type}`);
  const stones = (await rest('items?kind=eq.stone&select=id')).body || [];
  check('17 stones', stones.length === 17, String(stones.length));

  // --- moves: colunas que nunca foram sincronizadas ---
  const swift = (await rest('moves?id=eq.swift&select=*')).body?.[0];
  check('always_hits gravado (swift)', swift?.always_hits === true, String(swift?.always_hits));
  const takeDown = (await rest('moves?id=eq.take_down&select=*')).body?.[0];
  check('recoil_fraction gravado (take_down)', Number(takeDown?.recoil_fraction) === 0.25, String(takeDown?.recoil_fraction));
  const quick = (await rest('moves?id=eq.quick_attack&select=*')).body?.[0];
  check('priority gravado (quick_attack)', quick?.priority === 1, String(quick?.priority));
  const guillotine = (await rest('moves?id=eq.guillotine&select=*')).body?.[0];
  check('accuracy real gravada (guillotine=30)', guillotine?.accuracy === 30, String(guillotine?.accuracy));

  const earthquake = (await rest('moves?id=eq.earthquake&select=id,target,aoe_radius')).body?.[0];
  check('AOE marcado com raio (earthquake)', earthquake?.target === 'aoe' && Number(earthquake?.aoe_radius) === 240,
    `${earthquake?.target}/${earthquake?.aoe_radius}`);
  const pound = (await rest('moves?id=eq.pound&select=id,target,aoe_radius')).body?.[0];
  check('single sem raio (pound)', pound?.target === 'single' && pound?.aoe_radius === null,
    `${pound?.target}/${pound?.aoe_radius}`);

  // --- type_chart: 17x17 e so multiplicadores validos ---
  const mults = (await rest('type_chart?select=multiplier')).body || [];
  const distintos = [...new Set(mults.map((m) => Number(m.multiplier)))].sort((a, b) => a - b);
  check('type_chart 289 linhas (17x17)', mults.length === 289, String(mults.length));
  check('multiplicadores validos', distintos.every((m) => [0, 0.5, 1, 2].includes(m)), JSON.stringify(distintos));

  // --- formulas: a descricao que so existia no .xlsx ---
  const dmg = (await rest('formulas?key=eq.DAMAGE_BASE&select=*')).body?.[0];
  check('formula com expressao e variaveis',
    dmg?.expression?.includes('floor') && Array.isArray(dmg?.variables) && dmg.variables.length === 4,
    `vars=${JSON.stringify(dmg?.variables)}`);
  check('descricao da formula preservada', Boolean(dmg?.description), (dmg?.description || '').slice(0, 40));

  // --- maps / encounters ---
  const route46 = (await rest('maps?id=eq.route_46&select=*')).body?.[0];
  check('hunt inicial existe', Boolean(route46), `${route46?.name} lv${route46?.min_level}-${route46?.max_level}`);
  const semNightmare = (await rest('maps?continent=not.in.(johto,kanto)&select=id')).body || [];
  check('nenhuma hunt nightmare no banco', semNightmare.length === 0, String(semNightmare.length));
  const encRoute46 = (await rest('map_encounters?map_id=eq.route_46&select=species_id,weight')).body || [];
  check('encontros da hunt inicial', encRoute46.length === 3,
    encRoute46.map((e) => `${e.species_id}:${e.weight}`).join(' '));

  // --- species_moves aponta so pra moves existentes ---
  const smSample = (await rest('species_moves?species_id=eq.charmander&select=move_id,level_req&order=level_req')).body || [];
  check('moveset do charmander', smSample.length > 0, `${smSample.length} golpes, 1o=${smSample[0]?.move_id}@${smSample[0]?.level_req}`);

  // --- O TESTE QUE FECHA O CICLO: FK de progresso desbloqueada ---
  const player = (await rest('players?select=user_id&limit=1')).body?.[0];
  if (!player) {
    check('insert de progresso desbloqueado', false, 'nenhum jogador para testar');
  } else {
    const poke = await rest('pokemon_instances', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: player.user_id, species_id: 'charmander', location: 'bag',
        level: 5, exp: 0, hp: 20, is_shiny: false, rarity: 'comum',
        iv_hp: 10, iv_atk_fis: 10, iv_atk_esp: 10, iv_def: 10, iv_def_esp: 10, iv_speed: 10,
        stat_hp: 20, stat_atk_fis: 10, stat_atk_esp: 10, stat_def: 10, stat_def_esp: 10, stat_speed: 10,
        unlocked_abilities: ['scratch'],
      }),
    });
    check('insert de pokemon_instances passa (antes dava 23503)', poke.status < 400,
      `status=${poke.status}${poke.status >= 400 ? ' ' + JSON.stringify(poke.body).slice(0, 120) : ''}`);

    const item = await rest('player_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: player.user_id, item_id: 'potion', quantity: 5 }),
    });
    check('insert de player_items passa', item.status < 400, `status=${item.status}`);

    // limpeza — o banco volta ao estado anterior ao teste
    if (poke.status < 400 && poke.body?.[0]?.id) {
      await rest(`pokemon_instances?id=eq.${poke.body[0].id}`, { method: 'DELETE' });
    }
    if (item.status < 400) {
      await rest(`player_items?user_id=eq.${player.user_id}&item_id=eq.potion`, { method: 'DELETE' });
    }
    const sobrou = (await rest(`pokemon_instances?user_id=eq.${player.user_id}&select=id`)).body || [];
    check('limpeza: linhas de teste removidas', sobrou.length === 0, `restaram=${sobrou.length}`);
  }

  const fails = out.filter((o) => !o).length;
  console.log(`\n=== ${out.length - fails}/${out.length} PASS ===`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error('erro:', e.message); process.exit(1); });
