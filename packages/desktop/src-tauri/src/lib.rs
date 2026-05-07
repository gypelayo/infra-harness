mod db;
mod sidecar;

use sidecar::SidecarState;
use std::sync::Arc;
use tokio::sync::Mutex;

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_entities(env: Option<String>) -> Result<Vec<db::Entity>, String> {
    db::get_entities(env.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_edges() -> Result<Vec<db::EdgeRow>, String> {
    db::get_all_edges().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_memory_items(confidence: Option<String>) -> Result<Vec<db::MemoryItem>, String> {
    db::get_memory_items(confidence.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_audit_log(limit: Option<i64>) -> Result<Vec<db::AuditEntry>, String> {
    db::get_audit_log(limit.unwrap_or(50)).map_err(|e| e.to_string())
}

// ── App setup ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarState {
            running: Arc::new(Mutex::new(false)),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // Spawn the pi sidecar manager as a background task.
            tauri::async_runtime::spawn(async move {
                sidecar::start_sidecar(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_entities,
            get_all_edges,
            get_memory_items,
            get_audit_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
