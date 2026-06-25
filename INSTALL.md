# Pinky Studio — 설치 가이드 (Linux · macOS · Windows)

Pinky 로봇에 BLE 로 WiFi 를 설정해 주는 데스크탑 앱.

설치 방법은 두 가지다:
- **[A. Release 다운로드 → 실행](#a-설치-release-다운로드--실행)** — 빌드해 둔 파일을 받아 쓰는, 보통의 설치 방법.
- **[B. 소스에서 직접 빌드](#b-소스에서-직접-빌드-개발자)** — 코드를 고치거나 새 릴리스를 만드는 개발자용.

> 스캔/연결이 느리거나 에러가 나면 → [`../pinky_ble/TROUBLESHOOTING.md`](../pinky_ble/TROUBLESHOOTING.md)
> (대부분 클라이언트가 아니라 **로봇 광고 주기** 설정 문제다.)

---

## A. 설치 (Release 다운로드 → 실행)

GitHub Releases 페이지에서 **내 OS 에 맞는 파일**을 받아 실행하면 된다. 따로 빌드 도구
(Node·Rust 등) 설치가 필요 없다.

> **Releases:** https://github.com/pinklab-art/pinky_studio/releases
> (레포 주소가 다르면 해당 저장소의 Releases 페이지로. 파일명의 버전(`0.1.0`)·아키텍처는
> 릴리스마다 다를 수 있다.)

최신 릴리스의 **Assets** 에서 아래 표대로 고른다:

| OS | 받을 파일 | 비고 |
|---|---|---|
| Linux | `Pinky Studio_*_amd64.AppImage` (또는 `.deb`) | AppImage = 설치 없이 실행 |
| macOS (Apple Silicon) | `Pinky Studio_*_aarch64.dmg` | M1 이상 |
| macOS (Intel) | `Pinky Studio_*_x64.dmg` | 또는 `*_universal.dmg` 공용 |
| Windows | `Pinky Studio_*_x64-setup.exe` (또는 `.msi`) | 설치 마법사 |

### A-1. Linux
**AppImage (권장, 설치 불필요):**
```bash
chmod +x "Pinky Studio_0.1.0_amd64.AppImage"
./"Pinky Studio_0.1.0_amd64.AppImage"
```
- `libfuse.so.2` 없다고 뜨면: `sudo apt install libfuse2t64` (구버전은 `libfuse2`),
  또는 FUSE 없이 실행: `./"Pinky Studio_..._amd64.AppImage" --appimage-extract-and-run`

**deb 패키지로 설치:**
```bash
sudo apt install ./"Pinky Studio_0.1.0_amd64.deb"
# 실행: 앱 메뉴의 "Pinky Studio" 또는 터미널에서 pinky-studio
```

**BLE 요건:** bluetooth 서비스 active(`systemctl status bluetooth`), 어댑터 켜짐
(`bluetoothctl power on`). 로봇과 페어링 불필요.

### A-2. macOS
1. 받은 `.dmg` 더블클릭 → **Pinky Studio** 을 `Applications` 폴더로 드래그.
2. 첫 실행 때 **"확인되지 않은 개발자"** 경고가 뜨면(서명 안 한 빌드):
   - 앱을 **우클릭 → 열기 → 열기** (한 번만 하면 이후엔 그냥 열림), 또는
   - 터미널: `xattr -cr "/Applications/Pinky Studio.app"`
3. 첫 BLE 사용 시 **블루투스 권한 요청 → 허용**.
   (시스템 설정 → 개인정보 보호 및 보안 → Bluetooth 에서 변경 가능)

### A-3. Windows
1. 받은 `*-setup.exe`(NSIS) 또는 `.msi` 실행 → 설치 마법사 진행.
2. SmartScreen("Windows 의 PC 보호") 경고 시 → **추가 정보 → 실행**.
3. 실행 후 블루투스 권한을 물으면 허용.

**요건:** Windows 10 1809+ (BLE 는 WinRT), 블루투스 켜짐, WebView2(대부분 기본 탑재).

---

## B. 소스에서 직접 빌드 (개발자)

> Tauri 는 네이티브 빌드라 **그 OS 위에서 직접 빌드**해야 한다. 빌드 명령
> (`npm run tauri build`)은 세 OS 동일하고, 차이는 사전 준비물과 산출물 형식뿐.
> 이렇게 만든 산출물을 GitHub Release 의 Assets 로 올리면 위 A 의 다운로드 대상이 된다.

### 공통 사전 준비
- **Node.js LTS 20+** — https://nodejs.org
- **Rust (rustup)** — https://rustup.rs
- 프로젝트 가져오기: `git clone` (또는 폴더 복사 시 `node_modules/`, `.next/`, `out/`,
  `src-tauri/target/` 제외) 후 `npm install`

빌드/개발:
```bash
npm run tauri build      # 릴리스 번들 생성
npm run tauri dev        # 개발 모드(핫리로드)
```

### Linux 빌드
사전 설치(Debian/Ubuntu):
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev librsvg2-dev libgtk-3-dev \
  libayatana-appindicator3-dev \
  bluez libdbus-1-dev pkg-config
```
```bash
npm install && npm run tauri build
```
산출물:
```
src-tauri/target/release/bundle/appimage/Pinky Studio_0.1.0_amd64.AppImage
src-tauri/target/release/bundle/deb/Pinky Studio_0.1.0_amd64.deb
src-tauri/target/release/bundle/rpm/Pinky Studio-0.1.0-1.x86_64.rpm
```

### macOS 빌드
사전 설치: Node, Rust, `xcode-select --install`
```bash
npm install && npm run tauri build
```
산출물:
```
src-tauri/target/release/bundle/dmg/Pinky Studio_0.1.0_aarch64.dmg
src-tauri/target/release/bundle/macos/Pinky Studio.app
```
유니버설(Intel+Apple Silicon):
```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```
코드사이닝/공증: 서명 안 하면 사용자 첫 실행에 경고(위 A-2 회피법). 정식 배포는
Apple Developer 계정($99/년)으로 `APPLE_CERTIFICATE`/`APPLE_ID`/`APPLE_PASSWORD` 설정 후 빌드.
> macOS BLE 권한 키는 이미 설정됨(`src-tauri/Info.plist` 의
> `NSBluetoothAlwaysUsageDescription` 등).

### Windows 빌드
사전 설치: Node, Rust(MSVC), **Microsoft C++ Build Tools**("Desktop development with C++"),
WebView2.
```powershell
npm install
npm run tauri build
```
산출물:
```
src-tauri\target\release\bundle\msi\Pinky Studio_0.1.0_x64_en-US.msi
src-tauri\target\release\bundle\nsis\Pinky Studio_0.1.0_x64-setup.exe
```

---

## BLE 요구사항 요약

| OS | 백엔드 | 최소 요건 | 권한 |
|---|---|---|---|
| Linux | BlueZ (D-Bus) | bluetooth 서비스 active, 어댑터 power on | 페어링 불필요 |
| macOS | CoreBluetooth | — | 첫 사용 시 블루투스 권한 허용(키 설정됨) |
| Windows | WinRT | Windows 10 1809+ | 실행 시 권한 허용 |

세 OS 모두 **로봇과 사전 페어링 불필요** — 앱에서 검색 → 연결만 하면 된다.

---

## 빌드 산출물 / 다운로드 형식 요약

| OS | 빌드 명령 | 산출물 = Release 다운로드 형식 |
|---|---|---|
| Linux | `npm run tauri build` | `.AppImage`, `.deb`, `.rpm` |
| macOS | `npm run tauri build` | `.dmg`, `.app` |
| Windows | `npm run tauri build` | `.msi`, `.exe`(setup) |

---

## 문제 해결
스캔이 안 잡히거나(`여러 번 눌러야` / `2대 중 1대만`), 연결 에러
(`Not Connected` / `ATT error 0x0e` / `not available`)가 나면
→ [`../pinky_ble/TROUBLESHOOTING.md`](../pinky_ble/TROUBLESHOOTING.md).
