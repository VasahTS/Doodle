# Desempenho, memória e armazenamento

Implementação local de desenvolvimento, baseada na versão 0.3.0. Ainda não publicada.

As novas opções ficam na engrenagem de **Configurações**. As alterações de qualidade, memória e armazenamento são salvas automaticamente. A opção de aceleração gráfica exige fechar e abrir o aplicativo.

## Gráficos

| Qualidade da exibição | Comportamento |
| --- | --- |
| Automática — padrão | Usa a escala do monitor até 2×; reduz a prévia para 1× após uma sequência de pinturas lentas na CPU. |
| Econômica | Limita a prévia a 1×, sem sombra da folha. |
| Equilibrada | Limita a prévia a 1,5×, sem sombra da folha. |
| Alta qualidade | Acompanha o monitor até 3× e mantém a sombra em cache. |

As superfícies de apresentação também têm um limite de 16 milhões de pixels. Essas opções não alteram as dimensões nem os pixels do desenho e das exportações. A redução automática considera o tempo de execução da pintura na CPU; uma falha de apresentação da GPU pode precisar de diagnóstico separado.

**Aceleração de hardware:** Automática permite que o WebView utilize a GPU conforme suas regras de compatibilidade. Esse nome indica a preferência; não comprova que todas as operações estejam aceleradas.

**Compatibilidade:** no Windows, acrescenta `--disable-gpu` ao processo WebView2. No Linux, define `WEBKIT_DISABLE_COMPOSITING_MODE=1` antes de criar a janela. No Linux, o escopo é a composição acelerada, e não uma garantia de que toda API gráfica interna deixará de usar a GPU. O padrão não altera os mecanismos de aceleração do sistema. Configurações gráficas externas são preservadas e indicadas no diagnóstico.

A preferência nativa fica em `graphics-mode.txt`, na pasta de configuração do aplicativo. Uma preferência ausente ou inválida volta para Automática. `--safe-gpu` permite uma inicialização de compatibilidade sem modificar a preferência salva. No navegador, essa seleção fica desabilitada; a aceleração é administrada pelo próprio navegador.

## Memória e histórico

| Controle | Padrão | Valores disponíveis |
| --- | --- | --- |
| Passos de desfazer/refazer | 50 | 1–500 |
| Memória dos dados do histórico | 256 MB | 32, 64, 128, 256, 512 ou 1024 MB |
| Caches opcionais da exibição | 128 MB | Sem cache; 32, 64, 128, 256 ou 512 MB |

Os limites do histórico valem para desfazer e refazer em conjunto. Os dados mais antigos são descartados ao atingir um limite. Uma ação que exceda sozinha o orçamento pode ficar sem desfazer. Reduzir um limite também pode remover passos existentes. O desenho atual é preservado.

A contagem de memória estima os dados de pixels retidos, deduplica recursos compartilhados e inclui camadas removidas que só o histórico mantém. Não representa toda a memória do processo. Documento, ferramentas, máscaras, composição temporária e WebView também consomem memória.

Traços de pincel e borracha passam a guardar blocos de 128 × 128 tocados pelo traço, em vez de todo o retângulo de uma diagonal longa. O Liquify mantém seu histórico por blocos.

**Liberar caches** descarta as cópias opcionais da exibição; elas voltam a ser construídas conforme necessário. **Limpar histórico** pede confirmação e remove apenas os passos de desfazer/refazer.

## Armazenamento

- Limite total das cópias automáticas: 128 MB a 8 GB; padrão de 512 MB.
- Versões por desenho: 1–10; padrão de 3.
- Intervalo: desativado, 15 s, 30 s, 1 min ou 2 min; padrão de 30 s.
- O painel informa o espaço ocupado e dá acesso às cópias existentes.

Esses limites se aplicam às cópias de recuperação. Seus arquivos `.ora`, PNG e PSD ficam separados. Cópias de outros desenhos continuam exigindo descarte explícito. Ao reduzir a quantidade de versões, as anteriores são mantidas até concluir uma nova cópia com sucesso.

Falhas persistentes de recuperação passam a usar espera progressiva entre tentativas, de 5 segundos até 5 minutos. Quando o espaço já está cheio, a tentativa para antes de codificar novos PNGs. Alterar as opções ou escolher **Tentar novamente** remove a espera. As versões válidas existentes permanecem preservadas.

No navegador, o armazenamento mantém um índice pequeno dos tamanhos, para não percorrer o conteúdo de todos os PNGs em cada listagem. As cópias da versão anterior são migradas sem apagar os arquivos.

## Diagnóstico

Mostra pinturas do documento, atualizações de sobreposição, tempos de pintura da CPU, perdas de contexto da exibição e tarefas longas quando a API estiver disponível. **Medir fluidez** amostra os intervalos entre callbacks de animação durante três segundos; isso não equivale a medir todo o tempo de apresentação da GPU ou a latência física da caneta.

**Salvar diagnóstico** gera um JSON local com versão da build, runtime, escala da tela, dimensões do documento, quantidade de camadas, limites, contadores e preferência gráfica. Não inclui desenhos, nomes de arquivos ou caminhos pessoais e não transmite o relatório automaticamente.

## Validação da implementação

A comparação em Chromium 133, com GPU desativada e DPR 2, executou 60 atualizações de cursor sobre um documento em branco:

| Trabalho observado no canvas do documento | 0.3.0 | Desenvolvimento |
| --- | ---: | ---: |
| Chamadas `drawImage` no canvas visível | 120 | 0 |

O cursor continua sendo atualizado numa superfície separada. Essa medição confirma a eliminação do trabalho no caminho testado; não afirma uma taxa de FPS do aplicativo nativo nem reproduz as máquinas dos relatos.

Os testes incluem pressão simulada, documentos e exportações, limites de histórico, interface em português/inglês, configurações persistentes, migração de cópias antigas, espaço cheio, espera após falha e preservação de versões durante publicação interrompida. A compilação e a validação nativa de Windows/Linux, a configuração real do driver e a sensação com uma caneta física ainda precisam ser feitas no ambiente de destino.
