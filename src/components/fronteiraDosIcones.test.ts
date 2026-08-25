// PH-127 — Lucide fica dentro dos primitivos gerados; o app usa Phosphor.
//
// O projeto tem duas bibliotecas de icone de proposito, e a razao esta em
// `docs/12-decisoes-descartadas.md#unificar-as-duas-bibliotecas-de-icone`:
// `src/components/ui/*` e GERADO pela CLI do shadcn, e Lucide e o que ela emite.
// Editar aqueles arquivos a mao para "unificar" desfaz na proxima vez que
// alguem rodar a CLI.
//
// Isto e um teste, e nao so a nota no doc, porque a nota nao segura nada: a
// regra "Lucide nao sai de `ui/`" so vale enquanto alguem lembra dela, e o
// README de `docs/` e explicito sobre o que acontece com documento assim. O
// custo de errar e baixo e invisivel — mais uma biblioteca de icone no bundle,
// dois estilos de traco na mesma tela — que e justamente o tipo de coisa que
// ninguem nota numa revisao.
import { describe, expect, it } from 'vitest'

// `import.meta.glob` com `?raw`: `src/` nao tem os types de node, mesma razao
// documentada em `render/ambiente.test.ts`.
// Glob a partir da RAIZ do projeto (`/src/...`), e nao relativo a este arquivo:
// caminho relativo volta normalizado (`./ui/checkbox.tsx`) e o prefixo que
// interessa desaparece do resultado.
const FONTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const ARQUIVOS = Object.keys(FONTES).map((k) => ({ caminho: k.replace(/\\/g, '/'), fonte: FONTES[k] }))

const IMPORTA_LUCIDE = /from\s+['"]lucide-react['"]/
const PRIMITIVOS = '/src/components/ui/'

describe('fronteira das bibliotecas de icone (PH-127)', () => {
  // Guarda anti-teste-vacuo: sem arquivo lido, e sem NENHUM uso de Lucide
  // conhecido, o teste abaixo passaria sem olhar nada.
  it('o glob leu o codigo e achou os usos esperados de Lucide', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(100)
    const comLucide = ARQUIVOS.filter((a) => IMPORTA_LUCIDE.test(a.fonte))
    expect(comLucide.length).toBeGreaterThan(0)
  })

  it('Lucide nao e importado fora de src/components/ui/', () => {
    const foraDoLugar = ARQUIVOS
      .filter((a) => IMPORTA_LUCIDE.test(a.fonte) && !a.caminho.startsWith(PRIMITIVOS))
      .map((a) => a.caminho)

    expect(
      foraDoLugar,
      'importe de @phosphor-icons/react — Lucide existe so para os primitivos gerados pela CLI ' +
        'do shadcn (docs/12-decisoes-descartadas.md). Um primitivo copiado pra dentro de tela ' +
        'aparece exatamente assim.',
    ).toEqual([])
  })
})
