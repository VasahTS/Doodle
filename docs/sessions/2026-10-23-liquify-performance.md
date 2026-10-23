# Liquify: desempenho na branch de testes

Autoria: Codex (OpenAI), 23/10/2026. Daniel relatou lentidão em Empurrar, autorizou implementar em test/performance-canvas e exigiu extremos além de 1080p.

Foi implementado motor esparso com Worker, atlas WebGL2, CPU no Worker e fallback cooperativo, prévia regional, conclusão ordenada e diagnóstico da última passada. Seleção, alfa, pressão, uma entrada de desfazer por passada e ORA foram preservados. Detalhes e limites: [performance-liquify.md](../performance-liquify.md).

As 13 suítes completas passaram. A suíte de Liquify também passou forçando CPU e execução cooperativa; os testes assíncronos passaram no Edge. Dez cenários de estresse e um adicional sem GPU verificaram o limite 8000 × 8000, pincéis 1/160/500, máxima força, seleção, transparência, 12 camadas, cauda do traçado, cache, heartbeat e restauração exata. Ainda há atraso no efeito no limite extremo e em máquinas sem aceleração; não foi afirmada uma garantia universal de fluidez.

Commit compilado: 7c74aab8a097488a79bd76baff918f2e13668116. Run [39987901213](https://github.com/VasahTS/Doodle/actions/runs/39987901213) passou incluindo o app Windows real em 4K e 8000 × 8000. Pré-release pública: [performance-canvas-39987901213-1](https://github.com/VasahTS/Doodle/releases/tag/performance-canvas-39987901213-1).

Instalador Doodle-Performance-Test-Windows-x64-setup.exe: 2.022.878 bytes, SHA-256 b428d5e381f2f03467b771a2c28602b83a70d8e3bad3682d1d79bc311a264e50. Download público e checksum conferidos. Instalação e atualizações permanecem isoladas da versão estável; main/release/latest v0.3.0 não foram alterados. O checkout principal e as alterações locais anteriores do Daniel foram preservados.

Pedir aos amigos que usem este instalador atualizado e salvem o diagnóstico depois de uma passada lenta, pois agora ele identifica a revisão e inclui backend, fila e tempos do Liquify.
