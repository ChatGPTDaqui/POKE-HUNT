// Mede, por TIPO DE ASSET, quanto da arte das 135 especies de Hoenn ja existe
// no acervo local — e o que teria que ser desenhado ou buscado noutra fonte.
//
//   node scripts/conferir-arte-gen3.mjs --acervo="<checkout do SpriteCollab>"
//
// PH-146. Nao copia nada: so conta. A importacao de verdade e
// `npm run especies:importar`, e ela so deve rodar quando a geracao for ligada —
// sao ~4.000 arquivos, e commitar isso antes da hora poe peso no repo por um
// dado que ainda nao e usado.
//
// ---------------------------------------------------------------------------
// POR QUE CONTAR ANTES IMPORTA
// ---------------------------------------------------------------------------
// O elenco do jogo e filtrado por `assets/battle-sprites/<id>/`
// (`sync-planilha.js#ART_SPECIES_IDS`). Especie sem arte simplesmente NAO entra
// nas hunts — sem erro, sem aviso. Ligar a geracao com 20 espécies sem sprite
// nao daria mensagem nenhuma: elas apareceriam na Pokedex e nunca no mato.
//
// Este script existe pra esse numero ser conhecido ANTES, e nomeado.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { lerAnimData, resolverAnim } from './lib/animdata.mjs'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))

const ACERVO = (() => {
  const a = process.argv.find((x) => x.startsWith('--acervo='))
  const caminho = a ? a.slice('--acervo='.length) : process.env.SPRITECOLLAB_DIR
  if (!caminho) return null
  return existsSync(join(caminho, 'sprite')) ? caminho : null
})()

const DEX_MIN = 252
const DEX_MAX = 386
const ANIMS = ['Idle', 'Walk', 'Shoot', 'Charge', 'Sleep', 'Faint']
const EMOCOES = ['Pain', 'Worried', 'Dizzy', 'Stunned', 'Sigh', 'Joyous', 'Determined']

const catalogo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'usum', 'catalog-gen3.json'), 'utf8'))
const gen3 = catalogo.especies
  .filter((e) => e.dex >= DEX_MIN && e.dex <= DEX_MAX)
  .sort((a, b) => a.dex - b.dex)

const dex4 = (n) => String(n).padStart(4, '0')

// `assets/gen5ani/` usa o NOME em minusculo, com hifen — outra convencao que a
// dos ids do jogo (`mr__mime`). Normalizar os dois lados evita uma tabela de
// excecao que envelheceria sozinha.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const gen5 = new Set(
  existsSync(join(RAIZ, 'assets', 'gen5ani'))
    ? readdirSync(join(RAIZ, 'assets', 'gen5ani')).map((f) => norm(f.replace(/\.gif$/, '')))
    : [],
)
const gen5Shiny = new Set(
  existsSync(join(RAIZ, 'assets', 'gen5ani-shiny'))
    ? readdirSync(join(RAIZ, 'assets', 'gen5ani-shiny')).map((f) => norm(f.replace(/\.gif$/, '')))
    : [],
)

const contagem = {
  jaNoRepo: 0,
  spriteNoAcervo: 0, portraitNoAcervo: 0, portraitShinyNoAcervo: 0,
  gen5ani: 0, gen5aniShiny: 0,
}
const buracos = {
  semSprite: [], semPortrait: [], semPortraitShiny: [], semGen5: [],
  animsParciais: [], emocoesParciais: [], semEmocaoNenhuma: [],
}

for (const especie of gen3) {
  const d = dex4(especie.dex)
  const chave = especie.chave

  if (existsSync(join(RAIZ, 'assets', 'battle-sprites', chave))) contagem.jaNoRepo += 1

  if (gen5.has(norm(chave))) contagem.gen5ani += 1
  else buracos.semGen5.push(chave)
  if (gen5Shiny.has(norm(chave))) contagem.gen5aniShiny += 1

  if (!ACERVO) continue

  const spriteDir = join(ACERVO, 'sprite', d)
  const portraitDir = join(ACERVO, 'portrait', d)

  if (existsSync(join(spriteDir, 'AnimData.xml'))) {
    contagem.spriteNoAcervo += 1
    // Segue `<CopyOf>` igual `importar-especies-novas.mjs#resolverAnim` faz.
    // Contar arquivo cru mede a coisa errada: Silcoon, Cascoon e Lileep nao tem
    // `Idle-Anim.png` proprio e apontam pra `Walk` — a animacao EXISTE, e o
    // importador a resolve. A primeira versao deste script os listou como
    // buraco e o "buraco" era do medidor.
    const porNome = lerAnimData(join(spriteDir, 'AnimData.xml'))
    const faltando = ANIMS.filter((a) => !resolverAnim(a, porNome, spriteDir))
    if (faltando.includes('Idle') || faltando.includes('Walk')) {
      buracos.animsParciais.push(`${chave} (nem por CopyOf: ${faltando.join(',')})`)
    }
  } else {
    buracos.semSprite.push(chave)
  }

  if (existsSync(join(portraitDir, 'Normal.png'))) contagem.portraitNoAcervo += 1
  else buracos.semPortrait.push(chave)

  if (existsSync(join(portraitDir, '0000', '0001', 'Normal.png'))) contagem.portraitShinyNoAcervo += 1
  else buracos.semPortraitShiny.push(chave)

  const temEmocao = EMOCOES.filter((e) => existsSync(join(portraitDir, `${e}.png`))).length
  if (temEmocao === 0) buracos.semEmocaoNenhuma.push(chave)
  else if (temEmocao < EMOCOES.length) buracos.emocoesParciais.push(`${chave} (${temEmocao}/7)`)
}

// ---------------------------------------------------------------------------
const n = gen3.length
const linha = (rotulo, valor, total = n) =>
  `  ${rotulo.padEnd(34)} ${String(valor).padStart(3)}/${total}` +
  `${valor === total ? '  completo' : `  FALTAM ${total - valor}`}`

console.log(`COBERTURA DE ARTE — ${n} especies de Hoenn (dex ${DEX_MIN}-${DEX_MAX})\n`)

console.log('Ja no repositorio (nao precisa importar):')
console.log(linha('battle-sprites/<id>/', contagem.jaNoRepo))

console.log('\nJa no repositorio, outra pasta:')
console.log(linha('gen5ani/<nome>.gif', contagem.gen5ani))
console.log(linha('gen5ani-shiny/<nome>.gif', contagem.gen5aniShiny))

if (!ACERVO) {
  console.log('\nAcervo do SpriteCollab nao informado — passe --acervo=<pasta> ou')
  console.log('SPRITECOLLAB_DIR=<pasta> para medir sprite/, portrait/ e emocoes.')
} else {
  console.log('\nNo acervo local do SpriteCollab (a importar):')
  console.log(linha('sprite/<dex>/AnimData.xml', contagem.spriteNoAcervo))
  console.log(linha('portrait/<dex>/Normal.png', contagem.portraitNoAcervo))
  console.log(linha('portrait/<dex>/0000/0001/Normal.png', contagem.portraitShinyNoAcervo))

  const comEmocaoCompleta = n - buracos.semEmocaoNenhuma.length - buracos.emocoesParciais.length
  console.log(linha('7 faces de emocao', comEmocaoCompleta))
}

console.log('\n--- BURACOS ---')
let algum = false
for (const [rotulo, lista] of [
  ['sem sprite no acervo', buracos.semSprite],
  ['sem portrait no acervo', buracos.semPortrait],
  ['sem portrait shiny', buracos.semPortraitShiny],
  ['sem Idle/Walk (o piso das anims)', buracos.animsParciais],
  ['sem gen5ani', buracos.semGen5],
  ['ZERO faces de emocao', buracos.semEmocaoNenhuma],
  ['faces de emocao parciais', buracos.emocoesParciais],
]) {
  if (!lista.length) continue
  algum = true
  console.log(`\n${rotulo} (${lista.length}):`)
  console.log(`  ${lista.join(', ')}`)
}
if (!algum) console.log('\nNenhum. A arte das 135 esta inteira no acervo local.')

console.log('\n--- PARA IMPORTAR, QUANDO A GERACAO FOR LIGADA ---')
console.log('  npm run especies:importar -- --acervo="<checkout do SpriteCollab>"')
console.log('  npm run faces:emocao')
console.log('Nesta ordem, e SO DEPOIS de o catalogo do jogo ja conter as especies:')
console.log('o importador varre `pokes.generated.ts` e pula quem nao esta la.')
