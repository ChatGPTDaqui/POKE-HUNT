# Documento reorganizado

Consulte [docs/arquivo/README.md](docs/arquivo/README.md).
Texto anterior, datado e sem autoridade operacional: [arquivo](docs/arquivo/2026-09-08/SPEC-supabase-migration.md).

<a id="spec-migração-de-localstorage-para-postgres-supabase"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#spec-migração-de-localstorage-para-postgres-supabase); [documentação atual](docs/arquivo/README.md).

<a id="1-estado-atual-baseline"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#1-estado-atual-baseline); [documentação atual](docs/arquivo/README.md).

<a id="2-decisões-já-tomadas-não-reabrir-sem-motivo-novo"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#2-decisões-já-tomadas-não-reabrir-sem-motivo-novo); [documentação atual](docs/arquivo/README.md).

<a id="3-schema-proposto"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#3-schema-proposto); [documentação atual](docs/arquivo/README.md).

<a id="31-players-1-linha-por-usuário--substitui-o-topo-do-gamestate"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#31-players-1-linha-por-usuário--substitui-o-topo-do-gamestate); [documentação atual](docs/arquivo/README.md).

<a id="32-pokemon_instances-substitui-team--bagpokes"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#32-pokemon_instances-substitui-team--bagpokes); [documentação atual](docs/arquivo/README.md).

<a id="33-player_items-substitui-itemslockeditems"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#33-player_items-substitui-itemslockeditems); [documentação atual](docs/arquivo/README.md).

<a id="34-player_pokedex-substitui-pokedexkills"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#34-player_pokedex-substitui-pokedexkills); [documentação atual](docs/arquivo/README.md).

<a id="35-player_auto_catch_rules-substitui-autocatchrules"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#35-player_auto_catch_rules-substitui-autocatchrules); [documentação atual](docs/arquivo/README.md).

<a id="36-rls--obrigatório-em-todas-as-5-tabelas"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#36-rls--obrigatório-em-todas-as-5-tabelas); [documentação atual](docs/arquivo/README.md).

<a id="4-o-que-fica-fora-do-banco-permanece-no-bundle-js-estático"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#4-o-que-fica-fora-do-banco-permanece-no-bundle-js-estático); [documentação atual](docs/arquivo/README.md).

<a id="5-pontos-em-aberto--riscos-levar-para-a-implementação-não-resolvidos-aqui"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#5-pontos-em-aberto--riscos-levar-para-a-implementação-não-resolvidos-aqui); [documentação atual](docs/arquivo/README.md).

<a id="6-fase-2--catálogo-sai-da-planilha-entra-no-banco"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#6-fase-2--catálogo-sai-da-planilha-entra-no-banco); [documentação atual](docs/arquivo/README.md).

<a id="61-tabelas-de-catálogo-schema"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#61-tabelas-de-catálogo-schema); [documentação atual](docs/arquivo/README.md).

<a id="62-o-que-não-vira-tabela--continua-transformação-em-código"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#62-o-que-não-vira-tabela--continua-transformação-em-código); [documentação atual](docs/arquivo/README.md).

<a id="63-o-que-a-aposentadoria-da-planilha-resolve-de-verdade-não-é-só-troca-de-arquivo"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#63-o-que-a-aposentadoria-da-planilha-resolve-de-verdade-não-é-só-troca-de-arquivo); [documentação atual](docs/arquivo/README.md).

<a id="64-segurança--ponto-crítico-não-opcional"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#64-segurança--ponto-crítico-não-opcional); [documentação atual](docs/arquivo/README.md).

<a id="65-pipeline--migração"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#65-pipeline--migração); [documentação atual](docs/arquivo/README.md).

<a id="7-usuários-jogador-vs-admin--tabelas-rls-e-roteamento"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#7-usuários-jogador-vs-admin--tabelas-rls-e-roteamento); [documentação atual](docs/arquivo/README.md).

<a id="71-admins--admin_actions-retomando-o-desenho-da-conversa-anterior"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#71-admins--admin_actions-retomando-o-desenho-da-conversa-anterior); [documentação atual](docs/arquivo/README.md).

<a id="72-players-precisa-existir-antes-do-primeiro-login-em-telas-de-jogo"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#72-players-precisa-existir-antes-do-primeiro-login-em-telas-de-jogo); [documentação atual](docs/arquivo/README.md).

<a id="73-roteamento-vanilla-js--sem-framework-respeita-a-restrição-do-claudemd"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#73-roteamento-vanilla-js--sem-framework-respeita-a-restrição-do-claudemd); [documentação atual](docs/arquivo/README.md).

<a id="74-client-side-guard-não-é-segurança--rls-é-o-gate-real"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#74-client-side-guard-não-é-segurança--rls-é-o-gate-real); [documentação atual](docs/arquivo/README.md).

<a id="75-trade-off-aceito-jogo-deixa-de-abrir-100-offline"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#75-trade-off-aceito-jogo-deixa-de-abrir-100-offline); [documentação atual](docs/arquivo/README.md).

<a id="76-em-aberto"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#76-em-aberto); [documentação atual](docs/arquivo/README.md).

<a id="8-auditoria-da-planilha-real--correções-no-schema"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#8-auditoria-da-planilha-real--correções-no-schema); [documentação atual](docs/arquivo/README.md).

<a id="81-bugs-que-quebrariam-o-jogo-corrigidos"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#81-bugs-que-quebrariam-o-jogo-corrigidos); [documentação atual](docs/arquivo/README.md).

<a id="82-peso-de-spawn-troca-do-proxy-pelo-dado-real-decisão-do-usuário"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#82-peso-de-spawn-troca-do-proxy-pelo-dado-real-decisão-do-usuário); [documentação atual](docs/arquivo/README.md).

<a id="83-dado-real-que-morreria-com-o-xlsx-3-tabelas-fonte-novas"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#83-dado-real-que-morreria-com-o-xlsx-3-tabelas-fonte-novas); [documentação atual](docs/arquivo/README.md).

<a id="84-integridade-a-planilha-passou-limpa"></a>
[Seção anterior](docs/arquivo/2026-09-08/SPEC-supabase-migration.md#84-integridade-a-planilha-passou-limpa); [documentação atual](docs/arquivo/README.md).
