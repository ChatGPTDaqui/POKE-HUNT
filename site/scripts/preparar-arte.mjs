// Gera em site/public/art/ as versões leves da arte do jogo (pasta assets/ na
// raiz) usadas pelo site. A arte original tem 2048px e vários MB, então o site
// nunca aponta para ela direto.
//
//   node site/scripts/preparar-arte.mjs
//
// Rodar de novo só quando a arte de origem mudar. O resultado é versionado.
import sharp from 'sharp'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEM = join(SITE, '..', 'assets')
const DESTINO = join(SITE, 'public', 'art')

const pasta = (p) => { mkdirSync(join(DESTINO, p), { recursive: true }); return join(DESTINO, p) }

async function webp(origem, destino, largura, qualidade = 78) {
  await sharp(origem).resize({ width: largura, withoutEnlargement: true }).webp({ quality: qualidade }).toFile(destino)
}

// Cenários de hunt (vista de cima, pixel art): herói e faixa final.
const cenarios = pasta('cenarios')
for (const nome of ['beach', 'plains', 'tall-grass', 'forest']) {
  await webp(join(ORIGEM, 'hunt-backgrounds', `${nome}.jpg`), join(cenarios, `${nome}-1600.webp`), 1600)
  await webp(join(ORIGEM, 'hunt-backgrounds', `${nome}.jpg`), join(cenarios, `${nome}-900.webp`), 900)
}

// Ilustrações dos 12 biomas (seletor de bioma do jogo).
const biomas = pasta('biomas')
for (const nome of ['campo_aberto', 'mata', 'marinho', 'aguas_interiores', 'aridos', 'subterraneo',
  'gelido', 'igneo', 'urbano', 'industrial', 'sombrio', 'sagrado']) {
  await webp(join(ORIGEM, 'biome-selector', `${nome}.jpg`), join(biomas, `${nome}.webp`), 640, 74)
}

// Sprites pequenos: copiados como estão (pixel art de 80px / GIFs animados).
const treinadores = pasta('treinadores')
for (const nome of ['red', 'misty', 'brock', 'erika', 'sabrina', 'blaine', 'lance', 'oak']) {
  copyFileSync(join(ORIGEM, 'treinadores', `${nome}.png`), join(treinadores, `${nome}.png`))
}
const sprites = pasta('sprites')
for (const nome of ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'krabby', 'shellder', 'wingull',
  'pidgey', 'rattata', 'caterpie', 'eevee', 'dragonite', 'gyarados']) {
  copyFileSync(join(ORIGEM, 'gen5ani', `${nome}.gif`), join(sprites, `${nome}.gif`))
}
copyFileSync(join(ORIGEM, 'pokeball-throw', 'poke_ball-success.png'), join(pasta('fx'), 'pokebola.png'))

console.log('arte pronta em', DESTINO)
