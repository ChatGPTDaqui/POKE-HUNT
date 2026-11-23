// Site de apresentação do jogo. Fica separado do app (raiz do repo) porque o
// app é uma SPA que o buscador lê mal; aqui tudo sai como HTML pronto no build.
// Publicado num projeto Cloudflare Pages próprio (raiz do build: site/).
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { SITE_URL } from './src/config.mjs'

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  // PT-BR na raiz (público principal), inglês em /en/. Sem o roteamento i18n
  // do Astro: são poucas páginas, e cada uma declara o par no outro idioma
  // (hreflang) pelo layout.
  // O hreflang já está no <head> de cada página. A opção i18n do sitemap
  // pareia por caminho igual (/x/ com /en/x/) e as slugs aqui diferem.
  integrations: [sitemap()],
})
