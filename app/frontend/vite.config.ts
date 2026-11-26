import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const backend: ProxyOptions = {
  target: "http://127.0.0.1:8000",
  configure(proxy) {
    proxy.on("error", (_error, _request, response) => {
      if (response && "writeHead" in response && !response.headersSent && !response.writableEnded) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ detail: "FastAPI is unreachable on port 8000. Start both services with npm.cmd run dev." }));
      }
    });
  },
};
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": backend, "/health": backend },
  },
});
