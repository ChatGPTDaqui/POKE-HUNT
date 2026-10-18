// Port de js/render/Renderer.js. Wrapper de canvas 2D com estado de camera/
// zoom, chamado imperativamente pelo loop de rAF do <GameCanvas> (Fase 5) —
// nunca via re-render do React.
//
// Hospital mostra só o treinador; a entidade Pokémon permanece intacta no
// worldStore para cura e cabeçalho. Apresentação nunca muta o estado do motor.
import {
  drawEntity, drawCorpoPorCima, drawCuraDaEntidade, drawHpBar, drawNameLevelTag, drawEffect, drawMapBackground, readyImage,
  drawMarcaDoAlvo, drawMarcaDoJogador, planejarTextoDeCombate,
} from './sprites'
import { desenharAmbiente } from './ambiente'
import { drawBalaoDaAbertura } from './balaoDaAbertura'
import { desenharClimaFundo, desenharClimaFrente, familiaDoClima } from './climaVisual'
import { CENA_HOSPITAL, ZOOM_DA_CENA } from '@/data/hospital'
import type { WorldEntity, WorldState } from '@/engine/types'
import { protetorDaSala } from '@/engine/systems/salaSystem'
import { arteParaSala, backgroundParaSala, isCellBlocked } from '@/data/maps'
import type { MapDef } from '@/data/maps'
import { iniciarQuadroDeVfx } from './vfx/orcamento'
import { novoQuadroDoPixelizador } from './vfx/pixelizador'
import { desenharMoedasNoChao } from './vooDeRecompensa'
import { desenharItensNoChao } from './itemNoChao'
import { TreinadorEmCampo, lugarNoDuelo } from './treinadorEmCampo'
import { desenharCura, desenharCuraNoCentro, DURACAO_CURA_CENTRO_MS } from './cura'
import { VFX_CURA_DURACAO } from '@/engine/entity'

// Fundo por sub-bioma: a sala troca de sub-bioma a cada quota de abates (ver
// salaSystem.ts) mas ate 2026-08-15 o FUNDO ficava parado no do bioma inteiro
// — inconsistente com o HUD ja anunciando o sub-bioma novo.
//
// A regra nasceu aqui e MUDOU DE CASA em 2026-08-18 pra `data/maps.ts`: ela
// tambem decide qual walk-block pintado vale, e duas copias divergiriam em
// silencio (colisao de uma imagem, pixel na tela de outra). Importada, nao
// reescrita.

// Cor de fundo enquanto a arte do Centro Pokemon nao terminou de decodificar.
// Escura de proposito: a propria arte tem fundo preto em volta do predio,
// entao a troca "cor solida -> imagem" nao pisca.
const HOSPITAL_FALLBACK = '#0d0d10'

// Tamanho de tela do nome do treinador no Hospital. 1.5 e o
// zoom padrao com que a hunt desenha os mesmos elementos, entao o rotulo tem
// ali a mesma legibilidade que tem no combate.
const ESCALA_ROTULO_HOSPITAL = 1.5

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_SENSITIVITY = 0.0015
const ZOOM_STEP = 0.1
const DEFAULT_ZOOM = 1.5
const PLAYER_ANCHOR_Y = 0.58

export interface ScreenPoint {
  x: number
  y: number
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export class Renderer {
  movimentoReduzido = false
  private curaNoCentro: { inicio: number; equipe: number } | null = null
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  zoom: number
  /** Relogio do quadro anterior (ms), pra animacao do treinador em campo. */
  private ultimoQuadro = 0
  /** O boneco do treinador que anda atras do POKE (08/10). Um por cena. */
  readonly treinador = new TreinadorEmCampo()
  /** Treinador do RIVAL no duelo de PvP (09/10); fora da arena nao aparece. */
  readonly treinadorRival = new TreinadorEmCampo()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context indisponível')
    this.ctx = ctx
    this.ctx.imageSmoothingEnabled = false
    this.width = canvas.width
    this.height = canvas.height
    this.zoom = DEFAULT_ZOOM
  }

  handleResize(): void {
    this.width = this.canvas.width
    this.height = this.canvas.height
  }

  adjustZoom(deltaY: number): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom - deltaY * ZOOM_SENSITIVITY))
  }

  zoomStep(direction: number): number {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + direction * ZOOM_STEP))
    return this.zoom
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  /**
   * Como a arte do Centro Pokemon (quadrada) e encaixada nesta tela.
   *
   * ERA `cover` puro. Agora e `cover * ZOOM_DA_CENA`, com o zoom abaixo de 1
   * — ou seja, a cena e desenhada MENOR do que preencheria a tela, e sobra
   * fundo liso nas bordas. Isso e deliberado e o motivo esta em
   * `data/hospital.ts#ZOOM_DA_CENA`: e o unico jeito de o sprite de 64px do
   * POKE parar de ser esticado 3,6x sem mexer na proporcao dele com a cena.
   *
   * O que continua valendo do desenho antigo: os dois pontos que importam —
   * a enfermeira e o tapete — ficam colados no eixo central da imagem, entao
   * sobrevivem a qualquer recorte que ainda haja no eixo mais longo.
   *
   * O ZOOM DE CAMERA NAO ENTRA NESTA CONTA, e nao se confunde com
   * `ZOOM_DA_CENA`: aquele e controle do jogador sobre um mapa maior que a
   * tela, e o Hospital e cenario fixo. Aplicar zoom de camera aqui so
   * cortaria o cenario, e no maximo (2.5x) o tapete — onde fica o POKE — sai
   * inteiro da tela. Pior: com a enfermeira virando o botao de curar, um
   * nivel de zoom que a esconde e um beco sem saida. O ZoomControl fica
   * oculto fora da hunt (ver HudLayer) pra nao virar um botao inerte.
   */
  private _hospitalLayout(): { escala: number; ox: number; oy: number } {
    // `cover` (o `max`) e o tamanho que PREENCHE a tela; `ZOOM_DA_CENA`
    // encolhe a partir dele. Ver o comentario da constante: e o unico jeito
    // de tirar o serrilhado do POKE sem mexer na proporcao dele com a cena.
    const cobrindo = Math.max(this.width / CENA_HOSPITAL.largura, this.height / CENA_HOSPITAL.altura)
    const escala = cobrindo * ZOOM_DA_CENA
    return {
      escala,
      ox: (this.width - CENA_HOSPITAL.largura * escala) / 2,
      oy: (this.height - CENA_HOSPITAL.altura * escala) / 2,
    }
  }

  /** Fracao da imagem -> pixel da tela. */
  private _hospitalParaTela(fx: number, fy: number): ScreenPoint {
    const { escala, ox, oy } = this._hospitalLayout()
    return { x: ox + fx * CENA_HOSPITAL.largura * escala, y: oy + fy * CENA_HOSPITAL.altura * escala }
  }

  get hospitalPlayerPos(): ScreenPoint {
    return this._hospitalParaTela(CENA_HOSPITAL.tapete.x, CENA_HOSPITAL.tapete.y)
  }

  /**
   * Este ponto da tela esta sobre a enfermeira (ou sobre o rotulo "Curar")?
   *
   * `folga` cresce o retangulo em pixels de CANVAS, e existe pro dedo: a area
   * util e 9,8% x 13,8% da cena, o que num celular de 320px da ~31px de largura
   * — abaixo do minimo de toque, e este e o unico jeito de curar de graca.
   * Errar por 5px nao devolve nada na tela, o que le como botao quebrado.
   */
  hospitalClickOnNurse(x: number, y: number, folga = 0): boolean {
    const { escala, ox, oy } = this._hospitalLayout()
    if (!(escala > 0)) return false
    const largura = CENA_HOSPITAL.largura * escala
    const altura = CENA_HOSPITAL.altura * escala
    const fx = (x - ox) / largura
    const fy = (y - oy) / altura
    // A folga vem em px e o retangulo esta em fracao da cena: converter aqui
    // mantem a area de toque constante na TELA, e nao proporcional ao zoom.
    const fgx = folga / largura
    const fgy = folga / altura
    const a = CENA_HOSPITAL.alvo
    return fx >= a.x1 - fgx && fx <= a.x2 + fgx && fy >= a.y1 - fgy && fy <= a.y2 + fgy
  }

  /** Só confirmação visual, nunca trava a UI ou altera HP. Substitui o pulso anterior. */
  iniciarCuraNoCentro(equipe: number): void {
    this.curaNoCentro = equipe > 0 ? { inicio: performance.now(), equipe: Math.min(6, equipe) } : null
  }

  renderHospital(playerEntity: WorldEntity | null, nurseHovered = false): void {
    const ctx = this.ctx
    this.clear()
    ctx.fillStyle = HOSPITAL_FALLBACK
    ctx.fillRect(0, 0, this.width, this.height)

    const { escala, ox, oy } = this._hospitalLayout()
    if (!(escala > 0)) return // canvas ainda sem tamanho (primeiro frame antes do resize)
    const fundo = readyImage(CENA_HOSPITAL.imagem)

    ctx.save()
    // Daqui pra baixo tudo e desenhado em COORDENADA DA IMAGEM (0..2000): e o
    // unico sistema em que os pontos medidos sobre a arte continuam valendo
    // quando a janela muda de tamanho.
    ctx.translate(ox, oy)
    ctx.scale(escala, escala)

    if (fundo) ctx.drawImage(fundo, 0, 0, CENA_HOSPITAL.largura, CENA_HOSPITAL.altura)
    this._drawHospitalTrainer(ctx, escala)
    this._drawHospitalHeal(ctx, playerEntity)
    this._drawHealLabel(ctx, nurseHovered)

    ctx.restore()
  }

  private _drawHospitalHeal(ctx: CanvasRenderingContext2D, player: WorldEntity | null): void {
    const maquina = CENA_HOSPITAL.maquinaCura
    const ancora = { x: maquina.x * CENA_HOSPITAL.largura, peY: maquina.y * CENA_HOSPITAL.altura,
      altura: maquina.altura, raio: maquina.raio }
    iniciarQuadroDeVfx()
    if (this.curaNoCentro) {
      const fase = (performance.now() - this.curaNoCentro.inicio) / DURACAO_CURA_CENTRO_MS
      if (fase >= 1) this.curaNoCentro = null
      else desenharCuraNoCentro(ctx, ancora, fase, this.curaNoCentro.equipe, this.movimentoReduzido)
    } else if (player?.vfxCuraHp) {
      // Poção no Hospital: indica cura na máquina, não sobre o treinador.
      desenharCura(ctx, ancora, 1 - player.vfxCuraHp / VFX_CURA_DURACAO, this.movimentoReduzido, true)
    }
  }

  private _drawHospitalTrainer(ctx: CanvasRenderingContext2D, escala: number): void {
    const pes = {
      x: CENA_HOSPITAL.tapete.x * CENA_HOSPITAL.largura,
      y: CENA_HOSPITAL.tapete.y * CENA_HOSPITAL.altura,
    }
    // Hospital é apresentação, nunca troca a entidade usada para curar/equipar.
    // Limpar o rastro evita carregar coordenadas da hunt para o saguão e vice-versa.
    this.ultimoQuadro = 0
    this.treinador.parado(pes, { x: 0, y: 1 }, 0)
    this.treinador.desenhar(ctx, CENA_HOSPITAL.alturaTreinador, ESCALA_ROTULO_HOSPITAL / escala)
  }

  // "Curar" acima da cabeca da enfermeira. E o unico aviso de que ela e
  // clicavel, entao vem numa pilula com contorno em vez de texto solto: o
  // balcao atras e cheio de detalhe e texto puro se perderia nele.
  private _drawHealLabel(ctx: CanvasRenderingContext2D, hovered: boolean): void {
    const x = CENA_HOSPITAL.rotulo.x * CENA_HOSPITAL.largura
    const y = CENA_HOSPITAL.rotulo.y * CENA_HOSPITAL.altura
    const texto = 'Curar'

    ctx.save()
    ctx.font = 'bold 26px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(texto).width + 34
    const h = 44

    if (hovered) {
      ctx.shadowColor = 'rgba(255, 214, 120, 0.9)'
      ctx.shadowBlur = 22
    }
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, h / 2)
    ctx.fillStyle = hovered ? 'rgba(24, 18, 10, 0.94)' : 'rgba(12, 12, 16, 0.86)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 3
    ctx.strokeStyle = hovered ? '#ffd678' : '#c9a24a'
    ctx.stroke()

    ctx.fillStyle = hovered ? '#fff3d4' : '#ffe9a8'
    ctx.fillText(texto, x, y + 1)
    ctx.restore()
  }

  renderMap(mapDef: MapDef, world: WorldState): void {
    this.curaNoCentro = null // nada da confirmação da enfermeira atravessa a hunt
    const ctx = this.ctx
    this.clear()
    // Teto de particulas do VFX de golpe e POR QUADRO, somado entre todos os
    // efeitos: renova aqui, uma vez, antes de qualquer efeito pedir. E solta o
    // quadro guardado de efeito que ja acabou (vfx/pixelizador.ts).
    iniciarQuadroDeVfx()
    novoQuadroDoPixelizador()

    const camera = this._computeCamera(mapDef, world.player)
    ctx.save()
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-camera.x, -camera.y)

    const fundo = backgroundParaSala(mapDef, world.sala)
    const janela = { x: camera.x, y: camera.y, w: this.width / this.zoom, h: this.height / this.zoom }

    drawMapBackground(
      ctx,
      {
        bg: fundo,
        bounds: mapDef.bounds,
        arte: arteParaSala(mapDef.id, world.sala) ?? undefined,
      },
      janela,
    )

    // Vida ambiente ENTRE o fundo e as entidades (PH-96): folha, brasa e poeira
    // passam sobre o cenario mas por baixo do POKE — na frente dele, a camada
    // esconderia o que o jogador precisa ver. A janela vai em coordenada de
    // mundo porque e ela que decide onde a particula nasce e onde ela recicla.
    // A familia e resolvida AQUI, e nao dentro de `desenharAmbiente`: aquele
    // arquivo nao pode importar do motor (ver o guard em ambiente.test.ts).
    desenharAmbiente(ctx, fundo.image, janela, familiaDoClima(world.clima?.tipo ?? null))

    // Clima ATRAS das entidades (PH-141): o grosso da precipitacao. Depois do
    // ambiente porque a chuva passa por cima da folha que cai, nao por baixo.
    desenharClimaFundo(ctx, world.clima?.tipo ?? null, janela)

    // Quem sou eu / em quem estou batendo (PH-189). O id do alvo ja existia no
    // estado (`player.targetId`, publicado por `combatSystem#updateCombat`) e o
    // canvas nao usava. So vale com o jogador em pe: sem POKE em campo nao ha
    // "meu" nem alvo, e uma mira sobrando em cima de um mob leria como ordem.
    // PH-552: dentro da bola (`nascendo`) o POKE existe no motor mas nao no
    // campo — nem corpo, nem marca de chao, nem barra. A bola se abrindo e o
    // balao ficam no lugar dele.
    const jogadorVivo = world.player && !world.player.fainted && !world.player.nascendo ? world.player : null
    const idDoAlvo = jogadorVivo?.targetId ?? null
    // Antes dos corpos: as DUAS sao marca de CHAO, e passar por cima de quem
    // anda nelas leria como efeito de golpe.
    //
    // PH-493: o alvo desceu pro chao junto com o anel. Ate aqui ele era
    // desenhado DEPOIS dos corpos, porque era colchete em volta do corpo do
    // inimigo; agora que e um alvo pintado no piso, vir depois o poria por cima
    // do proprio POKE que ele marca.
    if (jogadorVivo) drawMarcaDoJogador(ctx, jogadorVivo)
    if (idDoAlvo) {
      const alvo = world.enemies.find((e) => e.id === idDoAlvo)
      if (alvo && alvo.poke.hp > 0) drawMarcaDoAlvo(ctx, alvo)
    }
    // Ouro e XP do abate caidos no chao (08/10): tambem sao CHAO, e quem anda
    // por cima deles os cobre. Sobem pra carteira 2 s depois, na camada de VFX.
    desenharMoedasNoChao(ctx)
    // Itens do abate (11/10): mesmo chao, depois das moedas pra o item ficar por cima delas.
    desenharItensNoChao(ctx)

    // PH-236: tipo do protetor (Guardian/Lord) vem da sala, nao da entidade
    // — `entity.isProtetor` so marca QUE e protetor. Resolvido uma vez por
    // frame (barato, `protetorDaSala` e pura) e repassado pra tag decidir o
    // texto.
    const tipoDeProtetorAtual = protetorDaSala(world.sala, world.mapDef?.id ?? '')

    // TREINADOR (08/10): anda atras do POKE, 2 quadrados de espaco. Segue o
    // POKE do mundo mesmo desmaiado ou saindo da bola — quem some e o POKE, nao
    // o treinador. Ordem de profundidade pelo pe: mais acima na tela fica atras.
    //
    // DUELO DE PVP (09/10): os DOIS treinadores ficam parados atras da bola do
    // proprio lado, olhando um pro outro, como nos jogos — nao seguem o POKE.
    // Desenhados antes de todos os corpos: o duelo acontece entre eles, e o
    // corpo do POKE tem prioridade visual (drawCorpoPorCima).
    const agora = typeof performance !== 'undefined' ? performance.now() : 0
    const dtDoTreinador = this.ultimoQuadro ? Math.min(0.1, (agora - this.ultimoQuadro) / 1000) : 0
    this.ultimoQuadro = agora
    const arena = world.arena
    if (arena) {
      const meu = lugarNoDuelo(arena.meuSpawn, arena.rivalSpawn)
      const dele = lugarNoDuelo(arena.rivalSpawn, arena.meuSpawn)
      this.treinador.parado(meu.pe, meu.olhando, dtDoTreinador)
      this.treinadorRival.parado(dele.pe, dele.olhando, dtDoTreinador)
      for (const t of [this.treinador, this.treinadorRival].sort((a, b) => a.pe!.y - b.pe!.y)) t.desenhar(ctx)
    } else {
      const mapa = world.mapDef
      this.treinador.atualizar(world.player, dtDoTreinador, mapa ? (x, y) => isCellBlocked(mapa, x, y) : undefined)
    }
    const peDoTreinadorAgora = arena ? null : this.treinador.pe
    const treinadorAtras = !!peDoTreinadorAgora && (!jogadorVivo || peDoTreinadorAgora.y <= jogadorVivo.y + 8)

    for (const enemy of world.enemies) {
      if (enemy.nascendo) continue
      drawEntity(ctx, enemy)
      if (enemy.poke.hp > 0) {
        drawHpBar(ctx, enemy, enemy.id === idDoAlvo)
        drawNameLevelTag(ctx, enemy, tipoDeProtetorAtual)
      }
    }

    if (treinadorAtras) this.treinador.desenhar(ctx)

    if (jogadorVivo) {
      drawEntity(ctx, jogadorVivo)
      // SEM PORCENTAGEM NO MEU PROPRIO POKE (PH-281), a pedido do usuario. O
      // mesmo numero ja esta no cabecalho, com rotulo `HP` e largura reservada
      // (PH-157/PH-193) — la ele e legivel sem competir com nada, e aqui
      // disputava a placa com o nome do golpe (PH-275).
      //
      // A DO ALVO CONTINUA, e a diferenca importa: o HP do inimigo nao aparece
      // em lugar nenhum da HUD. Tirar as duas juntas nao seria "simplificar",
      // seria apagar um dado que so existe aqui (PH-193).
      drawHpBar(ctx, jogadorVivo)
      drawNameLevelTag(ctx, jogadorVivo)
    }
    if (peDoTreinadorAgora && !treinadorAtras) this.treinador.desenhar(ctx)

    // Segunda passada de layout do texto flutuante (PH-189): a raia que o motor
    // reserva e por DONO e nao mede texto — ela nao sabe nada de dois POKE
    // vizinhos escrevendo na mesma coluna de pixel. Aqui, com a largura de
    // verdade em maos, as caixas que se atropelariam sobem. Ver
    // `render/textoDeCombate.ts`.
    const desviosDeTexto = planejarTextoDeCombate(ctx, world, { y: janela.y, h: janela.h })
    for (const effect of world.effects) {
      if (effect.type !== 'abilityEffect') drawEffect(ctx, effect, world, desviosDeTexto)
    }
    // "Vai X!!" (PH-552) por cima da bola que esta se abrindo.
    drawBalaoDaAbertura(ctx, world)

    // Informações de campo nunca encobrem o corpo: passada totalmente opaca.
    // Os golpes são a exceção: ficam depois dela e recebem uma segunda passada
    // a 40% (ALFA_DO_CORPO_POR_CIMA). Não reduzimos a opacidade de todos os Pokémon quando um golpe
    // qualquer está ativo; a composição só revela o corpo onde há sobreposição.
    for (const enemy of world.enemies) {
      if (!enemy.nascendo) drawCorpoPorCima(ctx, enemy, 1)
    }
    if (jogadorVivo) drawCorpoPorCima(ctx, jogadorVivo, 1)
    let temGolpe = false
    for (const effect of world.effects) {
      if (effect.type !== 'abilityEffect') continue
      temGolpe = true
      drawEffect(ctx, effect, world, desviosDeTexto)
    }
    if (temGolpe) {
      for (const enemy of world.enemies) {
        if (!enemy.nascendo) drawCorpoPorCima(ctx, enemy)
      }
      if (jogadorVivo) drawCorpoPorCima(ctx, jogadorVivo)
    }

    // Cura é feedback local, leve e desenhado uma única vez após os corpos.
    for (const enemy of world.enemies) {
      if (!enemy.nascendo) drawCuraDaEntidade(ctx, enemy, this.movimentoReduzido)
    }
    if (jogadorVivo) drawCuraDaEntidade(ctx, jogadorVivo, this.movimentoReduzido)

    // Clima na FRENTE de tudo (PH-141): a passagem rasante, o filtro de cor, a
    // vinheta e o relampago. Depois dos efeitos de golpe de proposito — o
    // filtro do clima cobre a cena inteira, e um golpe que ficasse por cima
    // dele pareceria recortado de outra imagem.
    desenharClimaFrente(ctx, world.clima?.tipo ?? null, janela)

    ctx.restore()
  }

  private _computeCamera(mapDef: MapDef, player: WorldEntity | null): ScreenPoint {
    const px = player ? player.x : mapDef.bounds.width / 2
    const py = player ? player.y : mapDef.bounds.height / 2
    return { x: px - this.width / 2 / this.zoom, y: py - (this.height * PLAYER_ANCHOR_Y) / this.zoom }
  }

  /**
   * Coordenada de MUNDO -> px de tela, pela mesma camera que `renderMap` usa
   * (PH-191).
   *
   * Existe porque a camada de VFX desenha em coordenada de TELA (ela precisa
   * falar com a HUD) e alguns efeitos NASCEM no mundo — o voo de ouro comeca no
   * POKE derrotado e termina na carteira. Sem isto o call site refaria a conta
   * da camera a mao, e uma copia que se desatualize planta o efeito num lugar
   * que nao e o do corpo.
   *
   * Devolve `null` fora da hunt: no Hospital nao ha `mapDef`, e `renderHospital`
   * usa outro sistema de coordenada (a escala da arte, ver `_hospitalLayout`).
   * Devolver um ponto qualquer ali seria pior que nao devolver nada.
   */
  mundoParaTela(mapDef: MapDef | null, player: WorldEntity | null, p: ScreenPoint): ScreenPoint | null {
    if (!mapDef) return null
    const camera = this._computeCamera(mapDef, player)
    return { x: (p.x - camera.x) * this.zoom, y: (p.y - camera.y) * this.zoom }
  }
}
