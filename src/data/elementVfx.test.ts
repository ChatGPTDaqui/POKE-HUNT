// Toda URL de arte declarada tem que existir no disco.
//
// A falha que isto tranca e SILENCIOSA por desenho: `drawVfxDeElemento`
// devolve `false` quando a imagem nao esta pronta, e quem chama cai no efeito
// procedural. Isso e o comportamento certo pra tipo sem arte e pro PNG ainda
// baixando — mas significa que um nome de arquivo errado (ou um asset que
// alguem apagou) nao produz erro nenhum: o golpe simplesmente volta a ser o
// desenho antigo e ninguem percebe ate olhar quadro a quadro.
//
// Vale o mesmo pros icones de slot: `abilityIconUrl` devolve a URL sem checar
// nada, e um 404 vira so um `<img>` vazio no meio da barra de golpes.
//
// A checagem usa `import.meta.glob` (do proprio Vite) e nao `node:fs`: o
// tsconfig do app nao carrega os tipos de Node, e o glob tem a vantagem de ser
// resolvido pelo MESMO resolvedor que serve os arquivos em runtime.
import { describe, expect, it } from 'vitest'
import { VFX_POR_ELEMENTO, todosOsQuadrosDeVfx } from './elementVfx'
import { todosOsIconesDeHabilidade, abilityIconUrl } from './abilityIcons'
import { TYPE_COLORS } from './typeColors'

const noDisco = new Set(
  [
    ...Object.keys(import.meta.glob('/assets/move-vfx/**/*.png')),
    ...Object.keys(import.meta.glob('/assets/ability-icons/*.png')),
  ].map((p) => p.replace(/^\//, '')),
)

describe('arte de golpe', () => {
  it('todo quadro de VFX existe', () => {
    expect(todosOsQuadrosDeVfx().filter((u) => !noDisco.has(u))).toEqual([])
  })

  it('todo tipo com arte tem quadro de alvo unico E de area', () => {
    const incompletos = Object.entries(VFX_POR_ELEMENTO)
      .filter(([, v]) => !v.single.length || !v.aoe.length)
      .map(([k]) => k)
    expect(incompletos).toEqual([])
  })

  it('nenhum quadro e reaproveitado entre dois tipos', () => {
    // Reaproveitar quadro entre tipos nao quebra nada tecnicamente, mas o
    // ponto do recurso e o jogador distinguir o elemento pelo efeito — dois
    // tipos com a mesma arte anulam isso sem aviso.
    const todos = todosOsQuadrosDeVfx()
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('icone de habilidade', () => {
  it('todo icone existe', () => {
    expect(todosOsIconesDeHabilidade().filter((u) => !noDisco.has(u))).toEqual([])
  })

  it('os 17 tipos elementais reais tem icone', () => {
    // `TYPE_COLORS` e a lista canonica de tipos deste dataset (Gen2, sem
    // Fairy). Tipo novo entrando ali sem icone aqui cairia no rotulo de 3
    // letras so naquele slot — visualmente incoerente no meio da barra.
    const semIcone = Object.keys(TYPE_COLORS).filter((t) => !abilityIconUrl(t))
    expect(semIcone).toEqual([])
  })
})
