import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const backend = new URL("../backend/", root);
const windows = process.platform === "win32";
const python = fileURLToPath(new URL(
  windows ? ".venv/Scripts/python.exe" : ".venv/bin/python",
  backend,
));
const dashboardUrl = "http://127.0.0.1:8000/api/dashboard";
let apiProcess;
let viteProcess;
let stopping = false;

async function checkApi() {
  let response;
  try {
    response = await fetch(dashboardUrl, { signal: AbortSignal.timeout(2000) });
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") return false;
    throw new Error("Could not check FastAPI on port 8000. Check the backend terminal.");
  }
  if (!response.ok) {
    throw new Error("Port 8000 responded, but the dashboard API returned HTTP " + response.status + ". Check the backend terminal.");
  }
  const payload = await response.json();
  if (!Array.isArray(payload.incidents) || !Array.isArray(payload.pendingUpdates)) {
    throw new Error("Port 8000 is serving a different or outdated API. Stop that server and run npm.cmd run dev again.");
  }
  return true;
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  viteProcess?.kill();
  if (apiProcess?.pid && windows && apiProcess.exitCode === null) {
    // The Windows virtual-environment launcher starts a child Python process.
    spawn("taskkill.exe", ["/PID", String(apiProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    }).on("error", () => apiProcess.kill());
  } else {
    apiProcess?.kill();
  }
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

try {
  if (!(await checkApi()) && !stopping) {
    if (!existsSync(python)) {
      throw new Error("Set up app/backend/.venv first. See app/IMPLEMENTATION_CHANGELOG.md.");
    }
    apiProcess = spawn(python, ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"], {
      cwd: backend,
      stdio: ["ignore", "inherit", "inherit"],
    });
    apiProcess.on("error", (error) => {
      console.error("FastAPI could not start:", error.message);
      stop(1);
    });
    apiProcess.on("exit", () => {
      if (!stopping) console.error("FastAPI stopped. See the backend log above.");
      stop(1);
    });
    const deadline = Date.now() + 10_000;
    while (!stopping && !(await checkApi())) {
      if (Date.now() >= deadline) throw new Error("FastAPI did not become ready on port 8000.");
      await delay(200);
    }
  } else if (!stopping) console.log("Using the running dashboard API on port 8000.");
  if (!stopping) {
    viteProcess = spawn(process.execPath, [
      fileURLToPath(new URL("node_modules/vite/bin/vite.js", root)),
      "--host", "127.0.0.1", ...process.argv.slice(2),
    ], { cwd: root, stdio: "inherit" });
    viteProcess.on("error", (error) => {
      console.error("Vite could not start:", error.message);
      stop(1);
    });
    viteProcess.on("exit", (code) => stop(code ?? 1));
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
