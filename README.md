# Pinky Studio

BLE로 Pinky(라즈베리파이5)에 연결해 WiFi를 설정하는 데스크탑 앱.

## 기술 스택

- **Tauri 2** (Rust) — 네이티브 창 + 시스템 웹뷰
- **Next.js 16 + React 19** — 정적 export
- **Tailwind CSS 4** + shadcn 스타일 컴포넌트
- **BLE**: `tauri-plugin-blec` (btleplug) — Windows / Ubuntu 동일 코드

## 사전 준비

1. **Rust 설치** (Tauri 필수)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```
2. **Linux 시스템 의존성** (Ubuntu)
   ```bash
   sudo apt update
   sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
     libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
     libdbus-1-dev bluez
   ```

## 개발

```bash
npm install
npm run tauri dev
```

## 빌드

빌드 전 아이콘 생성(최초 1회):
```bash
npm run tauri icon path/to/logo.png   # 1024x1024 권장
```
빌드:
```bash
npm run tauri build
```
- Ubuntu: `.deb` / `.AppImage`
- Windows: `.msi` / `.exe`

결과물은 `src-tauri/target/release/bundle/` 에 생성됩니다.

## 사용법

1. **Pinky 검색** → 목록에서 선택 → **연결**
2. 연결되면 자동으로 현재 WiFi(SSID/IP) 표시
3. **WiFi 스캔** → SSID 선택, 비밀번호 입력
4. **연결** → Pinky가 해당 WiFi에 접속 후 IP 회신
