// Hand-authored changelog — NOT spreadsheet-driven (see CLAUDE.md's "fonte
// de dados" note; this has no equivalent in dados_do_jogo.xlsx). Rendered by
// js/ui/panels/SettingsScreen.js's "Patch-notes" tab, newest first (the
// array is already kept in that order — see sortByDateDesc below, which
// re-sorts defensively so a future out-of-order entry can't silently render
// wrong instead of just looking odd in the source file).
export const PATCH_NOTES = [
  {
    version: '2.3',
    date: '2026-08-05',
    title: 'Novo menu Wiki: guia completo do jogo',
    highlights: [
      'Novo menu principal "Wiki" (📚), com 4 abas: Primeiros Passos, Efetividade de Tipos, Raridades Pokemon e Mecanicas.',
      '"Primeiros Passos" explica como comecar, como funciona o combate automatico, como navegar pelos menus e como progredir nas hunts.',
      '"Efetividade de Tipos" e uma ferramenta interativa: escolha qualquer um dos 17 tipos elementais e veja, com dados reais do jogo, contra quais tipos ele e super eficaz/resistido/imune tanto atacando quanto defendendo.',
      '"Raridades Pokemon" documenta a tabela completa (Comum a Mythic) com chance/multiplicador de status/multiplicador de venda de cada uma, alem de explicar Shiny e os lendarios como eixos separados.',
      '"Mecanicas" detalha captura, agressividade/lure, distancia de visao da camera, habilidades em area (AoE) e o sistema de recarga (cooldown por PP + Velocidade).',
    ],
  },
  {
    version: '2.2',
    date: '2026-08-05',
    title: 'Golpe AoE de nivel 50, debuffs reais, IA de caca ativa e ajustes de Lance',
    highlights: [
      'Todo POKE agora aprende um golpe em area exclusivo ao atingir o nivel 50, tematizado pelo seu tipo primario — a categoria (Fisico/Especial) e decidida automaticamente pelo maior atributo de ataque do proprio POKE.',
      'Self-Destruct/Explosion agora custam 50% da vida atual de quem usa o golpe, corrigindo o recuo que nunca era aplicado.',
      'Duplo clique num icone de habilidade liga/desliga o uso automatico dela pela IA de combate.',
      'Distancia de lure (aggro) dos selvagens reduzida para um alcance moderado (era 2.5x o valor real da planilha).',
      'POKE principal agora sempre foca e caca ativamente o inimigo vivo mais proximo pelo mapa, redefinindo o alvo a cada abate, em vez de priorizar quem ja estava vindo em sua direcao.',
      'Hunt Inicial troca Geodude por Sentret; Wooper e Quagsire saem da zona costeira (Agua) e passam a aparecer na zona do Deserto (Terra); Dragonite agora aparece em Ruinas Ancestrais com exatamente 1% de chance.',
      'Verificado ao vivo que Kanto desbloqueia corretamente apos vencer o Campeao Lance (persiste em save/reload). Novo botao "Retornar ao Centro Pokemon" aparece na hunt do Lance so depois da vitoria.',
      'Distancia de visao padrao da camera aumentada para 160% (nas hunts e no Hospital), mantendo o zoom manual disponivel para ajustar ainda mais.',
      'Pokebola so e jogada depois que o "corpo" do POKE derrotado desaparece por completo do campo, nao mais so apos a animacao de desmaio terminar.',
      'Taxa de drop de Stones reduzida de 20% para 5% por abate.',
    ],
  },
  {
    version: '2.1',
    date: '2026-08-05',
    title: 'Pathfinding real, mecanicas do Campeao Lance, sincronia de captura e escala de fundo',
    highlights: [
      'POKEs agora contornam paredes/obstaculos de verdade (busca de rota tipo A*) em vez de ficar travados contra eles.',
      'Hunt do Campeao Lance ganhou contagem regressiva de 5 antes do primeiro POKE aparecer, e um aviso central de Vitoria/Derrota ao fim da luta.',
      'POKEs derrotados na luta do Lance ficam visiveis no campo como corpos, em vez de desaparecer.',
      'Escala visual dos backgrounds das hunts reduzida a metade para bater melhor com o tamanho das sprites.',
    ],
  },
  {
    version: '2.0',
    date: '2026-08-05',
    title: 'Combate corpo-a-corpo real, mapas redimensionados e Campeao Lance vira o gate final de Johto',
    highlights: [
      'Tempo minimo entre acoes subiu para 2s e todo POKE trava no lugar enquanto usa um golpe (nao anda mais durante o ataque).',
      'Golpes em area agora nascem visualmente de quem usou a habilidade, nao mais de cada alvo atingido.',
      'Magnitude, Reversal, Counter, Seismic Toss e outros 10 golpes de dano variavel usam a formula real de cada um em vez do poder base generico.',
      'Camera do POKE ativo ancora um pouco abaixo do centro da tela.',
      'Escala das sprites em campo virou proporcional de verdade: o menor POKE do jogo fica em 1x, o maior em 3x.',
      'Animacao da pokebola so comeca depois que o POKE derrotado termina de desmaiar.',
      'Toda hunt agora tem um background real (nenhuma mais cai no xadrez de fundo antigo) e o mapa ficou 2x menor para o tamanho dos POKEs bater com o cenario.',
      'Colisao de mapa agora bloqueia agua de verdade tambem, nao so paredes e vazio.',
      'Campeao Lance virou a hunt final de Johto: derrota-lo agora e obrigatorio para acessar o Novo Continente (Kanto). Captura desabilitada nessa luta.',
    ],
  },
  {
    version: '1.9',
    date: '2026-08-04',
    title: 'World Building: um bioma por tipo elemental',
    highlights: [
      'Cada um dos 17 tipos elementais reais do jogo agora tem seu proprio bioma tematico (Floresta, Bosque, Costa, Cavernas, Fabrica, Ruinas Ancestrais, etc.).',
      'Corrigido bug serio: especies de certos tipos (ex. Dragao) podiam sumir por completo do jogo por nao caber em nenhuma hunt.',
      'Todo Pokemon do elenco agora tem garantidamente um local de captura correspondente ao seu tipo e nivel.',
    ],
  },
  {
    version: '1.8',
    date: '2026-08-04',
    title: 'Hunts BOSS de lendarios corrigidas + evolucao especial completa',
    highlights: [
      'Corrigido bug que fazia as 11 hunts BOSS de lendarios (Modo Pesadelo) desaparecerem silenciosamente.',
      'Evolucao via Level 80 + Stones agora cobre as 9 cadeias reais de evolucao por troca/hold-item (Kadabra, Machoke, Graveler, Haunter, Onix, Scyther, Seadra, Poliwhirl, Porygon).',
      'Taxa de drop de Stones elevada de 5% para 20% por abate.',
    ],
  },
  {
    version: '1.7',
    date: '2026-08-04',
    title: 'Evolucao especial e drop universal de Stones',
    highlights: [
      'Novo item "Pedra": 17 variantes elementais, uma por tipo, obtidas dropando de qualquer POKE derrotado.',
      'Evolucoes que antes exigiam troca (Kadabra -> Alakazam, etc.) agora evoluem no Level 80 usando 20 Stones do tipo primario.',
    ],
  },
  {
    version: '1.6',
    date: '2026-08-04',
    title: 'Correcoes de mochila, filtros de IV e busca de hunts',
    highlights: [
      'Corrigido um POKE com dado invalido cortando a lista inteira da mochila.',
      'Corrigido filtro de IV minimo/maximo invertido na Loja.',
      'Busca de hunts agora respeita o filtro de elemento selecionado.',
    ],
  },
  {
    version: '1.5',
    date: '2026-08-04',
    title: 'Badge de itens no Auto, filtro shiny e venda segura',
    highlights: [
      'Painel Auto ganhou um indicador mostrando a quantidade dos itens configurados.',
      'Mochila ganhou filtro dedicado para POKEs shiny.',
      'Venda de POKEs shiny na Loja agora exige confirmacao antes de concluir.',
    ],
  },
  {
    version: '1.4',
    date: '2026-08-04',
    title: 'Regras de auto-catch por especie',
    highlights: [
      'Auto-catch agora permite escolher uma bola dedicada por especie dentro da hunt atual.',
      'Regras por especie tem prioridade sobre a bola padrao e a bola de shiny.',
    ],
  },
  {
    version: '1.3',
    date: '2026-08-04',
    title: 'Ataque basico tipado e penalidade de morte',
    highlights: [
      'O golpe basico (fallback de todo POKE) agora usa o tipo elemental real da especie em vez de generico.',
      'Desmaiar em combate agora custa uma pequena porcentagem do EXP do nivel atual.',
    ],
  },
  {
    version: '1.2',
    date: '2026-08-04',
    title: 'Novo Continente (Kanto) e reformulacao de hunts por bioma',
    highlights: [
      'Adicionado um segundo continente (Kanto) com suas proprias zonas de caca.',
      'Hunts de Johto reagrupadas em bandas tematicas por bioma.',
    ],
  },
  {
    version: '1.0',
    date: '2026-08-04',
    title: 'Lancamento',
    highlights: [
      'Primeira versao publicada do NOVO POKE IDLE: captura, batalha automatica, EXP/nivel, Hospital, Hunts, Loja e automacoes (auto-pot/auto-catch/auto-revive).',
    ],
  },
];

export function sortedPatchNotes() {
  return [...PATCH_NOTES].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Number(b.version) - Number(a.version)));
}
