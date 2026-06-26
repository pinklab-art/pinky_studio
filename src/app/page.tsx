"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PinkyClient,
  type DeviceInfo,
  type BleEvent,
} from "@/lib/ble-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";

type WifiNet = { ssid: string; signal: string; security: string };

export default function Page() {
  const clientRef = useRef<PinkyClient | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedAddr, setSelectedAddr] = useState("");
  // 마지막으로 연결했던 기기. 연결했다 끊으면 BLE 스택 캐시 때문에 재스캔에 다시
  // 안 잡히는 경우가 있어, 목록에 남겨 재선택/재연결이 가능하게 한다.
  const [lastDevice, setLastDevice] = useState<DeviceInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scanningDev, setScanningDev] = useState(false);
  const [currentWifi, setCurrentWifi] = useState("현재 WiFi: (연결 후 표시)");
  // 로봇이 받은 WiFi IP. 있으면 Jupyter(IP:8888) 링크를 띄운다.
  const [currentIp, setCurrentIp] = useState<string | null>(null);

  const [networks, setNetworks] = useState<WifiNet[]>([]);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("—");

  const [domainId, setDomainId] = useState("");
  const [currentDomain, setCurrentDomain] = useState("현재 도메인: (연결 후 표시)");

  const [tab, setTab] = useState<"wifi" | "ros2">("wifi");

  const log = useCallback((line: string) => {
    setLogLines((prev) => [...prev, line].slice(-300));
  }, []);

  // 로그 추가될 때마다 맨 아래로 자동 스크롤
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines]);

  useEffect(() => {
    clientRef.current = new PinkyClient({
      onLog: log,
      onConnectionChange: (c) => {
        setConnected(c);
        if (!c) {
          setConnecting(false); // 끊기면 "연결 중" 도 풀어 버튼이 잠기지 않게
          setCurrentWifi("현재 WiFi: (연결 후 표시)");
          setCurrentIp(null);
          setCurrentDomain("현재 도메인: (연결 후 표시)");
        }
      },
    });
  }, [log]);

  const client = () => clientRef.current!;

  // ---- 1. Pinky 검색 / 연결 ----
  const onScanPinky = async () => {
    // 연결된 상태에서는 검색을 막는다(버튼은 비활성처럼 흐리게 표시).
    // 그래도 누르면 해제 안내만 로그로 띄운다(네이티브 disabled 면 클릭이 안 잡혀
    // 안내를 못 주므로, 연결 상태에선 클릭을 받아 여기서 처리한다).
    if (connected) {
      log("연결된 상태입니다. 먼저 [연결 해제] 후 다시 검색하세요.");
      return;
    }
    setScanningDev(true);
    setSelectedAddr("");
    log("'pinky_*' 스캔 중...");
    try {
      const found = await client().scanPinky(8000);
      // 직전 연결 기기가 스캔에 안 잡히면(끊은 직후 캐시 이슈) 목록에 남겨
      // 재선택→재연결이 가능하게 한다. btleplug 가 이미 아는 기기라 주소로 재연결됨.
      const list =
        lastDevice && !found.some((d) => d.id === lastDevice.id)
          ? [...found, lastDevice]
          : found;
      setDevices(list);
      if (found.length) {
        log(`Pinky ${found.length}개 발견. 목록에서 선택 후 [연결].`);
      } else if (list.length) {
        log("스캔엔 안 잡혔지만 직전 연결 기기를 목록에 유지합니다.");
      } else {
        log("Pinky를 못 찾음. 로봇 전원과 BLE 서버가 켜져 있는지 확인하세요.");
      }
    } catch (e) {
      log(`검색 오류: ${String(e)}`);
      setResult(`❌ 검색 오류: ${String(e)}`);
    } finally {
      setScanningDev(false);
    }
  };

  const onConnectPinky = async () => {
    if (!selectedAddr) {
      log("먼저 [Pinky 검색] 후 목록에서 선택하세요.");
      return;
    }
    setConnecting(true);
    const dev = devices.find((d) => d.id === selectedAddr);
    if (dev) setLastDevice(dev); // 끊은 뒤 재스캔에 안 잡혀도 재연결할 수 있게 기억
    log(`연결 시도: ${dev?.name ?? ""} [${selectedAddr}]`);
    try {
      await client().connect(selectedAddr);
      log("연결 완료.");
    } catch (e) {
      log(`연결 오류: ${String(e)}`);
      setConnecting(false);
      return;
    }
    setConnecting(false);
    // IP/WiFi 상태 조회는 연결과 분리 — 느려도 연결 UX 는 즉시 끝남.
    // (실패하면 연결 카드의 [재조회] 버튼으로 다시 시도)
    setCurrentWifi("현재 WiFi: 조회 중...");
    log("현재 WiFi 상태 조회 중...");
    refreshStatus().catch((e) => log(`상태 조회 오류: ${String(e)}`));
  };

  const onDisconnectPinky = async () => {
    try {
      await client().disconnect();
      log("연결을 해제했습니다.");
    } catch (e) {
      log(`해제 오류: ${String(e)}`);
    }
  };

  // ---- 2. WiFi ----
  const onScanWifi = async () => {
    setBusy(true);
    try {
      const evt = await client().send({ cmd: "scan" });
      if (!evt || evt.event !== "scan_result") return;
      const nets = (evt.networks as WifiNet[]) ?? [];
      setNetworks(nets);
      log(`WiFi ${nets.length}개 발견`);
    } finally {
      setBusy(false);
    }
  };

  const onConnectWifi = async () => {
    if (!ssid.trim()) {
      log("SSID를 입력/선택하세요.");
      return;
    }
    setBusy(true);
    setResult("연결 중...");
    try {
      const cmd: Record<string, unknown> = { cmd: "connect", ssid: ssid.trim() };
      if (password) cmd.psk = password;
      const evt = await client().send(cmd as { cmd: string });
      if (!evt) {
        setResult("응답 없음 (시간 초과)");
        return;
      }
      if (evt.event === "connect_result" && evt.ok) {
        setResult(`✅ 연결 성공\nIP: ${evt.ip}`);
        const ip = evt.ip as string | null;
        if (ip && ip !== "-") setCurrentIp(ip);
        await refreshStatus();
      } else {
        setResult(`❌ 실패: ${evt.message ?? ""}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async (): Promise<BleEvent | null> => {
    const evt = await client().send({ cmd: "status" });
    if (!evt || evt.event !== "status") {
      setCurrentWifi("현재 WiFi: 조회 실패");
      return null;
    }
    const state = evt.state as string;
    const s = evt.ssid as string | null;
    const ip = evt.ip as string | null;
    if (state === "connected" && s) {
      setCurrentWifi(`현재 WiFi: ${s}  (IP: ${ip})`);
      setCurrentIp(ip && ip !== "-" ? ip : null);
    } else {
      setCurrentWifi(`현재 WiFi: 미연결 (state=${state})`);
      setCurrentIp(null);
    }
    // 현재 ROS_DOMAIN_ID 표시 + 입력칸 프리필
    const d = evt.domain_id;
    if (d === null || d === undefined) {
      setCurrentDomain("현재 도메인: 설정 안 됨");
    } else {
      setCurrentDomain(`현재 도메인: ${d}`);
    }
    return evt;
  };

  const onStatus = async () => {
    setBusy(true);
    try {
      const evt = await refreshStatus();
      if (evt) {
        setResult(
          `state: ${evt.state}\nssid: ${evt.ssid}\nIP: ${evt.ip}`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- 3. ROS2 도메인 ----
  const onSetDomain = async () => {
    const n = Number(domainId);
    if (!Number.isInteger(n) || n < 0 || n > 232) {
      log("ROS_DOMAIN_ID는 0~232 사이 정수여야 합니다.");
      setResult("❌ ROS_DOMAIN_ID 범위 오류 (0~232)");
      return;
    }
    setBusy(true);
    setResult(`ROS_DOMAIN_ID=${n} 설정 중...`);
    try {
      const evt = await client().send({ cmd: "set_domain", domain_id: n });
      if (!evt) {
        setResult("응답 없음 (시간 초과)");
        return;
      }
      if (evt.event === "domain_result" && evt.ok) {
        setResult(`✅ ROS_DOMAIN_ID=${evt.domain_id} 설정됨\n${evt.message ?? ""}`);
        setCurrentDomain(`현재 도메인: ${evt.domain_id}`);
      } else {
        setResult(`❌ 실패: ${evt.message ?? ""}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // WiFi IP 가 아직 없으면(미할당) 로봇 AP 기본 주소로 접속.
  const jupyterIp = currentIp ?? "192.168.4.1";
  // AP 안내에 띄울 SSID — BLE 연결 중일 때만 연결된 기기명을 쓰고,
  // 해제 상태면 일반 표기(pinky_*)로 되돌린다.
  const apSsid = (connected && lastDevice?.name) || "pinky_*";

  // 로봇 Jupyter(8888) 를 기본 브라우저로 연다.
  const openJupyter = async () => {
    const url = `http://${jupyterIp}:8888`;
    log(`Jupyter 열기: ${url}`);
    try {
      await openUrl(url);
    } catch (e) {
      log(`Jupyter 열기 실패: ${String(e)}`);
    }
  };

  const canUseWifi = connected && !busy;

  return (
    <main className="mx-auto flex h-screen max-w-xl flex-col gap-4 overflow-hidden p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Pinky WiFi 설정 (BLE)</h1>
        <Badge variant={connected ? "success" : "secondary"}>
          {connected ? "연결됨" : "미연결"}
        </Badge>
      </header>

      {/* 1. Pinky 연결 */}
      <Card>
        <CardHeader>
          <CardTitle>Pinky 연결</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onScanPinky}
              disabled={scanningDev || connecting}
              className={connected ? "opacity-50" : undefined}
            >
              {scanningDev ? "검색 중..." : "Pinky 검색"}
            </Button>
            <select
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedAddr}
              onChange={(e) => setSelectedAddr(e.target.value)}
              disabled={connected || connecting}
            >
              <option value="">
                {devices.length === 0 ? "(검색된 기기 없음)" : "(기기 선택)"}
              </option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onConnectPinky} disabled={connecting || connected}>
              {connecting ? "연결 중..." : "연결"}
            </Button>
            <Button
              variant="outline"
              onClick={onDisconnectPinky}
              disabled={!connected}
            >
              연결 해제
            </Button>
          </div>
          <p className="text-sm font-semibold text-emerald-600">{currentWifi}</p>
        </CardContent>
      </Card>

      {/* Jupyter 접속 — BLE 연결과 무관하게 항상 노출. WiFi 연결 시 실제 IP,
          미연결 시 로봇 AP 기본 주소(192.168.4.1) 로 접속. */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Jupyter 접속</p>
            <p className="truncate text-xs text-muted-foreground">
              {currentIp
                ? `${jupyterIp}:8888`
                : `${jupyterIp}:8888 · 로봇 AP(${apSsid}) 연결 필요`}
            </p>
          </div>
          <Button onClick={openJupyter} className="shrink-0" title={`http://${jupyterIp}:8888`}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
            열기
          </Button>
        </CardContent>
      </Card>

      {/* 2. 설정 (탭: WiFi / ROS2) */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          {/* 탭 바 */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setTab("wifi")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-sm font-medium transition",
                tab === "wifi"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              WiFi 설정
            </button>
            <button
              type="button"
              onClick={() => setTab("ros2")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-sm font-medium transition",
                tab === "ros2"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              ROS2 Domain 설정
            </button>
          </div>

          {/* 탭 콘텐츠 (높이 고정 + 세로 가운데 정렬 -> 빈 공간 분산) */}
          <div className="flex min-h-[188px] flex-col justify-center">
          {/* WiFi 탭 */}
          {tab === "wifi" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ssid">SSID</Label>
                <div className="flex gap-2">
                  <Input
                    id="ssid"
                    list="ssid-list"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    placeholder="SSID 입력 또는 스캔 후 선택"
                    disabled={!connected}
                  />
                  <datalist id="ssid-list">
                    {networks.map((n) => (
                      <option key={n.ssid} value={n.ssid}>
                        {n.signal} · {n.security}
                      </option>
                    ))}
                  </datalist>
                  <Button
                    variant="secondary"
                    onClick={onScanWifi}
                    disabled={!canUseWifi}
                  >
                    WiFi 스캔
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pw">비밀번호</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="pw"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 (오픈망이면 비워두기)"
                    disabled={!connected}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
                    title={showPw ? "숨기기" : "표시"}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {showPw ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" x2="22" y1="2" y2="22" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={onConnectWifi} disabled={!canUseWifi}>
                  연결
                </Button>
                <Button variant="outline" onClick={onStatus} disabled={!canUseWifi}>
                  상태 확인
                </Button>
              </div>
            </div>
          )}

          {/* ROS2 탭 */}
          {tab === "ros2" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-emerald-600">
                {currentDomain}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="domain">ROS_DOMAIN_ID (0~232)</Label>
                <div className="flex gap-2">
                  <Input
                    id="domain"
                    type="number"
                    min={0}
                    max={232}
                    value={domainId}
                    onChange={(e) => setDomainId(e.target.value)}
                    placeholder="예: 30"
                    disabled={!connected}
                  />
                  <Button onClick={onSetDomain} disabled={!canUseWifi}>
                    적용
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                설정 후 새 터미널을 열거나 <code>source ~/.bashrc</code> 를 실행하세요.
              </p>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {/* 결과 (항상 표시, 작게) */}
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <span className="text-xs font-semibold text-muted-foreground">결과</span>
        <pre className="mt-1 whitespace-pre-wrap text-sm">{result}</pre>
      </div>

      {/* 로그 */}
      <div
        ref={logRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-muted-foreground",
        )}
      >
        {logLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </main>
  );
}
