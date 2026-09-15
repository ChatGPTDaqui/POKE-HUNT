// Retratos dos treinadores para a foto de perfil (PH-548, PH-550): baixa o
// sprite de corpo inteiro do acervo de treinadores do Pokemon Showdown — a
// mesma familia de fonte de `assets/gen5ani` — para `assets/treinadores/<id>.png`
// e recorta o ROSTO em `assets/treinadores/rosto/<id>.png`.
//
// POR QUE RECORTAR: o sprite e 80x80 de corpo inteiro; num quadrado de 2em o
// rosto some (PH-550). O recorte e um quadrado no topo da caixa do sprite,
// centrado no eixo dela — o mesmo corte cego pra todos, porque os sprites de
// treinador do acervo sao todos em pe e com a cabeca no topo. Pixel art
// tolera o corte: a tela desenha com `image-rendering: pixelated`, entao o
// que sai e o mesmo pixel maior, nao um borrao.
//
// A lista de ids e a de `src/data/avatares.ts`; o arquivo remoto pode ter
// sufixo de geracao (Agatha, Maxie, Leaf, Lorelei e a Equipe Rocket nao tem
// versao sem sufixo no acervo), por isso o mapa explicito em vez de
// `${id}.png` cego. Idempotente: pula o que ja existe, `--forcar` refaz tudo.
//
// Run: node scripts/importar-retratos-de-treinador.mjs [--forcar]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DESTINO = join(ROOT, 'assets', 'treinadores')
const ROSTOS = join(DESTINO, 'rosto')
const BASE = 'https://play.pokemonshowdown.com/sprites/trainers/'
const FORCAR = process.argv.includes('--forcar')

/** Fracao da altura da caixa do sprite que vira o lado do quadrado do rosto. */
const FRACAO_DO_ROSTO = 0.42

/**
 * id do avatar -> nome do arquivo no acervo (sem .png), ou { remoto, x, y } quando
 * o rosto nao esta no centro horizontal do topo da caixa (x = fracao da largura,
 * y = fracao da altura onde o quadrado comeca).
 */
const ARQUIVO_REMOTO = {
  // Os dez bots do PvP (scripts/pvp/seed-bots.mjs).
  red: 'red',
  blue: 'blue',
  giovanni: 'giovanni',
  lance: 'lance',
  agatha: 'agatha-gen3',
  blaine: 'blaine',
  steven: 'steven',
  wallace: 'wallace',
  maxie: 'maxie-gen3',
  ash: 'ash',
  // PH-550: mais gente iconica do desenho e dos jogos.
  // A Equipe Rocket vem de um sprite so com os tres (teamrocket.png): Jessie a
  // esquerda, James no meio, Meowth embaixo. O rosto de cada um e um corte do
  // mesmo arquivo com o centro horizontal deslocado (`x`, fracao da caixa).
  jessie: { remoto: 'teamrocket', x: 0.28, y: 0.04 },
  james: { remoto: 'teamrocket', x: 0.66, y: 0.04 },
  'recruta-rocket': 'rocketgrunt',
  'recruta-rocket-f': 'rocketgruntf',
  archer: 'archer',
  // Braco erguido acima da cabeca: a caixa comeca no braco, o rosto e mais baixo.
  ariana: { remoto: 'ariana', y: 0.12 },
  misty: 'misty',
  brock: 'brock',
  oak: 'oak',
  cynthia: 'cynthia',
  leaf: 'leaf-gen3',
  ethan: 'ethan',
  lyra: 'lyra',
  may: 'may',
  dawn: 'dawn',
  serena: 'serena',
  n: 'n',
  silver: 'silver',
  sabrina: 'sabrina',
  erika: 'erika',
  koga: 'koga',
  bruno: 'bruno',
  lorelei: 'lorelei-gen3',
  whitney: 'whitney',
  morty: 'morty',
  clair: 'clair',
}

/** Caixa dos pixels opacos: `null` se o sprite for todo transparente. */
function caixaOpaca(png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

function recortarRosto(png, xFracao = 0.5, yFracao = 0) {
  const caixa = caixaOpaca(png)
  if (!caixa) return null
  const altura = caixa.y1 - caixa.y0 + 1
  const lado = Math.max(8, Math.round(altura * FRACAO_DO_ROSTO))
  const centroX = Math.round(caixa.x0 + (caixa.x1 - caixa.x0) * xFracao)
  let x = centroX - Math.floor(lado / 2)
  let y = Math.round(caixa.y0 + altura * yFracao)
  x = Math.max(0, Math.min(png.width - lado, x))
  y = Math.max(0, Math.min(png.height - lado, y))
  const rosto = new PNG({ width: lado, height: lado })
  PNG.bitblt(png, rosto, x, y, lado, lado, 0, 0)
  return rosto
}

mkdirSync(ROSTOS, { recursive: true })
let baixados = 0
let recortados = 0
for (const [id, entrada] of Object.entries(ARQUIVO_REMOTO)) {
  const { remoto, x = 0.5, y = 0 } = typeof entrada === 'string' ? { remoto: entrada } : entrada
  const corpo = join(DESTINO, `${id}.png`)
  if (!existsSync(corpo) || FORCAR) {
    const res = await fetch(`${BASE}${remoto}.png`)
    if (!res.ok) throw new Error(`${id}: HTTP ${res.status} em ${remoto}.png`)
    writeFileSync(corpo, Buffer.from(await res.arrayBuffer()))
    baixados += 1
    console.log(`+ ${id} <- ${remoto}.png`)
  }
  const alvo = join(ROSTOS, `${id}.png`)
  if (existsSync(alvo) && !FORCAR) continue
  const png = PNG.sync.read(readFileSync(corpo))
  const rosto = recortarRosto(png, x, y)
  if (!rosto) throw new Error(`${id}: sprite sem pixel opaco`)
  writeFileSync(alvo, PNG.sync.write(rosto))
  recortados += 1
  console.log(`  rosto ${id}: ${rosto.width}x${rosto.height}`)
}
console.log(`${baixados} retrato(s) baixado(s), ${recortados} rosto(s) recortado(s) em assets/treinadores/`)
