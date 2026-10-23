# Integração das otimizações para main

Autoria: Codex (OpenAI), 23/10/2026. Daniel autorizou explicitamente passar a versão da branch test/performance-canvas para main.

Base main: 4b9a5a61781afce65d40cff9c1bfcffcba8368eb. Versão de testes integrada: efa019bfcf60cfb20bbd43d93b310b0313a867f4, com Liquify compilado/testado no Windows a partir de 7c74aab8a097488a79bd76baff918f2e13668116.

Foram mantidas as otimizações de canvas, memória, recuperação e o motor esparso de Liquify. Antes da integração foram corrigidas duas regressões já identificadas na revisão: barra da seleção desatualizada e clipboard perdido ao criar/abrir desenho. A nova suíte performance-integration confere visibilidade/inversão/remoção da seleção sem pintar a cena e copiar/colar entre documentos com desfazer/refazer exatos.

O canal padrão agora é main. A identidade padrão do aplicativo, associação ORA e atualizador continuam sendo os normais; a configuração experimental só se aplica quando solicitada explicitamente. A pipeline experimental está limitada a test/performance-canvas. O workflow estável de release e a versão 0.3.0 não foram alterados; publicar uma versão permanece uma ação separada.

O preparo e os testes foram feitos em uma cópia isolada. As alterações locais anteriores em AGENTS.md e nos registros de sessão do Daniel foram preservadas.

Validação final: as 14 suítes completas passaram, incluindo a nova suíte de integração. O teste extremo de 8000 × 8000/pincel 500/força máxima passou novamente após as correções (cerca de 1,13 s total nesta máquina), com pixels de desfazer/refazer exatos e todos os eventos preservados. O motor Liquify e o Rust são os mesmos já verificados no instalador experimental Windows; nenhuma nova release estável foi publicada.
