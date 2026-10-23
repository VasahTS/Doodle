# Branch de testes de desempenho do canvas

Esta branch contém o código de `Doodle-Performance-Source.zip`, baseado no Doodle 0.3.0, para testes de desempenho. Em 23/10/2026, Daniel autorizou enviá-lo a uma branch separada e informou que um amigo percebeu lentidão somente no canvas.

Esta atualização modifica o Liquify: cálculo em Worker com aceleração WebGL2 quando disponível, cache de blocos e prévia regional. O instalador Windows é gerado pelo workflow Canvas performance test installer e publicado em uma pré-release de testes após a compilação e as verificações nativas passarem. Os downloads da release estável 0.3.0 continuam sendo da versão anterior às otimizações.

## Novo instalador de Liquify

[Baixar o instalador Windows x64](https://github.com/VasahTS/Doodle/releases/download/performance-canvas-39987901213-1/Doodle-Performance-Test-Windows-x64-setup.exe). Esta build é da revisão 7c74aab8a097488a79bd76baff918f2e13668116.

## Liquify: teste prioritário

Use Empurrar, tamanho padrão e depois 500 px, força máxima, em 4K e 8000 × 8000. Faça passadas rápidas de ponta a ponta e passadas consecutivas. Confira a ponta final, seleção, transparência, Ctrl+Z/Ctrl+Y e salvar/reabrir. Acompanhe tanto a resposta do cursor quanto o atraso até a deformação terminar. Depois da passada lenta, salve o diagnóstico: agora ele identifica a build e inclui o tempo e a fila do Liquify.

Na máquina medida, a diagonal extrema de 8000 × 8000 caiu de cerca de 5 s para 1 s; ainda há cerca de 0,9 s de espera após soltar nesse caso. Com a GPU desativada, esse extremo levou cerca de 4,8 s no Worker/CPU, mantendo a interface respondendo. Sem Worker, o fallback cooperativo também é mais lento. Isso precisa ser comparado nas máquinas afetadas. Metodologia e resultados: [performance-liquify.md](docs/performance-liquify.md).

## Como testar

O foco é comparar a fluidez do canvas com a versão estável, usando o mesmo computador, tamanho de janela, escala do monitor e desenho.

1. Baixar o arquivo **Doodle-Performance-Test-Windows-x64-setup.exe** na pré-release de testes e instalar. Ele aparece como **Doodle Performance Test**, ao lado do Doodle estável, com configurações e recuperação separadas. A instalação de testes não associa arquivos .ora nem carrega o atualizador automático. Para abrir um desenho, usar Arquivo → Abrir dentro da build de testes.
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
- A atualização de Liquify passou nas 13 suítes, nos testes de estresse e no aplicativo Windows compilado (4K e 8000 × 8000, pincel máximo, desfazer/refazer exatos). Run: https://github.com/VasahTS/Doodle/actions/runs/39987901213.
- A revisão inicial ainda não tinha instalador. A nova pipeline só publica o download após compilar o Rust e testar a abertura real do Windows, isolamento, hover, traço, desfazer/refazer, ORA e preferência gráfica após reabertura. Ainda falta testar a sensação da caneta e as máquinas que apresentaram lag.

## Problemas do instalador de testes publicado, corrigidos na main

- **Barra da seleção:** Ctrl+A pode criar a seleção sem mostrar os botões. Após um zoom, a barra aparece, mas pode continuar visível após Ctrl+D. O estado da barra depende indevidamente de uma repintura da cena.
- **Copiar/colar entre documentos:** criar ou abrir outro desenho apaga a área de transferência interna. Copiar em um desenho e colar no próximo não funciona nesta versão de testes.
- **Idioma do teste automatizado:** `tests/performance.cjs` pressupõe inglês em um contexto sem idioma definido. Em um navegador pt-BR pode falhar apenas na comparação do texto. Definir o idioma do navegador como en-US faz essa suíte passar.

A barra da seleção e copiar/colar entre documentos foram corrigidos na integração para main, com cobertura automática. O instalador experimental acima foi compilado antes dessas duas correções; ele continua disponível para comparar desempenho. A versão estável publicada não foi substituída pela integração.

## Publicação e isolamento

A branch é `test/performance-canvas`. Main e release não recebem este código. A pipeline Windows cria uma tag performance-canvas-* e uma pré-release, sem marcá-la como latest e sem publicar latest.json. O workflow da versão estável permanece intacto. O backend só desativa o plugin de atualização quando usa o identificador independente da build de testes.

Para compilar manualmente esta instalação separada: `tauri build --ci --bundles nsis --config src-tauri/tauri.performance.conf.json`.

Guia das otimizações: [docs/performance.md](docs/performance.md).
