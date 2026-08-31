// PH-332 — a lista de lendarios existe DUAS vezes, e as duas tem que bater.
//
//   TypeScript  `LEGENDARY_SPECIES_IDS` (src/data/legendaries.ts) decide quem
//               ganha hunt BOSS propria (`nightmareMaps.ts#buildBossHunts`) e
//               quem sorteia 3 IVs perfeitos (`pokes.ts#rollIvs`).
//   Script      `LEGENDARY_SHEET_KEYS` (scripts/sync-planilha.js) decide quem
//               fica FORA das pools de hunt normal (`buildTypeRoster`).
//
// Elas nao podem ser uma so: o gerador e CommonJS e roda antes de existir
// TypeScript compilado; importar `src/data/` de lá exigiria um passo de build no
// meio do pipeline de dados. A alternativa a duplicacao e este teste.
//
// ---------------------------------------------------------------------------
// O QUE A DIVERGENCIA CUSTA — os dois lados, e os dois sao silenciosos
// ---------------------------------------------------------------------------
// FALTAR NO SCRIPT: o lendario entra em pool de hunt comum. Medido ao ligar a
// Geracao III, antes desta correcao: Rayquaza como encontro de rotina numa hunt
// de nivel 80-105, Regice numa de 52-62, Jirachi numa de 52-62, Deoxys numa de
// 60-70. `hunts.test.ts` pega esse lado — mas so depois de a especie estar na
// lista TypeScript, que era exatamente o que faltava.
//
// FALTAR NO TYPESCRIPT: o lendario nao ganha hunt BOSS. Ele existe no catalogo,
// aparece na Pokedex, e nao e alcancavel por caminho nenhum. Nada reprova.
//
// Este arquivo fecha o segundo lado, que era o unico sem guarda.
import { describe, expect, it } from 'vitest'

import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { SPECIES } from './pokes'
import { MAPS } from './maps'

// `?raw` e nao `require`: o gerador e CommonJS com `fs.readdirSync` no topo (ele
// le `assets/battle-sprites/` em tempo de carga), entao importa-lo de verdade
// dentro do vitest arrastaria I/O de disco e a arvore de dependencia inteira do
// pipeline de dados. Ler o texto e comparar a lista e o suficiente e nao acopla
// a suite ao gerador. Mesmo padrao de `limiteDeSessaoInativa.test.ts`.
import fonteDoGerador from '/scripts/sync-planilha.js?raw'

function chavesDoGerador(): string[] {
  // O array pode estar em varias linhas — `[\s\S]` em vez de `.`.
  const m = /const LEGENDARY_SHEET_KEYS = \[([\s\S]*?)\];/.exec(fonteDoGerador)
  expect(m, 'nao achei LEGENDARY_SHEET_KEYS em scripts/sync-planilha.js').toBeTruthy()
  return [...m![1].matchAll(/'([A-Z0-9_]+)'/g)].map(([, chave]) => chave)
}

describe('as duas listas de lendario sao a mesma lista (PH-332)', () => {
  it('mesmo conjunto, sem sobra de nenhum lado', () => {
    const doScript = chavesDoGerador().map((c) => c.toLowerCase()).sort()
    const doTs = [...LEGENDARY_SPECIES_IDS].sort()
    expect(doScript).toEqual(doTs)
  })

  it('mesma ORDEM tambem — a lista e lida como roteiro de conteudo', () => {
    // Nao e purismo: a ordem de `LEGENDARY_SPECIES_IDS` e a ordem em que as
    // hunts BOSS aparecem no menu (`buildBossHunts` itera a lista). Deixar as
    // duas na mesma ordem e o que permite ler uma e conferir a outra a olho.
    expect(chavesDoGerador().map((c) => c.toLowerCase())).toEqual(LEGENDARY_SPECIES_IDS)
  })

  it('todo lendario da lista existe no catalogo', () => {
    // Um id com typo passaria nos dois casos acima (esta nas duas listas) e
    // sumiria em silencio: `buildBossHunts` faz `if (!species) continue`, e
    // `buildTypeRoster` simplesmente nao acha o que excluir.
    const ausentes = LEGENDARY_SPECIES_IDS.filter((id) => !SPECIES[id])
    expect(ausentes, `lendario fora do catalogo: ${ausentes.join(', ')}`).toEqual([])
  })

  it('todo lendario tem a hunt BOSS dele', () => {
    // O outro lado do `continue` silencioso acima, visto pela saida.
    const semHunt = LEGENDARY_SPECIES_IDS.filter((id) => !MAPS[`boss_${id}`])
    expect(semHunt, `lendario sem hunt BOSS: ${semHunt.join(', ')}`).toEqual([])
  })
})
