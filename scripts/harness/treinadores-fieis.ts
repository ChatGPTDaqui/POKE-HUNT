import { TreinadorEmCampo } from '@/render/treinadorEmCampo'
import { SKINS_DO_TREINADOR, quadroDaSkin } from '@/data/skinsDoTreinador'

const direction = document.querySelector<HTMLSelectElement>('#direction')!
const state = document.querySelector<HTMLSelectElement>('#state')!
const zoom = document.querySelector<HTMLSelectElement>('#zoom')!
const directions = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]
const cards = SKINS_DO_TREINADOR.map(skin => {
  const article = document.createElement('article'), heading = document.createElement('h2')
  const canvas = document.createElement('canvas'), caption = document.createElement('small')
  const geometry = quadroDaSkin(skin.id)
  heading.textContent = skin.nome
  canvas.setAttribute('aria-label', `Animação de ${skin.nome}`)
  caption.textContent = `Quadro ${geometry.frameWidth} × ${geometry.frameHeight} · RGBA original`
  article.append(heading, canvas, caption)
  document.querySelector('#skins')!.append(article)
  const trainer = new TreinadorEmCampo()
  trainer.skin = skin.id
  return { canvas, trainer, skin }
})
let time = 0, previous = 0
direction.addEventListener('change', () => {
  time = 0
  for (const card of cards) { card.trainer = new TreinadorEmCampo(); card.trainer.skin = card.skin.id }
})
function frame(now: number) {
  const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0
  previous = now; time += dt
  const [dx, dy] = directions[Number(direction.value)], norm = Math.hypot(dx, dy)
  const facing = { x: dx / norm, y: dy / norm }
  for (const { canvas, trainer } of cards) {
    const width = canvas.clientWidth, height = canvas.clientHeight, dpr = devicePixelRatio || 1
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#355948'; ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#3a6050'
    for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 16) if ((x + y) % 32 === 0) ctx.fillRect(x, y, 16, 16)
    if (state.value === 'walk') trainer.atualizar({ x: time * 80 * facing.x, y: time * 80 * facing.y, radius: 12, facing }, dt)
    else trainer.parado(trainer.pe ?? { x: 0, y: 0 }, facing, dt)
    const foot = trainer.pe
    if (foot) {
      const scale = Number(zoom.value)
      ctx.translate(width / 2, height / 2 + 15 * scale)
      ctx.scale(scale, scale); ctx.translate(-foot.x, -foot.y)
      trainer.desenhar(ctx)
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
