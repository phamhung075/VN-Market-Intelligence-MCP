import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
    tsconfigPaths(),
  ],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./app/__tests__/setup.ts"],
    include: [
      "./app/__tests__/**/*.test.{ts,tsx}",
      "./app/domain/formatters/**/*.test.{ts,tsx}",
      "./app/lib/view-models/**/*.test.{ts,tsx}",
    ],
  },
});
