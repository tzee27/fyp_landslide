import WatercolorCanvas from "./WatercolorCanvas";
import { Component, type ReactNode } from "react";
import { useData } from "../app/DataProvider";
export function PageHeader({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <WatercolorCanvas compact />
      <div>
        <span className="eyebrow">
          {number} / NOTES FROM THE MALAYSIAN LANDSCAPE
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function DemoNote({ children }: { children?: ReactNode }) {
  return (
    <div className="demo-note">
      <span className="status-dot" />{" "}
      <span>
        {children ??
          "Demonstration dataset. No live observations or trained model predictions."}
      </span>
    </div>
  );
}
export function DataGate({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useData();
  if (data)
    return (
      <>
        {error && <p className="demo-note" role="status">Refresh failed. Showing the last loaded data.</p>}
        {children}
      </>
    );
  if (loading)
    return (
      <div className="skeleton" role="status">
        Loading dashboard data…
      </div>
    );
  if (error)
    return (
      <div className="empty" role="alert">
        <h2>Data could not be loaded</h2>
        <p>{error}</p>
        <button onClick={refresh}>Try again</button>
      </div>
    );
  return children;
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>Something interrupted this view.</h1>
        <p>Your source files are safe. Reload to try again.</p>
        <button onClick={() => location.reload()}>Reload dashboard</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="eyebrow">NOT CONNECTED</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
