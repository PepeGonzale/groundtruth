import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default config;
