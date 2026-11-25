import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loadDashboard, isDemo } from "../services/api";
import type { DashboardPayload } from "../types";
const refreshIntervalMs = 60_000;
const Context = createContext<{
  data: DashboardPayload | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}>({ data: null, loading: true, error: "", refresh: () => {} });
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function update() {
      setLoading(true);
      try {
        const payload = await loadDashboard(controller.signal);
        if (!controller.signal.aborted) {
          setData(payload);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Dashboard refresh failed.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (!isDemo) timer = window.setTimeout(update, refreshIntervalMs);
        }
      }
    }
    void update();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [revision]);
  return (
    <Context.Provider
      value={{ data, loading, error, refresh: () => setRevision((r) => r + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useData = () => useContext(Context);
export { isDemo };
