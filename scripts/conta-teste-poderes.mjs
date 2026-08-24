// Da recursos ilimitados a CONTA DE TESTE, pra ela conseguir exercitar
// qualquer parte do jogo sem passar horas farmando.
//
//   node scripts/conta-teste-poderes.mjs           # mostra o que faria
//   node scripts/conta-teste-poderes.mjs --aplicar # aplica
//
// O QUE ELE DA: ouro e diamante em excesso, TODO item do catalogo no talo,
// todas as hunts e todos os grupos de gate abertos, nivel de treinador no
// teto, e um Entei MYTHIC nivel 100 com IV 31/31 nos seis atributos no time.
//
// ---------------------------------------------------------------------------
// A TRAVA DE SEGURANCA
// ---------------------------------------------------------------------------
// Este script escreve com `service_role`, que ignora RLS — ou seja, ele
// alcanca o save de QUALQUER jogador. A unica coisa entre ele e um desastre e
// a resolucao do alvo: o user_id sai SEMPRE de uma busca pelo email canonico
// (CONTA_TESTE_EMAIL do .env), e o script aborta se esse email nao terminar em
// `@teste.pokehunt.local`. Nao existe parametro pra passar um id ou um email
// diferente, de proposito — o mesmo raciocinio de scripts/conta-de-teste.js:
// jogador de verdade nunca tem email nesse dominio, entao nenhuma distracao
// consegue apontar isto pra uma conta real.
//
// ---------------------------------------------------------------------------
// POR QUE O ENTEI E MONTADO PELO MOTOR, E NAO POR INSERT NA MAO
// ---------------------------------------------------------------------------
// `createPokeInstance` (bundle `authority/engine/headless.js`) aplica a formula de
// atributo, a curva de EXP da especie, o learnset ate o nivel e os 4 golpes
// ativos padrao. Escrever a linha a mao significaria reimplementar isso tudo, e
// qualquer erro sairia como um POKE silenciosamente errado — atributo que nao
// bate com a raridade, barra de EXP travada, golpe faltando. Aqui so os campos
// que o usuario pediu sao forcados (nivel, raridade, IV maximo); o resto o
// motor deriva, igual a um POKE capturado de verdade.
//
// EXIGE `npm run build:engine` atualizado (o bundle e o que este script
// importa).
//
// ---------------------------------------------------------------------------
// RODE COM O JOGO FORA DE UMA HUNT
// ---------------------------------------------------------------------------
// A sessao de hunt e a unica escrita que regrava o SNAPSHOT INTEIRO do jogador
// (docs/04-autoridade-do-servidor.md): um flush disparado depois deste script,
// vindo de uma sessao aberta ANTES dele, sobrescreve tudo que foi dado aqui. O
// script recusa rodar se houver sessao aberta. Depois de aplicar, recarregue a
// aba — o cliente em memoria ainda tem o estado antigo.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverSchema, cabecalhosRest } from './lib/schema-alvo.cjs';
import { carregarMotor } from './lib/motor.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const DOMINIO = '@teste.pokehunt.local';
const EMAIL_PADRAO = `claude${DOMINIO}`;

// Generosos, nao maximos. `gold` e bigint no Postgres mas vira Number no
// cliente, e encostar em 2^53 faria aritmetica de ouro perder precisao em
// silencio — 1 bilhao ja e mais do que o jogo inteiro consegue gastar.
const OURO = 1_000_000_000;
const DIAMANTES = 1_000_000; // `diamonds` e int4; 1e6 esta longe do teto
const QTD_POR_ITEM = 99_999;
const NIVEL_DO_TREINADOR = 100;

const ESPECIE_PRESENTE = 'entei';
const NIVEL_PRESENTE = 100;
const RARIDADE_PRESENTE = 'mythic';
const IV_MAXIMO = 31;

function lerEnv() {
  const env = {};
  for (const linha of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
    const t = linha.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return env;
}

// Cabecalhos da Admin API de auth. NAO leva profile de schema: `auth.users`
// nao mora nem em `public` nem em `dev`, e o header seria ignorado.
function cabecalhos(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra,
  };
}

// Fixado uma vez em `main`, antes de qualquer chamada. Modulo-level porque as 5
// chamadas a `rest` sao todas do mesmo alvo — passar o schema em cada uma so
// daria mais lugar pra esquecer de passar.
let SCHEMA = null;

async function rest(env, caminho, init = {}) {
  if (!SCHEMA) throw new Error('rest() chamado antes de resolver o schema alvo');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: cabecalhosRest(env.SUPABASE_SERVICE_ROLE_KEY, SCHEMA, init.headers),
  });
  if (!res.ok) {
    console.error(`${init.method || 'GET'} ${caminho} falhou: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

async function acharConta(env, email) {
  // Pagina de verdade: a admin API tem teto proprio de `per_page`, e "veio
  // menos que o pedido" e o unico fim de lista confiavel.
  for (let pagina = 1; ; pagina++) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${pagina}&per_page=200`, {
      headers: cabecalhos(env),
    });
    if (!res.ok) {
      console.error(`falha ao listar usuarios: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const { users } = await res.json();
    const achou = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (achou) return achou;
    if (users.length < 200) return null;
  }
}

async function main() {
  const env = lerEnv();
  const email = env.CONTA_TESTE_EMAIL || EMAIL_PADRAO;
  if (!email.toLowerCase().endsWith(DOMINIO)) {
    console.error(`RECUSADO: CONTA_TESTE_EMAIL (${email}) nao esta em ${DOMINIO}.`);
    console.error('Este script escreve com service_role e so pode alcancar o dominio de teste.');
    process.exit(1);
  }

  const aplicar = process.argv.includes('--aplicar');
  SCHEMA = resolverSchema({ envSchema: env.SUPABASE_SCHEMA });
  console.log(`Banco:  ${env.SUPABASE_URL}`);
  console.log(`Schema: ${SCHEMA}`);
  console.log(`Conta:  ${email}`);
  const motor = await carregarMotor();
  const { createPokeInstance, createRng, totalExpForLevel, ITEMS, MAPS, FAIXAS, GRUPOS_DO_LANCE } = motor;

  const conta = await acharConta(env, email);
  if (!conta) {
    console.error(`Conta ${email} nao existe. Rode: npm run conta:criar`);
    process.exit(1);
  }
  const userId = conta.id;

  // Sessao de hunt aberta regrava o snapshot inteiro no proximo flush e
  // desfaria tudo isto sem erro nenhum aparecer.
  const abertas = await rest(env, `game_sessions?user_id=eq.${userId}&closed_at=is.null&select=id`);
  if (abertas.length > 0) {
    console.error(`RECUSADO: ${abertas.length} sessao(oes) de hunt aberta(s) nesta conta.`);
    console.error('Saia da hunt (ou espere fechar) e rode de novo — um flush sobrescreveria tudo.');
    process.exit(1);
  }

  const itens = Object.keys(ITEMS);
  const mapas = Object.keys(MAPS);
  const gates = [...new Set([...FAIXAS.map((f) => f.id), ...GRUPOS_DO_LANCE])];

  // Um Entei que ja atenda ao pedido significa que o script ja rodou — nao
  // empilha um segundo a cada execucao.
  const jaTem = await rest(
    env,
    `pokemon_instances?user_id=eq.${userId}&species_id=eq.${ESPECIE_PRESENTE}` +
    `&rarity=eq.${RARIDADE_PRESENTE}&level=eq.${NIVEL_PRESENTE}&iv_hp=eq.${IV_MAXIMO}&select=id,team_slot,location`,
  );

  const ocupados = await rest(env, `pokemon_instances?user_id=eq.${userId}&location=eq.team&select=team_slot`);
  const usados = new Set(ocupados.map((p) => p.team_slot));
  const slotLivre = [0, 1, 2, 3, 4, 5].find((s) => !usados.has(s));

  console.log(`Conta:    ${email}  (${userId})`);
  console.log(`Ouro:     ${OURO.toLocaleString('pt-BR')}`);
  console.log(`Diamante: ${DIAMANTES.toLocaleString('pt-BR')}`);
  console.log(`Itens:    ${itens.length} tipos x ${QTD_POR_ITEM.toLocaleString('pt-BR')}`);
  console.log(`Hunts:    ${mapas.length} abertas`);
  console.log(`Gates:    ${gates.join(', ')}`);
  console.log(`Treinador: nivel ${NIVEL_DO_TREINADOR}`);
  console.log(
    jaTem.length > 0
      ? `Entei:    ja existe (${jaTem.length}) — nao cria outro`
      : slotLivre === undefined
        ? 'Entei:    time CHEIO — vai pra mochila (location=bag)'
        : `Entei:    novo, ${RARIDADE_PRESENTE} Lv${NIVEL_PRESENTE}, IV ${IV_MAXIMO}/${IV_MAXIMO}, slot ${slotLivre}`,
  );

  if (!aplicar) {
    console.log('\n(simulacao — rode com --aplicar pra valer)');
    return;
  }

  await rest(env, `players?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      gold: OURO,
      diamonds: DIAMANTES,
      trainer_level: NIVEL_DO_TREINADOR,
      // A EXP tem que ser exatamente a base do nivel, na mesma curva que
      // `progressionSystem.ts#TRAINER_GROWTH_CURVE` usa. Um numero solto aqui
      // deixaria a barra de progresso negativa ou passando de 100%.
      trainer_exp: totalExpForLevel(NIVEL_DO_TREINADOR, 'MEDIUM_SLOW'),
      unlocked_maps: mapas,
      unlocked_continents: gates,
    }),
  });

  await rest(env, 'player_items?on_conflict=user_id,item_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(itens.map((id) => ({ user_id: userId, item_id: id, quantity: QTD_POR_ITEM }))),
  });

  if (jaTem.length === 0) {
    const ivs = { hp: IV_MAXIMO, atkFis: IV_MAXIMO, atkEsp: IV_MAXIMO, def: IV_MAXIMO, defEsp: IV_MAXIMO, speed: IV_MAXIMO };
    const poke = createPokeInstance(createRng(1), ESPECIE_PRESENTE, NIVEL_PRESENTE, { ivs, rarity: RARIDADE_PRESENTE });
    const naMochila = slotLivre === undefined;
    await rest(env, 'pokemon_instances', {
      method: 'POST',
      body: JSON.stringify({
        // O uid do motor e um contador de modulo ('poke-1'); no banco a chave e
        // um uuid de verdade, e e ele que vira o uid do jogo na carga
        // (playerMapper.ts#rowToPoke).
        id: randomUUID(),
        user_id: userId,
        species_id: poke.speciesId,
        location: naMochila ? 'bag' : 'team',
        team_slot: naMochila ? null : slotLivre,
        level: poke.level,
        exp: poke.exp,
        hp: Math.round(poke.hp),
        is_shiny: poke.isShiny,
        rarity: poke.rarity,
        // Travado: um presente que a venda em massa ou o auto-sell possa levar
        // embora por acidente nao serve pra testar nada.
        locked: true,
        original_trainer: null,
        iv_hp: poke.ivs.hp, iv_atk_fis: poke.ivs.atkFis, iv_atk_esp: poke.ivs.atkEsp,
        iv_def: poke.ivs.def, iv_def_esp: poke.ivs.defEsp, iv_speed: poke.ivs.speed,
        stat_hp: poke.stats.hp, stat_atk_fis: poke.stats.atkFis, stat_atk_esp: poke.stats.atkEsp,
        stat_def: poke.stats.def, stat_def_esp: poke.stats.defEsp, stat_speed: poke.stats.speed,
        unlocked_abilities: poke.unlockedAbilities,
        active_abilities: poke.activeAbilities ?? null,
        disabled_abilities: {},
        status: null,
        status_turns: null,
      }),
    });
    console.log(`\nEntei criado: Lv${poke.level}, HP ${poke.stats.hp}, ATQ ${poke.stats.atkFis}, ` +
      `VEL ${poke.stats.speed}${poke.isShiny ? ', SHINY' : ''}`);
    console.log(`Golpes ativos: ${(poke.activeAbilities ?? []).join(', ')}`);
  }

  console.log('\nAplicado. RECARREGUE a aba do jogo — o cliente em memoria ainda tem o estado antigo.');
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
