# Liquify: implementação experimental e verificação

Autoria: Codex (OpenAI), 23/10/2026. Autorizado por Daniel apenas na branch test/performance-canvas.

## Causa e mudança

O Liquify anterior fazia leitura do canvas, interpolação de pixels e gravação sincronicamente para cada carimbo, dentro do evento da caneta. Passadas rápidas multiplicavam esse trabalho. Ao atualizar uma região pequena de uma camada grande, a apresentação também voltava a transferir a camada inteira. O diagnóstico inicial mediu o app parado e não continha tempos do Liquify.

O novo motor mantém blocos de 128 px em um Worker. WebGL2 calcula em um atlas de 2048 x 2048, sem textura do tamanho do documento. A leitura para publicar a prévia acontece por lotes de até oito blocos, com confirmação da interface antes do próximo lote. Sem WebGL2, o cálculo usa CPU no Worker; sem Worker/OffscreenCanvas, o mesmo cálculo cede a interface em fatias curtas. Pincéis abaixo de 24 px usam CPU para evitar o custo desproporcional de chamadas gráficas muito pequenas.

A prévia da camada ativa guarda só a região visível, com amostragem em potência de dois e pelo menos uma amostra por pixel de tela. Blocos publicados atualizam essa prévia, evitando transferir novamente o documento inteiro. Os pixels editados e exportados continuam na resolução original. Não é aplicado um filtro de qualidade menor ao documento, nem são descartados pontos do traçado.

Cada passada retém os originais antes da primeira mudança de cada bloco e gera um único passo de desfazer. Ações, passadas seguintes, salvar/fechar e colar aguardam a conclusão. Trocar o documento invalida respostas antigas. Uma falha reverte a passada. A pressão, Alt, seleção dura e trava do alfa permanecem ativos. CPU e GPU usam a mesma interpolação pré-multiplicada; diferenças de arredondamento de ponto flutuante entre os caminhos são possíveis.

O cache de pixels da CPU tem limite de 512 blocos (32 MiB), mais máscaras quando selecionado. O atlas usa 32 MiB para pixels e máscara; originais e resultados do histórico são adicionais e entram no orçamento de histórico existente. Não se trata de um limite para toda a memória do aplicativo.

## Medições locais

Chrome headless no Windows, mesma máquina e fixture, caneta sintética, força máxima, desenho colorido com transparência. Diagonal de ponta a ponta, 12 eventos a intervalos solicitados de 8 ms (30 eventos para as referências de pincel padrão). Os tempos incluem a conclusão da fila, além do envio dos eventos. Heartbeat é um timer de 8 ms na interface, não FPS nem latência física de mesa digitalizadora.

| Caso | Total (ms) | Espera após soltar (ms) | Handler pior (ms) | Heartbeat p95 (ms) |
|---|---:|---:|---:|---:|
| 1080p-fast-reference | 267.8 | 5.1 | 1.7 | 9.8 |
| 4K-default-fast | 263.3 | 1.9 | 9.7 | 9.1 |
| 4K-worker-cpu | 1556.2 | 1439.1 | 10.5 | 9.1 |
| 4K-max-fast | 403.5 | 290.4 | 10.1 | 9.7 |
| 8K-limit-max-fast | 980.1 | 868.7 | 7.2 | 9.3 |
| 8K-limit-default-fast | 632.8 | 523.6 | 7.1 | 9.4 |
| 4K-min-brush-jump | 49.9 | 23.0 | 9.5 | 12.5 |
| 8K-selection-alpha-twirl | 237.1 | 122.9 | 8.0 | 9.6 |
| 4K-many-layers | 492.2 | 378.1 | 10.1 | 9.9 |
| 4K-cooperative | 3234.5 | 3102.9 | 8.3 | 15.8 |

Comparação no código original do ZIP, com as mesmas fixtures: 4K/pincel 160: total 1194,7 ms, handler máximo 26,4 ms, heartbeat p95 50,4 ms. 8000 x 8000/pincel 500: total 5035,1 ms, handler máximo 341,8 ms, heartbeat p95 524,5 ms. O teste novo dá aproximadamente 5 vezes menos tempo total no último caso e elimina os eventos de centenas de milissegundos nesta máquina.

Teste adicional com --disable-gpu: o motor selecionou CPU no Worker. A diagonal de 8000 x 8000/pincel 500 terminou em 4833,7 ms, handler máximo 10,2 ms e heartbeat p95 17,4 ms. Portanto, o caminho sem aceleração melhora a resposta da interface, mas ainda tem atraso perceptível no efeito extremo.

Ainda existe espera no limite extremo: cerca de 0,9 s após soltar na diagonal de 8000 x 8000 com pincel máximo, e cerca de 3,1 s no teste 4K com Worker deliberadamente desativado. A interface continua cedendo turnos, mas isso não significa que a deformação termine instantaneamente. Drivers, CPU, escala e hardware dos amigos precisam ser verificados com o instalador.

## Validação

- As 13 suítes do runner completo passaram (as 12 anteriores mais liquify-async), incluindo pressão, seleção, ORA, PSD, recuperação em IndexedDB e arquivos reais, preferências e fechar/salvar. O ambiente de teste usa Playwright e ag-psd externos; TEMP/TMP dentro do workspace evitam a restrição de rename/download do sandbox. A suíte de preferência nativa recebeu locale en-US explícito para seu texto esperado.
- A suíte Liquify passou com GPU/Worker, CPU/Worker e fallback cooperativo. Confere quatro modos, Alt, pressão simulada, alfa, seleção, cancelamento, vista girada/espelhada e desfazer/refazer exatos.
- A suíte liquify-async também passou no Edge (executado fora do sandbox, que encerrava esse navegador antes da página).
- A nova suíte liquify-async confere passadas rápidas consecutivas, ação de desfazer durante cálculo, respostas antigas após novo documento, falha após prévia e concordância de CPU/GPU em uma fixture independente.
- Dez cenários de estresse passaram: 1080p como referência, 4K, limite 8000 x 8000, pincéis 1/160/500, máxima força, seleção e trava de alfa com girar, 12 camadas e alternativas CPU/cooperativa. Confere a cauda do traçado, restauração de pixels, orçamento de cache, lotes limitados, eventos preservados e heartbeat/handler p95 abaixo de 50 ms no ambiente medido.
- O workflow 39987901213 passou no aplicativo Windows compilado (WebView2 real): isolamento, atualizador ausente, pressão simulada, ORA, preferência gráfica após reiniciar e Liquify com pincel 500/força máxima em 4K e 8000 x 8000. Os dois extremos preservaram pixels e desfazer/refazer exatos. No runner remoto os totais foram 2593,5 e 4191,9 ms; os eventos foram enviados em rajada, e o ambiente difere do benchmark local. WebGL2 é a API utilizada, não uma comprovação de aceleração por hardware.

## Diagnóstico e repetição

Depois de reproduzir uma passada lenta, abrir Configurações > Diagnóstico > Salvar diagnóstico. O JSON inclui revisão da build, backend, modo/tamanho/força, fila máxima, carimbos, leituras/publicações e espera após soltar da última passada. computeMs mede tempo de parede do processamento no Worker: com GPU, parte do custo assíncrono termina em leitura/publicação; não é um timestamp GPU. Nenhum desenho, nome de arquivo ou caminho pessoal é incluído.

Com Playwright em NODE_PATH: node tests/liquify-async.cjs e node tests/liquify-stress.cjs. DOODLE_LIQUIFY_BACKEND=cpu ou cooperative seleciona o caminho na suíte tests/liquify.cjs. DOODLE_STRESS_SOURCE permite executar a fixture sobre o HTML original, e DOODLE_STRESS_FILTER filtra um caso. Os JSONs e logs locais da comparação ficam em liquify-investigation no workspace da sessão.

## Entrega verificada

Fonte compilada: 7c74aab8a097488a79bd76baff918f2e13668116. [Run Windows](https://github.com/VasahTS/Doodle/actions/runs/39987901213) e [pré-release pública](https://github.com/VasahTS/Doodle/releases/tag/performance-canvas-39987901213-1). Instalador: 2.022.878 bytes, SHA-256 b428d5e381f2f03467b771a2c28602b83a70d8e3bad3682d1d79bc311a264e50, conferido após download público. Main, release e latest v0.3.0 foram conferidos sem alteração.

## Integração para main — 23/10/2026

Daniel autorizou levar esta versão para main. Foram integrados o motor testado e as otimizações de canvas/recuperação. Duas regressões do snapshot experimental foram corrigidas antes da integração: a barra de ações da seleção acompanha quadros somente de overlay, e o clipboard interno é preservado ao criar ou abrir outro documento. O teste performance-integration verifica ambos sem restaurar recomposição de pixels durante seleção. O canal padrão do código é main; a configuração e o workflow do instalador experimental continuam explicitamente separados, por identificador e branch. Não houve publicação de uma nova versão estável nesta integração.
