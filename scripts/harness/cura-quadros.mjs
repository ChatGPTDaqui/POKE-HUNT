// Montagem offline do VFX real com PNGs reais. Não é screenshot do navegador.
// Requer canvas nativo instalado, ou --canvas-module /caminho/index.js.
import { build } from 'vite'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const raiz = fileURLToPath(new URL('../../', import.meta.url))
const argumento = nome => {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : null
}
const { createCanvas, loadImage } = require(argumento('--canvas-module') || '@napi-rs/canvas')
const temporario = await mkdtemp(path.join(tmpdir(), 'poke-cura-qa-'))
const saida = argumento('--out-dir') || temporario
await mkdir(saida, { recursive: true })
await build({ configFile: false, logLevel: 'warn', build: {
  outDir: path.join(temporario, 'codigo'), emptyOutDir: true,
  lib: { entry: path.join(raiz, 'scripts/harness/cura.fixture.ts'), formats: ['es'], fileName: () => 'cura.mjs' },
} })
const vfx = await import(pathToFileURL(path.join(temporario, 'codigo/cura.mjs')).href)
const imagens = new Map()
for (const id of ['pikachu', 'squirtle', 'dragonite']) {
  const anim = vfx.resolveBattleAnim(id, 'Idle')
  imagens.set(id, { anim, img: await loadImage(path.join(raiz, anim.url)) })
}
const hospital = await loadImage(path.join(raiz, 'assets/hospital/centro-pokemon.jpg'))
const fases = [.12, .35, .57, .82]
const celula = { w: 320, h: 235 }
const canvas = createCanvas(celula.w * fases.length, celula.h * 4)
const ctx = canvas.getContext('2d')
for (let linha = 0; linha < 4; linha++) {
  for (let coluna = 0; coluna < fases.length; coluna++) {
    ctx.save()
    ctx.translate(coluna * celula.w, linha * celula.h)
    ctx.beginPath()
    ctx.rect(0, 0, celula.w, celula.h)
    ctx.clip()
    ctx.fillStyle = linha === 1 ? '#e2e9cc' : '#15352d'
    ctx.fillRect(0, 0, celula.w, celula.h)
    const fase = fases[coluna]
    const reduzido = linha === 2
    if (linha === 3) {
      // Mesmo ponto medido sobre a máquina na arte; recorte de diagnóstico.
      ctx.scale(.9, .9)
      ctx.translate(-1170, -685)
      ctx.drawImage(hospital, 0, 0)
      vfx.desenharCuraNoCentro(ctx, { x: .674 * 2000, peY: .44 * 2000, altura: 180, raio: 58 }, fase, 6)
    } else {
      const id = linha === 1 ? 'dragonite' : linha === 2 ? 'squirtle' : 'pikachu'
      const { anim, img } = imagens.get(id)
      const scale = vfx.scaleForSpecies(id)
      ctx.translate(160, 132)
      ctx.scale(2, 2) // zoom diagnóstico; a geometria de mundo é a de produção
      ctx.imageSmoothingEnabled = false
      const foot = vfx.footOffsetFraction(id)
      const peY = anim.frameHeight * foot
      const topY = peY - anim.frameHeight * scale * (.5 + foot)
      ctx.drawImage(img, 0, 0, anim.frameWidth, anim.frameHeight,
        -anim.frameWidth * scale / 2, topY,
        anim.frameWidth * scale, anim.frameHeight * scale)
      const topo = topY + anim.frameHeight * scale * vfx.topoOpacoFraction(id, anim.name)
      const altura = peY - topo
      vfx.desenharCura(ctx, { x: 0, peY, altura, raio: Math.max(14 * 1.15, altura * .32) }, fase, reduzido)
    }
    ctx.restore()
    ctx.save()
    ctx.translate(coluna * celula.w, linha * celula.h)
    ctx.fillStyle = '#0c1522dc'
    ctx.fillRect(0, 0, celula.w, 30)
    ctx.fillStyle = '#e7f9ed'
    ctx.font = '13px sans-serif'
    ctx.fillText(`${['HP · fundo escuro', 'HP · fundo claro', 'Movimento reduzido', 'Centro · máquina'][linha]} | ${Math.round(fase * 100)}%`, 10, 20)
    ctx.restore()
  }
}
const arquivo = path.join(saida, 'cura-quadros.png')
await writeFile(arquivo, canvas.toBuffer('image/png'))
console.log(arquivo)
