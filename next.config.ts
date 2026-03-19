import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 允许从局域网 IP 访问 Next.js dev（避免 HMR 等开发资源被跨域拦截）
  allowedDevOrigins: ["192.168.1.10"],
};

export default nextConfig;
