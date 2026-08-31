// Emite `src/data/generated/spawnTiers.generated.ts` a partir das DUAS tabelas
// de tier derivadas dos jogos reais.
//
//   node scripts/gerar-spawn-tiers.mjs
//
// POR QUE ISTO EXISTE: o peso de spawn por especie vinha sendo RASPADO de
// `enemies.generated.ts` (`for (const enc of ENCOUNTERS_DATA) weight[...] =
// enc.weight`), um arquivo de ENCONTROS da estrutura de hunts ANTIGA. Com as
// hunts remontadas por bioma, aquele arquivo virou legado — e a dependencia
// era silenciosa: parar de emiti-lo nao daria erro, so zeraria os pesos e todo
// spawn viraria o fallback "incomum" sem ninguem notar.
//
// O peso e dado do PROJETO, nao da estrutura de hunts: e o tier real de
// encontro selvagem, derivado dos disassemblies. Agora ele viaja sozinho.
//
// ---------------------------------------------------------------------------
// AS DUAS ENTRADAS, E O BUG DE TRES SEMANAS QUE A SEGUNDA CONSERTA
// ---------------------------------------------------------------------------
// `spawn-tiers.json`      Gen1/Gen2 (pret/pokered, pokegold, pokecrystal),
//                         251 especies, por `scripts/derive-spawn-tiers.js`
// `spawn-tiers-gen3.json` Gen3/Hoenn (pret/pokeemerald), 135 especies,
//                         por `scripts/derive-spawn-tiers-gen3.mjs`
//
// O ARQUIVO DE GEN3 FOI DERIVADO EM 25/08 E NUNCA FOI LIGADO AQUI. Este
// gerador lia so o primeiro, entao as 135 especies de Hoenn saiam do arquivo
// gerado — e `huntSpawnOverrides.ts` as recebia pelo `?? DEFAULT_WEIGHT`, o
// fallback "incomum" (10). Resultado medido antes do conserto: das 353
// especies com sub-bioma, 125 (35%) spawnavam com peso inventado, plano,
// igual pro Wailord e pro Poochyena. Falha 100% silenciosa — o fallback
// existe justamente pra nao quebrar, e por isso ninguem viu.
//
// As duas tabelas SO PODEM ser fundidas porque compartilham a escala (os
// mesmos 5 tiers, os mesmos pesos) e nao tem nenhuma chave em comum. As duas
// coisas sao CONFERIDAS abaixo em vez de assumidas: se um dia
// `derive-spawn-tiers-gen3.mjs` mudar a escala dele, fundir em silencio daria
// peso errado pra meio roster, que e exatamente a classe de bug que este
// paragrafo documenta.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRADAS = [
  path.join(RAIZ, 'scripts/spawn-tiers.json'),
  path.join(RAIZ, 'scripts/spawn-tiers-gen3.json'),
]
const SAIDA = path.join(RAIZ, 'src/data/generated/spawnTiers.generated.ts')

const fontes = ENTRADAS.map((p) => ({ nome: path.basename(p), dados: JSON.parse(fs.readFileSync(p, 'utf8')) }))

// A escala tem que ser a MESMA nas duas, chave por chave e peso por peso.
// Comparada como texto canonico porque a ordem tambem importa: ela vira o
// comentario de cabecalho do arquivo gerado.
const escala = (d) => d.tiers.map((t) => `${t.chave}=${t.peso}`).join(', ')
const base = fontes[0]
for (const f of fontes.slice(1)) {
  if (escala(f.dados) !== escala(base.dados)) {
    throw new Error(
      `Escala de tier divergente entre ${base.nome} e ${f.nome}:\n` +
      `  ${base.nome}: ${escala(base.dados)}\n  ${f.nome}: ${escala(f.dados)}\n` +
      'Fundir escalas diferentes daria peso errado pra uma das geracoes inteira.'
    )
  }
}

const pesoPorTier = Object.fromEntries(base.dados.tiers.map((t) => [t.chave, t.peso]))

// Colisao de chave nao pode ser resolvida por "o ultimo vence": as duas
// tabelas sao derivadas de jogos diferentes e um empate significaria que
// alguem mudou o recorte de uma delas.
const origemDaChave = new Map()
const especies = {}
for (const { nome, dados } of fontes) {
  for (const [especie, info] of Object.entries(dados.especies)) {
    const jaVeio = origemDaChave.get(especie)
    if (jaVeio) {
      throw new Error(
        `Especie "${especie}" aparece em ${jaVeio} E em ${nome}. As duas tabelas ` +
        'cobrem geracoes disjuntas — uma chave nas duas significa que o recorte ' +
        'de uma delas mudou, e escolher um dos dois tiers no escuro e chute.'
      )
    }
    origemDaChave.set(especie, nome)
    especies[especie] = info
  }
}

const linhas = []
for (const [especie, info] of Object.entries(especies).sort(([a], [b]) => a.localeCompare(b))) {
  const peso = pesoPorTier[info.tier]
  if (peso == null) throw new Error(`Especie "${especie}" com tier desconhecido: ${info.tier}`)
  linhas.push(`  '${especie}': ${peso}, // ${info.tier} (${info.origem})`)
}

const saida = [
  '// AUTO-GERADO por `node scripts/gerar-spawn-tiers.mjs` a partir de',
  '// scripts/spawn-tiers.json (Gen1/Gen2) e scripts/spawn-tiers-gen3.json (Gen3).',
  '// Nao editar a mao.',
  '//',
  '// Peso de spawn por especie: o TIER real de encontro selvagem, derivado dos',
  '// disassemblies pret/pokered, pret/pokegold e pret/pokecrystal (Gen1/Gen2, ver',
  '// scripts/derive-spawn-tiers.js) e pret/pokeemerald (Gen3, ver',
  `// scripts/derive-spawn-tiers-gen3.mjs). A escala espelha a \`GrassMonProbTable\``,
  `// do Gen2: ${escala(base.dados)}.`,
  '//',
  '// NAO e a taxa de captura, e nao muda com a estrutura de hunts — quem e comum',
  '// nos jogos reais aparece mais, em qualquer hunt onde apareca.',
  '',
  `export const SPAWN_WEIGHT_BY_SPECIES: Record<string, number> = {`,
  ...linhas,
  '};',
  '',
].join('\n')

fs.writeFileSync(SAIDA, saida)
console.log(`${linhas.length} especies (${fontes.map((f) => `${f.nome}: ${Object.keys(f.dados.especies).length}`).join(', ')}) -> ${path.relative(process.cwd(), SAIDA)}`)
