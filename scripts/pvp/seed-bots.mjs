// Semeia os bots do PvP ranqueado (PH-539): dez treinadores iconicos com
// conta real (auth.users + players via trigger), seis POKEs nivel 80 com
// raridade legendary e IV 31, time salvo em `pvp_time` e marca em `pvp_bots`.
//
//   node scripts/pvp/seed-bots.mjs                      # schema do .env (padrao dev)
//   node scripts/pvp/seed-bots.mjs --schema=public --confirmar-public
//   node scripts/pvp/seed-bots.mjs --refazer            # apaga e recria os times
//   node scripts/pvp/seed-bots.mjs --refazer --so=wallace
//
// Idempotente por schema: bot com 6 POKEs e time salvo e pulado. A conta de
// auth e compartilhada entre dev e public (o trigger cria `players` nos dois),
// entao rodar uma vez por schema deixa os dois prontos.
//
// POR QUE PASSA PELO MOTOR: a linha de `pokemon_instances` carrega stats,
// exp e golpes derivados por regra. `createPokeInstance` do bundle headless e
// o mesmo caminho de uma captura real — ver scripts/poke-de-teste.mjs.
//
// DOMINIO PROPRIO: `@bots.pokehunt.local`, e nao `@teste.pokehunt.local`, pra
// `conta-de-teste.js --limpar` nunca alcancar os bots.
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { carregarMotor } from '../lib/motor.mjs'
import { resolverSchema, cabecalhosRest } from '../lib/schema-alvo.cjs'

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const DOMINIO = '@bots.pokehunt.local'
const NIVEL = 80
const IV_FULL = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }
const RARIDADE = 'legendary'

// Times pela aparicao mais reconhecivel de cada treinador, restritos ao
// catalogo do jogo (Gen 1-3). Repeticao de especie dentro do time e canonica
// (Lance). Entrada pode ser `{ especie, tms }` quando o learnset de nivel nao
// da 4 golpes decentes (evolucao por pedra, ex. Ludicolo): os `tms` entram em
// `golpes_de_maquina` e viram os golpes ativos, como se ensinados por TM.
const TMS = {
  ludicolo: ['scald', 'energy_ball', 'ice_beam', 'focus_blast'],
}
const BOTS = [
  { slug: 'red', nome: 'Red', time: ['pikachu', 'venusaur', 'charizard', 'blastoise', 'snorlax', 'lapras'] },
  { slug: 'blue', nome: 'Blue', time: ['pidgeot', 'alakazam', 'rhydon', 'exeggutor', 'gyarados', 'charizard'] },
  { slug: 'giovanni', nome: 'Giovanni', time: ['rhyhorn', 'dugtrio', 'nidoqueen', 'nidoking', 'rhydon', 'kangaskhan'] },
  { slug: 'lance', nome: 'Lance', time: ['gyarados', 'aerodactyl', 'charizard', 'dragonair', 'dragonite', 'dragonite'] },
  { slug: 'agatha', nome: 'Agatha', time: ['gengar', 'arbok', 'haunter', 'golbat', 'cloyster', 'weezing'] },
  { slug: 'blaine', nome: 'Blaine', time: ['arcanine', 'rapidash', 'magcargo', 'camerupt', 'torkoal', 'magmar'] },
  { slug: 'steven', nome: 'Steven Stone', time: ['skarmory', 'claydol', 'aggron', 'armaldo', 'cradily', 'metagross'] },
  { slug: 'wallace', nome: 'Wallace', time: ['wailord', 'tentacruel', 'ludicolo', 'whiscash', 'gyarados', 'milotic'] },
  { slug: 'maxie', nome: 'Maxie', time: ['groudon', 'camerupt', 'mightyena', 'crobat', 'solrock', 'weezing'] },
  { slug: 'ash', nome: 'Ash', time: ['pikachu', 'charizard', 'squirtle', 'bulbasaur', 'pidgeot', 'muk'] },
]

const args = process.argv.slice(2)
const refazer = args.includes('--refazer')
const so = args.find((a) => a.startsWith('--so='))?.slice(5)

function lerEnv() {
  const arquivo = join(RAIZ, '.env')
  if (!existsSync(arquivo)) {
    console.error('.env nao encontrado na raiz.')
    process.exit(1)
  }
  const env = {}
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  return env
}

const env = lerEnv()
const schema = resolverSchema({ argv: args, envSchema: env.SUPABASE_SCHEMA })
const cabecalhos = cabecalhosRest(env.SUPABASE_SERVICE_ROLE_KEY, schema)
console.log(`Banco: ${env.SUPABASE_URL}`)
console.log(`Schema: ${schema}`)

async function rest(caminho, init = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1${caminho}`, {
    ...init,
    headers: { ...cabecalhos, ...(init.headers || {}) },
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${caminho} -> ${r.status} ${texto}`)
  return texto ? JSON.parse(texto) : null
}

function authAdmin(caminho, init = {}) {
  return fetch(`${env.SUPABASE_URL}/auth/v1/admin${caminho}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
  })
}

async function listarUsuarios() {
  const todos = []
  for (let pagina = 1; ; pagina++) {
    const res = await authAdmin(`/users?page=${pagina}&per_page=200`)
    if (!res.ok) throw new Error(`listar usuarios: ${res.status} ${await res.text()}`)
    const { users } = await res.json()
    todos.push(...users)
    if (users.length < 200) return todos
  }
}

async function garantirConta(bot, usuarios) {
  const email = `bot-${bot.slug}${DOMINIO}`
  const existente = usuarios.find((u) => (u.email || '').toLowerCase() === email)
  if (existente) return existente.id
  const res = await authAdmin('/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      // Sem senha conhecida: ninguem loga como bot. O valor precisa passar em
      // `letters_digits`, entao leva letra e digito.
      password: `bot-${randomUUID()}7`,
      email_confirm: true,
      user_metadata: { trainer_name: bot.nome },
    }),
  })
  if (!res.ok) throw new Error(`criar ${email}: ${res.status} ${await res.text()}`)
  const criado = await res.json()
  console.log(`  conta criada: ${email}`)
  return criado.id
}

const motor = await carregarMotor()
const { SPECIES, createRng, createPokeInstance, gameStateToPokemonRows, randomSeed } = motor

for (const bot of BOTS) {
  for (const id of bot.time) {
    if (!SPECIES[id]) {
      console.error(`${bot.nome}: especie fora do catalogo: ${id}`)
      process.exit(1)
    }
  }
}

const usuarios = await listarUsuarios()
const alvos = so ? BOTS.filter((b) => b.slug === so) : BOTS
if (!alvos.length) {
  console.error(`--so=${so} nao bate com nenhum bot`)
  process.exit(1)
}

for (const bot of alvos) {
  console.log(`\n${bot.nome}`)
  const userId = await garantirConta(bot, usuarios)

  await rest(`/players?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ trainer_name: bot.nome }),
    headers: { Prefer: 'return=minimal' },
  })

  const existentes = await rest(`/pokemon_instances?user_id=eq.${userId}&select=id`)
  const [time] = await rest(`/pvp_time?user_id=eq.${userId}&select=pokemon_ids`)
  const pronto = existentes.length === 6 && time && (time.pokemon_ids || []).length === 6
  if (pronto && !refazer) {
    console.log('  ja semeado, pulando (use --refazer pra recriar)')
  } else {
    if (existentes.length) {
      await rest(`/pokemon_instances?user_id=eq.${userId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    }
    const rng = createRng(randomSeed())
    const pokes = bot.time.map((especieId) => {
      const poke = createPokeInstance(rng, especieId, NIVEL, { ivs: { ...IV_FULL }, rarity: RARIDADE })
      poke.originalTrainer = bot.nome
      const tms = TMS[especieId]
      if (tms) {
        poke.golpesDeMaquina = [...tms]
        poke.unlockedAbilities = [...new Set([...poke.unlockedAbilities, ...tms])]
        poke.activeAbilities = [...tms]
      }
      return poke
    })
    const linhas = gameStateToPokemonRows(userId, { team: pokes, bagPokes: [] })
    linhas.forEach((l, i) => { l.team_slot = i })
    await rest('/pokemon_instances', { method: 'POST', body: JSON.stringify(linhas), headers: { Prefer: 'return=minimal' } })

    const ids = pokes.map((p) => p.uid)
    await rest('/pvp_time?on_conflict=user_id', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, pokemon_ids: ids, atualizado_em: new Date().toISOString() }),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    })
    for (const p of pokes) {
      const aviso = p.activeAbilities.length < 4 ? '  AVISO: menos de 4 golpes ativos' : ''
      console.log(`  ${SPECIES[p.speciesId].name.padEnd(12)} hp ${String(p.stats.hp).padStart(4)}  ${p.activeAbilities.join(', ')}${aviso}`)
    }
  }

  await rest('/pvp_bots?on_conflict=user_id', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
}

console.log(`\n${alvos.length} bot(s) pronto(s) em ${schema}.`)
