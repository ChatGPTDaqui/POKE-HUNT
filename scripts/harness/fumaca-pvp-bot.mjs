// Fumaca do fallback de bot no PvP ranqueado (PH-539), contra o ambiente
// remoto de um schema.
//
//   node scripts/harness/fumaca-pvp-bot.mjs                  # dev (jogo-dev)
//   node scripts/harness/fumaca-pvp-bot.mjs --schema=public --confirmar-public
//
// O que prova, na ordem:
//   1. a conta de teste canonica tem time ranqueado pronto (6 POKEs nivel 80
//      com 4 golpes) — se nao tem, semeia na mochila via motor, como
//      scripts/poke-de-teste.mjs;
//   2. `entrar_fila_ranqueada` aceita; `tentar_parear_ranqueado` devolve null
//      antes dos 15s e uma sessao `ranqueado_bot` depois, com convidado em
//      `pvp_bots`;
//   3. a Edge `/pvp/resolver` devolve vencedor e semente, e a arena rodada
//      aqui com a mesma semente (motor headless) chega ao mesmo veredito;
//   4. `pvp_rank` da conta fica identico ao de antes e `pvp_historico` grava
//      `modo = 'ranqueado_bot'`.
//
// Escreve so na conta de teste canonica (@teste.pokehunt.local). O time de PvP
// salvo dela e sobrescrito com os 6 POKEs de fumaca.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { carregarMotor } from '../lib/motor.mjs'
import { resolverSchema, cabecalhosRest } from '../lib/schema-alvo.cjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTA = 'claude@teste.pokehunt.local'
const ESPERA_MAX_MS = 45_000
const POLL_MS = 3_000
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

// --- 1. conta e time pronto -------------------------------------------------
const usuarios = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: admin }).then((r) => r.json())
const usuario = (usuarios.users || []).find((u) => u.email === CONTA)
if (!usuario) {
  console.error(`conta ${CONTA} nao existe. Rode: npm run conta:criar`)
  process.exit(1)
}
const meuId = usuario.id
console.log(`\nConta de teste: ${CONTA}`)

const sessoesDeHunt = await rest(`/game_sessions?user_id=eq.${meuId}&closed_at=is.null&select=id`)
if (sessoesDeHunt.length) {
  console.error('conta com hunt aberta: o flush da sessao apagaria os POKEs de fumaca. Feche a hunt e rode de novo.')
  process.exit(1)
}

const pronto = await rest(`/rpc/pvp_time_pronto_ranqueado`, { method: 'POST', body: JSON.stringify({ p_user: meuId }) })
if (pronto === true) {
  console.log('  time ranqueado ja pronto, reutilizando')
} else {
  const motor = await carregarMotor()
  const rng = motor.createRng(motor.randomSeed())
  const pokes = TIME_DE_FUMACA.map((id) => {
    const p = motor.createPokeInstance(rng, id, 80)
    p.originalTrainer = 'ClaudeTeste'
    return p
  })
  const linhas = motor.gameStateToPokemonRows(meuId, { team: [], bagPokes: pokes })
  await rest('/pokemon_instances', { method: 'POST', body: JSON.stringify(linhas), headers: { Prefer: 'return=minimal' } })
  const ids = pokes.map((p) => p.uid)
  await rest('/pvp_time?on_conflict=user_id', {
    method: 'POST',
    body: JSON.stringify({ user_id: meuId, pokemon_ids: ids, atualizado_em: new Date().toISOString() }),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  // PH-563: o snapshot le o preset ativo; `pvp_time` e so espelho.
  await rest('/pvp_preset?on_conflict=user_id,tipo,posicao', {
    method: 'POST',
    body: JSON.stringify(['ataque', 'defesa'].map((tipo) => ({
      user_id: meuId, tipo, posicao: 1, slots: ids.map((pokemon_id) => ({ pokemon_id, golpes: [] })), ativo: true,
    }))),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  const agora = await rest(`/rpc/pvp_time_pronto_ranqueado`, { method: 'POST', body: JSON.stringify({ p_user: meuId }) })
  ok(agora === true, 'time de fumaca semeado e pronto pro ranqueado')
}

const bots = await rest('/pvp_bots?select=user_id')
ok(bots.length >= 1, `${bots.length} bot(s) em pvp_bots`)
const idsDeBot = new Set(bots.map((b) => b.user_id))

// Sessao viva presa de rodada anterior bloqueia `entrar_fila_ranqueada`.
await rest(`/pvp_sessao?estado=in.(convidada,aberta)&or=(anfitriao_id.eq.${meuId},convidado_id.eq.${meuId})`, {
  method: 'PATCH', body: JSON.stringify({ estado: 'cancelada' }), headers: { Prefer: 'return=minimal' },
})
await rest(`/pvp_fila?user_id=eq.${meuId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })

// Convite amistoso VENCIDO pendente (o caso real que barrou "Procurar
// oponente" com "Voce ja esta em um duelo PvP"): a fila tem que expirar e
// seguir, nao recusar.
await rest('/pvp_sessao', {
  method: 'POST',
  body: JSON.stringify({
    anfitriao_id: meuId, convidado_id: bots[0].user_id, estado: 'convidada', modo: 'amistoso',
    criada_em: new Date(Date.now() - 20 * 60_000).toISOString(),
    expira_em: new Date(Date.now() - 5 * 60_000).toISOString(),
  }),
  headers: { Prefer: 'return=minimal' },
})

// --- 2. fila e pareamento como o jogador ------------------------------------
const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json', Origin: ORIGEM },
  body: JSON.stringify({ email: CONTA, password: SENHA }),
}).then((r) => r.json())
if (!login.access_token) {
  console.error(`login falhou: ${login.error_description || login.msg || JSON.stringify(login)}`)
  process.exit(1)
}
const jogador = cabecalhosRest(ANON, schema, { Authorization: `Bearer ${login.access_token}` })

// --- 2a. preset com golpes por slot (PH-563) --------------------------------
// O snapshot da sessao tem que carregar `golpes_escolhidos` do preset ativo, e
// o POKE montado pelo motor tem que lutar com ESSE kit, nao com `active_abilities`.
const presets = await rest('/rpc/meus_presets_pvp', { method: 'POST', body: '{}' }, jogador)
ok(Array.isArray(presets) && presets.length === 6, `meus_presets_pvp devolve 6 presets (${presets?.length})`)
const ataqueAtivo = presets.find((p) => p.tipo === 'ataque' && p.ativo)
ok(ataqueAtivo != null && ataqueAtivo.slots.length === 6, `preset de ataque ativo com 6 slots (${ataqueAtivo?.slots?.length})`)
const [primeiro] = await rest(`/pokemon_instances?id=eq.${ataqueAtivo.slots[0].pokemon_id}&select=id,species_id,active_abilities,unlocked_abilities`)
const ativosDoPoke = primeiro.active_abilities ?? []
const escolhaDoPreset = ativosDoPoke.length >= 2 ? [...ativosDoPoke].reverse() : (primeiro.unlocked_abilities ?? []).slice(0, 2)
ok(escolhaDoPreset.length >= 1 && JSON.stringify(escolhaDoPreset) !== JSON.stringify(ativosDoPoke), `kit do preset difere do kit do POKE (${escolhaDoPreset.join(', ')})`)
const slotsComGolpe = ataqueAtivo.slots.map((s, i) => ({ pokemon_id: s.pokemon_id, golpes: i === 0 ? escolhaDoPreset : [] }))
const presetSalvo = await rest('/rpc/salvar_preset_pvp', {
  method: 'POST',
  body: JSON.stringify({ p_tipo: 'ataque', p_posicao: ataqueAtivo.posicao, p_nome: 'Fumaca', p_slots: slotsComGolpe }),
}, jogador)
ok(JSON.stringify(presetSalvo?.slots?.[0]?.golpes) === JSON.stringify(escolhaDoPreset), 'salvar_preset_pvp gravou os golpes do slot 1')
let recusou = false
try {
  await rest('/rpc/salvar_preset_pvp', {
    method: 'POST',
    body: JSON.stringify({ p_tipo: 'ataque', p_posicao: ataqueAtivo.posicao, p_nome: 'Fumaca', p_slots: [{ pokemon_id: primeiro.id, golpes: ['golpe_que_nao_existe'] }] }),
  }, jogador)
} catch { recusou = true }
ok(recusou, 'salvar_preset_pvp recusa golpe que o POKE nao conhece')
const [espelho] = await rest(`/pvp_time?user_id=eq.${meuId}&select=pokemon_ids`)
ok(JSON.stringify(espelho?.pokemon_ids) === JSON.stringify(slotsComGolpe.map((s) => s.pokemon_id)), 'pvp_time espelha o preset de ataque ativo')

// Base de comparacao e o rank que `entrar_fila_ranqueada` devolve, nao uma
// leitura anterior: a linha de `pvp_rank` so nasce nessa chamada
// (`pvp_garantir_rank`), e conta nova nao tem nada antes.
let rankEntrada = null
try {
  rankEntrada = await rest('/rpc/entrar_fila_ranqueada', { method: 'POST', body: '{}' }, jogador)
} catch (e) {
  ok(false, `entrar na fila com convite vencido pendente: ${e.message}`)
  process.exit(1)
}
ok(typeof rankEntrada?.mmr === 'number', `entrou na fila com convite vencido pendente (mmr ${rankEntrada?.mmr})`)
const campos = ['mmr', 'pdl', 'divisao', 'partidas', 'vitorias', 'derrotas']
const rankAntes = Object.fromEntries(campos.map((c) => [c, rankEntrada[c]]))
const partidasHojeAntes = rankEntrada.partidas_hoje

console.log('\nPareando (bot so entra depois de 15s)...')
const inicio = Date.now()
let sessao = null
let primeiraResposta
while (Date.now() - inicio < ESPERA_MAX_MS) {
  const r = await rest('/rpc/tentar_parear_ranqueado', { method: 'POST', body: '{}' }, jogador)
  if (primeiraResposta === undefined) primeiraResposta = r
  if (r && r.id) { sessao = r; break }
  await new Promise((res) => setTimeout(res, POLL_MS))
}
const decorrido = Math.round((Date.now() - inicio) / 1000)
// NULL composto sai do PostgREST como objeto com todas as colunas nulas.
ok(primeiraResposta == null || primeiraResposta.id == null, 'primeira chamada (antes dos 15s) veio sem sessao')
if (!ok(sessao != null, `sessao criada apos ${decorrido}s`)) {
  await rest('/rpc/sair_da_fila_ranqueada', { method: 'POST', body: '{}' }, jogador).catch(() => {})
  process.exit(1)
}
ok(decorrido >= 15, 'esperou pelo menos 15s')
ok(sessao.modo === 'ranqueado_bot', `modo = ${sessao.modo}`)
ok(sessao.anfitriao_id === meuId, 'jogador e o anfitriao')
ok(idsDeBot.has(sessao.convidado_id), 'convidado esta em pvp_bots')
ok(Array.isArray(sessao.convidado_time) && sessao.convidado_time.length === 6, 'time do bot no snapshot tem 6')
ok(JSON.stringify(sessao.anfitriao_time?.[0]?.golpes_escolhidos) === JSON.stringify(escolhaDoPreset), 'snapshot do anfitriao carrega golpes_escolhidos do preset')
const [nomeDoBot] = await rest(`/treinadores_publico?user_id=eq.${sessao.convidado_id}&select=trainer_name,eh_bot`, {}, jogador)
ok(nomeDoBot?.eh_bot === true, `treinadores_publico marca ${nomeDoBot?.trainer_name} como bot`)

// --- 3. resolucao na Edge ----------------------------------------------------
const resposta = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/pvp/resolver`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json', Origin: ORIGEM },
  body: JSON.stringify({ sessaoId: sessao.id }),
})
const corpo = await resposta.json().catch(() => ({}))
ok(resposta.ok, `edge /pvp/resolver HTTP ${resposta.status}`)
ok(corpo.vencedorId === null || corpo.vencedorId === meuId || corpo.vencedorId === sessao.convidado_id, `vencedor: ${corpo.vencedorId === meuId ? 'jogador' : corpo.vencedorId === null ? 'empate' : nomeDoBot?.trainer_name}`)
ok(Number.isInteger(corpo.semente), `semente devolvida (${corpo.semente})`)
ok(corpo.pdlDeltaAnfitriao === undefined, 'sem delta de PDL na resposta')

// --- 3b. determinismo: a MESMA arena aqui (Node) tem que dar o mesmo veredito
// que a Edge (Deno). E o contrato do PH-540 — o cliente reproduz a luta.
{
  const motor = await carregarMotor()
  ok(motor.sementeDaSessao(sessao.id) === corpo.semente, 'semente local bate com a do servidor')
  const meuTime = (sessao.anfitriao_time ?? []).map(motor.pvpRowToPoke).filter(Boolean)
  const rivalTime = (sessao.convidado_time ?? []).map(motor.pvpRowToPoke).filter(Boolean)
  const local = motor.rodarArena({ semente: corpo.semente, meuTime, rivalTime, nomeDoRival: '', casaEhOJogador: sessao.modo === 'amistoso' }, motor.LIVE_SIM_STEP_SECONDS)
  const vereditoLocal = local.resultado === 'vitoria' ? meuId : local.resultado === 'derrota' ? sessao.convidado_id : null
  ok(vereditoLocal === corpo.vencedorId, `reproducao local (${local.resultado}, ${local.ticks} ticks) bate com o veredito do servidor`)
  ok(JSON.stringify(meuTime[0]?.activeAbilities) === JSON.stringify(escolhaDoPreset), `POKE do slot 1 luta com o kit do preset (${meuTime[0]?.activeAbilities.join(', ')})`)
  const golpes = new Map()
  for (const p of [...meuTime, ...rivalTime]) golpes.set(p.speciesId, p.activeAbilities.join(', '))
  for (const [especie, lista] of golpes) console.log(`         ${especie.padEnd(12)} ${lista}`)
}

// --- 4. rank intacto e historico gravado -------------------------------------
const [rankDepois] = await rest(`/pvp_rank?user_id=eq.${meuId}&select=mmr,pdl,divisao,partidas,vitorias,derrotas,partidas_hoje`)
const rankDepoisComparavel = Object.fromEntries(campos.map((c) => [c, rankDepois?.[c]]))
ok(JSON.stringify(rankAntes) === JSON.stringify(rankDepoisComparavel), `mmr/pdl/divisao/partidas/vitorias/derrotas inalterados (${JSON.stringify(rankDepoisComparavel)})`)
ok(rankDepois.partidas_hoje === partidasHojeAntes, `partidas_hoje nao consumiu (${rankDepois.partidas_hoje})`)
const [hist] = await rest(`/pvp_historico?sessao_id=eq.${sessao.id}&select=modo,vencedor_id,pdl_delta_anfitriao`)
ok(hist?.modo === 'ranqueado_bot', `historico modo = ${hist?.modo}`)
ok(hist?.pdl_delta_anfitriao == null, 'historico sem delta de PDL')
const [sessaoFinal] = await rest(`/pvp_sessao?id=eq.${sessao.id}&select=estado`)
ok(sessaoFinal?.estado === 'concluida', `sessao ${sessaoFinal?.estado}`)

console.log(falhas ? `\n${falhas} verificacao(oes) FALHARAM` : '\nFumaca do bot de PvP: tudo ok')
process.exit(falhas ? 1 : 0)
