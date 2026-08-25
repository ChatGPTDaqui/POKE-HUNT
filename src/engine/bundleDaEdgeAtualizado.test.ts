// PH-133 — o bundle da Edge Function não pode ficar para trás de `authority/src`.
//
// ---------------------------------------------------------------------------
// O QUE ACONTECEU
// ---------------------------------------------------------------------------
// `supabase/functions/jogo/servidor.js` é gerado por `npm run build:edge` e
// COMMITADO. Em 2026-08-25 ele estava 4.490 inserções atrás da fonte: cinco
// levas de motor entraram sem rebuild.
//
// Três eram cosméticas (`isCrit`, `estagiosFonte`, `player.targetId`). Duas não:
// o A* com heap binário (PH-102) e as evoluções com `stoneType` (PH-145). O A*
// decide movimento, e o servidor RE-SIMULA o que o cliente fez — bundle velho
// ali é divergência de autoridade, que é a classe de bug mais cara deste
// projeto (PH-37).
//
// ---------------------------------------------------------------------------
// POR QUE UM TESTE, E NÃO UMA LINHA NO WORKFLOW
// ---------------------------------------------------------------------------
// `npm run edge:verificar` já existe e faz exatamente esta checagem. O que
// faltava era ALGUÉM RODAR: nenhum workflow o chama. A saída óbvia seria
// acrescentá-lo a `build-check-dev.yml`, uma linha de YAML.
//
// Este teste é o mesmo efeito por outro caminho, e ele tem uma vantagem que a
// linha de YAML não tem: roda em `npx vitest run` na máquina de quem
// desenvolve, ANTES do push. O CI já executa o vitest, então a cobertura de CI
// vem junto de graça.
//
// A linha de YAML continua valendo a pena — as duas não se excluem. Se ela
// entrar, este arquivo continua sendo o aviso que chega primeiro.
//
// ---------------------------------------------------------------------------
// POR QUE NÃO CHAMA `edge:verificar` DIRETO
// ---------------------------------------------------------------------------
// Aquele script roda `build:edge` SOBRE o arquivo commitado e depois pergunta
// ao `git diff` se algo mudou. Dentro de um teste isso teria dois defeitos:
// sujaria a árvore de trabalho de quem rodasse a suíte, e daria falso positivo
// para quem tivesse o bundle legitimamente modificado e ainda não commitado.
//
// Aqui o build sai para um diretório temporário e a comparação é de conteúdo.
// Nada é escrito no repositório.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { build } from 'vite'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const BUNDLE = join(RAIZ, 'supabase', 'functions', 'jogo', 'servidor.js')
// Dentro de `node_modules/` de propósito: já é ignorado pelo git e pelo próprio
// `test.exclude` do vite.config.ts, então nem o teste nem uma sobra dele podem
// virar arquivo rastreado.
const SAIDA_TEMP = 'node_modules/.tmp-edge-check'

describe('o bundle da Edge Function acompanha authority/src (PH-133)', () => {
  it('é byte a byte o que `npm run build:edge` produz hoje', async () => {
    // `mode` E `NODE_ENV` explícitos, e os DOIS são necessários.
    //
    // Dentro do Vitest o modo padrão é `'test'` e `process.env.NODE_ENV` vale
    // `'test'`. O `mode` sozinho não basta: a condição de export que decide
    // entre `react.production.js` e `react.development.js` é resolvida por
    // `NODE_ENV`, não pelo modo do Vite. Sem isto o bundle de teste sai 37 KB
    // maior — com o React de desenvolvimento dentro — e a comparação acusa
    // "desatualizado" quando não está.
    //
    // Restaurado no `finally`: deixar `NODE_ENV=production` vazado mudaria o
    // comportamento dos outros arquivos de teste da mesma execução.
    const nodeEnvAnterior = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await build({
        configFile: 'vite.edge.config.ts',
        logLevel: 'error',
        mode: 'production',
        build: { outDir: SAIDA_TEMP, emptyOutDir: true },
      })
    } finally {
      process.env.NODE_ENV = nodeEnvAnterior
    }

    // Quebra de linha NORMALIZADA antes de comparar, e isto não é frouxidão.
    // O repositório está em CRLF (`core.autocrlf`), então o git converte o
    // bundle ao gravá-lo na árvore de trabalho e o `vite build` emite LF: os
    // dois arquivos diferem em ~30.000 bytes de `\r` sem uma linha de código
    // diferente. `edge:verificar` não vê isso porque compara via `git diff`,
    // que normaliza; aqui a comparação é de conteúdo e precisa fazer o mesmo.
    //
    // Comparar cru daria um teste sempre vermelho — e um teste que sempre falha
    // é desligado na primeira semana, o que deixaria o furo aberto de novo.
    const semCR = (s: string) => s.replace(/\r\n/g, '\n')
    const gerado = semCR(readFileSync(join(RAIZ, SAIDA_TEMP, 'servidor.js'), 'utf8'))
    const commitado = semCR(readFileSync(BUNDLE, 'utf8'))

    // Guarda anti-vácuo: um build que falhasse silenciosamente e deixasse um
    // arquivo vazio faria as duas leituras "concordarem" em nada.
    expect(gerado.length, 'o build de teste saiu vazio').toBeGreaterThan(100_000)

    expect(
      gerado === commitado,
      'supabase/functions/jogo/servidor.js está desatualizado em relação a authority/src. '
      + 'Rode `npm run build:edge` e commite o bundle JUNTO da mudança de motor. '
      + 'Um `supabase functions deploy jogo` direto (sem o build antes) publicaria o bundle velho '
      + 'sem erro visível — e o servidor re-simula o que o cliente fez.',
    ).toBe(true)
    // ~600ms medido. É o teste mais caro da suíte depois dos de simulação, e o
    // preço é justo: a alternativa é descobrir a divergência em produção.
  }, 60_000)
})
