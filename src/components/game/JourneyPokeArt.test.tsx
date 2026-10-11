// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SPECIES } from '@/data/pokes'
import { JourneyPokeArt } from './JourneyPokeArt'

afterEach(cleanup)
it('recupera arte ausente e reinicia o fallback ao trocar espécie ou shiny', () => {
  const { rerender } = render(<JourneyPokeArt species={SPECIES.pikachu} />)
  expect(screen.getByRole('img').getAttribute('src')).toContain('gen5ani/pikachu.gif')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img').getAttribute('src')).not.toContain('.gif')
  rerender(<JourneyPokeArt species={SPECIES.pikachu} isShiny />)
  expect(screen.getByRole('img').getAttribute('src')).toContain('gen5ani-shiny/pikachu.gif')
  rerender(<JourneyPokeArt species={SPECIES.squirtle} />)
  expect(screen.getByRole('img').getAttribute('src')).toContain('gen5ani/squirtle.gif')
})
