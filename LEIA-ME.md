# Doodle

App para rabiscar rápido, com camadas, pressão da caneta e arquivos `.ora`.
Feito com Tauri (Rust por baixo, interface em HTML).

## Baixar pronto

Na página do projeto no GitHub, abra **Releases**:

- **Windows:** baixe o `Doodle_..._x64-setup.exe`. O Windows pode avisar que o app não é
  assinado: clique em "Mais informações" e depois em "Executar assim mesmo".
- **Linux:** baixe o `.AppImage`, marque como executável (`chmod +x Doodle_*.AppImage`) e abra.
  No Ubuntu/Debian também dá para instalar o `.deb`. A atualização automática funciona no AppImage.

Depois de instalado, o app procura atualizações sozinho (uma vez por dia) e mostra um aviso
com o botão **Atualizar agora**. Também dá para procurar pelo menu do arquivo, em
**Procurar atualizações**. Ele baixa, instala e abre de novo, sem precisar entrar no GitHub.

O app abre em português ou inglês conforme o idioma do Windows. Para trocar, clique no
nome do arquivo, lá em cima, e escolha o idioma no fim do menu.

## Já tem o Rust e o Tauri instalados?

Abra a pasta `doodle` no Explorador, clique com o botão direito num espaço vazio,
escolha **"Abrir no Terminal"** e rode:

```
cargo tauri dev
```

Para gerar o instalador, use `cargo tauri build` (detalhes no fim deste arquivo).
Se você tinha a versão anterior, substitua a pasta inteira por esta.

## Atalhos

O botão **Atalhos** (ou Ctrl+K) mostra todos e deixa trocar qualquer um:
clique no atalho e aperte a tecla nova. O app guarda a sua escolha.

Alguns que valem saber: **R** segurado e arrastando gira a tela, **'** volta para 0°,
**Z** segurado e arrastando dá zoom, **F1** espelha a vista, **Ctrl+T** transforma
(botão direito mostra mais opções), **L** é o laço e **/** trava os pixels transparentes da camada
(o pincel não vaza para fora do desenho) e **Ctrl+Alt+G** prende a camada na de baixo.

## O que tem nesta pasta

```
doodle/
├── src/index.html          ← o app inteiro (tela, pincel, camadas, atalhos)
└── src-tauri/              ← a parte em Rust que vira o programa do Windows
    ├── src/main.rs         ← liga as janelas de Abrir/Salvar e o acesso a arquivos
    ├── tauri.conf.json     ← nome, tamanho da janela, ícone, associação com .ora
    ├── capabilities/       ← permissões (o que o app pode fazer no computador)
    └── icons/              ← ícones do app
```

## Testar sem instalar nada

Dê dois cliques em `src/index.html`. Ele abre no Chrome ou no Edge e já dá para
desenhar, testar a caneta, usar camadas e atalhos. Salvar também funciona
nesses navegadores (eles perguntam onde guardar o arquivo).

## Transformar em programa do Windows

Isso só precisa ser feito uma vez no computador.

### 1. Ferramentas de compilação da Microsoft
Baixe em https://visualstudio.microsoft.com/visual-cpp-build-tools/
Na instalação, marque **"Desenvolvimento para desktop com C++"** e instale.
(São alguns GB. Pode demorar.)

### 2. Rust
Baixe o `rustup-init.exe` em https://rustup.rs e rode.
Quando aparecer o menu, aperte **Enter** para aceitar o padrão.
Depois **feche e abra de novo** qualquer terminal.

### 3. Ferramenta do Tauri
Abra o **Terminal** (ou PowerShell) e cole:

```
cargo install tauri-cli --version "^2" --locked
```

Demora alguns minutos na primeira vez.

### 4. Rodar o app
No Explorador de Arquivos, abra a pasta `doodle`, clique com o botão direito
num espaço vazio e escolha **"Abrir no Terminal"**. Então cole:

```
cargo tauri dev
```

A primeira vez demora (ele baixa e compila tudo). Depois abre a janela do Doodle.

### 5. Gerar o instalador
Na mesma pasta:

```
cargo tauri build
```

O instalador fica em:
`src-tauri\target\release\bundle\nsis\Doodle_0.1.0_x64-setup.exe`

Ele instala o Doodle no menu Iniciar e faz os arquivos `.ora` abrirem com ele
quando você der dois cliques.

## Se der erro

Copie a mensagem de erro inteira e mande para o Claude. Se você usar o
Claude Code nesta pasta, ele mesmo pode rodar os comandos acima e corrigir
o que aparecer.

## Sobre o formato .ora

É o OpenRaster, um formato aberto de desenho com camadas. O Krita, o GIMP e
o MyPaint também abrem esses arquivos. Por dentro é um `.zip` com uma imagem
PNG para cada camada e uma lista com nome, opacidade e visibilidade.

## Publicar uma versão nova (para quem mantém o projeto)

1. Mude o número em `src-tauri/tauri.conf.json` (`"version": "0.2.0"`, por exemplo).
2. Envie para o GitHub e crie a etiqueta da versão: `git tag v0.2.0` e `git push origin main v0.2.0`.
3. O GitHub gera o instalador, publica em Releases e quem já tem o app recebe o aviso de atualização.

As atualizações são assinadas com a chave guardada no segredo `TAURI_SIGNING_PRIVATE_KEY`
do repositório. Sem essa chave a publicação não funciona, e se ela for perdida o app instalado
para de aceitar atualizações novas. Guarde uma cópia num lugar seguro.
