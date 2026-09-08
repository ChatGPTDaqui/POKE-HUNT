# Publicação e diagnóstico

PR/merge: [PROCESSO](../PROCESSO.md). Banco: [migrations](banco.md).
Dev/public compartilham projeto; deploy de dev já aplica migrations de ambos.

Consultar estado agregado em intervalos razoáveis enquanto realiza trabalho independente;
não manter loops de `gh pr checks`. Espera não substitui verificar o resultado final.

`node scripts/ci/status-publicacao.mjs [SHA completo]` consulta o run e seu artefato
`publicacao-status`. Sem SHA usa a main atual. O resultado discrimina migration, Edge,
as duas bancadas e o cliente. `verified` exige todos; `configuration-inconclusive`
exige corrigir credenciais e verificar; `functional-failure` exige tratar a regressão;
`client-pending` exige acompanhar o Pages; `deployment-failure` exige investigar a etapa
que falhou. Artefato ausente ou execução em andamento nunca significam verificado.
O cliente precisa apresentar SHA, entrada no HTML e hash do bundle correspondentes,
independentemente da versão das patch notes. A espera por propagação tem limite.

## Sequência

1. Conferir merge e deploy de dev; distinguir aplicação de migrations, publicação e tipos.
2. Conferir staging: servidor e cliente. Revisar intervalo de patch notes: anunciar somente
   mudanças completas que o jogador vê/sente; documentação/CI internos não exigem nota de jogo.
3. PR dev → main, merge commit; sem nova espera por aprovação humana já dispensada.
4. Conferir deploy de produção e as duas bancadas: scripts/harness/fumaca-de-producao.mjs
   e scripts/harness/abrir-hunt-em-producao.mjs. Credencial ausente/recusada é inconclusivo:
   corrigir e verificar. Regressão funcional confirmada exige reversão antes de investigação longa.
5. Cliente Pages é publicação separada: conferir com o build promovido. Resultado real na issue.

## Ambientes e ferramentas

Servidor: jogo-dev (dev), jogo (public). Cliente: dev.poke-hunt-euj.pages.dev e
poke-hunt-euj.pages.dev. Configuração: [ambiente local](ambiente-local.md).
Build publicável: npm run build inclui copiar-assets; build:verificar não inclui arte.
Deploy normal é pelo CI. Acesso técnico a edge:publicar/db push não autoriza uso fora do fluxo.
Diagnóstico de crédito pode exigir fumaca-credito.mjs: ele escreve com conta de teste;
confirmar alvo e consultar suas opções antes de usar. Tela de login/HTTP 200 não prova hunt funcional.

Detalhes de incidentes: [operação histórica](../arquivo/2026-09-08/docs/11-operacao.md).
As alegações antigas de falta de workflow/proteção não descrevem o estado atual; consulte GitHub.
