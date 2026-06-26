// BLE 입출력은 tauri-plugin-blec(btleplug) 이 담당한다.
// 프론트(JS)에서 @mnlphlp/plugin-blec 으로 직접 scan/connect/send/subscribe 호출.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
