// Baixa as faces de EMOCAO de cada especie e gera o mapa de quem tem o que.
//
// Por que existe: `assets/sprites-face/<id>.png` guarda UMA face por especie —
// a expressao neutra. O banco de arte de origem tem ~16 expressoes por especie
// no mesmo formato (40x40, alpha), e o HUD passou a trocar a face conforme o
// estado do POKE em campo (ver src/data/faceEmotions.ts). Este script traz as 7
// expressoes que esse mapeamento usa e mais nada.
//
// Rodar com: node scripts/importar-faces-emocao.mjs [--forcar]
//
// Idempotente: arquivo que ja existe em disco nao e baixado de novo (passe
// `--forcar` pra rebaixar tudo). A cobertura NAO e completa — cerca de 40 das
// 226 especies nao tem parte das expressoes na origem, e e por isso que o mapa
// gerado existe: sem ele o navegador pediria um PNG que nao existe e o HUD
// ficaria com um <img> quebrado. Quem nao tem cai na face neutra, decidido em
// tempo de compilacao e nao por 404.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const FORCAR = process.argv.includes('--forcar')

// Nome do arquivo na origem -> slug usado no nosso disco e no codigo.
// Mantidos em minusculo e sem hifen porque viram chave de objeto no TS gerado.
const EMOCOES = {
  pain: 'Pain',
  worried: 'Worried',
  dizzy: 'Dizzy',
  stunned: 'Stunned',
  sigh: 'Sigh',
  joyous: 'Joyous',
  determined: 'Determined',
}

// SUBSTITUTAS: qual outra expressao da origem serve quando a canonica nao
// existe, em ordem de preferencia (PH-137).
//
// O acervo tem 16 expressoes por especie e este script usava 7. Medido: 8
// especies tinham ZERO das 7 e alguma das outras 9 — a cara delas nunca mudava,
// nem uma vez —, e outras 15 tinham buraco parcial com alternativa disponivel.
// Nao e falta de arte: e o mapeamento sendo estreito demais.
//
// O CRITERIO e o que o trilho de status precisa comunicar DE RELANCE, e nao
// sinonimo de dicionario. A face responde "o quanto incomoda", nao "qual e o
// status" — quem diz qual e o status e o selo colorido do lado. Entao a
// substituta certa e a que le com a mesma URGENCIA, mesmo com outro nome:
//
//   pain       dor        Crying > Teary-Eyed > Sad
//   worried    apreensao  Sad > Teary-Eyed > Crying
//   dizzy      tontura    Surprised > Crying        (olho arregalado, sem foco)
//   stunned    travado    Surprised > Shouting      (pego de surpresa e parado)
//   sigh       apatia     Sad > Teary-Eyed          (sono/desanimo, olho baixo)
//   joyous     festa      Happy > Inspired
//   determined foco       Inspired > Angry > Shouting
//
// `Angry` NAO substitui `pain`, e a tentacao existia: raiva le como "vai
// revidar", que e o oposto de "esta apanhando". Pelo mesmo motivo `Shouting` so
// entra em `determined` e `stunned`, nunca em `sigh`.
const SUBSTITUTAS = {
  pain: ['Crying', 'Teary-Eyed', 'Sad'],
  worried: ['Sad', 'Teary-Eyed', 'Crying'],
  dizzy: ['Surprised', 'Crying'],
  stunned: ['Surprised', 'Shouting'],
  sigh: ['Sad', 'Teary-Eyed'],
  joyous: ['Happy', 'Inspired'],
  determined: ['Inspired', 'Angry', 'Shouting'],
}

const REPO = 'PMDCollab/SpriteCollab'
const RAW = `https://raw.githubusercontent.com/${REPO}/master/portrait`
const CONCORRENCIA = 12

const DESTINO_NORMAL = join(RAIZ, 'assets', 'sprites-face', 'emo')
const DESTINO_SHINY = join(RAIZ, 'assets', 'sprites-face-shiny', 'emo')
const ARQUIVO_GERADO = join(RAIZ, 'src', 'data', 'generated', 'faceEmocoes.generated.ts')

// ---------- especies e numero da Pokedex ----------
// Mesma leitura que src/data/regions.ts faz em tempo de execucao: o numero da
// Pokedex Nacional so existe no texto da descricao da especie. Ler dali evita
// uma segunda tabela de dex pra sair de sincronia com a primeira.
function speciesComDex() {
  const texto = readFileSync(join(RAIZ, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
  const ids = [...texto.matchAll(/"id": "([a-z0-9_]+)"/g)].map((m) => m[1])
  const dex = [...texto.matchAll(/"description": "Pokedex N.(\d+)/g)].map((m) => Number(m[1]))
  if (ids.length !== dex.length) {
    throw new Error(`catalogo com ${ids.length} ids e ${dex.length} numeros de Pokedex — leitura desalinhada`)
  }
  // So as especies que JA tem face neutra em disco: elas sao o conjunto que o
  // jogo desenha (data/sprites.ts#SPECIES_WITH_ART). Baixar expressao de uma
  // especie sem face neutra criaria arte sem consumidor.
  return ids
    .map((id, i) => ({ id, dex4: String(dex[i]).padStart(4, '0') }))
    .filter(({ id }) => existsSync(join(RAIZ, 'assets', 'sprites-face', `${id}.png`)))
}

// ---------- o que existe na origem ----------
// Uma requisicao pra arvore inteira de `portrait/` em vez de um HEAD por
// arquivo: sao ~3.100 alvos, e perguntar de um em um seria a parte lenta do
// script inteiro.
async function arvoreDeRetratos() {
  const raiz = await pedirJson(`https://api.github.com/repos/${REPO}/git/trees/master`)
  const portrait = raiz.tree.find((e) => e.path === 'portrait')
  if (!portrait) throw new Error('a origem nao tem mais um diretorio portrait/ — formato mudou')
  const arvore = await pedirJson(`https://api.github.com/repos/${REPO}/git/trees/${portrait.sha}?recursive=1`)
  if (arvore.truncated) throw new Error('listagem truncada pela API — nao da pra confiar na cobertura')
  return new Set(arvore.tree.map((e) => e.path))
}

async function pedirJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`)
  return r.json()
}

// ---------- download ----------
async function baixar(url, destino) {
  const r = await fetch(url)
  if (!r.ok) return false
  const buf = Buffer.from(await r.arrayBuffer())
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, buf)
  return true
}

async function emLotes(tarefas, tamanho) {
  let i = 0
  let ok = 0
  let falhou = 0
  async function trabalhador() {
    while (i < tarefas.length) {
      const tarefa = tarefas[i++]
      if (await tarefa()) ok++
      else falhou++
    }
  }
  await Promise.all(Array.from({ length: tamanho }, trabalhador))
  return { ok, falhou }
}

// Uma linha por especie: com 226 entradas de 7 slugs, o `JSON.stringify`
// indentado gerava 3.300 linhas de arquivo pra caber uma tabela que o olho le
// melhor em 226.
function comoTabela(obj) {
  const linhas = Object.entries(obj)
    .filter(([, v]) => v.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, emocoes]) => `  ${id}: [${emocoes.map((e) => `'${e}'`).join(', ')}],`)
  return `{\n${linhas.join('\n')}\n}`
}

// ---------- main ----------
const especies = speciesComDex()
console.log(`${especies.length} especies com face neutra em disco`)

const arvore = await arvoreDeRetratos()
console.log(`origem: ${arvore.size} caminhos em portrait/`)

const tarefas = []
const temNormal = {}
const temShiny = {}

// De onde cada face substituida veio, na rodada ANTERIOR. Serve para uma coisa
// so, e ela e sutil: `existsSync(destino)` pula o download de um arquivo que ja
// esta em disco, e o arquivo em disco NAO diz de qual expressao ele saiu. Se a
// canonica passar a existir na origem, sem isto o substituto ficaria la para
// sempre, e o mapa gerado diria que a canonica esta em disco — mentira que so
// aparece olhando o retrato.
const substitutasAnteriores = (() => {
  if (!existsSync(ARQUIVO_GERADO)) return {}
  const texto = readFileSync(ARQUIVO_GERADO, 'utf8')
  const bloco = texto.match(/FACE_EMOCOES_SUBSTITUTAS[^=]*= (\{[\s\S]*?\n\})/)
  if (!bloco) return {}
  const mapa = {}
  for (const linha of bloco[1].split('\n')) {
    const m = linha.match(/'([^']+)': '([^']+)'/)
    if (m) mapa[m[1]] = m[2]
  }
  return mapa
})()

const substitutas = {}

for (const { id, dex4 } of especies) {
  temNormal[id] = []
  temShiny[id] = []
  for (const [slug, canonica] of Object.entries(EMOCOES)) {
    const alvos = [
      { prefixo: `${dex4}/`, destino: join(DESTINO_NORMAL, slug, `${id}.png`), lista: temNormal[id], paleta: 'normal' },
      { prefixo: `${dex4}/0000/0001/`, destino: join(DESTINO_SHINY, slug, `${id}.png`), lista: temShiny[id], paleta: 'shiny' },
    ]
    for (const { prefixo, destino, lista, paleta } of alvos) {
      // Canonica SEMPRE ganha. As substitutas so entram no buraco.
      const escolhida = [canonica, ...(SUBSTITUTAS[slug] ?? [])]
        .find((nome) => arvore.has(`${prefixo}${nome}.png`))
      if (!escolhida) continue
      lista.push(slug)

      const registro = `${paleta}:${slug}:${id}`
      if (escolhida !== canonica) substitutas[registro] = escolhida
      // Trocou de origem desde a ultima rodada (a canonica apareceu, ou a
      // preferencia mudou): rebaixa mesmo com o arquivo em disco.
      const mudou = (substitutasAnteriores[registro] ?? canonica) !== escolhida
      if (!FORCAR && !mudou && existsSync(destino)) continue
      tarefas.push(() => baixar(`${RAW}/${prefixo}${escolhida}.png`, destino))
    }
  }
}

console.log(`${tarefas.length} arquivos a baixar (concorrencia ${CONCORRENCIA})`)
const { ok, falhou } = await emLotes(tarefas, CONCORRENCIA)
console.log(`baixados ${ok}, falharam ${falhou}`)
if (falhou > 0) {
  // Falha de rede deixaria o mapa prometendo arte que nao esta em disco — o
  // proprio problema que o mapa existe pra evitar. Sai com erro em vez de
  // gravar um mapa mentiroso.
  console.error('download incompleto — mapa NAO regravado. Rode de novo.')
  process.exit(1)
}

const corpo = `// AUTO-GENERATED por \`node scripts/importar-faces-emocao.mjs\`.
// Nao editar a mao — o proximo run do script sobrescreve.
//
// Quais faces de emocao cada especie TEM em disco, por paleta. Quem nao aparece
// aqui (ou aparece sem uma emocao) cai na face neutra — ver
// src/data/faceEmotions.ts#faceEmocaoUrl.

export type FaceEmocao = ${Object.keys(EMOCOES).map((s) => `'${s}'`).join(' | ')}

export const FACE_EMOCOES: Record<string, FaceEmocao[]> = ${comoTabela(temNormal)}

export const FACE_EMOCOES_SHINY: Record<string, FaceEmocao[]> = ${comoTabela(temShiny)}

/**
 * Faces que NAO vieram da expressao de mesmo nome na origem (PH-137).
 *
 * \`'normal:dizzy:onix': 'Surprised'\` = o arquivo \`emo/dizzy/onix.png\` e o
 * \`Surprised.png\` do acervo. A especie nao tem \`Dizzy\` desenhado, e sem esta
 * substituicao a cara dela nunca mudaria.
 *
 * DUAS RAZOES pra este mapa existir em vez de a substituicao ser invisivel:
 *
 *   1. a proxima auditoria de arte precisa saber que \`Dizzy\` do Onix continua
 *      sem existir na origem — o arquivo em disco nao conta essa historia;
 *   2. o proprio script le isto pra decidir se rebaixa: se a canonica aparecer
 *      no acervo um dia, \`existsSync\` pularia o download e o substituto ficaria
 *      la pra sempre.
 */
export const FACE_EMOCOES_SUBSTITUTAS: Record<string, string> = ${
  Object.keys(substitutas).length
    ? `{\n${Object.entries(substitutas).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `  '${k}': '${v}',`).join('\n')}\n}`
    : '{}'
}
`
writeFileSync(ARQUIVO_GERADO, corpo)
console.log(`mapa gravado em ${ARQUIVO_GERADO}`)
const porEmocao = {}
for (const chave of Object.keys(substitutas)) {
  const slug = chave.split(':')[1]
  porEmocao[slug] = (porEmocao[slug] ?? 0) + 1
}
if (Object.keys(substitutas).length) {
  console.log(`${Object.keys(substitutas).length} face(s) vieram de expressao SUBSTITUTA: ` +
    Object.entries(porEmocao).map(([k, v]) => `${k}=${v}`).join(' '))
}
