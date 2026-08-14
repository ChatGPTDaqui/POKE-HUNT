// Guarda contra reversao silenciosa do catalogo.
//
// Tres geradores antigos continuam no repo (planilha -> geracao, Postgres ->
// geracao, e a verificacao byte-a-byte entre os dois). Todos produzem o
// catalogo de GEN 2. Desde a migracao para os dados de Pokemon Ultra Sun,
// rodar qualquer um deles sobrescreve `src/data/generated/*.ts` com stats,
// movesets, tipos e formulas de outra geracao — e sem o tipo Fada, que o resto
// do codigo ja assume existir.
//
// O modo de falha e o pior possivel: nao ha erro. O jogo simplesmente volta a
// ser o de antes, e so um teste (ou um jogador) percebe. Dai o bloqueio ser
// explicito e a saida ser diferente de zero.
//
// Eles NAO foram apagados de proposito: `sync-planilha.js` continua sendo a
// biblioteca de curadoria de hunts e o emissor que o gerador novo reusa, e os
// outros dois sao o registro auditavel de como o catalogo antigo era montado.
'use strict';

function bloqueiaCatalogoAntigo(comando, motivo) {
  if (process.env.PERMITIR_CATALOGO_GEN2 === '1') {
    console.warn(`AVISO: ${comando} vai mexer no catalogo de Gen2 (PERMITIR_CATALOGO_GEN2=1).\n`);
    return;
  }
  console.error(
    `${comando} esta desativado.\n\n` +
    `${motivo}\n\n` +
    'O gerador atual e: npm run usum:gerar\n\n' +
    'Para rodar mesmo assim: PERMITIR_CATALOGO_GEN2=1 <comando>\n' +
    '(os testes de dado vao falhar enquanto o catalogo antigo estiver no lugar).'
  );
  process.exit(1);
}

module.exports = { bloqueiaCatalogoAntigo };
