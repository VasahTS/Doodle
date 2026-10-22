# Doodle: notas do projeto para assistentes de IA

> Para o Daniel: anexe ou cole este arquivo no começo de uma conversa com qualquer IA (ChatGPT, Gemini, Claude, Cursor, Copilot...).
> Ele explica o projeto, como o código está organizado e as regras combinadas. Se a IA abrir o repositório, ela lê isto sozinha.

## Quem é o dono e como falar com ele

- Daniel, usuário do GitHub **VasahTS**. Fala português do Brasil.
- **Não programa.** Explique sem jargão, passo a passo, e diga exatamente o que clicar ou colar. Quando precisar de um comando, dê o comando pronto.
- Desenha com mesa digitalizadora (caneta com pressão) e está acostumado com **Clip Studio Paint** e **Photoshop**. Quando ele pedir um recurso "igual ao Clip Studio", siga o comportamento do Clip Studio.
- Prefere mudanças **evolutivas, não revolucionárias**: manter o layout atual e refinar. Ele rejeitou layouts radicais (tela livre, menu radial).
- A visão do app: **rápido, abrir e já rabiscar**, sem virar um editor de imagem pesado.

## O que é o app

Doodle é um app de desenho leve para rabiscar. Desktop, open source (licença MIT).

- Repositório: https://github.com/VasahTS/Doodle (o nome tem D maiúsculo)
- Downloads: https://github.com/VasahTS/Doodle/releases/latest
- Versão atual: veja `"version"` em `src-tauri/tauri.conf.json`
- Plataformas: **Windows é a prioridade.** A versão Linux é gerada junto, mas está em espera: um amigo achou ela lenta (WebKitGTK). Não mexa no Linux sem o Daniel pedir.
- Idiomas: **pt-BR e en-US**. O app escolhe pelo idioma do sistema, e dá para trocar no menu do arquivo.

### Recursos que já existem

- Pincel e borracha com **pressão da caneta** (no tamanho e/ou na opacidade), curva da caneta e estabilizador. **Cada ferramenta tem os próprios ajustes.**
- Cursor do pincel no tamanho real (vira um ponto quando é pequeno). O laço usa o próprio ícone como cursor.
- Pincel e borracha de **0,1 a 500 px**, com passos de 0,1 abaixo de 1 px; pressão pode afinar abaixo de 1 px.
- **Liquify** (`J`) como pincel na tela: empurrar, expandir, contrair e girar; tamanho/força próprios, pressão na força, Alt inverte os modos radiais e cada passada tem um único desfazer.
- **Camadas e pastas**, seleção múltipla (Ctrl+clique, Shift+clique), arrastar para reordenar ou para dentro de pastas, opacidade e visibilidade.
- **Travar pixels transparentes** (`/`), igual ao "Lock transparent pixels" do Clip Studio: o pincel e o balde não vazam para fora do desenho, e a borracha fica bloqueada.
- **Prender na camada de baixo** (`Ctrl+Alt+G`), igual ao "Clip to layer below": a camada só aparece onde a base tem desenho.
- **Laço** (`L`): botões Nova/Somar/Subtrair; **Shift soma, Ctrl subtrai** (Alt também subtrai). Ctrl+Z desfaz cada passo. O pontilhado é gerado da máscara final e guardado em cache, sem desenhar contornos sobrepostos. Uma barra flutuante aparece embaixo da seleção (tirar, inverter, transformar, recortar ou copiar para camada nova, apagar dentro ou fora, preencher).
- **F** preenche a seleção com a cor principal; Alt+Backspace é alternativa. **Backspace** limpa os pixels selecionados ou o conteúdo das camadas selecionadas quando não há seleção de pixels, sem excluir camadas. Delete é alternativa.
- **Ctrl+T** (transformar): mover, escalar, girar, inclinar, distorcer (cantos livres, com perspectiva), espelhar, girar 90°. O botão direito abre um menu com esses modos. Ctrl+Z desfaz o último ajuste dentro da transformação.
- **Vista**: R segurado gira a tela, `'` volta a 0°, Z segurado e arrastando dá zoom, F1 espelha a vista, Espaço segurado move a tela.
- **Configurações** na engrenagem do canto superior direito: idioma, atalhos e procura de atualizações. **Todos os atalhos podem ser trocados** (Configurações → Atalhos ou Ctrl+K). Ficam salvos.
- Arquivos **.ora** (OpenRaster, abrem no Krita e no GIMP), com pastas, trava e recorte. Exporta PNG. Abre PNG/JPG e cola imagens da área de transferência.
- **Atualização automática** pelas releases do GitHub (veja "Publicar uma versão").

## Arquitetura

O app é **Tauri 2**: uma janela nativa em Rust com uma página web dentro. Toda a interface e o motor de desenho estão em **um arquivo só, `src/index.html`** (HTML + CSS + JavaScript puro, sem framework, sem npm, sem etapa de build). Por isso o GitHub mostra "99% HTML".

Foi escolha consciente: a pressão da caneta é confiável na parte web (Pointer Events), e as bibliotecas de interface em Rust puro ainda falham nisso. **Não proponha reescrever em Rust** sem o Daniel pedir.

```
Doodle/
├── src/index.html            ← o app inteiro (interface + motor de desenho + traduções)
├── src-tauri/
│   ├── src/main.rs           ← liga os plugins (dialog, fs, updater, process) e o comando arquivo_inicial
│   ├── tauri.conf.json       ← nome, versão, janela, ícones, instalador NSIS (pt/en), atualizador (chave pública)
│   ├── capabilities/default.json  ← permissões da janela (core, dialog, fs, updater, process)
│   └── icons/
├── .github/workflows/release.yml  ← gera os instaladores e publica a release
├── README.md (inglês) · LEIA-ME.md (português) · LICENSE (MIT) · AGENTS.md (este arquivo)
```

- O lado Rust é mínimo de propósito. `arquivo_inicial` devolve o caminho do `.ora` quando o usuário abre o app com dois cliques num arquivo.
- O JavaScript acessa o sistema por `window.__TAURI__` (`withGlobalTauri: true`): `dialog`, `fs`, `updater`, `process`, `app`, `window`, `core`.
- Sem Tauri (abrindo o `index.html` num navegador), o app também funciona. Ele salva com `showSaveFilePicker` ou por download. Dentro da prévia do Claude (iframe), salvar é bloqueado e o app avisa.

## Mapa do `src/index.html`

O script é um IIFE só, dividido em seções com comentários `/* ===== Nome ===== */`. Em ordem:

| Seção | O que tem |
|---|---|
| Idiomas | `EN` (dicionário pt→en), `LANG`, `t(pt)`, `translateDOM()` |
| Utilidades | `mkCanvas`, `clamp`, `rectUnion`, `rectClamp`, `alphaBounds`, `toast` |
| Estado | `S` (ferramenta, cores, `S.tools.{brush,eraser,fill,liquify}`, `lassoMode`, zoom/rot/pan/flip, arquivo), `doc` (`W`, `H`, `root`, `active`, `sel`), `saveSettingsSoon()` |
| Árvore de camadas e pastas | `makeLayer`, `makeGroup`, `walk`, `allLayers`, `flatten()`, `clipBaseOf()`, `rowsTopDown`, `targetLayers()` |
| Histórico | `pushHistory`, `undo`, `redo`, `snapStruct`/`restoreStruct`, `act(fn, pix)`, `pixelEntry`, `setSelection` |
| Ações de camadas | adicionar, agrupar (`groupSelected`), duplicar, apagar, `mergeSelected` (Ctrl+E), mover, trava (`setAlphaLock`), recorte (`toggleClip`), painel (`renderLayers`) |
| Vista | `viewM()` (matriz com zoom, rotação e espelho), `toDocXY`, `docToScreen`, `setViewKeeping`, `animateView`, `fitView`, `toggleMirror`, `resetRotation` |
| Desenho na tela | `render()`, cache de camadas de baixo/de cima (`buildCache`, `rcache`), `drawItems`/`paintLayer` (grupos de recorte), formigas da seleção, barras flutuantes |
| Pincel com pressão | `pressureOf`, `radiusFor`, `stamp`, `beginStroke`, `extendStroke`, `endStroke` (carimbos espaçados num canvas de traço, aplicados à camada no fim) |
| Liquify | `beginLiquify`, `extendLiquify`, `liquifyDab`, `endLiquify`; deformação local e histórico por blocos de 128 px |
| Seleção com laço | `selection` (máscara em canvas + polígonos), `applyLasso`, `selectAll`, `invertSelection`, recortar/copiar/colar, `toNewLayers`, `fillSelection`, `clearOutside` |
| Transformar | `tf` (estado), `tfMatrix`, modos `free/scale/rotate/skew/distort`, homografia (`solveH`, `drawMesh`, `drawTri`), `applyTransform`, `cancelTransform`, menu do botão direito |
| Balde e conta-gotas | `floodFill` (preenchimento por linhas, respeita a seleção e a trava), `pickColor` |
| Ponteiro | eventos `pointerdown/move/up` com `getCoalescedEvents`, ponta borracha da caneta, mão, zoom com Z, girar com R |
| Ferramentas e opções | `setTool`, `setOptsMode`, ajustes por ferramenta, dock, balão de ajustes, paleta |
| Arquivo .ora | zip feito à mão (`zipStore`, `unzip`, `crc32`, inflate via `DecompressionStream`), `buildOra`, `loadOra` |
| Abrir e salvar | `writeOut`, `save`, `exportPng`, `openFile`, arrastar e soltar, colar imagem |
| Janelas | novo desenho, confirmação (`confirmBox`; `alert` e `confirm` não são usados) |
| Atalhos | `ACTIONS` (id, grupo, rótulo pt, tecla padrão), `RUN`, `KEYS`, teclas de segurar (`hold.*`), editor de atalhos |
| Fim | idioma, gaveta de camadas (`applyPin`), menus do arquivo e configurações (`openSettingsMenu`, `closeSettingsMenu`), atualizações (`checkUpdates`, `installUpdate`), início |

`window.__doodle` expõe funções internas para testes automáticos.

### Conceitos importantes

- **Ordem das camadas:** `children` de cada pasta vai **de baixo para cima**. O painel mostra de cima para baixo (`rowsTopDown`).
- **O que aparece na tela** é sempre `flatten()`: camadas visíveis com opacidade acumulada, e camadas presas (`clip`) agrupadas na sua base. Exportar, conta-gotas, balde e `mergedimage.png` usam a mesma lista, então a tela e o arquivo batem.
- **Desfazer:** qualquer ação nova deve passar por `act(() => {...}, [{layer, rect}])`. Ele fotografa a estrutura (`snapStruct`) e os pixels só do retângulo que muda. Traços usam `pixelEntry`. Mudanças só de seleção usam `setSelection` e não marcam o desenho como "não salvo".
- **Seleção** é uma máscara com borda dura (sem antisserrilhado), para recortar e colar no lugar sem deixar linha fantasma.
- **Traduções:** o texto original no código é em **português**. Para traduzir, envolva em `t('texto')` e adicione a chave no objeto `EN`. Textos fixos do HTML (conteúdo, `aria-label`, `title`) são traduzidos por `translateDOM` desde que a frase exista em `EN`. Frases montadas com variáveis são traduzidas em pedaços (`t('Salvo: ') + nome`). **Todo texto novo precisa entrar no `EN`.**
- **Ajustes e atalhos** ficam em `localStorage` (`doodle.settings`, `doodle.keys`).
- **Cores** vêm de variáveis CSS (`--accent`, `--panel`...) com tema claro e escuro. O acento é azul ultramar. As cores da paleta têm nomes de pigmentos.

## Formato .ora

O arquivo é um zip com `mimetype` (primeiro, sem compressão), `stack.xml`, `data/layerN.png`, `mergedimage.png` e `Thumbnails/thumbnail.png`. Pastas viram `<stack>`. Atributos extras que só o Doodle lê: `alpha-preserve="true"` (trava) e `clip-to-below="true"` (recorte). Outros programas ignoram esses atributos.

## Como testar

- **Rápido:** abra `src/index.html` no Chrome ou no Edge. Quase tudo funciona, menos o atualizador e os diálogos nativos.
- **App de verdade:** `cargo tauri dev` na raiz do projeto. Precisa do Rust e, no Windows, das Microsoft C++ Build Tools. O CLI se instala com `cargo install tauri-cli --version "^2" --locked`.
- Antes de entregar, teste com a pressão da caneta, Ctrl+Z, salvar e reabrir um `.ora`, e os dois idiomas.
- Regressões de navegador: `node tests/run.cjs` (Playwright disponível fora do projeto; veja `tests/README.md`). A pressão automatizada é simulada; o teste do atualizador usa um stub local.

## Publicar uma versão

1. Aumente `"version"` em `src-tauri/tauri.conf.json`, `version` em `src-tauri/Cargo.toml` e a versão do pacote `doodle` no `Cargo.lock`. Adicione a entrada em inglês ao `CHANGELOG.md`; o workflow usa essa entrada nas notas da release.
2. `git push origin main` e depois `git push origin main:release`.
3. O workflow `release.yml` lê a versão, cria a release `vX.Y.Z` e gera, na nuvem do GitHub:
   - Windows: `Doodle_X.Y.Z_x64-setup.exe` (NSIS, instalador em pt e en)
   - Linux: `.AppImage` e `.deb`
   - `latest.json` e as assinaturas `.sig`, que o atualizador do app usa
4. Quem tem o app instalado recebe o aviso **Atualizar agora** (o app procura uma vez por dia, ou pelo menu do arquivo).

Também funciona enviando uma tag `vX.Y.Z` ou rodando o workflow pela aba Actions.

**Assinatura:** as atualizações são assinadas. A chave pública está em `tauri.conf.json` (`plugins.updater.pubkey`). A chave privada fica **só** no segredo `TAURI_SIGNING_PRIVATE_KEY` do repositório e numa cópia guardada pelo Daniel. Ela não tem senha. Nunca coloque a chave privada no repositório. Se ela se perder, os apps instalados param de aceitar atualizações.

## Coisas a saber

- O instalador do Windows não é assinado com certificado, então o SmartScreen avisa na primeira instalação. É normal.
- No Linux o desempenho é ruim (WebKitGTK). Ideias para quando for retomado: `WEBKIT_DISABLE_DMABUF_RENDERER=1` ou `WEBKIT_DISABLE_COMPOSITING_MODE=1`, redesenhar só a área que mudou e evitar copiar o canvas inteiro a cada quadro.
- Se o arquivo único crescer demais, a próxima organização natural é separar o `index.html` em `style.css` e vários `.js` (camadas, pincel, laço, transformar, arquivo, atalhos, idiomas), sem framework e sem etapa de build.
- Ao responder o Daniel: diga o que mudou do ponto de vista dele, como testar e se ele precisa fazer algo. Evite despejar código no chat sem ele pedir.

## Registro de desenvolvimento

- **Codex (OpenAI)** implementou e documentou a sessão de **22/10/2026**, preparada para a versão **0.2.0**: Liquify, tamanhos fracionários, melhorias no laço/contorno, atalhos F e Backspace, configurações, testes e publicação.
- Registro completo: [docs/sessions/2026-10-22-codex.md](docs/sessions/2026-10-22-codex.md).
- Changelog em inglês: [CHANGELOG.md](CHANGELOG.md).
- Ideias futuras solicitadas pelo Daniel, ainda pendentes: [future-additions/README.md](future-additions/README.md).
