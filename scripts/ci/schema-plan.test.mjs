import { it, expect } from 'vitest'
import { planejar, conferirBaseAplicada } from './schema-plan.mjs'
const base = ['supabase/migrations/20260901000000_base.sql']
const migration = (name, status = 'A') => ({ path: `supabase/migrations/${name}.sql`, status })
it('PR de interface não depende de tipos remotos alterados por outra PR', () => {
  expect(planejar(base, [{ path: 'src/features/hunt/Hunt.tsx', status: 'M' }]).schema).toBe(false)
})
it('PR de migration e tipos exige validação descartável', () => {
  expect(planejar(base, [migration('20260902000000_teste_public'), migration('20260902000001_teste_dev')]).schema).toBe(true)
})
it.each([
  [migration('20260901000000_base', 'M')],
  [migration('20260901000000_base', 'D')],
  [migration('20260801000000_antiga')],
  [migration('20260902000000_so_public')],
  [migration('20260902000000_a'), migration('20260902000000_b')],
])('reprova histórico alterado, ordem, par e colisão: %j', (...changes) => {
  expect(() => planejar(base, changes)).toThrow()
})
it('baseline só é aceita se todas e somente as migrations da base estão aplicadas', () => {
  expect(() => conferirBaseAplicada(base, ['20260901000000'])).not.toThrow()
  expect(() => conferirBaseAplicada(base, [])).toThrow()
  expect(() => conferirBaseAplicada(base, ['20260901000000', '20260902000000'])).toThrow()
})
