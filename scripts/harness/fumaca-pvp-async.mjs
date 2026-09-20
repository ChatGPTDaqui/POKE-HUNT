// Fumaca do PvP ranqueado ASSINCRONO (PH-565), contra o ambiente remoto de
// um schema.
//
//   node scripts/harness/fumaca-pvp-async.mjs                  # dev (jogo-dev)
//   node scripts/harness/fumaca-pvp-async.mjs --schema=public --confirmar-public
//
// O que prova, na ordem:
//   1. as duas contas de teste (A = claude@, B = ph46-amigo2@) tem POKEs e
//      presets: A com ataque ativo (slot 1 com kit proprio), B com defesa ativa;
//   2. A ataca (`atacar_ranqueado`) e pareia com B mesmo B OFFLINE: sessao
//      `ranqueado`, convidado = B, snapshot da DEFESA de B, snapshot de A com
//      `golpes_escolhidos`, partidas_hoje de A +1 e de B intacto;
//   3. a Edge `/pvp/resolver` devolve vencedor e semente; a arena rodada aqui
//      (motor headless) chega ao mesmo veredito; o POKE do slot 1 luta com o
//      kit do preset;
//   4. o historico grava delta do DEFENSOR pela metade (|convidado| <= 12 e
//      <= |anfitriao|, sinais opostos) e B enxerga a linha como convidado;
//   5. cooldown: o segundo ataque de A nao repete B — com so B na faixa, cai
//      no bot (`ranqueado_bot`, sem PDL, partidas_hoje +1);
//   6. limite diario: com partidas_hoje = 5, `atacar_ranqueado` recusa.
//
// Escreve so nas contas de teste. Pra isolar a faixa de MMR (em public ha
// jogadores reais em ~1000), A e B sao postos em MMR 9000 durante a fumaca e
// restaurados no fim; as sessoes ranqueadas de A sao apagadas antes pra
// zerar o cooldown.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { carregarMotor } from '../lib/motor.mjs'
import { resolverSchema, cabecalhosRest } from '../lib/schema-alvo.cjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTAS = {
  A: { email: 'claude@teste.pokehunt.local', nome: 'ClaudeTeste' },
  B: { email: 'ph46-amigo2@teste.pokehunt.local', nome: 'Amigo2Teste' },
}
const MMR_ISOLADO = 9000
const TIME_DE_FUMACA = ['dragonite', 'tyranitar', 'salamence', 'metagross', 'gengar', 'machamp']

function lerEnv(caminho) {
  if (!existsSync(caminho)) return {}
  const env = {}
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const env = lerEnv(join(RAIZ, '.env'))
const local = lerEnv(join(RAIZ, '.env.local'))
const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL
const ANON = local.VITE_SUPABASE_ANON_KEY
const SERVICO = env.SUPABASE_SERVICE_ROLE_KEY
const SENHA = env.CONTA_TESTE_SENHA
if (!URL_BASE || !ANON || !SERVICO || !SENHA) {
  console.error('Faltando SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / CONTA_TESTE_SENHA')
  process.exit(1)
}

const args = process.argv.slice(2)
const schema = resolverSchema({ argv: args, envSchema: env.SUPABASE_SCHEMA })
const FUNCAO = schema === 'public' ? 'jogo' : 'jogo-dev'
const ORIGEM = schema === 'public' ? 'https://poke-hunt-euj.pages.dev' : 'https://dev.poke-hunt-euj.pages.dev'
const admin = cabecalhosRest(SERVICO, schema)
console.log(`Banco: ${URL_BASE}\nSchema: ${schema}\nEdge: ${FUNCAO}`)

let falhas = 0
const ok = (cond, msg) => {
  console.log(`  ${cond ? 'ok    ' : 'FALHOU'} ${msg}`)
  if (!cond) falhas++
  return cond
}

async function rest(caminho, init = {}, cabecalhos = admin) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, { ...init, headers: { ...cabecalhos, ...(init.headers || {}) } })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${caminho} -> ${r.status} ${texto}`)
  return texto ? JSON.parse(texto) : null
}

async function entrar(email) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ email, password: SENHA }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login ${email} falhou: ${j.error_description || j.msg || JSON.stringify(j)}`)
  return { token: j.access_token, cab: cabecalhosRest(ANON, schema, { Authorization: `Bearer ${j.access_token}` }) }
}

// --- 1. contas, POKEs e presets ----------------------------------------------
const usuarios = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: admin }).then((r) => r.json())
const ids = {}
for (const [k, c] of Object.entries(CONTAS)) {
  const u = (usuarios.users || []).find((x) => x.email === c.email)
  if (!u) { console.error(`conta ${c.email} nao existe (ver scripts/conta-de-teste.js)`); process.exit(1) }
  ids[k] = u.id
}
console.log(`\nA = ${CONTAS.A.email}\nB = ${CONTAS.B.email}`)

for (const k of ['A', 'B']) {
  const hunt = await rest(`/game_sessions?user_id=eq.${ids[k]}&closed_at=is.null&select=id`)
  if (hunt.length) { console.error(`conta ${k} com hunt aberta: feche e rode de novo.`); process.exit(1) }
}

async function garantirPokes(userId, quantos) {
  const existentes = await rest(`/pokemon_instances?user_id=eq.${userId}&select=id&limit=${quantos}`)
  if (existentes.length >= quantos) return existentes.map((p) => p.id)
  const motor = await carregarMotor()
  const rng = motor.createRng(motor.randomSeed())
  const pokes = TIME_DE_FUMACA.slice(0, quantos - existentes.length).map((id) => {
    const p = motor.createPokeInstance(rng, id, 80)
    p.originalTrainer = 'Fumaca'
    return p
  })
  const linhas = motor.gameStateToPokemonRows(userId, { team: [], bagPokes: pokes })
  await rest('/pokemon_instances', { method: 'POST', body: JSON.stringify(linhas), headers: { Prefer: 'return=minimal' } })
  return [...existentes.map((p) => p.id), ...pokes.map((p) => p.uid)]
}

const sessoes = { A: await entrar(CONTAS.A.email), B: await entrar(CONTAS.B.email) }

// A: ataque #1 ativo com 6 POKEs e kit proprio no slot 1.
const pokesA = await garantirPokes(ids.A, 6)
const [primeiro] = await rest(`/pokemon_instances?id=eq.${pokesA[0]}&select=id,active_abilities,unlocked_abilities`)
const ativos = primeiro.active_abilities ?? []
const kitDoPreset = ativos.length >= 2 ? [...ativos].reverse() : (primeiro.unlocked_abilities ?? []).slice(0, 2)
const presetA = await rest('/rpc/salvar_preset_pvp', {
  method: 'POST',
  body: JSON.stringify({ p_tipo: 'ataque', p_posicao: 1, p_nome: 'Fumaca', p_slots: pokesA.map((pokemon_id, i) => ({ pokemon_id, golpes: i === 0 ? kitDoPreset : [] })) }),
}, sessoes.A.cab)
await rest('/rpc/ativar_preset_pvp', { method: 'POST', body: JSON.stringify({ p_tipo: 'ataque', p_posicao: 1 }) }, sessoes.A.cab)
ok(presetA?.slots?.length === 6 && JSON.stringify(presetA.slots[0].golpes) === JSON.stringify(kitDoPreset), 'A: preset de ataque #1 salvo com kit proprio no slot 1')

// B: defesa #1 ativa com >= 1 POKE.
const pokesB = await garantirPokes(ids.B, 2)
const presetB = await rest('/rpc/salvar_preset_pvp', {
  method: 'POST',
  body: JSON.stringify({ p_tipo: 'defesa', p_posicao: 1, p_nome: 'Muralha', p_slots: pokesB.map((pokemon_id) => ({ pokemon_id, golpes: [] })) }),
}, sessoes.B.cab)
await rest('/rpc/ativar_preset_pvp', { method: 'POST', body: JSON.stringify({ p_tipo: 'defesa', p_posicao: 1 }) }, sessoes.B.cab)
ok(presetB?.slots?.length === pokesB.length, `B: preset de defesa #1 salvo com ${pokesB.length} POKE(s)`)

// --- 2. isolamento: MMR alto so pros dois, cooldown zerado, limite zerado ----
for (const k of ['A', 'B']) await rest('/rpc/meu_rank_pvp', { method: 'POST', body: '{}' }, sessoes[k].cab)
const ranksAntes = Object.fromEntries(await Promise.all(['A', 'B'].map(async (k) => {
  const [r] = await rest(`/pvp_rank?user_id=eq.${ids[k]}&select=mmr,pdl,divisao,partidas,vitorias,derrotas,partidas_hoje`)
  return [k, r]
})))
await rest(`/pvp_sessao?estado=in.(convidada,aberta)&or=(anfitriao_id.eq.${ids.A},convidado_id.eq.${ids.A},anfitriao_id.eq.${ids.B},convidado_id.eq.${ids.B})`, {
  method: 'PATCH', body: JSON.stringify({ estado: 'cancelada' }), headers: { Prefer: 'return=minimal' },
})
await rest(`/pvp_sessao?anfitriao_id=eq.${ids.A}&modo=in.(ranqueado,ranqueado_bot)`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
for (const k of ['A', 'B']) {
  await rest(`/pvp_rank?user_id=eq.${ids[k]}`, {
    method: 'PATCH', body: JSON.stringify({ mmr: MMR_ISOLADO, partidas_hoje: 0 }), headers: { Prefer: 'return=minimal' },
  })
}

async function restaurar() {
  for (const k of ['A', 'B']) {
    const r = ranksAntes[k]
    if (!r) continue
    await rest(`/pvp_rank?user_id=eq.${ids[k]}`, {
      method: 'PATCH',
      body: JSON.stringify({ mmr: r.mmr, pdl: r.pdl, divisao: r.divisao, partidas: r.partidas, vitorias: r.vitorias, derrotas: r.derrotas, partidas_hoje: r.partidas_hoje }),
      headers: { Prefer: 'return=minimal' },
    }).catch((e) => console.log(`  aviso: nao restaurou rank de ${k}: ${e.message}`))
  }
}

try {
  // --- 3. A ataca B offline ---------------------------------------------------
  const sessao = await rest('/rpc/atacar_ranqueado', { method: 'POST', body: '{}' }, sessoes.A.cab)
  ok(sessao?.id != null && sessao.estado === 'aberta', `atacar_ranqueado criou sessao ${sessao?.estado}`)
  ok(sessao.modo === 'ranqueado', `modo = ${sessao.modo}`)
  ok(sessao.anfitriao_id === ids.A && sessao.convidado_id === ids.B, 'A e o anfitriao, B (offline) e o convidado')
  ok(Array.isArray(sessao.convidado_time) && sessao.convidado_time.length === pokesB.length, `snapshot da DEFESA de B tem ${sessao.convidado_time?.length} POKE(s)`)
  ok(JSON.stringify(sessao.anfitriao_time?.[0]?.golpes_escolhidos) === JSON.stringify(kitDoPreset), 'snapshot de A carrega golpes_escolhidos do preset')
  ok(new Date(sessao.expira_em) - new Date(sessao.criada_em) <= 3 * 60_000, 'sessao assincrona expira em ~2 min')
  const [rankAMeio] = await rest(`/pvp_rank?user_id=eq.${ids.A}&select=partidas_hoje`)
  const [rankBMeio] = await rest(`/pvp_rank?user_id=eq.${ids.B}&select=partidas_hoje`)
  ok(rankAMeio.partidas_hoje === 1, `partidas_hoje de A = ${rankAMeio.partidas_hoje}`)
  ok(rankBMeio.partidas_hoje === 0, `partidas_hoje de B intacto (${rankBMeio.partidas_hoje})`)

  // B nao ve essa sessao como "duelo vivo" (filtro do cliente): so amistoso ou anfitriao.
  const vivaDeB = await rest(`/pvp_sessao?estado=in.(convidada,aberta)&or=(anfitriao_id.eq.${ids.B},modo.eq.amistoso)&select=id`, {}, sessoes.B.cab)
  ok(!vivaDeB.some((s) => s.id === sessao.id), 'B nao enxerga o ataque como duelo vivo dele')

  // --- 4. resolucao na Edge e reproducao local -------------------------------
  const resposta = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/pvp/resolver`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${sessoes.A.token}`, 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ sessaoId: sessao.id }),
  })
  const corpo = await resposta.json().catch(() => ({}))
  ok(resposta.ok, `edge /pvp/resolver HTTP ${resposta.status}`)
  ok(Number.isInteger(corpo.semente), `semente devolvida (${corpo.semente})`)
  {
    const motor = await carregarMotor()
    const meuTime = (sessao.anfitriao_time ?? []).map(motor.pvpRowToPoke).filter(Boolean)
    const rivalTime = (sessao.convidado_time ?? []).map(motor.pvpRowToPoke).filter(Boolean)
    const local = motor.rodarArena({ semente: corpo.semente, meuTime, rivalTime, nomeDoRival: '', casaEhOJogador: false }, motor.LIVE_SIM_STEP_SECONDS)
    const vereditoLocal = local.resultado === 'vitoria' ? ids.A : local.resultado === 'derrota' ? ids.B : null
    ok(vereditoLocal === corpo.vencedorId, `reproducao local (${local.resultado}, ${local.ticks} ticks) bate com o veredito do servidor`)
    ok(JSON.stringify(meuTime[0]?.activeAbilities) === JSON.stringify(kitDoPreset), `POKE do slot 1 luta com o kit do preset (${meuTime[0]?.activeAbilities.join(', ')})`)
  }
  const [hist] = await rest(`/pvp_historico?sessao_id=eq.${sessao.id}&select=modo,vencedor_id,pdl_delta_anfitriao,pdl_delta_convidado`)
  ok(hist?.modo === 'ranqueado', `historico modo = ${hist?.modo}`)
  const dA = hist?.pdl_delta_anfitriao, dB = hist?.pdl_delta_convidado
  if (corpo.vencedorId == null) {
    ok(dA === 0 && dB === 0, 'empate: sem delta pros dois')
  } else {
    ok(Number.isInteger(dA) && Number.isInteger(dB) && Math.sign(dA) === -Math.sign(dB), `deltas com sinais opostos (A ${dA}, B ${dB})`)
    ok(Math.abs(dB) <= 12 && Math.abs(dB) <= Math.abs(dA), `defensor leva metade (|${dB}| <= 12 e <= |${dA}|)`)
  }
  const histDeB = await rest(`/pvp_historico?sessao_id=eq.${sessao.id}&select=convidado_id`, {}, sessoes.B.cab)
  ok(histDeB.length === 1 && histDeB[0].convidado_id === ids.B, 'B enxerga a linha do historico como convidado')

  // --- 5. cooldown + bot -----------------------------------------------------
  const segunda = await rest('/rpc/atacar_ranqueado', { method: 'POST', body: '{}' }, sessoes.A.cab)
  ok(segunda?.convidado_id !== ids.B, 'segundo ataque nao repete B (cooldown de 5)')
  ok(segunda?.modo === 'ranqueado_bot', `sem outro humano na faixa cai no bot (modo = ${segunda?.modo})`)
  const bots = new Set((await rest('/pvp_bots?select=user_id')).map((b) => b.user_id))
  ok(bots.has(segunda?.convidado_id), 'convidado do segundo ataque esta em pvp_bots')
  const r2 = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/pvp/resolver`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${sessoes.A.token}`, 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ sessaoId: segunda.id }),
  })
  ok(r2.ok, `edge resolve o ataque ao bot HTTP ${r2.status}`)
  const [histBot] = await rest(`/pvp_historico?sessao_id=eq.${segunda.id}&select=modo,pdl_delta_anfitriao`)
  ok(histBot?.modo === 'ranqueado_bot' && histBot.pdl_delta_anfitriao == null, 'bot: sem PDL no historico')
  const [rankADepois] = await rest(`/pvp_rank?user_id=eq.${ids.A}&select=partidas_hoje,mmr`)
  ok(rankADepois.partidas_hoje === 2, `partidas_hoje de A = ${rankADepois.partidas_hoje} (bot conta)`)

  // --- 6. limite diario ------------------------------------------------------
  await rest(`/pvp_rank?user_id=eq.${ids.A}`, { method: 'PATCH', body: JSON.stringify({ partidas_hoje: 5 }), headers: { Prefer: 'return=minimal' } })
  let recusou = null
  try { await rest('/rpc/atacar_ranqueado', { method: 'POST', body: '{}' }, sessoes.A.cab) } catch (e) { recusou = e.message }
  ok(recusou != null && /Limite de 5/.test(recusou), 'limite diario recusa o ataque')

  // A fila antiga sumiu de vez.
  let filaSumiu = false
  try { await rest('/rpc/entrar_fila_ranqueada', { method: 'POST', body: '{}' }, sessoes.A.cab) } catch { filaSumiu = true }
  ok(filaSumiu, 'entrar_fila_ranqueada nao existe mais')
} finally {
  await restaurar()
}

console.log(falhas ? `\n${falhas} verificacao(oes) FALHARAM` : '\nFumaca do PvP assincrono: tudo ok')
process.exit(falhas ? 1 : 0)
