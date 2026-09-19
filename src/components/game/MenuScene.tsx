import type { ReactNode } from 'react'
import { useDeviceMode } from '@/stores/uiStore'
import './menu-scene.css'

/** Identidade dos menus do treinador; escala e regime continuam vindo da HUD. */
export function MenuScene({ children, tone = 'collection' }: {
  children: ReactNode
  tone?: 'collection' | 'shop' | 'team' | 'arena'
}) {
  const { mode } = useDeviceMode()
  return <div className="trainer-menu" data-tone={tone} data-layout={mode}>{children}</div>
}

export function SelectionHint({ children }: { children: ReactNode }) {
  return <div className="selection-hint"><span aria-hidden className="text-[2em]">◇</span><p>{children}</p></div>
}
