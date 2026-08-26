// Preenche as APIs de browser que o jsdom nao implementa e que a HUD usa.
//
// Registrado como `setupFiles` (vite.config.ts). Roda em TODO teste, node
// incluso, e isso e de proposito: o custo e uma checagem de `in` por API, e a
// alternativa — cada arquivo de teste de componente lembrando de stubar — falha
// exatamente do jeito que ja falhou.
//
// COMO ISTO NASCEU, porque a licao vale mais que o codigo: a PH-190 publicou uma
// ancora de VFX na Carteira do trilho, e a ancora usa `ResizeObserver`. Isso
// quebrou `porcentagemDosVitais.test.tsx` (PH-157), que monta o `StatusRail`
// inteiro e nao tem nada a ver com VFX — quatro testes vermelhos num arquivo que
// eu nao toquei.
//
// Antes disso eu tinha procurado "ResizeObserver" nos arquivos de teste e
// concluido que nenhum precisava. A busca estava errada: o que importa nao e
// quem MENCIONA a API, e quem MONTA um componente que a usa — e isso um grep
// pelo nome nao encontra.
//
// Cada stub aqui e o minimo pra o componente montar, nao uma emulacao. Teste que
// dependa do COMPORTAMENTO de um observer precisa mockar por conta propria, no
// proprio arquivo, onde a expectativa fica visivel.

if (!('ResizeObserver' in globalThis)) {
  // Nao dispara nada: quem publica medida (`useMedirAltura`, `useAncoraDeVfx`)
  // ja mede uma vez na montagem, e e essa primeira medida que os testes de
  // layout leem.
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}
