// Baixa da PokeAPI o catalogo de Pokemon Ultra Sun/Ultra Moon (Gen7) e grava
// `scripts/usum/catalog.json`, que passa a ser A FONTE DE BUILD do jogo.
//
// Rodar com: npm run usum:baixar
//
// ---------------------------------------------------------------------------
// POR QUE UM ARQUIVO COMMITADO, E NAO UMA LEITURA DIRETA NO BUILD
//
// 1. O build tem que ser reprodutivel e offline. `npm run usum:gerar` roda sem
//    rede; quem clona o repo produz os mesmos `*.generated.ts`.
// 2. A PokeAPI evolui. Se o build lesse a API na hora, uma correcao deles (ou
//    uma geracao nova) mudaria o jogo sem ninguem ter mexido em nada.
// 3. O diff do JSON no PR E a auditoria da migracao — da pra ver linha a linha
//    o que mudou de Gen2 pra Gen7.
//
// ---------------------------------------------------------------------------
// O QUE NAO VEM DAQUI
//
// - Taxa de aparicao selvagem (spawn tier). Medido: dos 251 do dex, so 131 tem
//   qualquer encontro selvagem no Ultra Sun, e boa parte deles e `island-scan`
//   (100% de chance, um Pokemon por dia) ou `sos` (cadeia de chamados) — nao
//   ha, na Gen7, nenhum conceito global de raridade por especie: as taxas sao
//   por LOCAL (confirmado na Bulbapedia, ex. Alola Route 1). Adotar esse dado
//   faria Bulbasaur/Charmander/Squirtle (island-scan, 100%) virarem os spawns
//   mais comuns do jogo. `scripts/spawn-tiers.json` (derivado dos disassemblies
//   de Gen1/Gen2, cobertura 251/251, escala 30/20/10/5/1 igual a das vagas
//   reais) continua sendo o eixo de frequencia. A medicao do USUM fica gravada
//   em `scripts/usum/encontros-usum.json` como evidencia da decisao.
// - Geometria de hunt (bounds, spawn points, brackets de nivel, hunt inicial).
//   Continua vindo da planilha/curadoria existente — ver generate-catalog-usum.js.
'use strict';

const fs = require('fs');
const path = require('path');
const api = require('./lib/pokeapi.js');

const OUT_DIR = path.join(__dirname, 'usum');
const DEX_MAX = 251; // Kanto + Johto: o elenco deste jogo nao muda nesta leva.

// ---------------------------------------------------------------------------
// Chaves de especie
// ---------------------------------------------------------------------------
// As chaves sao IDENTIDADE: aparecem em `pokemon_instances.species_id` de todo
// save, nos caminhos de arte (`assets/battle-sprites/{chave}/`), em
// `spawn-tiers.json` e nas tabelas hand-authored do jogo. Renomear uma quebra
// saves silenciosamente, entao elas NAO sao derivadas do nome da PokeAPI sem
// conferencia: o resultado e validado contra as 251 chaves de spawn-tiers.json
// e o script ESTOURA se alguma nao casar.
const EXCECOES_DE_CHAVE = {
  // `MR__MIME` no pokemon_constants.asm da pret, com underscore duplo — e a
  // chave que o jogo ja usa. "Normalizar" pra mr_mime geraria um id que nao
  // existe em lugar nenhum.
  'mr-mime': 'mr__mime',
  // idem: a chave historica veio de `FARFETCH_D`.
  farfetchd: 'farfetch_d',
};

function chaveDeEspecie(nomeApi) {
  return EXCECOES_DE_CHAVE[nomeApi] || nomeApi.replace(/-/g, '_');
}

// ---------------------------------------------------------------------------
// Enums do jogo
// ---------------------------------------------------------------------------
// Os 18 tipos da Gen6+ (Fada incluida). A ordem e a canonica dos jogos (a mesma
// que a tabela de tipos usa), e e ela que define a ordem das linhas/colunas do
// type chart gerado.
const TIPOS = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK',
  'STEEL', 'FAIRY',
];

// PokeAPI -> enum do jogo. Os 6 grupos de experiencia da Gen7 sao exatamente
// estes; `slow-then-very-fast`/`fast-then-very-slow` sao os nomes que a API da
// para Erratic/Fluctuating.
// Golpes que a PokeAPI devolve com o nome ATUAL, e nao com o nome que o golpe
// tinha no Ultra Sun. O endpoint versiona poder/precisao/tipo (`past_values`),
// mas NAO versiona o nome — entao renomeacao posterior vaza pro catalogo.
//
// Achado por `npm run usum:learnsets`, que compara nome a nome contra a
// Bulbapedia: era a unica divergencia sobrando em 251 especies (Krabby,
// Kingler e Pinsir), e os niveis batiam — so o nome era de outra geracao.
const NOME_NO_USUM = {
  // A chave da PokeAPI ficou no nome ANTIGO (`vice-grip`) e so o rotulo em
  // `names` foi atualizado pro novo. Ou seja: chave velha, nome novo — dava
  // `vice_grip = "Vise Grip"` no catalogo.
  'vice-grip': 'Vice Grip', // renomeado para "Vise Grip" na Gen VIII
};

const CURVA_POR_GROWTH_RATE = {
  fast: 'FAST',
  medium: 'MEDIUM_FAST',
  'medium-slow': 'MEDIUM_SLOW',
  slow: 'SLOW',
  'slow-then-very-fast': 'ERRATIC',
  'fast-then-very-slow': 'FLUCTUATING',
};

// Alvos da PokeAPI que significam "acerta mais de um Pokemon de uma vez" — o
// que neste jogo vira `target: 'aoe'` (splash num raio ao redor do atacante).
// `all-opponents` = os dois oponentes numa batalha dupla (Terremoto e
// Deslizamento de Rochas caem aqui); `all-other-pokemon` = todo mundo menos o
// usuario (Explosao, Terremoto em batalha tripla); `all` = o campo inteiro.
// Ficam de FORA `selected-pokemon`, `random-opponent`, `users-field`,
// `entire-field` (clima/armadilha, que este jogo nao simula) e tudo que so
// afeta o proprio usuario.
const ALVOS_EM_AREA = new Set(['all-opponents', 'all-other-pokemon', 'all']);

// --- Efeitos de golpe -------------------------------------------------------
//
// Os cinco status nao-volateis dos jogos mais a confusao — os unicos que este
// jogo simula. A PokeAPI usa mais uns quinze nomes de `ailment` (trap,
// leech-seed, infatuation, nightmare, disable, ...): todos viram `null` aqui,
// de proposito e por escrito, em vez de aparecerem como status desconhecido no
// meio do combate. Quando algum deles for implementado, entra nesta tabela.
const STATUS_DA_POKEAPI = {
  poison: 'poison',
  burn: 'burn',
  paralysis: 'paralysis',
  sleep: 'sleep',
  freeze: 'freeze',
  confusion: 'confusion',
};

// `move.target` que significa "em mim mesmo". Todo o resto e no oponente.
// 'users-field' e 'user-and-allies' entram porque neste jogo o time do jogador
// e um POKE so em campo: o campo do usuario E o usuario.
const ALVOS_NO_PROPRIO_USUARIO = new Set(['user', 'users-field', 'user-and-allies']);

// Nomes de stat da PokeAPI -> nomes deste jogo (os mesmos de StatBlock).
// `accuracy`/`evasion` nao existem aqui (nao ha calculo de acerto por estagio),
// entao golpe que so mexe nesses dois sai sem mudanca de stat.
const STAT_DE_ESTAGIO = {
  attack: 'atkFis',
  'special-attack': 'atkEsp',
  defense: 'def',
  'special-defense': 'defEsp',
  speed: 'speed',
};

/**
 * Efeitos de um golpe, no formato deste jogo.
 *
 * A REGRA DA CHANCE, que nao e obvia no dado cru: `meta.ailment_chance` vem 0
 * para golpe de status PURO (Thunder Wave, Toxic, Stun Spore) — nao porque a
 * chance seja zero, mas porque para eles nao ha "chance secundaria": o golpe E
 * o status. O que separa os dois casos e `meta.category`, que vale 'ailment'
 * no golpe puro e 'damage-ailment' no que causa dano e pode causar status de
 * quebra. Ler `ailment_chance` direto deixaria Toxic e Thunder Wave com 0% de
 * chance de fazer qualquer coisa.
 *
 * DURACAO NAO SAI DAQUI. `meta.min_turns`/`max_turns` da PokeAPI nao batem com
 * a Gen VII (conferido na Bulbapedia: Confuse Ray vem 2-5 e o real e 1-4;
 * Spore/Hypnosis/Sing vem 2-4 e o real e 1-3; Wrap nem internamente consistente
 * e). Os turnos vem escritos a mao em scripts/usum/status.json e sao conferidos
 * por `npm run usum:conferir`.
 */
function efeitosDoGolpe(m) {
  const meta = m.meta || {};
  const categoria = (meta.category && meta.category.name) || '';
  const status = STATUS_DA_POKEAPI[(meta.ailment && meta.ailment.name) || 'none'] || null;

  let chanceDeStatus = 0;
  if (status) {
    chanceDeStatus = meta.ailment_chance > 0 ? meta.ailment_chance : 100;
  }

  // Quem recebe o efeito. `stat_changes` da PokeAPI nao diz se o +2 de Ataque
  // e no usuario (Swords Dance) ou no alvo (Growl) — quem diz e `move.target`.
  // Sem isso, Danca das Espadas subiria o Ataque do INIMIGO.
  const alvoDoEfeito = ALVOS_NO_PROPRIO_USUARIO.has(m.target.name) ? 'self' : 'target'

  const mudancasDeStat = (m.stat_changes || [])
    .filter((s) => STAT_DE_ESTAGIO[s.stat.name] && s.change !== 0)
    .map((s) => ({ stat: STAT_DE_ESTAGIO[s.stat.name], estagios: s.change }));

  // Mesma logica da chance de status: golpe que SO mexe em stat ('net-good-stats',
  // 'damage+lower' com stat_chance 0) aplica sempre; o que mexe de quebra tem
  // `stat_chance` real.
  let chanceDeStat = 0;
  if (mudancasDeStat.length) {
    chanceDeStat = meta.stat_chance > 0 ? meta.stat_chance : 100;
  }

  return {
    status,
    chanceDeStatus,
    alvoDoEfeito,
    mudancasDeStat,
    chanceDeStat,
    chanceDeFlinch: meta.flinch_chance || 0,
    // `crit_rate` e o numero de ESTAGIOS de critico acima do normal (Slash e
    // Razor Leaf tem 1), nao uma porcentagem.
    estagiosDeCritico: meta.crit_rate || 0,
    // Porcentagem do dano causado que volta como cura (positivo) ou como recuo
    // (negativo, Double-Edge = -33).
    drenoPercentual: meta.drain || 0,
    // Porcentagem do HP MAXIMO curada por golpe de cura pura (Recover = 50).
    curaPercentual: meta.healing || 0,
    _categoriaPokeapi: categoria,
  };
}

const STAT_POKEAPI = {
  hp: 'hp',
  attack: 'atkFis',
  defense: 'def',
  'special-attack': 'atkEsp',
  'special-defense': 'defEsp',
  speed: 'speed',
};

// ---------------------------------------------------------------------------
// Evolucao
// ---------------------------------------------------------------------------
// O modelo do jogo suporta UM alvo de evolucao por especie, por NIVEL
// (`evolvesTo` + `evolvesAtLevel`). Evolucao por troca/pedra/amizade nao tem
// gatilho aqui: essas especies saem com `evolvesTo` vazio e sao tratadas pelo
// patch hand-authored `src/data/pokes.ts#SPECIAL_EVOLUTIONS` (Nivel 80 + 20
// Pedras do tipo primario — criterio ja existente, mantido por decisao
// explicita do usuario).
//
// Especie com MAIS DE UMA evolucao por nivel (so Tyrogue, no elenco 1-251)
// escolhe deterministicamente a de menor numero de Pokedex e registra o
// descarte em `evolucoesDescartadas` — some do jogo em silencio seria pior.
function extrairEvolucao(chain, nomeApi, dexPorNome) {
  const encontrado = (function busca(no) {
    if (no.species.name === nomeApi) return no;
    for (const filho of no.evolves_to) {
      const r = busca(filho);
      if (r) return r;
    }
    return null;
  })(chain.chain);
  if (!encontrado) return { evolvesTo: null, evolvesAtLevel: null, descartadas: [] };

  const porNivel = [];
  const outras = [];
  for (const filho of encontrado.evolves_to) {
    // As cadeias da PokeAPI nao tem recorte de geracao: o galho de Meowth
    // inclui Perrserker (Gen8, forma de Galar) e o de Wooper inclui Clodsire
    // (Gen9). Nenhum dos dois existe no Ultra Sun — e nenhum existe neste
    // jogo, cujo elenco e o dex 1-251. Cortar aqui evita que um alvo
    // inexistente vire `evolvesTo` de alguem.
    if ((dexPorNome[filho.species.name] || 9999) > DEX_MAX) continue;
    const gatilhoDeNivel = filho.evolution_details.find(
      (d) => d.trigger.name === 'level-up' && d.min_level != null
    );
    if (gatilhoDeNivel) porNivel.push({ nome: filho.species.name, nivel: gatilhoDeNivel.min_level });
    else outras.push(filho.species.name);
  }
  if (!porNivel.length) return { evolvesTo: null, evolvesAtLevel: null, descartadas: [] };

  porNivel.sort((a, b) => (dexPorNome[a.nome] || 9999) - (dexPorNome[b.nome] || 9999));
  const escolhida = porNivel[0];
  return {
    evolvesTo: chaveDeEspecie(escolhida.nome),
    evolvesAtLevel: escolhida.nivel,
    descartadas: porNivel.slice(1).map((e) => e.nome).concat(outras),
  };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Baixando catalogo Ultra Sun da PokeAPI (cache em scripts/.cache/pokeapi)...\n');
  const ordem = await api.carregarOrdemDeVersionGroups();

  // --- Tabela de tipos (Gen6+, com Fada) ---------------------------------
  const tiposApi = await api.emParalelo(TIPOS, 12, (t) =>
    api.getJson(`${api.BASE}/type/${t.toLowerCase()}`)
  );
  const tabelaDeTipos = {};
  for (let i = 0; i < TIPOS.length; i++) {
    const atacante = TIPOS[i];
    const rel = tiposApi[i].damage_relations;
    const linha = {};
    for (const def of TIPOS) linha[def] = 1;
    for (const t of rel.double_damage_to) linha[t.name.toUpperCase()] = 2;
    for (const t of rel.half_damage_to) linha[t.name.toUpperCase()] = 0.5;
    for (const t of rel.no_damage_to) linha[t.name.toUpperCase()] = 0;
    tabelaDeTipos[atacante] = linha;
  }
  console.log(`  tabela de tipos: ${TIPOS.length}x${TIPOS.length}`);

  // --- Especies -----------------------------------------------------------
  const dexes = Array.from({ length: DEX_MAX }, (_, i) => i + 1);
  const pokemons = await api.emParalelo(dexes, 12, (n) => api.getJson(`${api.BASE}/pokemon/${n}`));
  const speciesApi = await api.emParalelo(dexes, 12, (n) => api.getJson(`${api.BASE}/pokemon-species/${n}`));

  const dexPorNome = {};
  for (let i = 0; i < dexes.length; i++) dexPorNome[speciesApi[i].name] = dexes[i];

  const urlsDeCadeia = [...new Set(speciesApi.map((s) => s.evolution_chain && s.evolution_chain.url).filter(Boolean))];
  const cadeias = await api.emParalelo(urlsDeCadeia, 12, (u) => api.getJson(u));
  const cadeiaPorUrl = Object.fromEntries(urlsDeCadeia.map((u, i) => [u, cadeias[i]]));

  const especies = [];
  const evolucoesDescartadas = {};
  const golpesUsados = new Set();

  for (let i = 0; i < dexes.length; i++) {
    const p = pokemons[i];
    const s = speciesApi[i];
    const chave = chaveDeEspecie(s.name);

    const tipos = api.tiposNoUsum(p).map((t) => t.toUpperCase());
    for (const t of tipos) {
      if (!TIPOS.includes(t)) throw new Error(`${chave}: tipo desconhecido "${t}"`);
    }

    const curva = CURVA_POR_GROWTH_RATE[s.growth_rate.name];
    if (!curva) throw new Error(`${chave}: curva de crescimento desconhecida "${s.growth_rate.name}"`);

    const base = {};
    for (const st of p.stats) {
      const alvo = STAT_POKEAPI[st.stat.name];
      if (alvo) base[alvo] = st.base_stat;
    }

    const evo = extrairEvolucao(cadeiaPorUrl[s.evolution_chain.url], s.name, dexPorNome);
    if (evo.descartadas.length) evolucoesDescartadas[chave] = evo.descartadas;

    const golpes = api.golpesDeNivelNoUsum(p);

    especies.push({
      dex: dexes[i],
      chave,
      nome: s.names.find((n) => n.language.name === 'en')?.name || p.name,
      tipo1: tipos[0],
      tipo2: tipos[1] || null,
      base,
      baseExp: p.base_experience,
      catchRate: s.capture_rate,
      // PESO, em HECTOGRAMAS — a unidade que a PokeAPI usa (`pokemon.weight`:
      // Machamp = 1300, ou seja 130,0 kg). Guardado cru, sem converter, porque
      // as formulas dos jogos que dependem de peso (Low Kick, Heavy Slam) sao
      // escritas em kg e a conversao e uma divisao por 10 na hora de usar —
      // converter aqui perderia precisao e esconderia a unidade da fonte.
      pesoHg: p.weight,
      curva,
      evolvesTo: evo.evolvesTo,
      evolvesAtLevel: evo.evolvesAtLevel,
      // HABILIDADE (o que os jogos chamam de "Ability" — a passiva da especie,
      // nao o golpe). `slot` 1 e 2 sao as normais, sorteadas no encontro
      // selvagem; `is_hidden` e a Habilidade Oculta, que no Ultra Sun so sai
      // por Island Scan/SOS/transferencia e por isso e rara aqui tambem.
      //
      // CAVEAT DA FONTE, dito em voz alta: `pokemon.abilities` da PokeAPI NAO
      // tem `past_values` como `move` tem — ela devolve a atribuicao ATUAL, nao
      // a do Ultra Sun. Pro elenco 1-251 a diferenca e nula ou minima (as
      // mudancas de habilidade concentradas em Gen VI ja estao dentro do
      // recorte), mas se um dia o elenco crescer pra Gen VIII+, conferir na
      // Bulbapedia antes de confiar.
      habilidades: p.abilities
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((a) => ({
          chave: a.ability.name.replace(/-/g, '_'),
          slot: a.slot,
          ...(a.is_hidden ? { oculta: true } : {}),
        })),
      golpes: golpes.map((g) => ({
        chave: g.move.replace(/-/g, '_'),
        nivel: g.level,
        // So gravado quando true (a maioria e false) — mantem o diff do
        // catalogo pequeno pras ~150 linhas que realmente sao golpe de
        // evolucao, em vez de marcar as ~5.700 linhas todas.
        ...(g.evolucao ? { evolucao: true } : {}),
      })),
    });
  }
  console.log(`  especies: ${especies.length}`);

  // So golpe com nivel real, aprendido pela propria especie — sem bloco de
  // Recordador (ver cabecalho de `removerGolpesDeRecordador`). `golpesUsados`
  // e reconstruido a partir do resultado JA FILTRADO, senao a lista de golpes
  // buscados na PokeAPI abaixo traria entrada de golpe que nenhuma especie
  // aprende mais.
  const golpesRemovidos = api.removerGolpesDeRecordador(especies);
  console.log(`  golpes de recordador removidos: ${golpesRemovidos} linhas`);
  for (const especie of especies) {
    for (const g of especie.golpes) golpesUsados.add(g.chave.replace(/_/g, '-'));
  }

  // --- Golpes -------------------------------------------------------------
  const nomesDeGolpe = [...golpesUsados].sort();
  const golpesApi = await api.emParalelo(nomesDeGolpe, 12, (n) => api.getJson(`${api.BASE}/move/${n}`));
  const golpes = nomesDeGolpe.map((nome, i) => {
    const m = golpesApi[i];
    const v = api.valoresDeGolpeNoUsum(m, ordem);
    const tipo = v.type.toUpperCase();
    if (!TIPOS.includes(tipo)) throw new Error(`golpe ${nome}: tipo desconhecido "${tipo}"`);
    return {
      chave: nome.replace(/-/g, '_'),
      nome: NOME_NO_USUM[nome] || m.names.find((n) => n.language.name === 'en')?.name || m.name,
      tipo,
      categoria: m.damage_class.name, // physical | special | status
      // `move.target` da PokeAPI. Interessa so pra separar golpe que acerta
      // VARIOS alvos do que acerta um — e o que este jogo chama de AOE. A lista
      // de 6 chaves escrita a mao que isto substitui ja tinha se desatualizado
      // (`selfdestruct` virou `self_destruct` no catalogo novo e a entrada
      // parou de casar em silencio, deixando Explosao como golpe de alvo unico).
      alvo: ALVOS_EM_AREA.has(m.target.name) ? 'aoe' : 'single',
      poder: v.power == null ? 0 : v.power,
      precisao: v.accuracy == null ? 100 : v.accuracy,
      pp: v.pp == null ? 20 : v.pp,
      ...efeitosDoGolpe(m),
    };
  });
  console.log(`  golpes: ${golpes.length}`);

  // --- Habilidades (a passiva) ---------------------------------------------
  const nomesDeHabilidade = [...new Set(
    especies.flatMap((e) => e.habilidades.map((h) => h.chave.replace(/_/g, '-')))
  )].sort();
  const habilidadesApi = await api.emParalelo(nomesDeHabilidade, 12, (n) =>
    api.getJson(`${api.BASE}/ability/${n}`)
  );
  const habilidades = nomesDeHabilidade.map((nome, i) => {
    const h = habilidadesApi[i];
    const en = (entries) => entries.find((e) => e.language.name === 'en');
    // `short_effect` e a frase de UMA linha que descreve a mecanica ("Strengthens
    // Fire moves to inflict 1.5x damage at 1/3 max HP or less"). E ela que serve
    // de contrato pra implementacao — o flavor text do jogo e vago de proposito.
    const efeito = en(h.effect_entries || []);
    return {
      chave: nome.replace(/-/g, '_'),
      nome: en(h.names || [])?.name || h.name,
      efeito: efeito ? efeito.short_effect.replace(/\s+/g, ' ').trim() : null,
    };
  });
  console.log(`  habilidades: ${habilidades.length}`);

  // --- Conferencias que devem ESTOURAR, nunca avisar ----------------------
  const chavesConhecidas = new Set(Object.keys(JSON.parse(
    fs.readFileSync(path.join(__dirname, 'spawn-tiers.json'), 'utf8')
  ).especies));
  const semTier = especies.filter((e) => !chavesConhecidas.has(e.chave));
  if (semTier.length) {
    throw new Error(
      `chaves de especie divergiram de spawn-tiers.json: ${semTier.map((e) => e.chave).join(', ')}. ` +
      'Chave de especie e identidade (save/arte/tabelas do jogo) — corrija EXCECOES_DE_CHAVE, nunca a lista de tiers.'
    );
  }

  // Regressao conhecida da resolucao por versao: se qualquer um destes sair
  // com valor de outra geracao, `valoresDeGolpeNoUsum` quebrou. Rapid Spin
  // (20 na Gen7, 50 na Gen8) e o caso que motivou a funcao.
  const esperado = {
    rapid_spin: { poder: 20 }, bite: { poder: 60, tipo: 'DARK' },
    dig: { poder: 80 }, moonblast: { poder: 95, tipo: 'FAIRY' },

    // Efeitos. Os tres primeiros travam a regra de chance que o dado cru NAO
    // diz (ver efeitosDoGolpe): golpe de status puro vem com `ailment_chance`
    // 0 na PokeAPI, e ler aquilo direto deixaria Thunder Wave e Toxic com 0%
    // de chance de paralisar/envenenar — sem erro nenhum, so um golpe que
    // nunca faz nada.
    thunder_wave: { status: 'paralysis', chanceDeStatus: 100, precisao: 90 },
    toxic: { status: 'poison', chanceDeStatus: 100 },
    stun_spore: { status: 'paralysis', chanceDeStatus: 100, precisao: 75 },
    poison_sting: { status: 'poison', chanceDeStatus: 30 },
    fire_punch: { status: 'burn', chanceDeStatus: 10 },
    blizzard: { status: 'freeze', chanceDeStatus: 10, precisao: 70 },
    confuse_ray: { status: 'confusion', chanceDeStatus: 100 },
    // Sem status: o mapa nao pode passar a inventar um.
    tackle: { poder: 40, status: null, chanceDeStatus: 0 },
    // Dreno, cura e critico — os outros tres campos novos.
    absorb: { poder: 20, drenoPercentual: 50 },
    recover: { curaPercentual: 50 },
    slash: { estagiosDeCritico: 1 },
    swords_dance: { mudancasDeStat: [{ stat: 'atkFis', estagios: 2 }], chanceDeStat: 100, alvoDoEfeito: 'self' },
    growl: { mudancasDeStat: [{ stat: 'atkFis', estagios: -1 }], chanceDeStat: 100, alvoDoEfeito: 'target' },
  };
  for (const [chave, alvo] of Object.entries(esperado)) {
    const g = golpes.find((x) => x.chave === chave);
    if (!g) continue;
    for (const [campo, valor] of Object.entries(alvo)) {
      // Comparacao por JSON porque `mudancasDeStat` e uma lista de objetos —
      // `!==` nela passaria sempre, e a trava viraria enfeite.
      const saiu = JSON.stringify(g[campo]);
      if (saiu !== JSON.stringify(valor)) {
        throw new Error(`golpe ${chave}: ${campo} saiu ${saiu}, esperado ${JSON.stringify(valor)} no Ultra Sun`);
      }
    }
  }

  // --- Encontros selvagens no Ultra Sun (so evidencia, ver cabecalho) -----
  const encontrosPorDex = await api.emParalelo(dexes, 12, (n) =>
    api.getJson(`${api.BASE}/pokemon/${n}/encounters`)
  );
  const encontros = {};
  for (let i = 0; i < dexes.length; i++) {
    const areas = [];
    for (const a of encontrosPorDex[i] || []) {
      for (const v of a.version_details) {
        if (v.version.name !== 'ultra-sun') continue;
        areas.push({
          area: a.location_area.name,
          chanceMax: v.max_chance,
          metodos: [...new Set(v.encounter_details.map((e) => e.method.name))].sort(),
        });
      }
    }
    if (areas.length) encontros[chaveDeEspecie(speciesApi[i].name)] = areas;
  }

  // --- Escrita ------------------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const catalogo = {
    _fonte: 'PokeAPI v2 (https://pokeapi.co), version group "ultra-sun-ultra-moon"',
    _regra:
      'Valores resolvidos PARA O ULTRA SUN, nao os atuais: move.past_values (exclusivo) e ' +
      'pokemon.past_types (inclusivo). Ver scripts/lib/pokeapi.js.',
    _gerador: 'npm run usum:baixar (scripts/fetch-usum-catalog.js)',
    tipos: TIPOS,
    tabelaDeTipos,
    especies,
    golpes,
    habilidades,
    evolucoesDescartadas,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalogo, null, 1) + '\n');
  fs.writeFileSync(
    path.join(OUT_DIR, 'encontros-usum.json'),
    JSON.stringify(
      {
        _nota:
          'Evidencia da decisao de NAO usar encontro do Ultra Sun como taxa de spawn: ' +
          'cobertura parcial e metodos (island-scan/sos) sem semantica de raridade. ' +
          'O eixo de frequencia continua sendo scripts/spawn-tiers.json (Gen1/Gen2).',
        cobertura: `${Object.keys(encontros).length} de ${DEX_MAX}`,
        encontros,
      },
      null,
      1
    ) + '\n'
  );

  const stats = api.estatisticasDeCache();
  console.log(`\nEscrito scripts/usum/catalog.json (${especies.length} especies, ${golpes.length} golpes).`);
  console.log(`Encontros USUM medidos: ${Object.keys(encontros).length}/${DEX_MAX} especies.`);
  console.log(`Requests: ${stats.rede} de rede, ${stats.cache} de cache.`);
  if (Object.keys(evolucoesDescartadas).length) {
    console.log('\nEvolucoes descartadas (o modelo so suporta 1 alvo por especie):');
    for (const [k, v] of Object.entries(evolucoesDescartadas)) console.log(`  ${k} -> ${v.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(`\nFALHOU: ${err.message}`);
  process.exit(1);
});
