/**
 * Normaliza a acentuacao da copy player-facing (PH-379).
 *
 * POR QUE ISTO E UM SCRIPT VERSIONADO, E NAO UMA EDICAO A MAO QUE SOME
 * Sao ~2.700 substituicoes em 6 arquivos. Feita a mao, ninguem consegue revisar
 * o diff sabendo QUAL regra produziu cada troca; feita por script versionado, a
 * regra e o dicionario ficam auditaveis e a proxima leva (arquivo novo, texto
 * novo) roda o mesmo caminho em vez de recomecar do zero. Mesma razao pela qual
 * `CLAUDE.local.md` manda protótipo e bancada de medicao pro git.
 *
 * AS DUAS GUARDAS QUE TORNAM ISTO SEGURO
 *
 * 1. **So string com ESPACO.** Chave, id, nome de campo e valor comparado em
 *    codigo (`mode === 'compacto'`, `type: 'status'`) sao palavra unica. Exigir
 *    um espaco no literal deixa a transformacao so na PROSA — e nenhuma chave do
 *    projeto e uma frase. Rotulo de uma palavra ("Configuracoes") fica de fora
 *    de proposito e e corrigido a mao, que sao poucos.
 * 2. **Dicionario fechado, nunca regra morfologica.** `-cao -> -cao com til`
 *    parece tentador e erra em "vao"/"nao"/"chao" tanto quanto acerta; pior,
 *    erra em silencio. Aqui, palavra que nao esta no dicionario nao e tocada.
 *    O custo e falso NEGATIVO (palavra que continua sem acento), que o teste
 *    `acentuacaoDaCopy.test.ts` acusa — e nao falso positivo, que corromperia
 *    texto.
 *
 * O QUE FICA DE FORA, E POR QUE
 * Palavra ambigua nao entra no dicionario: `esta` (demonstrativo "esta tela" vs
 * verbo "esta ligado"), `e` (conjuncao vs verbo), `as`, `a`, `nos`, `tem`,
 * `vem`, `pode`. Nenhuma delas se resolve sem ler a frase, e um script que
 * "quase sempre acerta" em texto de jogo troca um erro visivel por um erro
 * escondido. Essas sao passadas a mao, com o diff na frente.
 *
 * Uso: `node scripts/harness/acentuar-copy.mjs [--conferir] <arquivo...>`
 * `--conferir` nao escreve nada: so lista o que mudaria.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Sem acento -> com acento. Minusculas; a troca preserva a caixa da primeira
 * letra (`Nao` -> `Não`) e a palavra toda em maiuscula (`NAO` -> `NÃO`).
 */
export const DICIONARIO = {
  // --- as mais frequentes -------------------------------------------------
  nao: 'não', sao: 'são', entao: 'então', tao: 'tão', vao: 'vão', estao: 'estão',
  dao: 'dão', voce: 'você', voces: 'vocês', ja: 'já', so: 'só', ate: 'até',
  ha: 'há', tambem: 'também', alem: 'além', porem: 'porém', apos: 'após',
  ninguem: 'ninguém', alguem: 'alguém', la: 'lá', tres: 'três',
  varios: 'vários', varias: 'várias', atras: 'atrás', tras: 'trás',
  possiveis: 'possíveis', saida: 'saída', saidas: 'saídas', ruido: 'ruído',
  dai: 'daí', hifen: 'hífen',
  // --- -ção / -ções -------------------------------------------------------
  acao: 'ação', acoes: 'ações', evolucao: 'evolução', evolucoes: 'evoluções',
  animacao: 'animação', animacoes: 'animações', selecao: 'seleção',
  protecao: 'proteção', duracao: 'duração', descricao: 'descrição',
  descricoes: 'descrições', colecao: 'coleção', ordenacao: 'ordenação',
  atencao: 'atenção', informacao: 'informação', informacoes: 'informações',
  posicao: 'posição', posicoes: 'posições', condicao: 'condição',
  condicoes: 'condições', reducao: 'redução', producao: 'produção',
  correcao: 'correção', correcoes: 'correções', simulacao: 'simulação',
  gravacao: 'gravação', opcao: 'opção', opcoes: 'opções', pocao: 'poção',
  pocoes: 'poções', configuracao: 'configuração', configuracoes: 'configurações',
  automacao: 'automação', automacoes: 'automações', rotacao: 'rotação',
  aparicao: 'aparição', punicao: 'punição', municao: 'munição',
  restauracao: 'restauração', combinacao: 'combinação', variacao: 'variação',
  aplicacao: 'aplicação', notificacao: 'notificação', notificacoes: 'notificações',
  confirmacao: 'confirmação', autenticacao: 'autenticação', validacao: 'validação',
  navegacao: 'navegação', paginacao: 'paginação', ativacao: 'ativação',
  desativacao: 'desativação', migracao: 'migração', criacao: 'criação',
  negociacao: 'negociação', negociacoes: 'negociações', reputacao: 'reputação',
  intencao: 'intenção', excecao: 'exceção', excecoes: 'exceções',
  solucao: 'solução', instrucao: 'instrução', instrucoes: 'instruções',
  distribuicao: 'distribuição', diminuicao: 'diminuição', pontuacao: 'pontuação',
  // --- -são / -sões -------------------------------------------------------
  sessao: 'sessão', sessoes: 'sessões', conexao: 'conexão', conexoes: 'conexões',
  versao: 'versão', versoes: 'versões', edicao: 'edição', missao: 'missão',
  missoes: 'missões', explosao: 'explosão', explosoes: 'explosões',
  visao: 'visão', decisao: 'decisão', decisoes: 'decisões', precisao: 'precisão',
  divisao: 'divisão', pressao: 'pressão', permissao: 'permissão',
  permissoes: 'permissões', invasao: 'invasão', expansao: 'expansão',
  extensao: 'extensão', dimensao: 'dimensão', suspensao: 'suspensão',
  impressao: 'impressão', expressao: 'expressão', tensao: 'tensão',
  razao: 'razão', razoes: 'razões', prisao: 'prisão', ocasiao: 'ocasião',
  evasao: 'evasão', emissao: 'emissão', transmissao: 'transmissão',
  // --- -ão avulsos --------------------------------------------------------
  botao: 'botão', botoes: 'botões', cartao: 'cartão', cartoes: 'cartões',
  padrao: 'padrão', padroes: 'padrões', campeao: 'campeão', campeoes: 'campeões',
  guardiao: 'guardião', guardioes: 'guardiões', dragao: 'dragão',
  dragoes: 'dragões', mao: 'mão', maos: 'mãos', chao: 'chão', irmao: 'irmão',
  cao: 'cão', orgao: 'órgão', portao: 'portão', limao: 'limão',
  // --- -ç ------------------------------------------------------------------
  forca: 'força', forcas: 'forças', cacada: 'caçada', cacadas: 'caçadas',
  caca: 'caça', cacar: 'caçar', comeca: 'começa', comecar: 'começar',
  comecou: 'começou', comeco: 'começo', danca: 'dança', dancar: 'dançar',
  mudanca: 'mudança', mudancas: 'mudanças', preco: 'preço', precos: 'preços',
  aco: 'aço', diferenca: 'diferença', diferencas: 'diferenças',
  seguranca: 'segurança', esperanca: 'esperança', heranca: 'herança',
  servico: 'serviço', servicos: 'serviços', cabeca: 'cabeça', cabecas: 'cabeças',
  cabecalho: 'cabeçalho', licenca: 'licença', presenca: 'presença',
  crianca: 'criança', pescoco: 'pescoço', reforco: 'reforço', esforco: 'esforço',
  almoco: 'almoço', poco: 'poço', laco: 'laço', braco: 'braço', bracos: 'braços',
  // --- proparoxitonas e -í/-ú ---------------------------------------------
  nivel: 'nível', niveis: 'níveis', numero: 'número', numeros: 'números',
  pagina: 'página', paginas: 'páginas', ultimo: 'último', ultima: 'última',
  ultimos: 'últimos', ultimas: 'últimas', proximo: 'próximo', proxima: 'próxima',
  proximos: 'próximos', proximas: 'próximas', proprio: 'próprio',
  propria: 'própria', proprios: 'próprios', proprias: 'próprias',
  maximo: 'máximo', maxima: 'máxima', minimo: 'mínimo', minima: 'mínima',
  unico: 'único', unica: 'única', unicos: 'únicos', unicas: 'únicas',
  critico: 'crítico', critica: 'crítica', criticos: 'críticos',
  criticas: 'críticas', fisico: 'físico', fisica: 'física', fisicos: 'físicos',
  psiquico: 'psíquico', psiquica: 'psíquica', eletrico: 'elétrico',
  eletrica: 'elétrica', toxico: 'tóxico', toxica: 'tóxica', basico: 'básico',
  basica: 'básica', basicos: 'básicos', basicas: 'básicas',
  automatico: 'automático', automatica: 'automática',
  automaticos: 'automáticos', automaticas: 'automáticas',
  automaticamente: 'automaticamente',
  rapido: 'rápido', rapida: 'rápida', rapidos: 'rápidos', rapidas: 'rápidas',
  pratico: 'prático', pratica: 'prática', publico: 'público', publica: 'pública',
  magico: 'mágico', magica: 'mágica', logico: 'lógico', tecnico: 'técnico',
  historico: 'histórico', historica: 'histórica', generico: 'genérico',
  especifico: 'específico', estatico: 'estático', dinamico: 'dinâmico',
  grafico: 'gráfico', graficos: 'gráficos', tatico: 'tático',
  otimo: 'ótimo', pessimo: 'péssimo', medico: 'médico', comodo: 'cômodo',
  metodo: 'método', periodo: 'período', periodos: 'períodos',
  calculo: 'cálculo', formula: 'fórmula', formulas: 'fórmulas',
  titulo: 'título', titulos: 'títulos', circulo: 'círculo', veiculo: 'veículo',
  obstaculo: 'obstáculo', musculo: 'músculo', seculo: 'século',
  estagio: 'estágio', estagios: 'estágios', relatorio: 'relatório',
  relatorios: 'relatórios', laboratorio: 'laboratório',
  obrigatorio: 'obrigatório', obrigatoria: 'obrigatória',
  territorio: 'território', repertorio: 'repertório', acessorio: 'acessório',
  usuario: 'usuário', usuarios: 'usuários', necessario: 'necessário',
  necessaria: 'necessária', diario: 'diário', diaria: 'diária',
  inventario: 'inventário', adversario: 'adversário', cenario: 'cenário',
  cenarios: 'cenários', glossario: 'glossário', bestiario: 'bestiário',
  aniversario: 'aniversário', comentario: 'comentário', formulario: 'formulário',
  criterio: 'critério', criterios: 'critérios', premio: 'prêmio',
  premios: 'prêmios', serio: 'sério', obvio: 'óbvio',
  video: 'vídeo', audio: 'áudio', inicio: 'início', exercicio: 'exercício',
  beneficio: 'benefício', sacrificio: 'sacrifício', edificio: 'edifício',
  especie: 'espécie', especies: 'espécies', serie: 'série',
  superficie: 'superfície', planicie: 'planície',
  codigo: 'código', codigos: 'códigos', modulo: 'módulo', modulos: 'módulos',
  maquina: 'máquina', maquinas: 'máquinas', logica: 'lógica',
  arvore: 'árvore', arvores: 'árvores', historia: 'história',
  historias: 'histórias', familia: 'família', estrategia: 'estratégia',
  justica: 'justiça', noticia: 'notícia', noticias: 'notícias',
  // --- -ável / -ível -------------------------------------------------------
  possivel: 'possível', impossivel: 'impossível', disponivel: 'disponível',
  disponiveis: 'disponíveis', indisponivel: 'indisponível',
  visivel: 'visível', visiveis: 'visíveis', invisivel: 'invisível',
  legivel: 'legível', ilegivel: 'ilegível', elegivel: 'elegível',
  elegiveis: 'elegíveis', incrivel: 'incrível', terrivel: 'terrível',
  horrivel: 'horrível', sensivel: 'sensível', util: 'útil', inutil: 'inútil',
  uteis: 'úteis', dificil: 'difícil', dificeis: 'difíceis', facil: 'fácil',
  faceis: 'fáceis', responsavel: 'responsável', variavel: 'variável',
  variaveis: 'variáveis', agradavel: 'agradável', saudavel: 'saudável',
  amigavel: 'amigável', vulneravel: 'vulnerável', imprevisivel: 'imprevisível',
  invencivel: 'invencível', imbativel: 'imbatível',
  // --- -ência / -ância ------------------------------------------------------
  experiencia: 'experiência', sequencia: 'sequência', frequencia: 'frequência',
  referencia: 'referência', resistencia: 'resistência',
  resistencias: 'resistências', existencia: 'existência', potencia: 'potência',
  urgencia: 'urgência', tendencia: 'tendência', aparencia: 'aparência',
  consequencia: 'consequência', consequencias: 'consequências',
  ocorrencia: 'ocorrência', preferencia: 'preferência',
  transferencia: 'transferência', paciencia: 'paciência',
  distancia: 'distância', distancias: 'distâncias', importancia: 'importância',
  instancia: 'instância', substancia: 'substância', tolerancia: 'tolerância',
  ganancia: 'ganância', elegancia: 'elegância', abundancia: 'abundância',
  // --- futuro / passado com acento -----------------------------------------
  sera: 'será', serao: 'serão', tera: 'terá', terao: 'terão', fara: 'fará',
  farao: 'farão', dara: 'dará', darao: 'darão', ira: 'irá', irao: 'irão',
  estara: 'estará', estarao: 'estarão', ficara: 'ficará', ficarao: 'ficarão',
  virao: 'virão', podera: 'poderá', poderao: 'poderão',
  havera: 'haverá', precisara: 'precisará', precisarao: 'precisarão',
  voltara: 'voltará', valera: 'valerá', comecara: 'começará',
  // FORA DE PROPOSITO: `vira` (o verbo "virar", comum no jogo — "vira um chip")
  // e `virá` sao a mesma sequencia de letras sem acento, e o verbo e o caso
  // frequente aqui. `ira`/`ai` idem: `IRA` e `AI` aparecem em sigla e a troca
  // com caixa preservada produziria `IRÁ` e `AÍ`.
  // --- avulsos que aparecem no jogo ----------------------------------------
  agua: 'água', aguas: 'águas', saude: 'saúde', ceu: 'céu', pe: 'pé', pes: 'pés',
  mes: 'mês', portugues: 'português', ingles: 'inglês',
  icone: 'ícone', icones: 'ícones',
  memoria: 'memória', vitoria: 'vitória', vitorias: 'vitórias',
  estatistica: 'estatística', estatisticas: 'estatísticas',
  bonus: 'bônus', armazem: 'armazém', parabens: 'parabéns', refem: 'refém',
  area: 'área', areas: 'áreas', aereo: 'aéreo', heroi: 'herói', herois: 'heróis',
  ceramica: 'cerâmica', panico: 'pânico', canhao: 'canhão',
  fantastico: 'fantástico', tunel: 'túnel',
  bencao: 'bênção', licao: 'lição', licoes: 'lições', racao: 'ração',
  balcao: 'balcão',
  ferias: 'férias', torax: 'tórax',
  proposito: 'propósito', propositos: 'propósitos', episodio: 'episódio',
  simbolo: 'símbolo', simbolos: 'símbolos',
  sinonimo: 'sinônimo', anonimo: 'anônimo', economico: 'econômico',
  fenomeno: 'fenômeno', trofeu: 'troféu', chapeu: 'chapéu',
  papeis: 'papéis', aneis: 'anéis',
  // --- vocabulario das descricoes de golpe ---------------------------------
  // Segunda leva: sairam da lista de palavras que SOBRARAM sem acento depois da
  // primeira passada em `moveDescriptions.ts`. O metodo importa mais que a
  // lista — rodar, medir o residuo, ampliar o dicionario, repetir — porque e
  // ele que o proximo arquivo de texto vai usar.
  lamina: 'lâmina', laminas: 'lâminas', le: 'lê', cirurgica: 'cirúrgica',
  alteracao: 'alteração', alteracoes: 'alterações', reforca: 'reforça',
  po: 'pó', cabecada: 'cabeçada', lanca: 'lança', lancar: 'lançar',
  lancado: 'lançado', lancada: 'lançada', lancas: 'lanças',
  balanca: 'balança', pinca: 'pinça', traicoeiro: 'traiçoeiro',
  acido: 'ácido', acida: 'ácida', petala: 'pétala', petalas: 'pétalas',
  tentaculo: 'tentáculo', tentaculos: 'tentáculos', algodao: 'algodão',
  cancao: 'canção', cancoes: 'canções', sonifero: 'sonífero',
  musculos: 'músculos', metalico: 'metálico', metalica: 'metálica',
  clarao: 'clarão', aleatorio: 'aleatório', aleatoria: 'aleatória',
  intangivel: 'intangível', ilusorias: 'ilusórias', ilusorio: 'ilusório',
  adoravel: 'adorável', antebracos: 'antebraços', altissima: 'altíssima',
  altissimo: 'altíssimo', giratorio: 'giratório', giratoria: 'giratória',
  desidratacao: 'desidratação', erupcao: 'erupção',
  concentracao: 'concentração', telecinetica: 'telecinética',
  psiquicos: 'psíquicos', psiquicas: 'psíquicas', protecoes: 'proteções',
  veu: 'véu', espaco: 'espaço', particula: 'partícula',
  particulas: 'partículas', folego: 'fôlego', lagrima: 'lágrima',
  lagrimas: 'lágrimas', movedica: 'movediça', vinganca: 'vingança',
  fumaca: 'fumaça', eletricos: 'elétricos', eletricas: 'elétricas',
  magneticas: 'magnéticas', magnetico: 'magnético',
  imperceptivel: 'imperceptível', fatuo: 'fátuo', raizes: 'raízes',
  agil: 'ágil', ageis: 'ágeis', cipos: 'cipós', furia: 'fúria',
  cocegas: 'cócegas', estardalhaco: 'estardalhaço', pisao: 'pisão',
  empurroes: 'empurrões', iris: 'íris', sugestao: 'sugestão',
  hipnotica: 'hipnótica', hipnotico: 'hipnótico', mistica: 'mística',
  mistico: 'místico', ferrao: 'ferrão', ferroes: 'ferrões',
  liquido: 'líquido', liquida: 'líquida', vacuo: 'vácuo',
  cacador: 'caçador', cacadores: 'caçadores', avancado: 'avançado',
  avancou: 'avançou', avancar: 'avançar', avanca: 'avança',
  // --- quarta leva: residuo do changelog -----------------------------------
  endereco: 'endereço', enderecos: 'endereços', anuncio: 'anúncio',
  anuncios: 'anúncios',
  identico: 'idêntico', identica: 'idêntica', identicos: 'idênticos',
  provavel: 'provável', provaveis: 'prováveis', concluida: 'concluída',
  concluido: 'concluído', rodape: 'rodapé', faisca: 'faísca',
  faiscas: 'faíscas', mandibula: 'mandíbula', cabecalhos: 'cabeçalhos',
  perimetro: 'perímetro', parametro: 'parâmetro', parametros: 'parâmetros',
  gas: 'gás', insonia: 'insônia', pulsacao: 'pulsação', frenetica: 'frenética',
  lingua: 'língua', simultaneas: 'simultâneas', toxicas: 'tóxicas',
  turbilhao: 'turbilhão', pedacos: 'pedaços',
  // --- terceira leva: residuo de traitInfo / tutoriais / Wiki --------------
  genero: 'gênero', generos: 'gêneros', secundario: 'secundário',
  secundarios: 'secundários', secundaria: 'secundária',
  provocacao: 'provocação', autodestruicao: 'autodestruição',
  transformacao: 'transformação', atracao: 'atração', mecanica: 'mecânica',
  mecanicas: 'mecânicas', mutavel: 'mutável', catalogo: 'catálogo',
  lendario: 'lendário', lendarios: 'lendários', graca: 'graça',
  comecam: 'começam', robo: 'robô', reaplicacao: 'reaplicação',
  simplificacao: 'simplificação', fisicos: 'físicos', fisicas: 'físicas',
  passivo: 'passivo', escudo: 'escudo',

}

// Chaves de seguranca do dicionario acima: entradas iguais dos dois lados so
// existem porque a palavra JA esta certa e alguem poderia "consertar" errado.
// Elas nunca produzem troca, e ficam pra documentar o cuidado.
const IDENTICAS = new Set(
  Object.entries(DICIONARIO).filter(([k, v]) => k === v).map(([k]) => k),
)

/** `Nao` -> `Não`, `NAO` -> `NÃO`, `nao` -> `não`. */
function comMesmaCaixa(original, acentuada) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return acentuada.toUpperCase()
  }
  if (original[0] === original[0].toUpperCase()) {
    return acentuada[0].toUpperCase() + acentuada.slice(1)
  }
  return acentuada
}

/**
 * Aplica o dicionario num pedaco de PROSA (nao num literal inteiro).
 *
 * `${...}` de template literal fica INTOCADO — e a guarda que faltava na
 * primeira versao. Sem ela, `${NATURE_BONUS}` virava `${NATURE_BÔNUS}` e
 * `${SEGUNDOS_DE_IMUNIDADE_APOS_CURA}` virava `..._APÓS_CURA`: o que parece
 * texto ali dentro e um IDENTIFICADOR. Foi o `tsc` que acusou ("Cannot find
 * name 'NATURE_BÔNUS'"), e so por sorte — um `${especie}` teria virado
 * `${espécie}` do mesmo jeito e quebrado igual, mas um trecho interpolado que
 * casasse com palavra do dicionario E existisse com acento passaria calado.
 */
export function acentuarTexto(texto) {
  return texto
    .split(/(\$?\{[^}]*\})/g)
    .map((parte) => (parte.startsWith('{') || parte.startsWith('${')
      ? parte
      // A borda da palavra exclui `_` e digito dos DOIS lados. Sem isso,
      // `dano_nivel` numa lista de colunas do PostgREST virava `dano_nível` e
      // `TAMANHO_PAGINA` virava `TAMANHO_PÁGINA` — identificador, nao texto.
      // Achado pelo `tsc`, que reprovou com "Cannot find name 'TAMANHO_PÁGINA'".
      : parte.replace(/(?<![A-Za-zÀ-ÿ0-9_])[A-Za-zÀ-ÿ]{2,}(?![A-Za-zÀ-ÿ0-9_])/g, (palavra) => {
        const chave = palavra.toLowerCase()
        if (IDENTICAS.has(chave)) return palavra
        const acentuada = DICIONARIO[chave]
        return acentuada ? comMesmaCaixa(palavra, acentuada) : palavra
      })))
    .join('')
}

/**
 * Um literal so e tocado se tiver ESPACO — ver a guarda 1 no topo. Comentario
 * de linha e de bloco ficam de fora: eles nao sao copy, e mexer neles inflaria
 * o diff sem mudar nada na tela.
 */
const RE_LITERAL = /(['"`])((?:[^\\\n]|\\.)*?)\1/g

/**
 * TEXTO SOLTO DE JSX — `<p>frase aqui</p>`.
 *
 * Sem esta regra a Wiki inteira ficava de fora: ela e 1.040 linhas de JSX onde
 * a copy quase nunca esta entre aspas. `[^<>{}\n]` exclui de saida qualquer
 * trecho com interpolacao (`{variavel}`), que e onde estaria o unico risco de
 * mexer em codigo — e o dicionario fechado cobre o resto (um `a > b && c <`
 * casaria aqui, e nenhuma daquelas palavras existe no dicionario).
 */
// `[^=;(){}[\]|&<>\n]` no corpo, e nao so `[^<>{}\n]`: sem os operadores, um
// generico de TypeScript (`<T>(itens: T[], tamanho = TAMANHO_PAGINA): Paginado<`)
// e uma arrow (`=> nivel <=`) casam com "texto entre > e <" e viram alvo. Os
// dois foram reprovados pelo `tsc` na primeira tentativa. Texto de tela nao tem
// `=`, `;` nem parenteses de chamada.
// A lookbehind cobre o caso que sobrou depois dos operadores: numa arrow
// (`=> nivel <= level`) o `>` do `=>` e o `<` do `<=` cercam um trecho limpo, e
// `nivel` virava `nível` no meio do codigo. `tsc` reprovou nas duas
// ocorrencias. A regra "duas palavras" abaixo fecha o mesmo buraco por outro
// lado — texto de tela nunca e uma palavra so entre `>` e `<`.
// `{}` FICA DE FORA DA EXCLUSAO: metade da copy de JSX e frase misturada com
// interpolacao — `<span>Nivel {poke.level}</span>`. Excluir a chave deixava
// essas linhas intocadas (foi assim que "Nivel 25" sobreviveu a primeira
// passada). Quem protege o miolo e o `acentuarTexto`, que nao mexe em nada
// dentro de `{...}`.
// Duas frouxidoes deliberadas em cima da versao anterior, as duas medidas
// contra copy que sobrou sem acento:
//
//   - PARENTESE volta a ser texto valido. Ele estava na exclusao por causa de
//     generico e chamada de funcao, e levava junto metade da Wiki:
//     `</b>: impede status NOVO (nao remove um que ja estava la).</li>`. O que
//     ainda barra generico e chamada e a exclusao de `=`, `;` e `[]` —
//     `<T>(itens: T[], tamanho = X): Paginado<` tem os tres.
//   - `<` sai da lookbehind. Ele barrava o FRAGMENTO (`<>Voce recebe <b>`), que
//     e justamente como o projeto escreve frase com pedaco em negrito. `<>` e
//     JSX; `<` seguido de `>` nao e operador nenhum em JS.
const RE_TEXTO_JSX = /(?<![=\-!>])>([^=;[\]|&<>\n]{2,})<(?!=)/g

/**
 * TEXTO DE JSX QUEBRADO EM VARIAS LINHAS.
 *
 * `RE_TEXTO_JSX` exige a tag dos DOIS lados, na mesma linha. Um paragrafo longo
 * da Wiki nao e assim:
 *
 * ```jsx
 * <p>
 *   O golpe de nivel 50 ja esta detalhado na aba <b>Mecanicas</b> — esta aba
 *   so resume.
 * </p>
 * ```
 *
 * A linha do meio nao tem `>` antes nem `<` depois, e ficava inteira de fora.
 * As duas regras abaixo cobrem as pontas: prosa que TERMINA numa tag e prosa
 * que COMECA depois de uma. `=`, `;`, `[]`, `|` e `&` continuam barrando
 * codigo, e o dicionario fechado limita o estrago de qualquer sobra.
 */
// `{}` e `?` ficam FORA nas duas regras de ponta, ao contrario do meio.
// `{ultima ? <TextoComRealce .../>` casava aqui com a chave aberta sem par, e a
// protecao de `{...}` do `acentuarTexto` so cobre par fechado — resultado, a
// variavel `ultima` virou `última`. Prosa quebrada em linha raramente comeca ou
// termina com interpolacao; ternario em JSX, sempre.
// `:` tambem sai daqui, e e a guarda que fecha a classe inteira: um campo de
// tipo (`acao: ReturnType<typeof useAcaoPendente>`) nao comeca por
// palavra-chave e casa tao bem quanto uma frase — foi assim que `acao` virou
// `ação` num nome de propriedade. Prosa que termina em tag E carrega dois
// pontos e rara; propriedade tipada com generico, nao.
const RE_JSX_ATE_A_TAG = /^([^=;:[\]|&<>{}?\n]{3,})</

/**
 * DECLARACAO DE TIPO NAO E PROSA, e ela se parece com prosa terminada em tag.
 *
 * `export const APARENCIA: Record<ClimaTipo, Aparencia> = {` casa em
 * `RE_JSX_ATE_A_TAG` — o trecho ate o primeiro `<` nao tem `=` nem `;`. Na
 * primeira tentativa isso renomeou a constante para `APARÊNCIA` e quebrou o
 * import do teste. O que separa os dois casos com seguranca e a PALAVRA
 * INICIAL: declaracao de TypeScript sempre comeca por palavra-chave; texto de
 * tela, nunca.
 */
const RE_COMECA_COM_PALAVRA_CHAVE = /^\s*(export|const|let|var|function|import|type|interface|class|extends|implements|return|if|for|while|switch|case|new|await|async|public|private|readonly)\b/
const RE_JSX_DEPOIS_DA_TAG = /(?<![=\-!>])>([^=;[\]|&<>{}?\n]{3,})$/

/**
 * Prosa de verdade tem um espaco e pelo menos uma palavra.
 *
 * A primeira versao exigia DUAS palavras seguidas (`[A-Za-z]\s+[A-Za-z]`) e
 * perdia justamente a forma mais comum da copy de JSX: uma palavra mais uma
 * interpolacao (`>Nivel {poke.level}<`). Quem segura os operadores agora sao as
 * lookarounds de `RE_TEXTO_JSX` — numa arrow, o `>` vem depois de `=` e o `<`
 * vem antes de `=`, e os dois casos saem por ali.
 */
const RE_TEM_PROSA = /[A-Za-zÀ-ÿ]{2,}/

/**
 * Lista de colunas do PostgREST — `'id, fonte, rota, nivel, mensagem'`.
 *
 * Ela passa por toda guarda anterior: tem espaco, e minuscula, nao tem `_` em
 * toda palavra. E o `tsc` so acusa quando o nome da coluna existe no tipo
 * gerado; numa tabela sem tipo, `nivel -> nível` viraria erro de runtime no
 * primeiro `select`. A forma e o que denuncia: virgulas separando palavras
 * unicas, sem nenhuma frase entre elas.
 */
const RE_LISTA_DE_COLUNAS = /^\s*[a-z_][\w]*(\s*,\s*[a-z_][\w]*)+\s*$/

/**
 * LITERAL QUE O CODIGO COMPARA — o modo de falha mais perigoso deste script, e
 * o unico que nao aparece como erro de tipo.
 *
 * O caso real, pego pelo `autoridade.test.ts`:
 *
 * ```ts
 * erro.status === 409 && erro.message === 'nenhuma sessao aberta'
 * ```
 *
 * Aquele texto e a mensagem do SERVIDOR, nao copy. Acentuar o lado do cliente
 * quebra a igualdade e a sessao morta deixa de ser detectada — sem erro de
 * compilacao, sem excecao, so um timer batendo no servidor pra sempre. E a
 * mesma familia de `.includes(...)`, `.startsWith(...)` e `case '...'`.
 *
 * A deteccao e pelo CONTEXTO da linha, e nao pelo conteudo: o texto comparado e
 * frase de gente igual ao resto.
 */
const RE_ANTES_DE_COMPARACAO = /(===?|!==?|\.(includes|startsWith|endsWith|indexOf|split|replace|replaceAll|match)\(|\bcase\s+)\s*$/
const RE_DEPOIS_DE_COMPARACAO = /^\s*(===?|!==?)/

export function acentuarFonte(fonte) {
  const linhas = fonte.split('\n')
  let trocas = 0
  const saida = linhas.map((linha) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return linha
    const comLiterais = linha.replace(RE_LITERAL, (inteiro, aspas, corpo, deslocamento) => {
      if (!corpo.includes(' ')) return inteiro
      if (RE_LISTA_DE_COLUNAS.test(corpo)) return inteiro
      if (RE_ANTES_DE_COMPARACAO.test(linha.slice(0, deslocamento))) return inteiro
      if (RE_DEPOIS_DE_COMPARACAO.test(linha.slice(deslocamento + inteiro.length))) return inteiro
      const novo = acentuarTexto(corpo)
      if (novo !== corpo) trocas += 1
      return aspas + novo + aspas
    })
    const comJsx = comLiterais.replace(RE_TEXTO_JSX, (inteiro, corpo) => {
      if (!corpo.includes(' ') || !RE_TEM_PROSA.test(corpo)) return inteiro
      const novo = acentuarTexto(corpo)
      if (novo !== corpo) trocas += 1
      return '>' + novo + '<'
    })
    const comPonta = comJsx.replace(RE_JSX_ATE_A_TAG, (inteiro, corpo) => {
      if (!corpo.includes(' ') || !RE_TEM_PROSA.test(corpo)) return inteiro
      if (RE_COMECA_COM_PALAVRA_CHAVE.test(corpo)) return inteiro
      const novo = acentuarTexto(corpo)
      if (novo !== corpo) trocas += 1
      return novo + '<'
    })
    return comPonta.replace(RE_JSX_DEPOIS_DA_TAG, (inteiro, corpo) => {
      if (!corpo.includes(' ') || !RE_TEM_PROSA.test(corpo)) return inteiro
      const novo = acentuarTexto(corpo)
      if (novo !== corpo) trocas += 1
      return '>' + novo
    })
  })
  return { fonte: saida.join('\n'), trocas }
}

// A CLI so roda quando ESTE arquivo e o que foi executado. Sem a guarda, o
// teste que importa `DICIONARIO` pra varrer o codigo disparava a CLI sem
// argumento e morria com `process.exit(2)` antes de rodar caso nenhum.
const executadoDireto = process.argv[1]?.replace(/\\/g, '/').endsWith('acentuar-copy.mjs')

if (executadoDireto) {
  const args = process.argv.slice(2)
  const conferir = args.includes('--conferir')
  const alvos = args.filter((a) => !a.startsWith('--'))

  if (alvos.length === 0) {
    console.error('uso: node scripts/harness/acentuar-copy.mjs [--conferir] <arquivo...>')
    process.exit(2)
  }

  let total = 0
  for (const caminho of alvos) {
    const original = readFileSync(caminho, 'utf8')
    const { fonte, trocas } = acentuarFonte(original)
    total += trocas
    if (trocas > 0 && !conferir) writeFileSync(caminho, fonte, 'utf8')
    console.log(`${trocas.toString().padStart(5)}  ${caminho}`)
  }
  console.log(`${total.toString().padStart(5)}  TOTAL${conferir ? ' (nada escrito)' : ''}`)
}
