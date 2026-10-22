// Esconde a janela preta de terminal no Windows quando o app é instalado.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Quando você dá dois cliques num arquivo .ora, o Windows abre o Doodle
/// passando o caminho do arquivo. A tela pergunta esse caminho ao iniciar.
#[tauri::command]
fn arquivo_inicial() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".ora"))
}

fn main() {
    tauri::Builder::default()
        // Janelas nativas de "Abrir" e "Salvar como"
        .plugin(tauri_plugin_dialog::init())
        // Ler e gravar os arquivos .ora e .png
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![arquivo_inicial])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Doodle");
}
