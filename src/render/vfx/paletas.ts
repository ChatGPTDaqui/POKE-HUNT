// As 18 peles de tipo — o que o tipo "pinta" numa coreografia.
//
// MESMA ESTRUTURA pra todos (contorno escuro, base, meio, nucleo claro): e isso
// que segura o estilo quando os tipos forem feitos em momentos diferentes. Um
// tipo novo que precisasse de uma quinta camada seria sinal de desenho fora da
// linguagem, nao de estrutura curta.
//
// Contorno e nucleo nao sao preto e branco puros de proposito: preto puro em
// cima do tileset some na sombra das arvores, e branco puro estoura o dither.
import type { ElementType } from '@/data/generated/types'
import type { Pele } from './tipos'

export const PELES: Record<ElementType, Pele> = {
  NORMAL:   { contorno: '#2a2630', base: '#b8b2a6', meio: '#e2ddd0', nucleo: '#fffaf0', estrela: '#f4efe2', particula: 'impacto' },
  FIRE:     { contorno: '#4a0c08', base: '#d9261c', meio: '#ff8c1a', nucleo: '#ffe98a', estrela: '#ff8c1a', particula: 'chama', acento: ['#1e1a22', '#3e3844', '#5e5766'] },
  WATER:    { contorno: '#0c1f4a', base: '#2a6fd6', meio: '#5fb3f5', nucleo: '#d8f3ff', estrela: '#8fd3ff', particula: 'gota' },
  ELECTRIC: { contorno: '#1a1030', base: '#f2b600', meio: '#ffd400', nucleo: '#fffbe0', estrela: '#ffd400', particula: 'faisca' },
  GRASS:    { contorno: '#0f2e12', base: '#2f9a3a', meio: '#7ed957', nucleo: '#e6ffc2', estrela: '#9be86a', particula: 'folha' },
  ICE:      { contorno: '#12324a', base: '#58b8e0', meio: '#a8e6f7', nucleo: '#f2fdff', estrela: '#bff4ff', particula: 'cristal' },
  FIGHTING: { contorno: '#3a0f0a', base: '#b83a1e', meio: '#f07a3a', nucleo: '#ffe0c0', estrela: '#ffb070', particula: 'golpe' },
  POISON:   { contorno: '#2a0f33', base: '#8a3aa8', meio: '#c46ee0', nucleo: '#f4d8ff', estrela: '#d890f0', particula: 'bolha' },
  GROUND:   { contorno: '#33220f', base: '#9a6a32', meio: '#d6a45e', nucleo: '#f7e3b8', estrela: '#e8bf7a', particula: 'poeira' },
  FLYING:   { contorno: '#1e2a44', base: '#8aa6d6', meio: '#c8d8f5', nucleo: '#f8fbff', estrela: '#dde8ff', particula: 'pena' },
  PSYCHIC:  { contorno: '#3a0a2a', base: '#d6337a', meio: '#f57ab0', nucleo: '#ffe0f0', estrela: '#ff9ccb', particula: 'psi' },
  BUG:      { contorno: '#1f2a08', base: '#7a9a12', meio: '#b8d63a', nucleo: '#f0ffc0', estrela: '#cfe86a', particula: 'esporo' },
  ROCK:     { contorno: '#2a2214', base: '#8a7440', meio: '#bfa66a', nucleo: '#efe2bd', estrela: '#d4bd84', particula: 'pedra' },
  GHOST:    { contorno: '#140a2a', base: '#4f3a8a', meio: '#8a6fd0', nucleo: '#e0d4ff', estrela: '#a890f0', particula: 'fantasma' },
  DRAGON:   { contorno: '#10103a', base: '#4a3ad6', meio: '#7f8af5', nucleo: '#e0e4ff', estrela: '#9aa4ff', particula: 'escama' },
  DARK:     { contorno: '#0c0a10', base: '#3a2f3a', meio: '#6e5a6a', nucleo: '#d8c8d0', estrela: '#8a6f84', particula: 'sombra', acento: ['#e0405a'] },
  STEEL:    { contorno: '#1a2028', base: '#7a8494', meio: '#b8c2d0', nucleo: '#f4f8ff', estrela: '#d0d8e6', particula: 'metal', acento: ['#fff3c4', '#ff9a3a'] },
  FAIRY:    { contorno: '#3a1430', base: '#e070b0', meio: '#f7a8d4', nucleo: '#fff0f8', estrela: '#ffc4e4', particula: 'estrela' },
}

/**
 * Cores que TODO efeito pode usar alem das da pele: o contorno universal da
 * estrela de impacto e o branco de flash. Entram na paleta do pixelizador de
 * todo efeito, senao a estrela de um golpe de agua sairia "corrigida" pra azul.
 */
export const NEUTROS = ['#1a1024', '#ffffff'] as const

/**
 * Paleta fechada de um efeito: pele + neutros. O pixelizador so emite estas cores.
 * Sem repeticao — a estrela de varios tipos e a propria cor do meio.
 */
export function paletaDaPele(pele: Pele): string[] {
  return [...new Set([pele.contorno, pele.base, pele.meio, pele.nucleo, pele.estrela, ...(pele.acento ?? []), ...NEUTROS])]
}
