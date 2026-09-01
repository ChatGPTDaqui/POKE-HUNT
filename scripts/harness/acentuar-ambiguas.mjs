/**
 * Segunda metade da normalizacao de acentuacao (PH-379) — a parte que NAO da
 * pra automatizar.
 *
 * `acentuar-copy.mjs` resolve o que um dicionario fechado resolve. Sobram tres
 * classes que exigem ler a frase, e todas estao aqui como par literal:
 *
 * 1. **Palavra ambigua.** `e` (conjuncao) contra `é` (verbo); `esta` (esta
 *    tela) contra `está` (esta ligado). Nenhuma regra decide isso sem contexto,
 *    e um script que "quase sempre acerta" troca erro visivel por erro
 *    escondido.
 * 2. **Rotulo de UMA palavra.** O automatico exige espaco no literal — e a
 *    guarda que impede mexer em chave, id e valor comparado em codigo.
 *    "Configuracoes" e "Padrao" caem fora dela por construcao.
 * 3. **Teste que travava a grafia antiga.** Sao asserts sobre copy
 *    (`toContain('Sem conexao')`); mudar a copy sem mudar o assert deixa o
 *    teste vermelho pelo motivo certo, entao os dois andam juntos.
 *
 * Cada par foi lido na frase antes de entrar aqui. Rodar duas vezes e
 * inofensivo: o que ja foi aplicado simplesmente nao e encontrado.
 *
 * Uso: `node scripts/harness/acentuar-ambiguas.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs'

const POR_ARQUIVO = {
  'src/data/moveDescriptions.ts': [
    ['esta desligado', 'está desligado'],
    ['quem esta se protegendo', 'quem está se protegendo'],
    ['quem esta no ar', 'quem está no ar'],
    ['quem esta em campo', 'quem está em campo'],
    ['quem não e Rocha', 'quem não é Rocha'],
    ['Prev o ataque', 'Prevê o ataque'],
    ['Cria copias ilusórias', 'Cria cópias ilusórias'],
    ['nunca vai escolhe-lo', 'nunca vai escolhê-lo'],
    ['pode faze-lo recuar', 'pode fazê-lo recuar'],
  ],
  // --- rotulos de UMA palavra ---------------------------------------------
  // O script automatico exige espaco no literal (a guarda que impede mexer em
  // chave e id). Rotulo de uma palavra cai fora dela e vem a mao — sao poucos.
  'src/features/screens/ScreenOverlay.tsx': [
    ["config: 'Configuracoes'", "config: 'Configurações'"],
  ],
  'src/data/biomas.ts': [
    ["nome: 'Planicie'", "nome: 'Planície'"],
    ["nome: 'Laboratorio'", "nome: 'Laboratório'"],
    ["nome: 'Espaco'", "nome: 'Espaço'"],
  ],
  'src/data/especialidades.ts': [
    ["titulo: 'Lendario'", "titulo: 'Lendário'"],
  ],
  'src/features/bestiario/BestiarioMenu.tsx': [
    ['<SectionLabel>ESTAGIOS</SectionLabel>', '<SectionLabel>ESTÁGIOS</SectionLabel>'],
  ],
  'src/features/pokedex/PokedexMenu.tsx': [
    ['>Evolucao</div>', '>Evolução</div>'],
  ],
  'src/features/settings/SettingsScreen.tsx': [
    ['>Padrao</GameButton>', '>Padrão</GameButton>'],
  ],
  'src/features/wiki/WikiMenu.tsx': [
    ['nome="Configuracoes"', 'nome="Configurações"'],
    ['<b>maximo</b>', '<b>máximo</b>'],
    ['<b>Fisicos</b>', '<b>Físicos</b>'],
    ['<b>Mecanicas</b>', '<b>Mecânicas</b>'],
    ['<b>Precisao</b>', '<b>Precisão</b>'],
    ['<b>Evasao</b>', '<b>Evasão</b>'],
    ['<b>Critico</b>', '<b>Crítico</b>'],
    ["label: 'Mecanicas'", "label: 'Mecânicas'"],
  ],
  'src/lib/erroDeRede.ts': [
    ['Este endereço não esta na', 'Este endereço não está na'],
    ['— não e problema do seu navegador.', '— não é problema do seu navegador.'],
    ['o mais provável e um bloqueador', 'o mais provável é um bloqueador'],
  ],
  'src/features/troca/TrocaMenu.tsx': [
    ['Você não esta em nenhuma troca.', 'Você não está em nenhuma troca.'],
  ],
  // --- testes que travavam a grafia antiga ---------------------------------
  'src/data/origensDoJogo.test.ts': [
    ["'bloqueador de anuncios'", "'bloqueador de anúncios'"],
    ["toContain('nao esta na')", "toContain('não está na')"],
    ["toContain('nao e problema do seu navegador')", "toContain('não é problema do seu navegador')"],
    ["toContain('Sem conexao')", "toContain('Sem conexão')"],
  ],
  'src/components/shared/MovesetTable.test.tsx': [
    ['/Maximo de 4/', '/Máximo de 4/'],
    ['/nao ataca/i', '/não ataca/i'],
  ],
  'src/components/hud/AbilityHud.test.tsx': [
    ['/nao ataca/i', '/não ataca/i'],
  ],
  'src/components/hud/climaMoraNoTrilho.test.tsx': [
    ['/enquanto voce estiver nesta area/', '/enquanto você estiver nesta área/'],
  ],
  'src/features/correio/anexoDePoke.test.tsx': [
    ['/Voce recebeu Eevee/i', '/Você recebeu Eevee/i'],
    ['/Nivel 25/', '/Nível 25/'],
  ],
  'src/features/troca/confirmacaoNaTela.test.tsx': [
    ['/Voce nao esta em nenhuma troca/', '/Você não está em nenhuma troca/'],
  ],
  'src/data/especialidades.test.ts': [
    ["toBe('Lendario')", "toBe('Lendário')"],
  ],
  'src/features/troca/fimDaMesaAvisa.test.tsx': [
    ["'Troca concluida.'", "'Troca concluída.'"],
  ],
  'src/data/remote/playerRepository.test.ts': [
    ['/sessao pode ter expirado/', '/sessão pode ter expirado/'],
  ],
  'src/data/traitInfo.ts': [
    ['não e consumido', 'não é consumido'],
    ['a caçada e automática', 'a caçada é automática'],
    ['O tipo aqui e da espécie', 'O tipo aqui é da espécie'],
    ['a tipagem não e mutável', 'a tipagem não é mutável'],
    ['O loot deste jogo e por hunt', 'O loot deste jogo é por hunt'],
    ['nunca e rebaixada', 'nunca é rebaixada'],
    ['nunca e rebaixado', 'nunca é rebaixado'],
    ['Nenhum atributo e rebaixado', 'Nenhum atributo é rebaixado'],
    ['no portador e INVERTIDA', 'no portador é INVERTIDA'],
  ],
  'src/data/tutoriais.ts': [
    ['O que o Bot e', 'O que o Bot é'],
    ['O Bot e o conjunto', 'O Bot é o conjunto'],
    ['a bola e consumida', 'a bola é consumida'],
    ['Morrer lá e definitivo', 'Morrer lá é definitivo'],
    ['enquanto você esta fora', 'enquanto você está fora'],
    ['pra coloca-lo de pé', 'pra colocá-lo de pé'],
  ],
}

let total = 0
for (const [caminho, pares] of Object.entries(POR_ARQUIVO)) {
  let s = readFileSync(caminho, 'utf8')
  let n = 0
  for (const [de, para] of pares) {
    const antes = s
    s = s.split(de).join(para)
    if (s !== antes) n += 1
    else console.log(`  NAO ACHOU em ${caminho}: ${de}`)
  }
  writeFileSync(caminho, s, 'utf8')
  total += n
  console.log(`${String(n).padStart(4)}/${pares.length}  ${caminho}`)
}
console.log(`${total} padroes aplicados`)
