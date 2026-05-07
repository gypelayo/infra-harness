use tauri::{AppHandle, Manager};
use tauri::Emitter;
use std::process::Stdio;
use std::io::{BufRead, BufReader};
use tokio::sync::Mutex;
use std::sync::Arc;

pub struct SidecarState {
    pub running: Arc<Mutex<bool>>,
}

/// Spawn pi --mode rpc as a sidecar, read its stdout, and emit
/// "agent-ui" events to the frontend for any infra_harness_ui lines.
pub async fn start_sidecar(app: AppHandle) {
    let running = {
        let state = app.state::<SidecarState>();
        state.running.clone()
    };

    loop {
        {
            let mut r = running.lock().await;
            *r = false;
        }
        app.emit("sidecar-status", serde_json::json!({ "ready": false })).ok();

        // Locate the pi binary.
        let pi_bin = which_pi();
        if pi_bin.is_none() {
            eprintln!("[sidecar] pi binary not found. Retrying in 10s.");
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            continue;
        }
        let pi_bin = pi_bin.unwrap();

        let child = std::process::Command::new(&pi_bin)
            .args(["--mode", "rpc", "--no-session"])
            .env("INFRA_HARNESS_TAURI_SIDECAR", "1")
            .stdout(Stdio::piped())
            .stdin(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn();

        match child {
            Err(e) => {
                eprintln!("[sidecar] Failed to spawn pi: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
            Ok(mut proc) => {
                {
                    let mut r = running.lock().await;
                    *r = true;
                }
                app.emit("sidecar-status", serde_json::json!({ "ready": true })).ok();

                let stdout = proc.stdout.take().expect("stdout");
                let app2 = app.clone();

                // Read stdout in a blocking thread (pi emits LF-delimited JSONL).
                tokio::task::spawn_blocking(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        match line {
                            Ok(l) if !l.trim().is_empty() => {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&l) {
                                    if val.get("type").and_then(|t| t.as_str()) == Some("infra_harness_ui") {
                                        if let Some(descriptor) = val.get("descriptor") {
                                            app2.emit("agent-ui", serde_json::json!({
                                                "descriptor": descriptor
                                            })).ok();
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                });

                // Wait for process to exit.
                let _ = proc.wait();
                eprintln!("[sidecar] pi process exited. Restarting in 3s.");
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }
        }
    }
}

fn which_pi() -> Option<String> {
    // Honour explicit override.
    if let Ok(p) = std::env::var("PI_BIN") {
        return Some(p);
    }
    // Try PATH.
    if let Ok(output) = std::process::Command::new("which").arg("pi").output() {
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    // Common npm global paths.
    for candidate in &[
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        "~/.nvm/versions/node/v20.19.4/bin/pi",
    ] {
        let expanded = candidate.replace('~', &std::env::var("HOME").unwrap_or_default());
        if std::path::Path::new(&expanded).exists() {
            return Some(expanded);
        }
    }
    None
}
