import { describe, expect, it } from 'vitest'
import { entradaDoCliente } from './build-info.mts'

describe('metadados identificam o cliente, não a bancada', () => {
  it('seleciona o script do index mesmo quando o lab vem primeiro', () => {
    expect(entradaDoCliente(['build/lab.js', 'build/main.js'], '<script type="module" src="/build/main.js"></script>'))
      .toBe('build/main.js')
  })
  it('aceita caminho relativo e ignora preload/imagem', () => {
    expect(entradaDoCliente(['build/lab.js', 'build/main.js'], "<link href='/build/lab.js'><img src='/build/lab.js'><script src='./build/main.js'></script>"))
      .toBe('build/main.js')
  })
  it('preserva builds de entrada única, inclusive harness isolado', () => {
    expect(entradaDoCliente(['build/prototipo.js'])).toBe('build/prototipo.js')
  })
  it.each([{ entries: [] }, { entries: ['build/lab.js', 'build/main.js'] }])('reprova ausência de uma identificação inequívoca: $entries', ({ entries }) => {
    expect(() => entradaDoCliente(entries, '<script src="/build/outro.js"></script>')).toThrow()
  })
  it('reprova duas entradas usadas pelo mesmo HTML em vez de escolher pela ordem', () => {
    expect(() => entradaDoCliente(['build/lab.js', 'build/main.js'], '<script src="/build/main.js"></script><script src="/build/lab.js"></script>')).toThrow()
  })
})
