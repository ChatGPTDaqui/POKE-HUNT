// PH-511 — a tela de Hunt nao volta a explicar por `title=` nativo.
//
// ---------------------------------------------------------------------------
// O QUE ESTE PORTAO IMPEDE
// ---------------------------------------------------------------------------
// `title=` em elemento HTML so abre com o mouse parado ~1s e **nao existe no
// toque**. No celular o elemento fica sem legenda nenhuma, e nada indica que
// havia uma. `docs/19-explicacao-flutuante.md` chama esse padrao de "o pior dos
// tres padroes de explicacao do jogo".
//
// A tela de Hunt tinha TRES, e o pior deles nao era o obvio:
//
//   LinhaDeEspecie  o selo de efetividade — mostra so "2x"/"½x" numa cor, e a
//                   legenda invisivel era o unico lugar que dizia DE QUEM
//                   CONTRA QUEM. E o dado que decide se vale entrar na hunt.
//   LinhaDeEspecie  a tag de Guardião/Lord
//   HuntMenu        o chip de sub-bioma ("N especies · loot X")
//
// ---------------------------------------------------------------------------
// POR QUE UM SEGUNDO ARQUIVO, E NAO ESTENDER O GLOB DO PRIMEIRO
// ---------------------------------------------------------------------------
// `components/hud/hudNaoUsaTitleNativo.test.ts` (PH-165) faz a mesma varredura
// na HUD. Estender o glob dele pra ca daria UM teste cobrindo duas areas com
// historias diferentes — e a mensagem de falha perderia o contexto de qual
// leva fechou qual area. `docs/19` lista as areas restantes uma a uma; cada uma
// que fechar ganha o seu, e as tres compartilham o DETECTOR
// (`lib/tituloNativo.ts`), que e a parte que nao pode divergir.
//
// A REGRA E DO DETECTOR, e o falso positivo que ela evita esta documentado la:
// `<Sheet title="Hunt Analyzer">` e PROP de componente, nao atributo de DOM, e
// nao vira tooltip nenhum. So tag com letra minuscula conta.
import { describe, expect, it } from 'vitest'
import { titlesNativos } from '@/lib/tituloNativo'

const FONTES = import.meta.glob('./*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

describe('a tela de Hunt nao usa `title=` nativo (PH-511)', () => {
  it('a varredura enxerga os arquivos da tela de Hunt', () => {
    // Sem isto o teste passa vazio se o glob mudar de caminho — o modo de falha
    // classico de teste que le fonte, e o unico jeito de um portao de proibicao
    // mentir sem ninguem ver.
    expect(Object.keys(FONTES).length).toBeGreaterThanOrEqual(4)
    expect(Object.keys(FONTES).some((k) => k.endsWith('/LinhaDeEspecie.tsx'))).toBe(true)
    expect(Object.keys(FONTES).some((k) => k.endsWith('/HuntMenu.tsx'))).toBe(true)
  })

  it('nenhum elemento HTML da tela de Hunt carrega `title=`', () => {
    const achados: string[] = []
    for (const [arquivo, fonte] of Object.entries(FONTES)) {
      for (const linha of titlesNativos(fonte)) achados.push(`${arquivo}:${linha}`)
    }
    expect(
      achados,
      'title= nativo nao abre no toque (docs/19). Use `Explicacao` ou `<Palavra>` — '
      + '`components/shared/StatusBadge.tsx` e a conversao de referencia, e '
      + '`LinhaDeEspecie` mostra as duas formas.\n\n'
      + achados.join('\n'),
    ).toEqual([])
  })

  it('`title=` como PROP de componente continua valendo', () => {
    // Guarda anti-falso-positivo, e ela existe porque a varredura da PH-165
    // ERROU exatamente aqui na primeira passada: contou `<Sheet title=…>` como
    // violacao e achou 93 ocorrencias onde havia 40. `HuntAnalyzer` tem uma
    // dessas e tem que continuar passando.
    const analyzer = Object.entries(FONTES).find(([k]) => k.endsWith('/HuntAnalyzer.tsx'))
    expect(analyzer, 'HuntAnalyzer.tsx sumiu do glob').toBeTruthy()
    expect(analyzer![1]).toMatch(/title="Hunt Analyzer"/)
    expect(titlesNativos(analyzer![1])).toEqual([])
  })
})
