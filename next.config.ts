import type { NextConfig } from "next";
import os from "os";

function getAllowedDevOrigins() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  // Test servers must not contend with a developer's active .next directory.
  distDir: process.env.ATG_NEXT_DIST_DIR || ".next"
};

export default nextConfig;
