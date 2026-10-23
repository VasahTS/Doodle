# 23/10/2026 — otimização e configurações de desempenho

Pedido do Daniel: investigar relatos de lentidão extrema já na abertura, em Windows e Linux; comparar com PhotoCraft; implementar otimizações e controles de armazenamento, aceleração gráfica e histórico. Trabalho local, sem autorização de publicação.

Base: `main`, commit `4b9a5a61781afce65d40cff9c1bfcffcba8368eb`, Doodle 0.3.0.

Branch local: `perf/settings-and-rendering`. Autoria: Codex (OpenAI).

## Implementado

- Cena opaca e sobreposição transparente separadas. Hover, mudança do cursor e animação da seleção não recompõem o documento.
- Fundo em cache, caches de camadas opcionais com orçamento, alocação sob demanda e limpeza ao trocar de documento/tamanho/opções.
- Qualidade automática/econômica/equilibrada/alta, com escala de apresentação separada da resolução dos pixels e dos arquivos.
- Scratch do pincel atualizado por região modificada. Histórico do pincel/borracha por blocos tocados de 128 px, com undo/redo exatos.
- Atualização do status da caneta por quadro e leitura única dos limites da tela por lote de eventos coalescidos.
- Histórico configurável de 1–500 passos e 32 MB–1 GB de dados retidos; caches opcionais de 0–512 MB. Contagem deduplica recursos compartilhados e inclui camadas removidas retidas por estrutura.
- Configurações com quatro abas: gráficos, histórico, armazenamento e diagnóstico, em pt-BR/en-US, com navegação por teclado, foco e layout estreito.
- Preferência nativa automática/compatibilidade, salva em arquivo independente e aplicada antes da janela. Windows: `--disable-gpu` somente em compatibilidade; Linux: desativação de composição acelerada somente nesse modo. `--safe-gpu` para uma inicialização. Alterações exigem reabertura. A interface informa o escopo e não declara GPU ativa com base apenas na preferência.
- Recuperação com 1–10 versões, 128 MB–8 GB, consulta de espaço e acesso ao gerenciamento existente. Falhas usam espera progressiva e espaço já cheio evita compressão repetida.
- A redução de retenção só remove versões anteriores após novo manifesto bem-sucedido. O prune inicial pode limpar resíduos sem reduzir antecipadamente as versões válidas.
- Índice `sizes` no IndexedDB v2, com migração preguiçosa dos arquivos existentes. Gravação/exclusão de arquivo e tamanho é transacional. Prune nativo usa listagem da sessão, reduzindo varreduras globais.
- Relatório JSON local de diagnóstico sem desenho, nome de arquivo ou caminho pessoal. Mede trabalho da CPU e intervalos de callbacks separadamente; nenhuma medição é anunciada como prova de aceleração 2D ou FPS nativo.

## Comparação de trabalho

Chromium 133 headless, GPU desativada, viewport 1280 × 820, DPR 2, documento branco inicial. Em 60 atualizações de cursor:

| Contador no canvas visível do documento | Base 0.3.0 | Implementação |
| --- | ---: | ---: |
| Chamadas `drawImage` | 120 | 0 |

O cursor é atualizado no overlay. É uma comparação do caminho de código exercitado, não reprodução do hardware dos amigos e não uma medição de FPS do aplicativo Tauri.

O teste de diagonal de 2048 × 2048 reteve 5.743.632 bytes com o histórico em blocos; verifica também que a retenção é inferior a 6 MiB e que undo/redo restaura pixels exatamente. As configurações são de dados de pixels retidos, não limites rígidos de toda a RAM do processo.

## Validação

As **12 suítes** de `node tests/run.cjs` passaram em navegador real, incluindo:

- Metadados de versão e changelog.
- Pressão simulada, tamanhos de 0,1–2 px, DPR 1/1,5/2, zoom e persistência.
- Liquify, seleção, contornos, preenchimento, transformação, atalhos e limpeza.
- Exportação PSD validada por leitor independente e preservação do destino ORA.
- Salvar ao sair, cancelamento/erros, gravação completa e bloqueio de fechamento concorrente.
- Recuperação IndexedDB real e ponte nativa sobre arquivos temporários reais; corrupção, interrupção, retomada, scheduler e edição durante PNG.
- Zero pinturas de cena em hover/animação, prévia reduzida, histórico em blocos, orçamento e limites, persistência dos novos controles, abas/foco, relatório privado e ponte de preferência gráfica.
- Migração real de IndexedDB v1, listagem sem cursor de valores PNG, espaço cheio antes de compressão, backoff sem I/O repetido, retomada e preservação de cinco versões até uma nova publicação completar ao reduzir o limite.

Dependências de teste ficaram fora do aplicativo. `tests/browser.cjs` permite um Chromium externo; `ag-psd` foi usado como leitor independente. Não foram adicionadas dependências npm ao app.

Verificação visual de todas as abas em português e inglês, temas claro/escuro e larguras 1280/820/430. O rodapé de fechamento permanece visível e o conteúdo rola em janelas estreitas. `git diff --check`, considerando os CRLF existentes, passou.

## Limites e próxima sessão

- Não foi compilado um instalador nem executado o Tauri nativo nesta máquina. A ponte de gráficos foi testada com stub; o novo código Rust e a aplicação real das flags ainda exigem build e execução em Windows/Linux. A instalação da toolchain local não ficou utilizável neste ambiente.
- Falta teste com caneta física, GPU/driver real e ao menos uma máquina que apresentou o problema. A aceleração do Canvas 2D não pode ser deduzida de uma identificação de WebGL.
- Os testes não comprovam a eliminação de todas as causas dos relatos. O frontend agora evita o trabalho identificado e permite recolher diagnóstico para os casos restantes.
- A versão de release permanece 0.3.0, e o changelog usa `Unreleased`. Ao preparar publicação, atualizar as três versões, compilar, validar e publicar somente quando Daniel solicitar.
- Arquitetura continua Tauri + Canvas 2D, sem framework ou reescrita do motor. O PhotoCraft serviu de referência para cache por revisão, blocos, limites e diagnóstico; nenhum código ou backend dele foi incorporado.

Guia das opções: [`../performance.md`](../performance.md).
