// PH-379: a copy do jogo nao volta a perder acento.
//
// O QUE ESTE TESTE EXISTE PRA IMPEDIR, e por que ele nao e frescura de estilo:
// a varredura que motivou a leva achou 410 ocorrencias de palavra portuguesa
// sem diacritico em texto que o jogador LE — ficha de golpe, Wiki, tutorial,
// changelog. E era inconsistente: arquivos recentes escreviam "Não foi
// possível" ao lado de arquivos antigos com "Nao foi possivel", no mesmo
// modulo. Ou seja, deriva, e nao decisao — nao ha regra em `CLAUDE.md`, em
// `CLAUDE.local.md` nem em `docs/` pedindo ASCII, e a fonte do projeto (Geist)
// tem o repertorio completo.
//
// Corrigir 800 ocorrencias sem trancar o resultado seria trabalho perdido: o
// proximo arquivo novo reabre o buraco, e ninguem percebe — texto errado nao
// lanca excecao.
//
// COMO ELE EVITA FALSO POSITIVO. Chave, id e valor comparado em codigo
// (`mode === 'compacto'`) sao palavra unica, entao so literal COM ESPACO entra
// na conta. `data/generated/` fica de fora porque e regerado da planilha mestra
// — corrigir ali seria sobrescrito no proximo `catalog:gerar`, e o conserto
// pertence a fonte. `patchNotes.ts` idem, por outro motivo: e historico
// publicado e tem leva propria.
import { describe, expect, it } from 'vitest'

/**
 * Palavras que SEMPRE levam diacritico em portugues.
 *
 * Curta de proposito, e so com o que nao tem homografo sem acento: `esta`
 * (demonstrativo) e `e` (conjuncao) ficam de fora porque as duas grafias
 * existem, e um teste que reprovasse "esta tela" seria pior que teste nenhum.
 */
const SEM_ACENTO_PROIBIDAS = [
  'nao', 'sao', 'entao', 'tao', 'estao', 'voce', 'voces', 'ja', 'ate', 'tambem',
  'alem', 'porem', 'apos', 'ninguem', 'alguem', 'tres', 'varios', 'varias',
  'atras', 'possiveis', 'possivel', 'impossivel', 'disponivel', 'nivel',
  'niveis', 'numero', 'numeros', 'pagina', 'paginas', 'ultimo', 'ultima',
  'proximo', 'proxima', 'proprio', 'propria', 'maximo', 'minimo', 'unico',
  'unica', 'critico', 'critica', 'fisico', 'fisica', 'psiquico', 'eletrico',
  'basico', 'basica', 'automatico', 'automatica', 'rapido', 'rapida',
  'especie', 'especies', 'usuario', 'usuarios', 'relatorio', 'historico',
  'estagio', 'estagios', 'forca', 'cacada', 'caca', 'preco', 'precos',
  'mudanca', 'diferenca', 'servico', 'cabeca', 'aco', 'agua', 'saude',
  'acao', 'acoes', 'opcao', 'opcoes', 'sessao', 'conexao', 'versao', 'missao',
  'evolucao', 'descricao', 'informacao', 'configuracao', 'configuracoes',
  'precisao', 'pressao', 'razao', 'visao', 'decisao', 'explosao', 'padrao',
  'botao', 'cartao', 'campeao', 'guardiao', 'dragao', 'mao', 'chao',
  'experiencia', 'sequencia', 'frequencia', 'resistencia', 'distancia',
  'sera', 'serao', 'tera', 'terao', 'ira', 'irao', 'estara', 'ficara',
  'bonus', 'area', 'icone', 'icones', 'memoria', 'vitoria', 'dificil', 'facil',
  'util', 'inutil', 'lendario', 'lendarios', 'catalogo', 'mecanica',
  'mecanicas', 'genero', 'evasao', 'duracao', 'protecao', 'atencao',
]

const RE_PROIBIDAS = new RegExp(
  `(^|[^\\p{L}0-9_])(${SEM_ACENTO_PROIBIDAS.join('|')})($|[^\\p{L}0-9_])`,
  'iu',
)

const FONTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** Identificador, classe do Tailwind, caminho de arquivo — nao e copy. */
function pareceCodigo(texto: string): boolean {
  return /^[a-z0-9@/._-]+$/i.test(texto)
    || /[/\\]|px-|py-|text-|flex|rounded|border|gap-|assets|https?:/.test(texto)
}

/**
 * Lista de colunas do PostgREST (`'id, fonte, rota, nivel, mensagem'`).
 *
 * Ela tem espaco e e minuscula, entao passa por toda guarda anterior — e o
 * nome da coluna vem do BANCO, nao da tela. Mesma forma que
 * `scripts/harness/acentuar-copy.mjs` reconhece.
 */
const RE_LISTA_DE_COLUNAS = /^\s*[a-z_][\w]*(\s*,\s*[a-z_][\w]*)+\s*$/

/**
 * `${...}` fora — o miolo de uma interpolacao e IDENTIFICADOR, nao texto.
 *
 * Sem isto o teste reprovava `\`${especie.name} nível ${poke.level}\`` por causa
 * de "especie", que e o nome da variavel. Dezessete falsos positivos assim na
 * primeira execucao, todos em template literal.
 */
function semInterpolacao(texto: string): string {
  return texto.replace(/\$\{[^}]*\}/g, ' ')
}

/** Cada trecho de PROSA de um arquivo, com a linha em que ele esta. */
function trechosDeCopy(fonte: string): { linha: number; texto: string }[] {
  const achados: { linha: number; texto: string }[] = []
  fonte.split('\n').forEach((linha, i) => {
    // Comentario nao e copy: ele nao chega em tela nenhuma, e normaliza-lo
    // encheria o diff sem mudar nada pro jogador.
    if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return
    // Literal comparado em codigo tem a grafia do OUTRO lado da comparacao (a
    // mensagem do servidor, por exemplo) e nao pode ser tocado.
    if (/(===?|!==?)/.test(linha)) return
    const candidatos: string[] = []
    for (const m of linha.matchAll(/'([^'\n]{2,300})'/g)) candidatos.push(m[1])
    for (const m of linha.matchAll(/"([^"\n]{2,300})"/g)) candidatos.push(m[1])
    for (const m of linha.matchAll(/`([^`\n]{2,300})`/g)) candidatos.push(m[1])
    // As lookarounds sao as mesmas de `acentuar-copy.mjs`, e existem pelo mesmo
    // motivo: numa arrow (`=> nivel <= f.niveis[1]`) o `>` do `=>` e o `<` do
    // `<=` cercam um trecho que parece texto de JSX e e codigo.
    for (const m of linha.matchAll(/(?<![=\-!>])>([^<>{}\n]{2,300})<(?!=)/g)) candidatos.push(m[1])
    for (const bruto of candidatos) {
      if (!bruto.includes(' ') || pareceCodigo(bruto)) continue
      if (RE_LISTA_DE_COLUNAS.test(bruto)) continue
      const texto = semInterpolacao(bruto)
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(texto)) continue
      achados.push({ linha: i + 1, texto })
    }
  })
  return achados
}

describe('a copy do jogo continua acentuada (PH-379)', () => {
  it('nenhum texto de tela usa a grafia sem diacritico', () => {
    const faltando: string[] = []
    for (const [caminho, fonte] of Object.entries(FONTES)) {
      if (/\.test\.|\/data\/generated\/|patchNotes\.ts$/.test(caminho)) continue
      for (const { linha, texto } of trechosDeCopy(fonte)) {
        const erro = RE_PROIBIDAS.exec(texto)
        if (erro) faltando.push(`${caminho}:${linha}  "${erro[2]}"  em: ${texto.slice(0, 80)}`)
      }
    }
    expect(faltando, `copy sem acento (rode \`node scripts/harness/acentuar-copy.mjs <arquivo>\`):\n${faltando.join('\n')}`)
      .toEqual([])
  })

  it('o teste enxerga o que veio consertar — contrafactual', () => {
    // Sem isto, um erro na extracao (regex que nao casa nada) faria o caso
    // acima passar para sempre, e o guarda seria decorativo.
    const amostra = "const aviso = 'Sem golpe escolhido — seu POKE nao ataca.'"
    const trechos = trechosDeCopy(amostra)
    expect(trechos).toHaveLength(1)
    expect(RE_PROIBIDAS.test(trechos[0].texto)).toBe(true)
  })

  it('nao reprova a grafia CERTA, nem o que e chave de codigo', () => {
    const certo = "const aviso = 'Sem golpe escolhido — seu POKE não ataca.'"
    expect(RE_PROIBIDAS.test(trechosDeCopy(certo)[0].texto)).toBe(false)

    // Chave de uma palavra nao entra na varredura (nao tem espaco).
    expect(trechosDeCopy("if (modo) abrir('configuracoes')")).toEqual([])
  })
})
