import type { NextConfig } from "next";

// Tauri 는 정적 파일을 웹뷰에서 서빙하므로 Next 를 static export 로 빌드한다.
// dev 모드에서는 next dev 서버(localhost:3000)를 그대로 사용한다.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
