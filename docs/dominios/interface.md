# Interface e arte

Fontes: src/components, src/features, src/index.css e src/render.
Preserve escala em em, tokens e separação Canvas/React. HP/EXP ao vivo vêm do worldStore.
Mudança de HUD exige verificar tamanho real e interação mobile, incluindo altura disponível.
Tooltip deve funcionar ao toque; title nativo não é explicação acessível no celular.
Tipografia: consulte ../operacao/preservacao-visual.md quando a tarefa exigir preservá-la.
--font-mono já existe em src/index.css; não repetir o diagnóstico do prompt antigo.
Canvas usa ctx.font e não herda CSS. Arte/VFX podem afetar o bundle de authority: confira dependências.

## Temas da interface

ThemeProvider aplica Claro/Jornada ou Escuro/Dark Glass (padrão) na raiz, inclusive
HUD, navegação, chat e portais. Ajuste em Mais → Ajustes → Geral, persistido só no
aparelho por useSecureStorage; falha de storage não impede a troca em memória.
Uma preferência válida salva continua sendo respeitada; ausência/valor inválido usa Escuro.
EquipmentArt mantém pigmentos próprios nos dois temas; controles monocromáticos
continuam herdando contraste. Sala/clima ancoram no centro abaixo do cabeçalho,
sem entrar na altura medida dos atalhos. No Canvas, corpos cobrem informações
com opacidade 1; a passada sobre golpes usa 0,8. Clima mantém sua composição global.
journey.css mantém composição/densidade e themes.css define os materiais. Não
inverter a escala n900/n100 global: dados de combate e raridades conservam sua paleta.
A preferência de reduzir transparência continua independente do tema.

Cabeçalho e equipe formam uma âncora permanente: gaveta de detalhes, evolução e
placar são camadas absolutas, nunca espaçadores entre ativo e reservas. Cabeçalho
e reservas ficam em z59, acima dos painéis comuns e abaixo das confirmações z60.
Os retratos de treinador e Pokémon usam a mesma medida (44px no mobile, 2,5em no PC).
O cabeçalho ocupa a largura segura inteira: retrato do treinador na extremidade
direita, nome/carteira à esquerda dele, sem limitar sua âncora em monitores largos.
Painéis reservam a altura medida das reservas no PC e 52px de faixa lateral no
mobile, somente quando há reservas. A coluna de atalhos continua usando só a altura
do cabeçalho. Medidas são transitórias, nunca persistidas nem enviadas ao servidor.
Próximo golpe e nível de aprendizado ficam visíveis sob HP/XP, junto do Pokémon
ativo. A previsão usa nivelDeAprendizado da forma atual; empates mostram +N e todos
os nomes na explicação por toque/foco. Sem futuro, informa o fim do aprendizado.
Skins preservam recortes RGBA nativos; a geometria gerada informa também quantos
quadros originais há na caminhada. Vistas ausentes são espelhadas, sem gerar arte.

## Espaço útil

Painel usa snap `conteudo` por padrão: cresce só até o conteúdo ou o limite seguro,
sem reservar altura vazia. Listas longas mantêm rolagem; `cheia` continua explícito.
Durante consultas, `useGestaoAberta` recolhe controles de campo e chat mobile para
liberar altura. Auto não participa desse recolhimento: precisa acompanhar a batalha.
Compactar espaçamentos e duplicações, não reduzir tipografia nem alvos de toque.
Evidência e limites da varredura: [auditoria de densidade](../planos/2026-10-11-espaco-util-interface.md).

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
