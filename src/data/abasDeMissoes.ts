// Abas da janela Missões (18/10/2026, pedido do dono): tudo que é "missão"
// num lugar só, entrando por um único atalho. Ver
// docs/planos/2026-10-18-janela-de-missoes-design.md.

export type AbaDeMissoes = 'diario' | 'objetivos' | 'tasks' | 'especialidades' | 'conquistas' | 'bestiario'
// Nivel de cima: Diario, Objetivos e Progresso (pedido do dono, 18/10/2026).
// So Progresso tem submenu.
export type GrupoDeMissoes = 'diario' | 'objetivos' | 'progresso'

export const ABAS_DE_MISSOES: readonly { aba: AbaDeMissoes; rotulo: string; grupo: GrupoDeMissoes }[] = [
  { aba: 'diario', rotulo: 'Diário', grupo: 'diario' },
  { aba: 'objetivos', rotulo: 'Objetivos', grupo: 'objetivos' },
  { aba: 'tasks', rotulo: 'Tasks', grupo: 'progresso' },
  { aba: 'especialidades', rotulo: 'Especialidades', grupo: 'progresso' },
  { aba: 'conquistas', rotulo: 'Conquistas', grupo: 'progresso' },
  { aba: 'bestiario', rotulo: 'Bestiário', grupo: 'progresso' },
]

export const GRUPOS_DE_MISSOES: readonly { value: GrupoDeMissoes; label: string }[] = [
  { value: 'diario', label: 'Diário' },
  { value: 'objetivos', label: 'Objetivos' },
  { value: 'progresso', label: 'Progresso' },
]

/** O grupo tem submenu (mais de uma aba dentro)? */
export function grupoTemSubmenu(g: GrupoDeMissoes): boolean {
  return ABAS_DE_MISSOES.filter((a) => a.grupo === g).length > 1
}

export function grupoDaAba(aba: AbaDeMissoes): GrupoDeMissoes {
  return ABAS_DE_MISSOES.find((a) => a.aba === aba)!.grupo
}

/**
 * Telas que viraram aba. Quem ainda pede a tela antiga (destino de Primeiro
 * Passo, card da Jornada, código esquecido) cai na janela Missões, na aba certa.
 */
export const TELA_VIROU_ABA: Readonly<Record<string, AbaDeMissoes>> = {
  tasks: 'tasks',
  especialidades: 'especialidades',
  conquistas: 'conquistas',
  bestiario: 'bestiario',
}

/** O que cada aba tem pronto pra coletar agora. */
export type PendenciasDeMissoes = Partial<Record<AbaDeMissoes, number>>

export function totalDePendencias(p: PendenciasDeMissoes): number {
  return Object.values(p).reduce<number>((s, n) => s + (n ?? 0), 0)
}

/**
 * A aba em que a janela abre: a primeira (na ordem das abas) com algo pronto e
 * destrancada; sem nenhuma, a última usada.
 */
export function abaInicial(
  p: PendenciasDeMissoes, ultima: AbaDeMissoes, trancada: (aba: AbaDeMissoes) => boolean,
): AbaDeMissoes {
  return ABAS_DE_MISSOES.find(({ aba }) => (p[aba] ?? 0) > 0 && !trancada(aba))?.aba ?? ultima
}
