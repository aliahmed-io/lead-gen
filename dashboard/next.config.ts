import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        /node_modules/,
        path.resolve(process.cwd(), '../settings.json'),
        path.resolve(process.cwd(), '../templates.json'),
        path.resolve(process.cwd(), '../campaign_db.json'),
        path.resolve(process.cwd(), '../leads_db.json'),
        path.resolve(process.cwd(), '../campaign_state.json'),
        path.resolve(process.cwd(), '../inbox_db.json'),
        path.resolve(process.cwd(), '../inbox_db.json.tmp'),
        path.resolve(process.cwd(), '../leads_db.json.tmp'),
        path.resolve(process.cwd(), '../audit.log'),
      ],
    };
    return config;
  },
};

export default nextConfig;
