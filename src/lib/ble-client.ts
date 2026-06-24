// Pinky BLE 클라이언트 로직.
// 실제 BLE 입출력은 tauri-plugin-blec(btleplug, Rust) 이 담당하고,
// 여기서는 프로토콜(프레이밍 + 요청/응답 매칭)만 다룬다.
// ble_gui.py 의 _send / 스캔 / 연결 / notify 조립 로직을 그대로 옮긴 것.

import {
  startScan,
  stopScan,
  connect as blecConnect,
  disconnect as blecDisconnect,
  send as blecSend,
  subscribe as blecSubscribe,
  type BleDevice,
} from "@mnlphlp/plugin-blec";

import {
  RX_CHAR_UUID,
  TX_CHAR_UUID,
  DEVICE_NAME_PREFIX,
  SERVICE_UUID,
  MFD_COMPANY_ID,
} from "./ble-constants";
import { MessageAssembler, encodeMessage, chunkBytes } from "./ble-protocol";

// 이 이벤트가 오면 "그 명령의 최종 응답" 으로 보고 대기를 끝낸다.
const TERMINAL_EVENTS = new Set([
  "pong",
  "scan_result",
  "status",
  "connect_result",
  "domain_result",
  "error",
]);

export type BleEvent = Record<string, unknown> & { event?: string };
export type Command = { cmd: string; [k: string]: unknown };
export type DeviceInfo = { id: string; name: string };

type Pending = {
  cmd: string;
  resolve: (evt: BleEvent | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type Callbacks = {
  onLog?: (line: string) => void;
  onEvent?: (evt: BleEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
};

export class PinkyClient {
  private assembler = new MessageAssembler();
  private pending: Pending | null = null;
  private subscribed = false;
  private cb: Callbacks;

  constructor(cb: Callbacks = {}) {
    this.cb = cb;
  }

  private log(line: string) {
    this.cb.onLog?.(line);
  }

  // ---- 스캔: pinky_* 기기만 골라 반환 (자동 연결 안 함) ----
  // blec 의 startScan 은 곧바로 resolve 되고, 발견된 기기는 콜백으로 스트리밍된다.
  // 여러 대를 안정적으로 잡기 위해, "Pinky 개수가 일정 시간(STABLE_MS) 동안
  // 안 늘어나면" 종료한다. (못 찾으면 timeout 까지, 한 대면 금방 끝남)
  async scanPinky(timeoutMs = 10000): Promise<DeviceInfo[]> {
    // 이전 스캔이 어정쩡하게 남아 있으면 정리 (어댑터 점유로 인한 누락 방지)
    try {
      await stopScan();
    } catch {
      // 안 돌고 있었으면 무시
    }

    // 기기를 찾은 뒤 "더 안 늘어나면" 종료하는 안정화 대기.
    // 짧을수록 스캔이 빨리 끝난다(보통 1대라 즉시 끝남). 여러 대를 놓치지 않을
    // 최소선으로 1초. POLL 도 촘촘히 해서 안정 판정 즉시 반환.
    const STABLE_MS = 1000; // 새 Pinky 가 이 시간 동안 안 나타나면 종료
    const POLL_MS = 200;

    // 광고된 manufacturer data(회사ID 0xFFFF)에 실린 기기 이름을 디코드한다.
    //   BlueZ 는 LocalName 을 "스캔 응답"에만 넣어 macOS 가 못 받는 경우가 있다.
    //   서버는 같은 이름을 "기본 광고 패킷"의 manufacturer data 로도 보내므로,
    //   맥에서도 첫 발견에 진짜 이름(pinky_xxxx)을 얻을 수 있다.
    const mfdName = (d: BleDevice): string | null => {
      const raw = d.manufacturerData?.[MFD_COMPANY_ID] as
        | ArrayLike<number>
        | undefined;
      if (!raw || raw.length === 0) return null;
      let s = "";
      for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
      return s.startsWith(DEVICE_NAME_PREFIX) ? s : null;
    };

    // 표시 이름: 광고 이름(pinky_*) > manufacturer data 이름 > 주소 일부 폴백.
    const svc = SERVICE_UUID.toLowerCase();
    const displayName = (d: BleDevice) =>
      (d.name && d.name.startsWith(DEVICE_NAME_PREFIX) && d.name) ||
      mfdName(d) ||
      `Pinky (${d.address.slice(-5)})`;

    // Pinky 판별: 이름(pinky_*) | 서비스 UUID(0xa000) | manufacturer data 이름.
    //   서비스 UUID 와 manufacturer data 는 둘 다 "기본 광고 패킷"에 있어 맥도 첫 발견에 받음.
    const isPinky = (d: BleDevice) =>
      (!!d.name && d.name.startsWith(DEVICE_NAME_PREFIX)) ||
      (Array.isArray(d.services) &&
        d.services.some((u) => u?.toLowerCase() === svc)) ||
      mfdName(d) !== null;

    // blec 은 매 주기(200ms)마다 현재까지 발견된 전체 목록을 콜백으로 보낸다.
    // 주소 기준으로 누적/갱신하면 여러 대도, 뒤늦게 채워진 이름/속성도 반영된다.
    const acc = new Map<string, BleDevice>();
    const countPinky = () => [...acc.values()].filter(isPinky).length;

    // 스캔 1회 패스: startScan 후, 새 Pinky 가 STABLE_MS 동안 안 늘면 종료.
    const runPass = async (passTimeout: number) => {
      await startScan((devices: BleDevice[]) => {
        for (const d of devices) acc.set(d.address, d);
      }, passTimeout);

      const startedAt = Date.now();
      let lastCount = -1;
      let lastChangeAt = startedAt;
      await new Promise<void>((resolve) => {
        const iv = setInterval(() => {
          const now = Date.now();
          const c = countPinky();
          if (c !== lastCount) {
            lastCount = c;
            lastChangeAt = now;
          }
          const stable = c > 0 && now - lastChangeAt >= STABLE_MS;
          if (stable || now - startedAt >= passTimeout) {
            clearInterval(iv);
            resolve();
          }
        }, POLL_MS);
      });

      try {
        await stopScan();
      } catch {
        // 이미 끝났으면 무시
      }
    };

    await runPass(timeoutMs);

    // 누적된 것 중 Pinky 만, 이름순 정렬 (Map 이라 이미 주소 기준 중복 제거됨)
    const pinkies = [...acc.values()]
      .filter(isPinky)
      .map((d) => ({ id: d.address, name: displayName(d) }));
    pinkies.sort((a, b) => a.name.localeCompare(b.name));
    return pinkies;
  }

  // 프라미스에 타임아웃을 건다 (blec 가 응답 없이 매달리는 것 방지).
  private withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${what} 시간 초과 (${ms}ms)`)),
        ms,
      );
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  // TX notify 구독. 연결 직후 GATT services-resolved 전이면 한 번에 실패/멈출 수
  // 있어(특히 macOS/CoreBluetooth) 짧게 재시도한다.
  private async subscribeTx(): Promise<void> {
    const delays = [0, 400]; // 즉시 → 0.4s 뒤 1회 재시도
    let lastErr: unknown;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
      try {
        await this.withTimeout(
          blecSubscribe(TX_CHAR_UUID, (data: Uint8Array) => this.onNotify(data)),
          5000,
          "구독",
        );
        return;
      } catch (e) {
        lastErr = e;
        this.log(`구독 재시도 ${i + 1}/${delays.length}...`);
      }
    }
    throw lastErr;
  }

  // ---- 연결 + TX notify 구독 ----
  async connect(id: string): Promise<void> {
    // 단계별 소요시간 계측 + 전체 타임아웃(맥에서 연결이 안 끝나고 무한 대기하는 것 방지).
    const t0 = performance.now();
    try {
      await this.withTimeout(
        blecConnect(id, () => {
          this.log("Pinky 연결이 끊어졌습니다.");
          this.subscribed = false;
          this.cb.onConnectionChange?.(false);
        }),
        12000,
        "연결(링크)",
      );
      const t1 = performance.now();
      await this.subscribeTx();
      const t2 = performance.now();
      this.subscribed = true;
      this.log(
        `연결 소요: 링크 ${Math.round(t1 - t0)}ms + 구독 ${Math.round(t2 - t1)}ms`,
      );
      this.cb.onConnectionChange?.(true);
    } catch (e) {
      // 실패 시 반쯤 열린 링크를 정리 → 다음 시도가 깨끗하게 시작되게 함
      try {
        await blecDisconnect();
      } catch {
        /* 무시 */
      }
      this.subscribed = false;
      this.cb.onConnectionChange?.(false);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await blecDisconnect();
    } finally {
      this.subscribed = false;
    }
  }

  // ---- TX notify 수신 -> 조립 -> 이벤트 처리 ----
  private onNotify(data: Uint8Array) {
    for (const evt of this.assembler.feed(data) as BleEvent[]) {
      this.log(`← ${JSON.stringify(evt)}`);
      this.cb.onEvent?.(evt);
      if (this.pending) {
        const name = evt.event;
        // connect 중간의 status(connecting) 는 종료로 안 봄
        const intermediate =
          this.pending.cmd === "connect" && name === "status";
        if (name && TERMINAL_EVENTS.has(name) && !intermediate) {
          const p = this.pending;
          this.pending = null;
          clearTimeout(p.timer);
          p.resolve(evt);
        }
      }
    }
  }

  // ---- 명령 전송 후 최종 응답 이벤트를 기다려 반환 (실패 시 null) ----
  send(cmd: Command): Promise<BleEvent | null> {
    if (!this.subscribed) {
      // 구독이 끊겼는데 UI 가 아직 "연결됨" 일 수 있다 -> 상태 동기화
      this.log("연결이 끊어졌습니다. 다시 연결하세요.");
      this.cb.onConnectionChange?.(false);
      return Promise.resolve(null);
    }
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(null);
      this.pending = null;
    }

    // connect 는 실제 WiFi 접속까지, scan 은 로봇의 첫 nmcli rescan(콜드 ~15초+)을
    // 기다려야 하므로 타임아웃을 넉넉히 준다. 그 외 명령은 20초.
    const timeout =
      cmd.cmd === "connect" ? 60000 : cmd.cmd === "scan" ? 35000 : 20000;
    this.log(`→ ${JSON.stringify(cmd)}`);

    return new Promise<BleEvent | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending && this.pending.timer === timer) {
          this.pending = null;
          this.log("응답 시간 초과.");
          resolve(null);
        }
      }, timeout);
      this.pending = { cmd: cmd.cmd, resolve, timer };

      // 청크로 잘라 RX 에 순차 write
      (async () => {
        try {
          for (const chunk of chunkBytes(encodeMessage(cmd))) {
            await blecSend(RX_CHAR_UUID, chunk, "withResponse");
          }
        } catch (e) {
          if (this.pending && this.pending.timer === timer) {
            this.pending = null;
            clearTimeout(timer);
            this.log(`전송 오류: ${String(e)}`);
            resolve(null);
          }
        }
      })();
    });
  }
}
