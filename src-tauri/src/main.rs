// Esconde a janela preta de terminal no Windows quando o app é instalado.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::io::Read;

struct GraphicsState {
    path: Option<PathBuf>,
    applied: String,
    external_override: bool,
}

fn read_graphics_mode(path: Option<&PathBuf>) -> String {
    let software = path.and_then(|p| std::fs::File::open(p).ok())
        .and_then(|f| { let mut s = String::new(); f.take(32).read_to_string(&mut s).ok().map(|_| s) })
        .is_some_and(|s| s.trim() == "software");
    if software { "software" } else { "auto" }.into()
}

#[tauri::command]
fn graphics_preferences(state: tauri::State<'_, GraphicsState>) -> serde_json::Value {
    serde_json::json!({
        "applied": state.applied,
        "requested": read_graphics_mode(state.path.as_ref()),
        "externalOverride": state.external_override,
        "supported": cfg!(any(target_os = "windows", target_os = "linux")),
        "platform": std::env::consts::OS,
    })
}

#[tauri::command]
fn set_graphics_preference(mode: String, state: tauri::State<'_, GraphicsState>) -> Result<(), String> {
    if !matches!(mode.as_str(), "auto" | "software") { return Err("Invalid graphics mode".into()); }
    if !cfg!(any(target_os = "windows", target_os = "linux")) { return Err("Graphics selection is unavailable on this platform".into()); }
    let path = state.path.as_ref().ok_or("Configuration directory unavailable")?;
    let parent = path.parent().ok_or("Configuration directory unavailable")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    // This small, independent preference can safely fall back to automatic after a corrupt write.
    std::fs::write(path, mode.as_bytes()).map_err(|e| e.to_string())
}

/// Quando você dá dois cliques num arquivo .ora, o Windows abre o Doodle
/// passando o caminho do arquivo. A tela pergunta esse caminho ao iniciar.
#[tauri::command]
fn arquivo_inicial() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".ora"))
}

fn main() {
    let context = tauri::generate_context!();
    let path = dirs::config_dir().map(|p| p.join(&context.config().identifier).join("graphics-mode.txt"));
    let mut applied = read_graphics_mode(path.as_ref());
    if std::env::args().any(|a| a == "--safe-gpu") { applied = "software".into(); }
    let external_override = std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_some()
        || std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_some()
        || std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some();
    // Set before creating the WebView or starting its threads. Automatic leaves driver policy intact.
    if applied == "software" {
        #[cfg(target_os = "windows")]
        {
            let previous = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", format!("{previous} --disable-gpu"));
        }
        #[cfg(target_os = "linux")]
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
    tauri::Builder::default()
        .manage(GraphicsState { path, applied, external_override })
        // Janelas nativas de "Abrir" e "Salvar como"
        .plugin(tauri_plugin_dialog::init())
        // Ler e gravar os arquivos .ora e .png
        .plugin(tauri_plugin_fs::init())
        // Baixar e instalar atualizações publicadas no GitHub
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Reabrir o app depois de atualizar
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![arquivo_inicial, graphics_preferences, set_graphics_preference])
        .run(context)
        .expect("erro ao iniciar o Doodle");
}
