import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loadDashboard, isDemo } from "../services/api";
import type { DashboardPayload } from "../types";
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
    setLoading(true);
    setError("");
    loadDashboard(controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
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
