// Importa a arte de toda especie que ESTA no catalogo gerado e ainda NAO tem
// `assets/battle-sprites/<id>/` — e depois costura as tres tabelas
// hand-authored que o jogo le pra desenhar.
//
// Rodar com: npm run especies:importar
//
// ---------------------------------------------------------------------------
// POR QUE ESTE SCRIPT EXISTE, SE JA HAVIA UM
//
// `scripts/import-kanto-sprites.js` fez este mesmo trabalho na leva das ~130
// especies de Kanto, mas escreve em `js/data/*.js` — o jogo vanilla, que nao
// existe mais — e le a lista de especies da planilha `.xlsx`, que deixou de ser
// a fonte do catalogo quando o gerador passou a ser `npm run usum:gerar`.
// Rodar aquele arquivo hoje falha no primeiro `readFileSync`. Este aqui e o
// mesmo algoritmo apontando pros arquivos vigentes; o antigo fica como
// registro da leva que ele rodou.
//
// ---------------------------------------------------------------------------
// DE ONDE VEM A ARTE
//
// De um checkout LOCAL do PMDCollab/SpriteCollab, nao da rede. O caminho vem de
// `--acervo=<pasta>` ou da variavel SPRITECOLLAB_DIR. A pasta tem que conter
// `sprite/` e `portrait/` na raiz.
//
// Baixar da API seriam ~40 requisicoes por especie e a arvore de `sprite/` ja
// passa do limite em que a API do GitHub trunca a listagem (`truncated: true`),
// o que daria cobertura silenciosamente incompleta.
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { lerAnimData, resolverAnim } from './lib/animdata.mjs'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))

const ACERVO = (() => {
  const arg = process.argv.find((a) => a.startsWith('--acervo='))
  const caminho = arg ? arg.slice('--acervo='.length) : process.env.SPRITECOLLAB_DIR
  if (!caminho) {
    throw new Error(
      'informe o checkout do SpriteCollab: --acervo="<pasta>" ou SPRITECOLLAB_DIR=<pasta>\n' +
      'A pasta precisa ter sprite/ e portrait/ na raiz.'
    )
  }
  for (const sub of ['sprite', 'portrait']) {
    if (!existsSync(join(caminho, sub))) throw new Error(`${caminho} nao tem ${sub}/ — nao e um checkout do SpriteCollab`)
  }
  return caminho
})()

const SPRITE_ROOT = join(ACERVO, 'sprite')
const PORTRAIT_ROOT = join(ACERVO, 'portrait')

const BATTLE_DIR = join(RAIZ, 'assets', 'battle-sprites')
const FACE_DIR = join(RAIZ, 'assets', 'sprites-face')
const FACE_SHINY_DIR = join(RAIZ, 'assets', 'sprites-face-shiny')
const ICON_DIR = join(RAIZ, 'assets', 'sprites')
const ICON_SHINY_DIR = join(RAIZ, 'assets', 'sprites-shiny')

// As seis que `src/data/battleSpriteAnims.ts#AnimName` conhece. O acervo tem
// ~40 por especie; trazer o resto seria peso sem consumidor.
const ANIMS = ['Idle', 'Walk', 'Shoot', 'Charge', 'Sleep', 'Faint']

// ---------------------------------------------------------------------------
// Catalogo: id -> numero da Pokedex
//
// Mesma leitura que `scripts/importar-faces-emocao.mjs` faz: o numero so existe
// no texto da descricao. Ler dali evita uma segunda tabela de dex pra sair de
// sincronia com a primeira.
function especiesDoCatalogo() {
  const texto = readFileSync(join(RAIZ, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
  const ids = [...texto.matchAll(/"id": "([a-z0-9_]+)"/g)].map((m) => m[1])
  const dex = [...texto.matchAll(/"description": "Pokedex N.(\d+)/g)].map((m) => Number(m[1]))
  if (ids.length !== dex.length) {
    throw new Error(`catalogo com ${ids.length} ids e ${dex.length} numeros de Pokedex — leitura desalinhada`)
  }
  return ids.map((id, i) => ({ id, dex4: String(dex[i]).padStart(4, '0') }))
}

/**
 * A FONTE alternativa: `scripts/usum/catalog.json`, filtrada por faixa de dex.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO PRECISOU EXISTIR — o ciclo arte <-> catalogo (PH-332)
 * ---------------------------------------------------------------------------
 * O plano de ativacao da Geracao III (docs/17) manda, nesta ordem: gerar o
 * catalogo (passo 4), importar a arte (passo 5), gerar o catalogo DE NOVO
 * (passo 6, porque a curadoria de hunts le `assets/battle-sprites/` em tempo de
 * carga). Rodando isso, o passo 5 nao importa nada — e o motivo e uma
 * dependencia circular que o plano nao viu:
 *
 *   `pokes.generated.ts` sai de `usum:gerar`, cujo elenco (`allSpeciesKeys`)
 *   nasce das pools de hunt, que `sync-planilha.js#buildTypeRoster` filtra por
 *   `ART_SPECIES_IDS` = os diretorios de `assets/battle-sprites/`.
 *
 *   Sem arte -> fora do catalogo gerado.
 *   `especiesDoCatalogo()` le o catalogo gerado -> nao acha as 135.
 *   Nada e importado -> continua sem arte.
 *
 * Medido: depois de `usum:baixar --dex-max=386` e `usum:gerar`,
 * `scripts/usum/catalog.json` tem 386 especies e `pokes.generated.ts` continua
 * com 245. Nenhum erro em lugar nenhum.
 *
 * A saida NAO e desligar o filtro de arte por uma rodada (isso poria 135
 * especies em pool de hunt com forma geometrica, que e exatamente o que aquele
 * filtro existe pra impedir). E importar a arte a partir da FONTE do catalogo,
 * e nao do arquivo derivado dele: `scripts/usum/catalog.json` ja tem `chave` e
 * `dex` das 386, e nao depende de arte nenhuma.
 *
 * Por isso e um modo explicito (`--faixa-dex=252-386`) e nao o padrao: o uso
 * normal do script — "importar quem entrou no catalogo e ainda nao tem arte" —
 * continua funcionando como antes.
 */
function especiesDaFaixa(faixa) {
  const m = /^(\d+)-(\d+)$/.exec(faixa)
  if (!m) throw new Error(`--faixa-dex invalido: ${faixa} (esperado "252-386")`)
  const [, de, ate] = m.map(Number)
  const caminho = join(RAIZ, 'scripts', 'usum', 'catalog.json')
  if (!existsSync(caminho)) throw new Error('scripts/usum/catalog.json nao existe — rode `npm run usum:baixar`')
  const catalogo = JSON.parse(readFileSync(caminho, 'utf8'))
  const naFaixa = catalogo.especies.filter((e) => e.dex >= de && e.dex <= ate)
  if (!naFaixa.length) {
    throw new Error(
      `nenhuma especie entre dex ${de} e ${ate} em scripts/usum/catalog.json `
      + `(o recorte dele e 1-${catalogo._recorte?.dexMax ?? '?'}).`
    )
  }
  return naFaixa.map((e) => ({ id: e.chave, dex4: String(e.dex).padStart(4, '0') }))
}

// ---------------------------------------------------------------------------
// Medicao do pe
//
// `spriteFootOffsets.ts` guarda onde o POKE realmente pisa dentro do quadro,
// como fracao de frameHeight medida do CENTRO pra baixo. Os quadros do PMD tem
// muito vazio de embalo em cima e embaixo; fixar 0.5 (borda do quadro) foi o
// bug que deixava a sombra flutuando longe do pe.
//
// Medido no quadro 0 da fileira 0 (virado pra baixo) — a mesma convencao
// documentada la, so que calculada em vez de estimada no olho.
const ALFA_MINIMO = 20

function medirPe(pngPath, frameWidth, frameHeight) {
  const { width, height, rgba } = decodificarPng(readFileSync(pngPath))
  if (frameWidth > width || frameHeight > height) return null
  let ultimaLinhaOpaca = -1
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      if (rgba[(y * width + x) * 4 + 3] > ALFA_MINIMO) { ultimaLinhaOpaca = y; break }
    }
  }
  if (ultimaLinhaOpaca < 0) return null
  return Math.round(((ultimaLinhaOpaca - frameHeight / 2) / frameHeight) * 1000) / 1000
}

// ---------------------------------------------------------------------------
function copiar(origem, destino) {
  mkdirSync(dirname(destino), { recursive: true })
  copyFileSync(origem, destino)
}

// Insere as linhas novas antes do fechamento do objeto, preservando o resto do
// arquivo byte a byte. Os arquivos do repo estao em CRLF; escrever LF sujaria o
// diff inteiro com "arquivo trocou de final de linha".
function inserirAntesDoFechamento(caminho, fechamento, comentario, linhas) {
  const conteudo = readFileSync(caminho, 'utf8')
  const eol = conteudo.includes('\r\n') ? '\r\n' : '\n'
  // Ancora no fechamento EXATO do objeto (`};` no comeco da linha), nao no
  // ultimo `}` do arquivo: esses arquivos tem funcoes depois da tabela, e
  // `lastIndexOf('}')` enfia as linhas no meio de uma delas — o que rende erro
  // de sintaxe, nao um diff errado silencioso, mas custa uma rodada de tsc.
  const idx = conteudo.indexOf(eol + fechamento)
  if (idx === -1) throw new Error(`nao achei ${JSON.stringify(fechamento)} em ${caminho}`)
  const bloco = eol + comentario.split('\n').map((l) => `  ${l}`).join(eol) + eol +
    linhas.map((l) => `  ${l}`).join(eol) + eol
  writeFileSync(caminho, conteudo.slice(0, idx) + bloco + conteudo.slice(idx))
}

function costurarAnims(novas) {
  const caminho = join(RAIZ, 'src', 'data', 'battleSpriteAnims.ts')
  const conteudo = readFileSync(caminho, 'utf8')
  const eol = conteudo.includes('\r\n') ? '\r\n' : '\n'
  const m = conteudo.match(/export const BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = ([\s\S]*)$/)
  if (!m) throw new Error('nao achei BATTLE_SPRITE_ANIMS')
  const existente = JSON.parse(m[1].trim())
  const juntas = { ...existente, ...novas }
  const corpo = JSON.stringify(juntas, null, 2).replace(/\n/g, eol)
  writeFileSync(caminho, conteudo.slice(0, m.index) +
    `export const BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = ${corpo}${eol}`)
}

// `SPECIES_WITH_ART` e um Set literal, nao um objeto: o fechamento e `]);` e
// nao `}`, entao ele nao passa por `inserirAntesDoFechamento`.
function costurarSpeciesComArte(ids, nota) {
  const caminho = join(RAIZ, 'src', 'data', 'sprites.ts')
  const conteudo = readFileSync(caminho, 'utf8')
  const eol = conteudo.includes('\r\n') ? '\r\n' : '\n'
  const idx = conteudo.indexOf(']);')
  if (idx === -1) throw new Error('nao achei o fechamento de SPECIES_WITH_ART')
  const bloco = eol +
    nota.split('\n').map((l) => `  // ${l}`).join(eol) + eol +
    `  ${ids.map((id) => `'${id}'`).join(', ')},${eol}`
  writeFileSync(caminho, conteudo.slice(0, idx) + bloco + conteudo.slice(idx))
}

// ---------------------------------------------------------------------------
const { createRequire } = await import('node:module')
const { decodePng: decodificarPng } = createRequire(import.meta.url)('./lib/png.js')

const FAIXA_DEX = (() => {
  const arg = process.argv.find((a) => a.startsWith('--faixa-dex='))
  return arg ? arg.slice('--faixa-dex='.length) : null
})()

const fonte = FAIXA_DEX ? especiesDaFaixa(FAIXA_DEX) : especiesDoCatalogo()
const alvos = fonte.filter(({ id }) => !existsSync(join(BATTLE_DIR, id)))
console.log(
  `${alvos.length} especie(s) sem battle-sprites`
  + (FAIXA_DEX ? ` — fonte: scripts/usum/catalog.json, dex ${FAIXA_DEX}` : ' — fonte: pokes.generated.ts'),
)
if (!alvos.length) process.exit(0)

const anims = {}
const pes = {}
const importadas = []
const puladas = []

for (const { id, dex4 } of alvos) {
  const spriteDir = join(SPRITE_ROOT, dex4)
  const shinySpriteDir = join(spriteDir, '0000', '0001')
  const portraitDir = join(PORTRAIT_ROOT, dex4)
  const shinyPortraitDir = join(portraitDir, '0000', '0001')

  const animXml = join(spriteDir, 'AnimData.xml')
  if (!existsSync(animXml)) { puladas.push(`${id} (sem sprite/${dex4}/AnimData.xml)`); continue }
  const porNome = lerAnimData(animXml)

  const doId = {}
  let quadroIdle = null
  let idleW = null
  let idleH = null

  for (const anim of ANIMS) {
    const r = resolverAnim(anim, porNome, spriteDir)
    if (!r) continue
    const destino = join(BATTLE_DIR, id, `${anim}-Anim.png`)
    copiar(r.arquivo, destino)
    // Shiny sem quadro proprio reusa o normal: melhor a paleta errada do que
    // um <img> que nao carrega no meio do combate.
    const shiny = join(shinySpriteDir, `${r.nome}-Anim.png`)
    copiar(existsSync(shiny) ? shiny : r.arquivo, join(BATTLE_DIR, id, `${anim}-Shiny-Anim.png`))
    doId[anim] = { frameWidth: r.no.frameWidth, frameHeight: r.no.frameHeight, durations: r.no.duracoes }
    if (anim === 'Idle' || (anim === 'Walk' && !quadroIdle)) {
      quadroIdle = destino; idleW = r.no.frameWidth; idleH = r.no.frameHeight
    }
  }
  if (!Object.keys(doId).length) { puladas.push(`${id} (nenhuma das ${ANIMS.length} animacoes resolveu)`); continue }
  anims[id] = doId

  if (quadroIdle) {
    const frac = medirPe(quadroIdle, idleW, idleH)
    if (frac != null) pes[id] = frac
  }

  // Retrato neutro serve os DOIS destinos (icone de lista e face do trilho) —
  // nao existe arte de caixa separada pra essas especies, igual as ~190 que ja
  // estavam no jogo.
  const retrato = join(portraitDir, 'Normal.png')
  if (existsSync(retrato)) {
    const retratoShiny = join(shinyPortraitDir, 'Normal.png')
    const origemShiny = existsSync(retratoShiny) ? retratoShiny : retrato
    copiar(retrato, join(FACE_DIR, `${id}.png`))
    copiar(origemShiny, join(FACE_SHINY_DIR, `${id}.png`))
    copiar(retrato, join(ICON_DIR, `${id}.png`))
    copiar(origemShiny, join(ICON_SHINY_DIR, `${id}.png`))
  } else {
    puladas.push(`${id} (aviso: sem portrait/${dex4}/Normal.png — fica com forma geometrica na lista)`)
  }

  importadas.push(id)
}

// A nota que vai NOS ARQUIVOS costurados. Ela nao e decoracao: quem abrir
// `sprites.ts` daqui a seis meses precisa saber de que leva vieram aquelas
// linhas, e a versao anterior deste script escrevia "PH-145" fixo — o que
// mentiria para qualquer leva seguinte.
const NOTA = FAIXA_DEX
  ? `PH-332: as especies de Hoenn (dex ${FAIXA_DEX}), importadas a partir de\n`
    + 'scripts/usum/catalog.json (ver `especiesDaFaixa` e o ciclo arte<->catalogo).'
  : 'As evolucoes que entraram no elenco com PH-145 — mesma medicao\n'
    + 'automatica das levas anteriores.';

if (importadas.length) {
  costurarAnims(anims)
  inserirAntesDoFechamento(
    join(RAIZ, 'src', 'data', 'spriteFootOffsets.ts'),
    '};',
    NOTA.split('\n').map((l) => `// ${l}`).join('\n'),
    Object.entries(pes).map(([id, f]) => `${id}: ${f},`),
  )
  costurarSpeciesComArte(importadas, NOTA)
}

console.log(`\nImportadas: ${importadas.length}${importadas.length ? ` (${importadas.join(', ')})` : ''}`)
if (puladas.length) {
  console.log(`Puladas/avisos: ${puladas.length}`)
  for (const p of puladas) console.log(`  - ${p}`)
}
