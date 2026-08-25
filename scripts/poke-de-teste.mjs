// Injeta um POKE pronto na conta de teste — pra ver arte/golpe/animacao sem
// jogar 20 niveis a mao.
//
//   node scripts/poke-de-teste.mjs --especie=scizor --nivel=20
//   node scripts/poke-de-teste.mjs --especie=scizor --nivel=20 --golpes=bullet_punch
//   node scripts/poke-de-teste.mjs --especie=scizor --nivel=20 --local=bag
//
// Opcoes: --especie (obrigatorio), --nivel=1, --golpes=a,b (ativos; padrao = o
// conjunto normal do nivel), --local=team|bag, --shiny, --email=<outra conta de
// teste>, --forcar (ignora a checagem de sessao aberta).
//
// POR QUE NAO E SQL A MAO: a linha de `pokemon_instances` tem 6 IVs, 6 stats
// derivados, exp acumulada da curva de crescimento e a lista de golpes
// aprendidos — tudo derivado por regra do motor. Escrever isso a mao produz um
// POKE que existe no banco mas mente sobre si mesmo (stat que nao bate com o
// nivel, golpe que ele nao deveria saber). Aqui o POKE sai de
// `createPokeInstance` do PROPRIO motor (authority/engine/headless.js) e a linha,
// de `gameStateToPokemonRows` — o mesmo caminho que uma captura de verdade usa.
//
// SO ESCREVE EM CONTA DE TESTE: o email precisa terminar em
// @teste.pokehunt.local (ver scripts/conta-de-teste.js). Nao ha flag pra burlar.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { carregarMotor } from './lib/motor.mjs'
import { resolverSchema, cabecalhosRest } from './lib/schema-alvo.cjs'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const DOMINIO_TESTE = '@teste.pokehunt.local'

const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const flag = (nome) => args.includes(`--${nome}`)

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
const schema = resolverSchema({ envSchema: env.SUPABASE_SCHEMA })
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

const especieId = opcao('especie')
const nivel = Number(opcao('nivel', '1'))
const local = opcao('local', 'team')
const email = opcao('email', env.CONTA_TESTE_EMAIL)
const golpesForcados = opcao('golpes')?.split(',').map((g) => g.trim()).filter(Boolean)

if (!especieId) {
  console.error('falta --especie=<id>. Ex: --especie=scizor --nivel=20')
  process.exit(1)
}
if (!email) {
  console.error('sem email: preencha CONTA_TESTE_EMAIL no .env ou passe --email=')
  process.exit(1)
}
if (!email.endsWith(DOMINIO_TESTE)) {
  console.error(`recusado: "${email}" nao esta em ${DOMINIO_TESTE}. Este script so escreve em conta de teste.`)
  process.exit(1)
}
if (local !== 'team' && local !== 'bag') {
  console.error('--local aceita team ou bag')
  process.exit(1)
}

// O motor empacotado que o servidor de autoridade usa. Fonte unica de verdade
// pra stats/exp/golpes — ver o cabecalho deste arquivo.
const motor = await carregarMotor()
const { SPECIES, MAX_TEAM_SIZE, createRng, createPokeInstance, gameStateToPokemonRows, activeAbilitiesPadrao } = motor

const especie = SPECIES[especieId]
if (!especie) {
  console.error(`especie desconhecida: ${especieId}`)
  process.exit(1)
}

// --- 1. quem e o jogador
const usuarios = await fetch(
  `${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
  { headers: cabecalhos },
).then((r) => r.json())
const usuario = (usuarios.users || []).find((u) => u.email === email)
if (!usuario) {
  console.error(`conta ${email} nao existe. Rode: npm run conta:criar`)
  process.exit(1)
}

// --- 2. sessao aberta? o snapshot dela apagaria este POKE
//
// `gravarEstado` (server/src/progresso.ts) grava o SNAPSHOT INTEIRO com
// delete-diff: ele apaga toda linha de pokemon_instances que nao esteja no
// estado que o cliente/servidor carregou. Um POKE inserido no meio de uma sessao
// aberta desaparece no flush seguinte, sem erro nenhum.
const sessoes = await rest(`/game_sessions?user_id=eq.${usuario.id}&closed_at=is.null&select=id,map_id,started_at`)
if (sessoes.length && !flag('forcar')) {
  console.error(`conta com ${sessoes.length} sessao(oes) de hunt ABERTA(s): ${sessoes.map((s) => s.map_id).join(', ')}`)
  console.error('Feche a hunt no jogo (volta pro Hospital) e rode de novo, ou passe --forcar.')
  console.error('Motivo: o flush da sessao regrava o snapshot inteiro e apaga POKE que ele nao conhece.')
  process.exit(1)
}

// --- 3. onde cabe
const existentes = await rest(`/pokemon_instances?user_id=eq.${usuario.id}&select=id,species_id,level,location,team_slot`)
let teamSlot = null
if (local === 'team') {
  const ocupados = new Set(existentes.filter((p) => p.location === 'team').map((p) => p.team_slot))
  for (let i = 0; i < MAX_TEAM_SIZE; i++) {
    if (!ocupados.has(i)) {
      teamSlot = i
      break
    }
  }
  if (teamSlot === null) {
    console.error(`equipe cheia (${MAX_TEAM_SIZE}). Use --local=bag ou libere um slot no jogo.`)
    process.exit(1)
  }
}

// --- 4. o POKE, pelo motor
// Semente fixa nao serve: duas rodadas dariam o MESMO uid e o insert bateria na
// PK. `randomSeed` do motor e o que uma sessao de verdade usa.
const rng = createRng(motor.randomSeed())
const poke = createPokeInstance(rng, especieId, nivel)
poke.originalTrainer = 'ClaudeTeste'
if (flag('shiny')) poke.isShiny = true
if (golpesForcados) {
  const desconhecidos = golpesForcados.filter((g) => !poke.unlockedAbilities.includes(g))
  if (desconhecidos.length) {
    console.error(`${especie.name} nivel ${nivel} nao aprendeu: ${desconhecidos.join(', ')}`)
    console.error(`aprendidos ate aqui: ${poke.unlockedAbilities.join(', ')}`)
    process.exit(1)
  }
  poke.activeAbilities = golpesForcados
}

const [linha] = gameStateToPokemonRows(usuario.id, {
  team: local === 'team' ? [poke] : [],
  bagPokes: local === 'bag' ? [poke] : [],
})
if (local === 'team') linha.team_slot = teamSlot

await rest('/pokemon_instances', { method: 'POST', body: JSON.stringify(linha) })

const padrao = activeAbilitiesPadrao(especie, nivel)
console.log(`${especie.name} nivel ${nivel} inserido em ${local}${local === 'team' ? ` slot ${teamSlot}` : ''} de ${email}`)
console.log(`  uid          ${poke.uid}`)
console.log(`  raridade     ${poke.rarity}${poke.isShiny ? ' (shiny)' : ''}`)
console.log(`  hp/atk/vel   ${poke.stats.hp}/${poke.stats.atkFis}/${poke.stats.speed}`)
console.log(`  aprendidos   ${poke.unlockedAbilities.join(', ')}`)
console.log(`  ativos       ${poke.activeAbilities.join(', ')}${golpesForcados ? `  (padrao seria: ${padrao.join(', ')})` : ''}`)
console.log('Recarregue o jogo (F5) pra ele aparecer — o cliente le o estado no load.')
