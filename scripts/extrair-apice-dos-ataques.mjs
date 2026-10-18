// Extrai o APICE das poses de ataque (`<HitFrame>` do AnimData.xml do acervo
// PMD) pra cada especie com arte, e escreve src/data/generated/apiceDoAtaque.generated.ts.
//
// O apice e o quadro em que o golpe "sai" na arte autoral (o soco encosta, a
// boca abre). O motor usa pra disparar o VFX do golpe nesse instante (ver
// engine/tempoDoGolpe.ts). `importar-anim-pmd.mjs` copiava so as duracoes e
// descartava esse campo.
//
// Confere que o node achado tem as MESMAS duracoes que ja estao em
// src/data/battleSpriteAnims.ts — se o acervo mudou desde o import, a especie
// fica de fora (o motor cai no apice estimado) em vez de casar quadro errado.
//
// Run: node scripts/extrair-apice-dos-ataques.mjs [--acervo=<checkout do SpriteCollab>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ACERVO = (() => {
  const arg = process.argv.find((a) => a.startsWith('--acervo='))
  return arg ? arg.slice('--acervo='.length) : join(ROOT, 'assets', 'SpriteCollab-master (1)', 'SpriteCollab-master')
})()
const SPRITE_ROOT = join(ACERVO, 'sprite')
const ANIMS_TS_PATH = join(ROOT, 'src', 'data', 'battleSpriteAnims.ts')
const POKES_GENERATED_PATH = join(ROOT, 'src', 'data', 'generated', 'pokes.generated.ts')
const SAIDA = join(ROOT, 'src', 'data', 'generated', 'apiceDoAtaque.generated.ts')
// 18/10/2026: toda pose que um golpe pode tocar (engine/poseDoGolpe.ts), nao
// so as tres de antes.
const POSES = ['Shoot', 'Charge', 'Attack', 'Swing', 'Strike', 'SpAttack', 'Double', 'Rotate', 'Head', 'HitGround', 'Stomp', 'Kick',
  'Punch', 'Jab', 'Uppercut', 'Chop', 'Slice', 'Bite', 'Scratch', 'MultiScratch', 'MultiStrike', 'QuickStrike', 'Slam', 'Lick',
  'Sing', 'Sound', 'Gas', 'Shock', 'Dance', 'Twirl', 'Withdraw', 'Rumble']

if (!existsSync(SPRITE_ROOT)) throw new Error(`acervo nao encontrado: ${SPRITE_ROOT}`)

function parseAnimData(xmlPath) {
  const xml = readFileSync(xmlPath, 'utf8')
  const nodes = {}
  for (const bloco of xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || []) {
    const nome = (bloco.match(/<Name>(.*?)<\/Name>/) || [])[1]
    if (!nome) continue
    const hit = (bloco.match(/<HitFrame>(\d+)<\/HitFrame>/) || [])[1]
    nodes[nome] = {
      copyOf: (bloco.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1] || null,
      hitFrame: hit === undefined ? null : parseInt(hit, 10),
      durations: [...bloco.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => parseInt(m[1], 10)),
    }
  }
  return nodes
}

// Segue <CopyOf> ate o node que tem quadros de verdade.
function resolver(nome, nodes, vistos = new Set()) {
  if (vistos.has(nome) || !nodes[nome]) return null
  vistos.add(nome)
  const node = nodes[nome]
  if (node.durations.length > 0) return node
  return node.copyOf ? resolver(node.copyOf, nodes, vistos) : null
}

function dexPorEspecie() {
  const txt = readFileSync(POKES_GENERATED_PATH, 'utf8')
  const mapa = {}
  for (const bloco of txt.match(/"id":\s*"([a-z0-9_]+)",\s*"name":[\s\S]*?"description":\s*"Pokedex Nº(\d+)/g) || []) {
    mapa[bloco.match(/"id":\s*"([a-z0-9_]+)"/)[1]] = parseInt(bloco.match(/Pokedex Nº(\d+)/)[1], 10)
  }
  return mapa
}

function main() {
  const conteudo = readFileSync(ANIMS_TS_PATH, 'utf8')
  const m = conteudo.match(/export const BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = ([\s\S]*?);?\s*$/)
  if (!m) throw new Error('nao encontrei BATTLE_SPRITE_ANIMS')
  const anims = JSON.parse(m[1])
  const dex = dexPorEspecie()

  const saida = {}
  const faltas = []
  for (const id of Object.keys(anims).sort()) {
    const n = dex[id]
    const xml = n == null ? null : join(SPRITE_ROOT, String(n).padStart(4, '0'), 'AnimData.xml')
    if (!xml || !existsSync(xml)) { faltas.push(`${id} (sem AnimData)`); continue }
    const nodes = parseAnimData(xml)
    for (const pose of POSES) {
      const nosso = anims[id][pose]
      if (!nosso) continue
      const node = resolver(pose, nodes)
      if (!node || node.hitFrame == null) { faltas.push(`${id}.${pose} (sem HitFrame)`); continue }
      if (node.durations.join(',') !== nosso.durations.join(',')) { faltas.push(`${id}.${pose} (duracoes divergem)`); continue }
      if (node.hitFrame < 0 || node.hitFrame >= nosso.durations.length) { faltas.push(`${id}.${pose} (HitFrame fora)`); continue }
      ;(saida[id] ??= {})[pose] = node.hitFrame
    }
  }

  const corpo = JSON.stringify(saida).replace(/\},"/g, '},\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, '\n}')
  writeFileSync(SAIDA, `// GERADO por scripts/extrair-apice-dos-ataques.mjs — nao editar a mao.
import type { AnimName } from '@/data/battleSpriteAnims'

// Indice (0-based) do quadro de APICE (<HitFrame> do PMD) de cada pose de ataque.
// Especie/pose ausente: o motor estima (ver engine/tempoDoGolpe.ts).
export const APICE_DO_ATAQUE: Record<string, Partial<Record<AnimName, number>>> = ${corpo}
`)
  const total = Object.values(saida).reduce((s, p) => s + Object.keys(p).length, 0)
  console.log(`apices: ${total} (especies: ${Object.keys(saida).length}); faltas: ${faltas.length}`)
  if (faltas.length) console.log(faltas.slice(0, 30).join('\n'))
}

main()
