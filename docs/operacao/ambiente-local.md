# Ambiente local

Na raiz: npm install (primeiro uso), npm run dev (porta 5173).
Authority precisa de npm run build:engine antes do typecheck; em worktree, dependências próprias.
Não existe adaptador Node local de authority: o front usa a Edge publicada em staging.
Mudança no servidor chega por PR/CI; não publicar feature manualmente para conseguir testar.

## Configuração

O cliente Vite usa .env.local. Para staging alinhar VITE_SERVIDOR_URL com jogo-dev
e VITE_SUPABASE_SCHEMA com dev. Produção usa jogo/public. VITE_SUPABASE_URL e
VITE_SUPABASE_ANON_KEY identificam o projeto; não copiar credenciais para docs.
VITE_AUTH_STORAGE_KEY deve diferir entre staging/produção para separar sessões.
Apontar só a Edge para dev pode deixar RPCs em public. Reinicie Vite após mudar variáveis.
Projeto/schema reais devem ser conferidos antes de operar; não confiar em estado de memória.

Scripts operacionais e edge:publicar podem ler o .env raiz, não o .env.local do cliente.
Confirme destino explicitamente; nunca abra/imprima segredos para diagnosticar contexto.
Produção/staging: [publicação](publicacao.md). Banco: [procedimento](banco.md).

## Conta de teste e navegador

Reutilize a conta canônica, configurada por CONTA_TESTE_EMAIL/CONTA_TESTE_SENHA no .env.
npm run conta:teste consulta estado. npm run conta:criar provisiona a conta se necessário.
Conta extra somente se o teste exige jogadores distintos, no domínio @teste.pokehunt.local.
Após criar extras, use conta:limpar conforme seu filtro reservado; nunca apagar jogadores reais.
Não use conta com poderes para medir balanceamento; confira pré-condições do cenário.
No navegador, use UI real, respostas do servidor e pixels; import de /src/stores no console
pode criar outra instância. Save de localStorage não é prova de progresso remoto.

CLAUDE.local.md guarda caminhos da máquina. Obsidian/memória são consultas opcionais por tema.
