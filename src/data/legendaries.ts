// Os lendarios (e miticos) do elenco — mesma lista que
// `scripts/sync-planilha.js#LEGENDARY_SHEET_KEYS`, em minusculas pra casar com
// id de especie. Compartilhada por `nightmareMaps.ts` (as hunts BOSS),
// `pokes.ts#rollIvs` (3 IVs perfeitos, regra da Gen VII) e `pokeHeights.ts`.
//
// ---------------------------------------------------------------------------
// AS DUAS COISAS QUE ESTA LISTA DECIDE, E POR QUE ELAS ANDAM JUNTAS
// ---------------------------------------------------------------------------
// 1. Quem NAO entra em pool de hunt normal. Isso mora do lado do gerador
//    (`LEGENDARY_SHEET_KEYS`), e `hunts.test.ts` guarda o resultado.
// 2. Quem GANHA uma hunt BOSS propria (`buildBossHunts`, nivel 300, sem
//    respawn). Isso mora aqui.
//
// Divergir as duas produz um dos dois desastres: lendario aparecendo numa hunt
// comum de nivel 52 com peso 1/30 (o que a PH-332 quase deixou passar — ver
// abaixo), ou lendario que existe no catalogo e nao e alcancavel por caminho
// nenhum.
//
// ---------------------------------------------------------------------------
// PH-332: as 10 de Hoenn, e o que aconteceu quando elas foram esquecidas
// ---------------------------------------------------------------------------
// Ligar a Geracao III poe 135 especies novas no elenco, e o gerador de hunts
// nao tem como saber quais delas sao lendarias — nao existe flag de lendario
// nem em `scripts/usum/catalog.json` nem em `pokes.generated.ts`. Medido na
// primeira rodada de `usum:gerar` com a arte importada:
//
//   Geleira (nivel 52-62):        ... SPHEAL, SEALEO, WALREIN, REGICE
//   Fabrica (nivel 52-62):        ... BELDUM, METANG, METAGROSS, REGISTEEL, JIRACHI
//   Ruinas Ancestrais (80-105):   ... BAGON, SHELGON, SALAMENCE, LATIAS, LATIOS, RAYQUAZA
//   Torre Mistica (60-70):        ... SPOINK, GRUMPIG, CHIMECHO, WYNAUT, DEOXYS
//
// Sem erro nenhum. Rayquaza como encontro selvagem de rotina numa hunt de
// nivel 80.
//
// As 10 entram aqui, e por consequencia ganham hunt BOSS propria — `buildBossHunts`
// e derivado desta lista e o fundo por tipo cobre os 18, entao nao ha nada a
// escrever a mao. Passa de 11 para 21 hunts BOSS.
export const LEGENDARY_SPECIES_IDS: string[] = [
  // Kanto e Johto (as 11 originais).
  'articuno', 'zapdos', 'moltres', 'raikou', 'entei', 'suicune',
  'lugia', 'ho_oh', 'celebi', 'mewtwo', 'mew',
  // Hoenn (PH-332). Regis, o duo eon, o trio do clima e os dois miticos —
  // Jirachi e Deoxys entram como mitico do mesmo jeito que Mew e Celebi ja
  // estavam.
  'regirock', 'regice', 'registeel', 'latias', 'latios',
  'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys',
]
