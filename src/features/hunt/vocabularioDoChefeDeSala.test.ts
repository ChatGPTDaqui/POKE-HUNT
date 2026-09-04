// PH-509 — o chefe de sala tem UM nome na tela, e nao tres.
//
// ---------------------------------------------------------------------------
// O QUE ESTE TESTE IMPEDE
// ---------------------------------------------------------------------------
// O mesmo conceito aparecia com TRES vocabularios no mesmo jogo:
//
//   LinhaDeEspecie / sprites   ->  "★ GUARDIAN" / "★ LORD"     (ingles)
//   SalaChip                   ->  "Guardião"   / "Lorde"      (portugues)
//   glossario                  ->  "Guardião e Lorde"
//   Wiki e tutorial (PH-507)   ->  "Guardião"   / "Lord"
//
// O jogador lia "Guardião" na Wiki, via "GUARDIAN" na tela e "Lorde" no chip. E
// nenhum teste reprovava, porque nenhum dos tres estava ERRADO isoladamente —
// o defeito era a divergencia, que so aparece olhando os quatro arquivos juntos.
// E exatamente a classe de coisa que um teste de varredura pega e um teste de
// unidade nao.
//
// ---------------------------------------------------------------------------
// A DECISAO QUE ELE TRANCA, com o porque
// ---------------------------------------------------------------------------
// "Guardião" (portugues) e "Lord" (ingles), e a mistura NAO e descuido:
//
//  - "Lord" e CANONICO pra este papel exato. Em Legends: Arceus os Noble
//    Pokemon sao tratados como "Lord Kleavor" / "Lady Lilligant" — o dono da
//    area, que precisa ser subjugado pra o treinador prosseguir. Traduzir pra
//    "Lorde" perderia o nome proprio.
//  - "Guardian" NAO tinha essa defesa: em canon de jogo a palavra nomeia os
//    guardian deities de Alola (os Tapu), que sao LENDARIOS — categoria que
//    este projeto tem num sistema separado, entao o nome colidia. Traduzido,
//    "Guardião" descreve a funcao sem colidir com nada.
//
// Considerado e descartado: "Totem" (Gen VII, o mapeamento canonico mais
// preciso — guarda a Trial e precisa cair pra passar) e "Alpha" (Legends:
// Arceus; nao bloqueia passagem, e `alpha` ja significa opacidade em
// `render/ambiente.ts`). Decisao do dono do projeto.
//
// ---------------------------------------------------------------------------
// O QUE ELE NAO TOCA, DE PROPOSITO
// ---------------------------------------------------------------------------
// `TipoDeProtetor` continua `'guardian' | 'lord'`, e o banco continua com
// `check (tipo in ('guardian','lord'))`. O valor esta PERSISTIDO: renomear
// pediria par de migrations e backfill de linha viva, e e a armadilha conhecida
// de "string persistida + rename = 403 em toda hunt, sem erro nenhum". Mesma
// razao pela qual as migrations antigas ficaram com `boss_*`.
//
// Ou seja: este teste olha SO o que o jogador le. Identificador em ingles aqui e
// o comportamento certo, e por isso a varredura ignora comentario e nome de
// simbolo — ver `apenasCopy`.
import { describe, expect, it } from 'vitest'

/**
 * Os fontes que produzem TEXTO DE CHEFE DE SALA pra tela.
 *
 * Lista explicita, e nao um glob de `src/**`: `data/patchNotes.ts` tem "LORDE" e
 * "GUARDIÃO" em notas ja publicadas (historico imutavel, nao se reescreve), e um
 * glob amplo reprovaria o changelog. Arquivo novo que passe a mostrar o chefe
 * precisa ser acrescentado aqui — o custo e uma linha, e o ganho e o teste nao
 * mentir por omissao.
 */
const FONTES = import.meta.glob(
  [
    '/src/features/hunt/LinhaDeEspecie.tsx',
    '/src/render/sprites.ts',
    '/src/components/hud/SalaChip.tsx',
    '/src/data/glossario.ts',
    '/src/features/wiki/abaMundo.tsx',
    '/src/data/tutoriais.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

/**
 * Comentario fora, e o `TipoDeProtetor` tambem.
 *
 * Os comentarios deste projeto EXPLICAM a decisao citando o nome antigo (o
 * cabecalho acima e o exemplo), e o identificador em ingles e deliberado. Sem
 * esta limpeza o teste reprovaria a documentacao da propria regra e o codigo
 * que ela manda manter — e a saida seria desligar o teste.
 */
function apenasCopy(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    // `tipoDeProtetor === 'lord'`, `'guardian' | 'lord'`, `ehLord` — chave e
    // simbolo, nao texto de tela.
    .replace(/'(guardian|lord)'/g, '')
    .replace(/\b(TipoDeProtetor|ehLord|tipoDeProtetor)\b/g, '')
}

const PROIBIDOS: { re: RegExp; porque: string }[] = [
  {
    re: /\bGUARDIAN\b/,
    porque: 'a UI e em portugues — o rotulo do chefe de sala 1-9 e "GUARDIÃO". '
      + "O identificador `'guardian'` continua em ingles de proposito (esta persistido no banco).",
  },
  {
    re: /\bGuardian\b/,
    porque: 'idem, na forma capitalizada: em copy escreva "Guardião".',
  },
  {
    re: /\bLordes?\b(?!\s*Kleavor)/i,
    porque: '"Lorde" (portugues) e "Lord" (canon de Legends: Arceus) estavam os dois em uso pro MESMO chefe. '
      + 'Vale "Lord" — e nome proprio, nao substantivo comum.',
  },
]

/** Cada linha de copy que casa com o proibido, com o arquivo e a linha. */
function ocorrencias(fonte: string, re: RegExp): { linha: number; texto: string }[] {
  return apenasCopy(fonte)
    .split('\n')
    .map((texto, i) => ({ linha: i + 1, texto }))
    .filter(({ texto }) => re.test(texto))
}

describe('o chefe de sala tem um nome so na tela (PH-509)', () => {
  for (const { re, porque } of PROIBIDOS) {
    it(`a copy nao usa ${re.source}`, () => {
      const achados: string[] = []
      for (const [arquivo, fonte] of Object.entries(FONTES)) {
        for (const { linha, texto } of ocorrencias(fonte, re)) {
          achados.push(`${arquivo}:${linha}  ${texto.trim()}`)
        }
      }
      expect(achados, `${porque}\n\n${achados.join('\n')}`).toEqual([])
    })
  }

  // A SANIDADE, e ela nao e formalidade: as tres regras acima sao PROIBICOES, e
  // proibicao passa verde num arquivo vazio. Sem este caso, apagar a tag da tela
  // deixaria a suite inteira verde — o modo de falha classico de teste de
  // varredura. Aqui se afirma que o par CERTO existe de fato.
  it('os nomes escolhidos aparecem de verdade na copy', () => {
    const tudo = Object.values(FONTES).map(apenasCopy).join('\n')
    expect(tudo).toMatch(/GUARDIÃO/)
    expect(tudo).toMatch(/Guardião/)
    expect(tudo).toMatch(/\bLORD\b/)
  })
})
