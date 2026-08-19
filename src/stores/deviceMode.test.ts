// O regime de dispositivo e uma decisao SILENCIOSA: errar nao lanca nada, so
// desenha o layout errado. Foi assim que o celular deitado (844x390) passou
// meses caindo no regime de desktop, com 390px de altura util, cards do topo e
// rodape se sobrepondo, e nenhum breakpoint acusando.
import { describe, expect, it } from 'vitest'
import { deviceModeDe } from './uiStore'

describe('deviceModeDe', () => {
  it('celular em pe e compacto', () => {
    expect(deviceModeDe(390, 844, true).mode).toBe('compacto')
    expect(deviceModeDe(360, 800, true).mode).toBe('compacto')
  })

  // O caso que motivou a existencia do eixo de altura.
  it('celular DEITADO nao e desktop', () => {
    expect(deviceModeDe(844, 390, true).mode).toBe('deitado')
    expect(deviceModeDe(932, 430, true).mode).toBe('deitado')
  })

  it('desktop e amplo, e usa janela em vez de sheet', () => {
    const amplo = deviceModeDe(1440, 900, false)
    expect(amplo.mode).toBe('amplo')
    expect(amplo.usaSheet).toBe(false)
    expect(amplo.compacto).toBe(false)
  })

  // Uma janela de navegador achatada num monitor grande tem hover e alvo de
  // 32px clicavel: tratar como celular deitado encolheria a HUD sem motivo.
  it('janela de desktop achatada e larga continua ampla', () => {
    expect(deviceModeDe(1600, 420, false).mode).toBe('amplo')
  })

  // ...mas uma janela estreita E baixa cai no layout deitado mesmo sem dedo:
  // ali o problema nao e o ponteiro, e nao caber.
  it('janela estreita e baixa cai no deitado', () => {
    expect(deviceModeDe(900, 400, false).mode).toBe('deitado')
  })

  it('tablet em pe e compacto abaixo de 820 e amplo acima', () => {
    expect(deviceModeDe(810, 1180, true).mode).toBe('compacto')
    expect(deviceModeDe(834, 1194, true).mode).toBe('amplo')
  })

  it('compacto e deitado abrem sheet; amplo COM MOUSE abre janela', () => {
    expect(deviceModeDe(390, 844, true).usaSheet).toBe(true)
    expect(deviceModeDe(844, 390, true).usaSheet).toBe(true)
    expect(deviceModeDe(1280, 800, false).usaSheet).toBe(false)
  })

  // Um tablet cabe no layout amplo (ha espaco pro trilho espalhado), mas nao
  // pode receber janela arrastavel: o canto de redimensionar tem 16px e o dedo
  // nao o alcanca.
  it('tablet grande e amplo no layout e sheet no painel', () => {
    const tablet = deviceModeDe(1024, 1366, true)
    expect(tablet.mode).toBe('amplo')
    expect(tablet.usaSheet).toBe(true)
  })
})
