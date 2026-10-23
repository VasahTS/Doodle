# Branch de testes de desempenho do canvas

Esta branch contém o código de `Doodle-Performance-Source.zip`, baseado no Doodle 0.3.0, para testes de desempenho. Em 23/10/2026, Daniel autorizou enviá-lo a uma branch separada e informou que um amigo percebeu lentidão somente no canvas.

O código do aplicativo foi mantido como no pacote revisado. Esta entrega não é uma nova versão estável nem inclui um novo instalador. Os downloads da release 0.3.0 continuam sendo da versão estável anterior às otimizações.

## Como testar

O foco é comparar a fluidez do canvas com a versão estável, usando o mesmo computador, tamanho de janela, escala do monitor e desenho.

1. No Windows, quem tem Rust e as ferramentas C++ instaladas pode executar `cargo tauri dev` na raiz desta branch. Para uma primeira verificação do frontend, abrir `src/index.html` no Chrome ou Edge; essa verificação não substitui o aplicativo instalado.
2. Mover o cursor/caneta sem desenhar sobre a folha em branco. Observar se o canvas acompanha o movimento sem travadas.
3. Fazer traços contínuos, com pressão quando houver mesa digitalizadora. Comparar traços curtos e diagonais longas.
4. Repetir em um desenho com várias camadas, além de mover, aproximar e girar a vista.
5. Em Configurações → Desempenho e gráficos, comparar as qualidades Automática e Econômica. Elas afetam apenas a prévia, sem reduzir a resolução do desenho.
6. Se persistirem problemas gráficos no aplicativo nativo, testar Compatibilidade, fechar e reabrir o app antes de comparar. A preferência, sozinha, não comprova que a GPU esteja sendo usada.
7. Em Configurações → Diagnóstico, salvar o relatório local e anotar o que provocou a lentidão, sistema operacional, GPU, escala do monitor e tipo de entrada. O relatório não é enviado automaticamente.

O botão Medir fluidez amostra intervalos entre callbacks de animação. Não mede a latência física da caneta e não comprova sozinho a fluidez do canvas durante desenho.

## Resultados já verificados

- Em 60 movimentos de cursor sem contato, a base 0.3.0 executou 120 chamadas `drawImage` na superfície do documento; este pacote executou zero. A medição foi feita no Chrome headless, com GPU desativada e DPR 2.
- As 12 suítes fornecidas passaram na revisão após ajustes do ambiente de teste. Isso não substitui um teste nativo em uma máquina que apresentou o problema.
- Nenhum instalador deste pacote foi compilado ou executado nesta revisão. Ainda não há confirmação de que todos os relatos de lag foram resolvidos.

## Problemas conhecidos deste pacote

- **Barra da seleção:** Ctrl+A pode criar a seleção sem mostrar os botões. Após um zoom, a barra aparece, mas pode continuar visível após Ctrl+D. O estado da barra depende indevidamente de uma repintura da cena.
- **Copiar/colar entre documentos:** criar ou abrir outro desenho apaga a área de transferência interna. Copiar em um desenho e colar no próximo não funciona nesta versão de testes.
- **Idioma do teste automatizado:** `tests/performance.cjs` pressupõe inglês em um contexto sem idioma definido. Em um navegador pt-BR pode falhar apenas na comparação do texto. Definir o idioma do navegador como en-US faz essa suíte passar.

Esses problemas foram documentados e continuam presentes para preservar a versão solicitada para o teste. As regressões de seleção e copiar/colar devem ser corrigidas antes de integrar as mudanças ao main.

## Publicação e isolamento

A branch é `test/performance-canvas`. Main e release não recebem este código. Não foram criados tags, releases ou alterações no atualizador. O workflow existente só publica ao atualizar a branch release, criar uma tag v* ou executar o workflow manualmente.

Guia das otimizações: [docs/performance.md](docs/performance.md).
