# Pinky Studio (SUNDAY 스택)

기존 PySide6 GUI(`pinky_ble/ble_gui.py`)와 **동일한 기능**을 SUNDAY 스택으로 옮긴
데스크탑 앱. BLE 로 Pinky(라즈베리파이5)에 붙어 WiFi 를 설정한다.

- **셸**: Tauri 2 (Rust) — 네이티브 창 + 시스템 웹뷰
- **프론트**: Next.js 16 + React 19 (static export)
- **스타일**: Tailwind CSS 4 + shadcn 스타일 컴포넌트
- **BLE**: `tauri-plugin-blec`(btleplug, Rust) — `bleak` 대체. Windows/Ubuntu 동일 코드.
- **서버(Pinky)는 그대로**: `pinky_ble/ble_server.py` 등 변경 없음. 프로토콜 동일.

## 구조

```
[React UI] ──@mnlphlp/plugin-blec──▶ [Rust: tauri-plugin-blec(btleplug)]
  src/app/page.tsx                            │ BLE GATT
  src/lib/ble-client.ts (프로토콜)             ▼
  src/lib/ble-protocol.ts (프레이밍)   Pinky 서버(ble_server.py)
```

- `src/lib/ble-protocol.ts` = `ble_common.py` 의 프레이밍(20바이트 청크 + `\n`)을 TS 로 포팅.
- `src/lib/ble-client.ts` = `ble_gui.py` 의 `_send`/스캔/연결/조립 로직.

## 사전 준비

1. **Rust 설치** (Tauri 필수):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```
2. **Linux 시스템 의존성**(Ubuntu) — Tauri 웹뷰 + BLE(BlueZ):
   ```bash
   sudo apt update
   sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
     libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
     libdbus-1-dev bluez
   ```
   - btleplug 는 Linux 에서 BlueZ(DBus)를, Windows 에서 WinRT 를 사용한다.

## 설치 & 실행 (개발)

```bash
cd pinky_desktop
npm install
npm run tauri dev
```
- 첫 실행 시 npm 이 정확한 최신 버전으로 의존성을 잠그고, cargo 가 Rust 의존성을 받는다.
- `tauri-plugin-blec` 버전이 안 맞으면:
  ```bash
  cd src-tauri && cargo add tauri-plugin-blec   # 최신으로 갱신
  cd .. && npm install @mnlphlp/plugin-blec@latest
  ```

## 빌드 (배포)

빌드 전 아이콘 생성(한 번만):
```bash
npm run tauri icon path/to/logo.png   # 1024x1024 권장 -> src-tauri/icons 생성
```
그다음:
```bash
npm run tauri build
```
- Ubuntu: `.deb` / `.AppImage`, Windows: `.msi` / `.exe` 가
  `src-tauri/target/release/bundle/` 에 생성된다.

## 사용 흐름 (PySide6 버전과 동일)

1. **Pinky 검색** → 목록에서 선택 → **연결** (자동 연결 안 함, 여러 Pinky 대비)
2. 연결되면 자동으로 `status` 조회 → 현재 WiFi(SSID/IP) 표시
3. **WiFi 스캔** → SSID 선택, 비밀번호 입력
4. **연결** → Pinky 가 `nmcli` 로 접속, IP 잡힐 때까지 대기 후 IP 회신
