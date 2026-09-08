# Catálogo

Fonte: scripts/usum/catalog.json e formulas.json. npm run usum:gerar gera catálogo;
usum:conferir e invariantes de dados verificam a saída. Confirme o gerador de cada arquivo:
src/data/generated também contém derivações de mapas/arte, não apenas catálogo USUM.
Não edite gerados à mão; preserve entradas e saídas versionadas.
planilha:aplicar, catalog:gerar, catalog:migrar e catalog:verificar são legado Gen2 bloqueado;
não habilite PERMITIR_CATALOGO_GEN2 por conveniência.
Geração III foi ligada em PH-332; o plano antigo de preparação não é pendência atual.

## Consulta detalhada

- [A fonte de verdade é scripts/usum/catalog.json](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#a-fonte-de-verdade-é-scriptsusumcatalogjson)
- [O bloqueio: por que os três geradores antigos continuam no repo, desligados](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#o-bloqueio-por-que-os-três-geradores-antigos-continuam-no-repo-desligados)
- [A prova histórica: trocar de fonte (planilha → Postgres) não mudou o jogo](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#a-prova-histórica-trocar-de-fonte-planilha--postgres-não-mudou-o-jogo)
- [Os scripts (estado atual: pipeline vivo primeiro)](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#os-scripts-estado-atual-pipeline-vivo-primeiro)
- [O que vem de onde no catalog.json](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#o-que-vem-de-onde-no-catalogjson)
- [Armadilhas do PostgREST (histórico — só relevantes se o bloqueio for levantado)](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#armadilhas-do-postgrest-histórico--só-relevantes-se-o-bloqueio-for-levantado)
- [Regras sobre arquivos gerados](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#regras-sobre-arquivos-gerados)
- [O motor de fórmula](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#o-motor-de-fórmula)
- [Tier de spawn: por que o peso deixou de ser catchRate](../arquivo/2026-09-08/docs/02-dados-e-catalogo.md#tier-de-spawn-por-que-o-peso-deixou-de-ser-catchrate)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
