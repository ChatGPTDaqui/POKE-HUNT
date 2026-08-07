// HP bar chrome cropped from the DS Pokemon Black2/White2 rip
// (assets/DS _ DSi - Pokemon Black 2 _ White 2 - Miscellaneous - HP Bars.png)
// — the pill frame + "HP" label, with the baked-in fill erased down to the
// bar's own empty-track color so a colored rect can be drawn over it at
// render time, sized by the entity's current HP%.
export const HP_BAR_FRAME_URL = 'assets/hp-bar/frame.png'
export const HP_BAR_FRAME_ASPECT = 12 / 105 // native crop height/width

// Fill track position as a fraction of the frame image's own width/height —
// found by sampling the source crop's pixels (green fill sat at native
// x182-229 of a x143-247 pill, y49-51 of a y47-58 pill).
export const HP_TRACK = { x0: 0.36, x1: 0.83, y0: 0.2, y1: 0.55 }

// Same three tones the source sheet uses for its HP color legend.
const GREEN = '#008a28'
const ORANGE = '#9a6110'
const RED = '#922030'

export function hpBarFillColor(pct: number): string {
  if (pct <= 0.2) return RED
  if (pct <= 0.5) return ORANGE
  return GREEN
}
