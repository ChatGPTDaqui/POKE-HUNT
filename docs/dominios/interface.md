# Interface e arte

Fontes: src/components, src/features, src/index.css e src/render.
Preserve escala em em, tokens e separação Canvas/React. HP/EXP ao vivo vêm do worldStore.
Mudança de HUD exige verificar tamanho real e interação mobile, incluindo altura disponível.
Tooltip deve funcionar ao toque; title nativo não é explicação acessível no celular.
Tipografia: consulte ../operacao/preservacao-visual.md quando a tarefa exigir preservá-la.
--font-mono já existe em src/index.css; não repetir o diagnóstico do prompt antigo.
Canvas usa ctx.font e não herda CSS. Arte/VFX podem afetar o bundle de authority: confira dependências.

## Consulta detalhada

- [O fundamento: escala fluida em em](../arquivo/2026-09-08/docs/09-interface.md#o-fundamento-escala-fluida-em-em)
- [Regimes de dispositivo, em JS](../arquivo/2026-09-08/docs/09-interface.md#regimes-de-dispositivo-em-js)
- [A unica media query de layout do projeto](../arquivo/2026-09-08/docs/09-interface.md#a-unica-media-query-de-layout-do-projeto)
- [O rodape e MEDIDO, nao estimado](../arquivo/2026-09-08/docs/09-interface.md#o-rodape-e-medido-nao-estimado)
- [Duas superficies permanentes: trilho e doca](../arquivo/2026-09-08/docs/09-interface.md#duas-superficies-permanentes-trilho-e-doca)
- [Janela no desktop, sheet no celular](../arquivo/2026-09-08/docs/09-interface.md#janela-no-desktop-sheet-no-celular)
- [O que so existe no dedo](../arquivo/2026-09-08/docs/09-interface.md#o-que-so-existe-no-dedo)
- [Vidro preto](../arquivo/2026-09-08/docs/09-interface.md#vidro-preto)
- [Avisos que pertencem ao campo](../arquivo/2026-09-08/docs/09-interface.md#avisos-que-pertencem-ao-campo)
- [Densidade: quantos itens cabem numa tela](../arquivo/2026-09-08/docs/09-interface.md#densidade-quantos-itens-cabem-numa-tela)
- [O eixo que faltava nos paineis: altura util](../arquivo/2026-09-08/docs/09-interface.md#o-eixo-que-faltava-nos-paineis-altura-util)
- [Bug de clique em botão dentro de painel re-renderizado a 60fps](../arquivo/2026-09-08/docs/09-interface.md#bug-de-clique-em-botão-dentro-de-painel-re-renderizado-a-60fps)
- [Tokens](../arquivo/2026-09-08/docs/09-interface.md#tokens)
- [Listas longas: paginação, não virtualização](../arquivo/2026-09-08/docs/09-interface.md#listas-longas-paginação-não-virtualização)
- [Cabeçalho fixo e rolagem preservada](../arquivo/2026-09-08/docs/09-interface.md#cabeçalho-fixo-e-rolagem-preservada)
- [Busca sem perder o foco](../arquivo/2026-09-08/docs/09-interface.md#busca-sem-perder-o-foco)
- [Toasts que mentiam](../arquivo/2026-09-08/docs/09-interface.md#toasts-que-mentiam)
- [Reatividade](../arquivo/2026-09-08/docs/09-interface.md#reatividade)
- [Preload de arte](../arquivo/2026-09-08/docs/09-interface.md#preload-de-arte)
- [Acessibilidade](../arquivo/2026-09-08/docs/09-interface.md#acessibilidade)
- [Telas construídas e telas que ficaram como aviso honesto](../arquivo/2026-09-08/docs/09-interface.md#telas-construídas-e-telas-que-ficaram-como-aviso-honesto)
- [Tooltips](../arquivo/2026-09-08/docs/09-interface.md#tooltips)
- [VFX de combate](../arquivo/2026-09-08/docs/09-interface.md#vfx-de-combate)
- [Ícones de skill por TIPO](../arquivo/2026-09-08/docs/09-interface.md#ícones-de-skill-por-tipo)
- [Retrato do POKE](../arquivo/2026-09-08/docs/09-interface.md#retrato-do-poke)
- [Tutoriais](../arquivo/2026-09-08/docs/09-interface.md#tutoriais)
- [Deploy: dois bugs que só aparecem publicado](../arquivo/2026-09-08/docs/09-interface.md#deploy-dois-bugs-que-só-aparecem-publicado)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
