import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pinky Studio",
  description: "데스크탑에서 BLE 로 Pinky 의 WiFi 를 설정합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
