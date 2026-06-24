// ble_common.py 의 상수와 1:1 로 맞춰야 서버(ble_server.py)와 통신됨.

// WiFi/제어용 서비스
export const SERVICE_UUID = "0000a000-0000-1000-8000-00805f9b34fb";

// RX: 앱 -> Pinky (Write). 앱이 명령을 씀.
export const RX_CHAR_UUID = "0000a001-0000-1000-8000-00805f9b34fb";

// TX: Pinky -> 앱 (Notify). Pinky 가 응답/이벤트를 push.
export const TX_CHAR_UUID = "0000a002-0000-1000-8000-00805f9b34fb";

// advertising 이름 접두사. 이 접두사로 기기를 찾음.
// AP 모드 SSID 와 동일한 형식: pinky_<eth0 MAC 뒤4자리>
export const DEVICE_NAME_PREFIX = "pinky_";

// 기기 이름을 manufacturer data(회사ID 0xFFFF) 로도 광고함.
// BlueZ 는 LocalName 을 "스캔 응답"에만 넣는데, macOS 는 그걸 못 받는 경우가 있어
// 목록에 이름이 안 뜬다. manufacturer data 는 "기본 광고 패킷"에 들어가 맥도 첫 발견에 받음.
export const MFD_COMPANY_ID = 0xffff;

// BLE 한 패킷 payload 한계(약 20바이트)에 맞춘 청크 크기.
export const CHUNK_SIZE = 20;
