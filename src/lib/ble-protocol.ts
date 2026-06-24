// ble_common.py 의 메시지 프레이밍을 TypeScript 로 포팅한 것.
//
//  BLE 한 패킷(notify/write)은 MTU 제한(payload ~20바이트)에 걸리므로,
//  JSON 한 덩어리를 20바이트씩 잘라 보내고(받는 쪽은) 종료문자 '\n' 이 나올
//  때까지 모아서 한 메시지로 조립한다.
//  JSON.stringify 결과에는 raw '\n' 이 없으므로(문자열 내 개행은 \\n escape)
//  '\n' 을 구분자로 안전하게 쓸 수 있다.

import { CHUNK_SIZE } from "./ble-constants";

const TERMINATOR = 0x0a; // '\n'
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 객체 -> 전송용 bytes (UTF-8 JSON + 종료문자). */
export function encodeMessage(obj: unknown): Uint8Array {
  const body = encoder.encode(JSON.stringify(obj));
  const out = new Uint8Array(body.length + 1);
  out.set(body, 0);
  out[body.length] = TERMINATOR;
  return out;
}

/** bytes 를 size 바이트씩 잘라 배열로 반환. */
export function chunkBytes(data: Uint8Array, size: number = CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  return chunks;
}

/** 수신 청크를 모아 완성된 메시지(객체)들을 뽑아내는 조립기. */
export class MessageAssembler {
  private buf: number[] = [];

  /** 청크를 넣고, 완성된 메시지 객체들의 배열을 반환. */
  feed(data: Uint8Array): Record<string, unknown>[] {
    for (const b of data) this.buf.push(b);
    const out: Record<string, unknown>[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf(TERMINATOR)) !== -1) {
      const rawBytes = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      // 멀티바이트 UTF-8 이 청크 경계에서 쪼개져도, 여기서 바이트를 다시
      // 이어붙인 뒤 디코딩하므로 안전하다.
      const raw = decoder.decode(new Uint8Array(rawBytes)).trim();
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw));
      } catch {
        // 깨진 프레임은 무시
      }
    }
    return out;
  }
}
