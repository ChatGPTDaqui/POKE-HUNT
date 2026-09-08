# POKE-HUNT / Novo Poke Idle

Jogo idle de captura em React, TypeScript e Canvas, com autoridade e persistência Supabase.

## Rodar

Na raiz, npm install no primeiro uso e npm run dev (porta 5173).
Configure cliente e RPC para staging conforme [ambiente local](docs/operacao/ambiente-local.md).
O progresso exige servidor de autoridade publicado; servidor muda por PR/CI.

| Comando | Uso |
|---|---|
| npm run dev | Cliente Vite |
| npm run build:verificar | Conferir build limpo sem copiar arte |
| npm run build | Build publicável, incluindo arte |
| npm start | Build e serve.js |
| npm run usum:gerar | Gerar catálogo atual |

Arquitetura e documentação: [índice por tarefa](docs/README.md).
Contribuição: [processo](docs/PROCESSO.md). Agentes: [AGENTS.md](AGENTS.md).
Assets e entradas de geração são preservados na raiz/scripts; não copiar para public/assets.
Catálogo Gen2 e saves vanilla pertencem ao histórico; não são configuração atual.
