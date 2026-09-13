// PH-532: acrescenta a animacao `Hurt` (flinch de levar dano, ver
// docs/arquivo/2026-09-08/docs/18-animacoes-do-pmd-disponiveis.md — cobertura
// 100% no acervo PMD, 2 quadros/10 ticks) as especies que JA TEM pasta em
// assets/battle-sprites/<id>/ (as outras 6 poses ja foram importadas antes).
//
// Diferente de scripts/import-kanto-sprites.js (legado, escreve em js/data/*
// que nao existe mais depois da migracao pra src/ + TS): este script SO
// adiciona uma animacao nova a especies que ja tem pasta, e escreve direto em
// src/data/battleSpriteAnims.ts.
//
// Run: node scripts/importar-hurt-anim.mjs [--acervo=<checkout do SpriteCollab>]
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ACERVO = (() => {
  const arg = process.argv.find((a) => a.startsWith('--acervo='))
  return arg ? arg.slice('--acervo='.length) : join(ROOT, 'assets', 'SpriteCollab-master (1)', 'SpriteCollab-master')
})()
const SPRITE_ROOT = join(ACERVO, 'sprite')
const BATTLE_SPRITES_DIR = join(ROOT, 'assets', 'battle-sprites')
const ANIMS_TS_PATH = join(ROOT, 'src', 'data', 'battleSpriteAnims.ts')
const POKES_GENERATED_PATH = join(ROOT, 'src', 'data', 'generated', 'pokes.generated.ts')

if (!existsSync(SPRITE_ROOT)) throw new Error(`acervo nao encontrado: ${SPRITE_ROOT}`)

function dex4(n) {
  return String(n).padStart(4, '0')
}

function parseAnimData(xmlPath) {
  const xml = readFileSync(xmlPath, 'utf8')
  const nodeByName = {}
  const animBlocks = xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || []
  for (const block of animBlocks) {
    const name = (block.match(/<Name>(.*?)<\/Name>/) || [])[1]
    if (!name) continue
    const copyOf = (block.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1] || null
    const frameWidth = (block.match(/<FrameWidth>(\d+)<\/FrameWidth>/) || [])[1]
    const frameHeight = (block.match(/<FrameHeight>(\d+)<\/FrameHeight>/) || [])[1]
    const durations = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => parseInt(m[1], 10))
    nodeByName[name] = {
      copyOf,
      frameWidth: frameWidth ? parseInt(frameWidth, 10) : null,
      frameHeight: frameHeight ? parseInt(frameHeight, 10) : null,
      durations,
    }
  }
  return nodeByName
}

// Segue <CopyOf> ate achar um node com PNG de verdade no disco — mesma logica
// de import-kanto-sprites.js#resolveAnim.
function resolveAnim(name, nodeByName, spriteDir, visited = new Set()) {
  if (visited.has(name)) return null
  visited.add(name)
  const filePath = join(spriteDir, `${name}-Anim.png`)
  const node = nodeByName[name]
  if (existsSync(filePath) && node && node.frameWidth) return { file: filePath, node }
  if (node && node.copyOf) return resolveAnim(node.copyOf, nodeByName, spriteDir, visited)
  return null
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
}

// dex number: embutido na description gerada ("Pokedex Nº4 - tipo FIRE.").
function extrairDexPorEspecie() {
  const txt = readFileSync(POKES_GENERATED_PATH, 'utf8')
  const porEspecie = {}
  const blocos = txt.match(/"id":\s*"([a-z0-9_]+)",\s*"name":[\s\S]*?"description":\s*"Pokedex Nº(\d+)/g) || []
  for (const bloco of blocos) {
    const idM = bloco.match(/"id":\s*"([a-z0-9_]+)"/)
    const dexM = bloco.match(/Pokedex Nº(\d+)/)
    if (idM && dexM) porEspecie[idM[1]] = parseInt(dexM[1], 10)
  }
  return porEspecie
}

function main() {
  const dexPorEspecie = extrairDexPorEspecie()
  const forcar = process.argv.includes('--forcar')
  const especiesComPasta = readdirSync(BATTLE_SPRITES_DIR).filter((id) =>
    existsSync(join(BATTLE_SPRITES_DIR, id, 'Idle-Anim.png'))
    && (forcar || !existsSync(join(BATTLE_SPRITES_DIR, id, 'Hurt-Anim.png'))),
  )
  console.log(`${especiesComPasta.length} especies sem Hurt-Anim ainda.`)

  const novasEntradas = {}
  const importadas = []
  const puladas = []

  for (const id of especiesComPasta) {
    const dexNum = dexPorEspecie[id]
    if (dexNum == null) { puladas.push(`${id} (sem numero de dex no catalogo)`); continue }

    const d4 = dex4(dexNum)
    const spriteDir = join(SPRITE_ROOT, d4)
    const shinySpriteDir = join(spriteDir, '0000', '0001')
    const animXmlPath = join(spriteDir, 'AnimData.xml')
    if (!existsSync(animXmlPath)) { puladas.push(`${id} (sem AnimData.xml em sprite/${d4})`); continue }

    const nodeByName = parseAnimData(animXmlPath)
    const resolved = resolveAnim('Hurt', nodeByName, spriteDir)
    if (!resolved) { puladas.push(`${id} (acervo nao tem Hurt pra esta especie)`); continue }

    const destNormal = join(BATTLE_SPRITES_DIR, id, 'Hurt-Anim.png')
    copyFile(resolved.file, destNormal)

    const shinyFile = join(shinySpriteDir, 'Hurt-Anim.png')
    const destShiny = join(BATTLE_SPRITES_DIR, id, 'Hurt-Shiny-Anim.png')
    copyFile(existsSync(shinyFile) ? shinyFile : resolved.file, destShiny)

    novasEntradas[id] = {
      frameWidth: resolved.node.frameWidth,
      frameHeight: resolved.node.frameHeight,
      durations: resolved.node.durations,
    }
    importadas.push(id)
  }

  if (importadas.length > 0) {
    const conteudo = readFileSync(ANIMS_TS_PATH, 'utf8')
    const m = conteudo.match(/export const BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = ([\s\S]*?);?\s*$/)
    if (!m) throw new Error('nao encontrei BATTLE_SPRITE_ANIMS em battleSpriteAnims.ts')
    const existente = JSON.parse(m[1])
    for (const [id, anim] of Object.entries(novasEntradas)) {
      existente[id] = { ...existente[id], Hurt: anim }
    }
    const header = conteudo.slice(0, m.index)
    // SEM ; no final: scripts/geometriaDosSprites.test.mjs le este arquivo com
    // `[\s\S]*$` (ate o fim literal) e faz JSON.parse direto — um ; sobrando
    // quebra o parse. O arquivo original tambem termina sem ele.
    writeFileSync(
      ANIMS_TS_PATH,
      `${header}export const BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = ${JSON.stringify(existente, null, 2)}\n`,
    )
  }

  console.log(`\nImportadas: ${importadas.length}`)
  console.log(`Puladas: ${puladas.length}`)
  for (const p of puladas.slice(0, 20)) console.log(`  - ${p}`)
  if (puladas.length > 20) console.log(`  ... e mais ${puladas.length - 20}`)
}

main()
