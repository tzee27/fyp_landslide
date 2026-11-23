import { useReducedMotion } from "../hooks/useReducedMotion";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Cell,
} from "recharts";
import { PageHeader, DemoNote } from "../components/Common";
import { timeSeries, places } from "../mocks/data";
const factorData: Record<string, { name: string; value: number }[]> = {
  Terrain: [
    { name: "0–10°", value: 14 },
    { name: "10–20°", value: 28 },
    { name: "20–30°", value: 35 },
    { name: "30–40°", value: 18 },
    { name: "40°+", value: 5 },
  ],
  Soil: [
    { name: "Clay", value: 36 },
    { name: "Sand", value: 42 },
    { name: "Silt", value: 22 },
  ],
  "Land cover": [
    { name: "Forest", value: 58 },
    { name: "Cropland", value: 18 },
    { name: "Built-up", value: 14 },
    { name: "Other", value: 10 },
  ],
  Infrastructure: [
    { name: "< 100 m", value: 22 },
    { name: "100–500 m", value: 34 },
    { name: "500–1,000 m", value: 28 },
    { name: "> 1,000 m", value: 16 },
  ],
};
export default function Analytics() {
  const reduced = useReducedMotion();
  const [location, setLocation] = useState(places[1].name),
    [period, setPeriod] = useState("14"),
    [factor, setFactor] = useState("Rainfall");
  const data = useMemo(
    () => timeSeries(location).slice(-Number(period)),
    [location, period],
  );
  const total = data.reduce((a, p) => a + p.rainfall, 0);
  const distributions = factorData[factor]?.map((d, i) => ({
    ...d,
    value: location.includes("Sabah")
      ? d.value + (i === 0 ? 4 : i === 1 ? -4 : 0)
      : d.value,
  }));
  return (
    <div className="page">
      <PageHeader
        number="03"
        title="Environmental Analytics"
        description="Read the conditions behind the landscape, one factor at a time."
      />
      <DemoNote>
        All charts use synthetic samples for interaction testing. They describe
        no observed Malaysian conditions.
      </DemoNote>
      <div className="filterbar">
        <label>
          Study location
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {places.slice(1).map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Sample window
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="14">18–31 Oct 2026 · 14 days</option>
            <option value="7">25–31 Oct 2026 · 7 days</option>
          </select>
        </label>
        <label>
          Environmental factor
          <select value={factor} onChange={(e) => setFactor(e.target.value)}>
            {["Rainfall", "Soil moisture", ...Object.keys(factorData)].map(
              (f) => (
                <option key={f}>{f}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="analytics-grid">
        <section className="chart-panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">
                SYNTHETIC SAMPLE / {location.toUpperCase()}
              </span>
              <h2>
                {factor === "Rainfall"
                  ? "When rainfall accumulates"
                  : factor === "Soil moisture"
                    ? "Moisture through time"
                    : factor + " composition"}
              </h2>
            </div>
            <span className="tag">Demo</span>
          </div>
          <div className="chart-area" key={factor + location + period}>
            <ResponsiveContainer width="100%" height="100%">
              {distributions ? (
                <BarChart
                  data={distributions}
                  margin={{ left: 0, right: 16, bottom: 16 }}
                >
                  <CartesianGrid stroke="#dce2d9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#596d63"
                    tick={{ fontSize: 15 }}
                  />
                  <YAxis stroke="#596d63" unit="%" />
                  <Tooltip
                    contentStyle={{
                      background: "#fffcf7",
                      border: "1px solid #d4ddd2",
                      color: "#263734",
                    }}
                  />
                  <Bar
                    isAnimationActive={!reduced}
                    animationDuration={450}
                    dataKey="value"
                    name="Synthetic sample proportion (%)"
                    radius={[3, 3, 0, 0]}
                  >
                    {distributions.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          [
                            "#658f7b",
                            "#719aaa",
                            "#af7853",
                            "#c76957",
                            "#b8b5a4",
                          ][i]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <ComposedChart
                  data={data}
                  margin={{ left: 0, right: 20, bottom: 16 }}
                >
                  <CartesianGrid stroke="#dce2d9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#596d63"
                    tick={{ fontSize: 15 }}
                  />
                  <YAxis
                    stroke="#596d63"
                    unit={factor === "Rainfall" ? " mm" : "%"}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fffcf7",
                      border: "1px solid #d4ddd2",
                      color: "#263734",
                    }}
                  />
                  {factor === "Rainfall" ? (
                    <>
                      <Bar
                        isAnimationActive={!reduced}
                        animationDuration={450}
                        dataKey="rainfall"
                        name="Daily rainfall (mm)"
                        fill="#719aaa"
                        radius={[2, 2, 0, 0]}
                      />
                      <Line
                        isAnimationActive={!reduced}
                        animationDuration={450}
                        dataKey="antecedent"
                        name="Trailing total, up to 7 days (mm)"
                        stroke="#af7853"
                        strokeWidth={2}
                        dot={false}
                      />
                    </>
                  ) : (
                    <Line
                      isAnimationActive={!reduced}
                      animationDuration={450}
                      dataKey="moisture"
                      name="Soil moisture (%)"
                      stroke="#658f7b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="chart-caption">
            {factor === "Rainfall" ? (
              <>
                <span className="chart-key blue" /> Daily rainfall{" "}
                <span className="chart-key sand" /> Trailing total, up to 7 days
              </>
            ) : (
              <span>
                Illustrative {factor.toLowerCase()} values · synthetic sample
              </span>
            )}
          </div>
        </section>
        <aside className="analysis-note">
          <span className="eyebrow">READING THIS VIEW</span>
          <h2>
            {factor === "Rainfall"
              ? "A pattern, not a prediction."
              : "Context before conclusions."}
          </h2>
          <p>
            {factor === "Rainfall"
              ? "Rainfall can contribute to slope instability. Timing, antecedent conditions and local terrain all matter. This sample demonstrates how those conditions can be explored."
              : "These distributions demonstrate the analytical interface. Real sampling design, units and quality checks must be established before interpreting relationships."}
          </p>
          <div className="note-stat">
            <strong>
              {factor === "Rainfall"
                ? total
                : factor === "Soil moisture"
                  ? data[data.length - 1].moisture
                  : "100"}
              <small>{factor === "Rainfall" ? "mm" : "%"}</small>
            </strong>
            <span>
              {factor === "Rainfall"
                ? "Synthetic window rainfall"
                : factor === "Soil moisture"
                  ? "Synthetic final-day moisture"
                  : "Illustrative sample composition"}
            </span>
          </div>
          <p className="microcopy">
            {distributions
              ? "Static factor samples do not change with the date selector. Sample basis: 100 synthetic units per location."
              : "Sample basis: " +
                data.length +
                " synthetic daily values. Early trailing totals use only the available preceding days."}
          </p>
        </aside>
      </div>
      <section className="method-note">
        <span className="eyebrow">INTERPRETATION & LIMITATIONS</span>
        <p>
          Exploratory relationships do not establish causation. Verified event
          overlays, correlation analysis and landslide/control comparisons will
          become available when quality-controlled observations and
          environmental samples are connected.
        </p>
      </section>
    </div>
  );
}
