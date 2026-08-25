// Que animacoes o acervo PMD tem alem das 6 que o jogo usa, para quantas
// especies do elenco, e quanto cada uma custaria em disco.
//
//   node scripts/conferir-animacoes-pmd.mjs --acervo="<checkout do SpriteCollab>"
//   node scripts/conferir-animacoes-pmd.mjs --acervo="..." --min=20
//
// PH-122. So conta: nao copia nada. A conclusao desta rodada esta escrita em
// `docs/18-animacoes-do-pmd-disponiveis.md`; este script existe pra ela poder
// ser REFEITA em vez de acreditada, e pra proxima pessoa que abrir o acervo nao
// precisar remontar a medicao.
//
// ---------------------------------------------------------------------------
// A COISA QUE ESTE SCRIPT FAZ E QUE CONTAR ARQUIVO NAO FAZ
// ---------------------------------------------------------------------------
// Segue `<CopyOf>`. Silcoon nao tem `Idle-Anim.png` e TEM a animacao Idle: o no
// aponta pra `Walk`, e o importador resolve. Contar nome de arquivo mede o
// nome, nao a arte — e a diferenca nao e pequena: `Faint` sai de 53 pra 58, e
// varias especies que pareciam nao ter `Idle` tem.
//
// Foi esse mesmo erro que fez a primeira medicao de arte da geracao III listar
// tres especies como buraco quando o buraco era do medidor.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

import { lerAnimData, resolverAnim } from './lib/animdata.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))

const ACERVO = (() => {
  const a = process.argv.find((x) => x.startsWith('--acervo='))
  const caminho = a ? a.slice('--acervo='.length) : process.env.SPRITECOLLAB_DIR
  if (!caminho) {
    throw new Error(
      'informe o checkout do SpriteCollab: --acervo="<pasta>" ou SPRITECOLLAB_DIR=<pasta>\n' +
      'A pasta precisa ter sprite/ na raiz.'
    )
  }
  if (!existsSync(join(caminho, 'sprite'))) throw new Error(`${caminho} nao tem sprite/`)
  return caminho
})()

const MIN_PORCENTO = (() => {
  const a = process.argv.find((x) => x.startsWith('--min='))
  return a ? Number(a.slice('--min='.length)) : 20
})()

const SPRITE = join(ACERVO, 'sprite')

/** As seis de `src/data/battleSpriteAnims.ts#AnimName`. */
const JA_USADAS = new Set(['Idle', 'Walk', 'Shoot', 'Charge', 'Sleep', 'Faint'])

// ---------------------------------------------------------------------------
const texto = readFileSync(join(RAIZ, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
const ids = [...texto.matchAll(/"id": "([a-z0-9_]+)"/g)].map((m) => m[1])
const dexes = [...texto.matchAll(/"description": "Pokedex N.(\d+)/g)].map((m) => Number(m[1]))

const elenco = ids.map((id, i) => ({ id, dex4: String(dexes[i]).padStart(4, '0') }))
  .filter(({ dex4 }) => existsSync(join(SPRITE, dex4, 'AnimData.xml')))

if (!elenco.length) throw new Error('nenhuma especie do elenco tem pasta no acervo — caminho errado?')

const dados = new Map() // nome -> { especies, bytes, quadros, ticks }
const nomesConhecidos = new Set()

for (const { dex4 } of elenco) {
  const dir = join(SPRITE, dex4)
  const porNome = lerAnimData(join(dir, 'AnimData.xml'))
  for (const nome of Object.keys(porNome)) nomesConhecidos.add(nome)

  for (const nome of Object.keys(porNome)) {
    const r = resolverAnim(nome, porNome, dir)
    if (!r) continue
    const atual = dados.get(nome) ?? { especies: 0, bytes: 0, quadros: 0, ticks: 0 }
    atual.especies += 1
    // O custo real de adotar: o arquivo resolvido, normal E shiny. Medir so o
    // normal subestima pela metade — toda especie leva as duas paletas.
    for (const sub of ['', join('0000', '0001')]) {
      const arquivo = join(dir, sub, `${r.nome}-Anim.png`)
      if (existsSync(arquivo)) atual.bytes += statSync(arquivo).size
    }
    atual.quadros = Math.max(atual.quadros, r.no.duracoes.length)
    atual.ticks = Math.max(atual.ticks, r.no.duracoes.reduce((a, b) => a + b, 0))
    dados.set(nome, atual)
  }
}

// ---------------------------------------------------------------------------
const n = elenco.length
const linhas = [...dados.entries()]
  .map(([nome, d]) => ({ nome, ...d, pct: (d.especies / n) * 100 }))
  .sort((a, b) => b.especies - a.especies || a.nome.localeCompare(b.nome))

console.log(`ANIMACOES DO ACERVO PMD — ${n} especies do elenco, ${nomesConhecidos.size} nomes distintos\n`)
console.log(`Cobertura seguindo <CopyOf>. As seis JA USADAS pelo jogo vem marcadas.\n`)
console.log(`  ${'animacao'.padEnd(15)} ${'cobertura'.padEnd(12)} ${'MB'.padStart(6)}  quadros  ticks`)

const acimaDoCorte = linhas.filter((l) => l.pct >= MIN_PORCENTO)
for (const l of acimaDoCorte) {
  const marca = JA_USADAS.has(l.nome) ? ' (em uso)' : ''
  console.log(
    `  ${l.nome.padEnd(15)} ${`${l.especies}/${n}`.padEnd(6)} ${`${l.pct.toFixed(0)}%`.padStart(5)} ` +
    `${(l.bytes / 1024 / 1024).toFixed(1).padStart(6)}  ${String(l.quadros).padStart(7)}  ${String(l.ticks).padStart(5)}${marca}`,
  )
}

const abaixo = linhas.length - acimaDoCorte.length
if (abaixo > 0) {
  console.log(`\n  ... e mais ${abaixo} abaixo de ${MIN_PORCENTO}% (use --min=0 pra ver todas).`)
}

const completas = linhas.filter((l) => l.especies === n && !JA_USADAS.has(l.nome))
console.log(`\nCOBERTURA TOTAL e ainda NAO usadas (${completas.length}) — nao precisam de fallback:`)
for (const l of completas) {
  console.log(`  ${l.nome.padEnd(15)} ${(l.bytes / 1024 / 1024).toFixed(1)} MB, ` +
    `${l.quadros} quadros, ${l.ticks} ticks (${(l.ticks / 60).toFixed(1)}s)`)
}

// O que o repositorio JA tem, pra separar "falta arte" de "falta importar".
console.log('\nNO REPOSITORIO HOJE (assets/battle-sprites/):')
const battle = join(RAIZ, 'assets', 'battle-sprites')
if (existsSync(battle)) {
  const pastas = readdirSync(battle, { withFileTypes: true }).filter((e) => e.isDirectory())
  for (const nome of [...JA_USADAS].sort()) {
    const tem = pastas.filter((p) => existsSync(join(battle, p.name, `${nome}-Anim.png`))).length
    const noAcervo = dados.get(nome)?.especies ?? 0
    const falta = noAcervo - tem
    console.log(`  ${nome.padEnd(15)} ${String(tem).padStart(3)}/${pastas.length} em disco, ` +
      `${String(noAcervo).padStart(3)}/${n} resolvem no acervo` +
      `${falta > 0 ? `  <- ${falta} especie(s) importariam sem custo de decisao` : ''}`)
  }
}

console.log(`\nA conclusao desta medicao esta em docs/18-animacoes-do-pmd-disponiveis.md.`)
console.log('Adotar uma animacao e decisao de custo: assets/ e versionada, e binario')
console.log('commitado fica no historico do git mesmo depois de removido.')
