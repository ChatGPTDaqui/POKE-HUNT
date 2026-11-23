# Site de apresentação (Astro)

Páginas estáticas PT-BR (raiz) e EN (`/en/`) que apresentam o jogo para buscadores.
O jogo continua no app da raiz do repositório; aqui só há links para ele.

- Endereços: `src/config.mjs`. Pares de idioma e menu: `src/i18n.mjs`.
- Novidades lê `src/data/patchNotes.ts` do jogo no build.
- Local: `npm --prefix site install` e `npm --prefix site run dev` (porta 4321).

## Publicação (Cloudflare Pages, projeto próprio)

Projeto `pokeinspiration`, ligado a este repositório:

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Root directory | `site` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

Node vem de `site/.node-version`.

Pendência: Astro está no 5.x porque o 7.x exige Node ≥ 22.23.4. As vulnerabilidades
do `npm audit` atingem SSR, endpoint de imagem e servidor de dev, que este site
estático não usa. Subir para o 7.x junto com o Node.
