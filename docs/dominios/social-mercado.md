# Social e mercado

Fontes: src/data/remote, features sociais e supabase/migrations.
Dinheiro, item e POKE precisam mudar atomicamente na transação que efetiva a negociação.
Verifique posse pelo ator autenticado e proteja contra repetição/concorrência.
Busque a última definição de RPC nas migrations, não a primeira ocorrência do nome.
Entrega reivindicada sem persistência precisa retornar à fila; não corrigir cada call site
com tratamentos inconsistentes. Testes de troca/correio podem exigir duas contas reais de teste.

## Consulta detalhada

- [O invariante que sustenta tudo aqui](../arquivo/2026-09-08/docs/08-social-e-mercado.md#o-invariante-que-sustenta-tudo-aqui)
- [Mercado: dois modelos, porque item e POKE não são a mesma coisa](../arquivo/2026-09-08/docs/08-social-e-mercado.md#mercado-dois-modelos-porque-item-e-poke-não-são-a-mesma-coisa)
- [Os três invariantes do mercado](../arquivo/2026-09-08/docs/08-social-e-mercado.md#os-três-invariantes-do-mercado)
- [POKE anunciado sai do inventário via location='market'](../arquivo/2026-09-08/docs/08-social-e-mercado.md#poke-anunciado-sai-do-inventário-via-locationmarket)
- [dev.comprar_anuncio: cobrar e mover o POKE na MESMA transação](../arquivo/2026-09-08/docs/08-social-e-mercado.md#devcomprar_anuncio-cobrar-e-mover-o-poke-na-mesma-transação)
- [Modo "Somente Lance"](../arquivo/2026-09-08/docs/08-social-e-mercado.md#modo-somente-lance)
- [RLS do mercado e do social — leitura pública chegou, escrita continua fechada](../arquivo/2026-09-08/docs/08-social-e-mercado.md#rls-do-mercado-e-do-social--leitura-pública-chegou-escrita-continua-fechada)
- [Chat Mundo: Realtime, não mais polling](../arquivo/2026-09-08/docs/08-social-e-mercado.md#chat-mundo-realtime-não-mais-polling)
- [Correio e amizades](../arquivo/2026-09-08/docs/08-social-e-mercado.md#correio-e-amizades)
- [Nome do treinador é único](../arquivo/2026-09-08/docs/08-social-e-mercado.md#nome-do-treinador-é-único)
- [Ranking e Perfil](../arquivo/2026-09-08/docs/08-social-e-mercado.md#ranking-e-perfil)
- [Hall da Fama](../arquivo/2026-09-08/docs/08-social-e-mercado.md#hall-da-fama)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
