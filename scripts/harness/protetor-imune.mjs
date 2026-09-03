// Bancada: com que frequencia o protetor sorteado e IMUNE ao POKE em campo —
// e, portanto, trava a sala pra sempre (PH-301).
//
// O QUE ESTA SENDO MEDIDO, E POR QUE
// -----------------------------------------------------------------------------
// A sala so avanca quando o protetor dela morre, e ele e o UNICO inimigo em
// campo enquanto esta vivo. Se o POKE do jogador nao consegue causar dano nele,
// nao ha timeout, nao ha erro e nao ha saida: a hunt fica em 30/30 pra sempre.
//
// O caso que abriu a PH-301, reproduzido no motor: `charmander` Lv102 com os 4
// golpes que `activeAbilitiesPadrao` da a ele (todos de FOGO) contra um `ponyta`
// com a habilidade Flash Fire, que e imunidade a FOGO. Janela apos janela do
// servidor, o `hp_atual` do protetor ficou parado em 46.
//
// Esta bancada conta a taxa por sub-bioma, com e sem o filtro do sorteio, pra
// dizer o tamanho do problema em vez de "acontece as vezes".
//
// O QUE ELA MEDIU (2026-08-30, antes/depois da correcao)
// -----------------------------------------------------------------------------
//   sub-bioma  | 1 tentativa (antes) | 6 tentativas (depois)
//   -----------|---------------------|----------------------
//   plains     |   0 / 120           |   0 / 120
//   grass      |   5 / 120  growlithe|   0 / 120
//   meadow     |  28 / 120  ponyta   |   0 / 120
//   town       |   0 / 120           |   0 / 120
//
// Ou seja: na Campina, quase 1 em cada 4 salas travava a hunt de um POKE
// monotipo de FOGO. Nao era caso raro.
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/protetor-imune.mjs
import {
  createRng, createPokeInstance, buildMapWorld, podeDanificar, ABATES_POR_SALA,
} from '../../authority/engine/headless.js'

const HUNT = 'campo_aberto_e1'
const ESPECIE = process.env.ESPECIE ?? 'charmander'
const NIVEL = Number(process.env.NIVEL ?? 102)
const SEMENTES = Number(process.env.SEMENTES ?? 120)
// Os 4 sub-biomas de `campo_aberto` (data/biomas.ts).
const SUB_BIOMAS = ['plains', 'grass', 'meadow', 'town']

console.log(`POKE: ${ESPECIE} Lv${NIVEL} | hunt: ${HUNT} | ${SEMENTES} sementes por sub-bioma`)
console.log('sub-bioma | protetores imunes | especies')

for (const chave of SUB_BIOMAS) {
  const imunes = []
  for (let semente = 1; semente <= SEMENTES; semente++) {
    const poke = createPokeInstance(createRng(semente), ESPECIE, NIVEL)
    const world = buildMapWorld(
      HUNT, poke,
      { seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave, abates: ABATES_POR_SALA, ciclos: 0 } },
    )
    const protetor = world.enemies.find((e) => e.isProtetor)
    if (!protetor) continue
    if (!podeDanificar(world.rng, world.player, protetor)) imunes.push(protetor.poke.speciesId)
  }
  const especies = [...new Set(imunes)].join(', ') || '-'
  console.log(`${chave.padEnd(9)} | ${String(imunes.length).padStart(3)} / ${SEMENTES}       | ${especies}`)
}
