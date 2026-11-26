import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {Bar,BarChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import classes from "../services/landCoverClasses.json";

type Year = {year:number;region:string;coverage:number;shares:Record<string,number>};
type Composition = {rows:Year[];refreshedAt:string};
export function LandCoverAnalytics({region,historical}:{region:string;historical:boolean}){
  const [data,setData]=useState<Composition>();
  const [error,setError]=useState("");
  const [start,setStart]=useState(0),[end,setEnd]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(import.meta.env.BASE_URL+"data/land-cover-composition.json",{signal:controller.signal})
      .then(r=>{if(!r.ok)throw Error("Land-cover export unavailable.");return r.json()})
      .then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return ()=>controller.abort();
  },[]);
  if(!data)return <p role="status">{error||"Loading land-cover composition…"}</p>;
  const rows=data.rows.filter(r=>r.region===region);
  const eligible=rows.filter(r=>r.coverage>=.95);
  const latest=eligible.at(-1)?.year;
  if(!latest)return <p>No year reaches 95% mapped coverage for {region} on the 1 km overview grid.</p>;
  const from=historical && eligible.some(r=>r.year===start)?start:historical?eligible[0].year:latest;
  const through=historical && eligible.some(r=>r.year===end)?end:latest;
  const selected=eligible.filter(r=>r.year>=from && r.year<=through);
  const last=selected.at(-1)!;
  const shown=classes.filter(c=>selected.some(r=>r.shares[c.code]>0));
  const largest=shown.reduce((a,b)=>(last.shares[b.code]??0)>(last.shares[a.code]??0)?b:a);
  return <>
    {historical && <><nav className="analysis-tabs" aria-label="Time resolution"><button aria-pressed="true">Yearly</button></nav>
      <div className="filterbar"><label>From year<select value={from} onChange={e=>setStart(+e.target.value)}>{eligible.filter(r=>r.year<=through).map(r=><option key={r.year}>{r.year}</option>)}</select></label>
      <label>Through year<select value={through} onChange={e=>setEnd(+e.target.value)}>{eligible.filter(r=>r.year>=from).map(r=><option key={r.year}>{r.year}</option>)}</select></label></div></>}
    <div className="analysis-layout"><section><h2>Land-cover composition in {region}</h2>
    <div className="analysis-metrics"><div><small>Reference year</small><strong>{last.year}</strong></div><div><small>Mapped coverage</small><strong>{(100*last.coverage).toFixed(1)}%</strong></div><div><small>Classes in {last.year}</small><strong>{Object.keys(last.shares).length}</strong></div></div>
    <h3>Share of mapped land area (%)</h3>
    <ResponsiveContainer width="100%" height={285}><BarChart data={selected.map(r=>({year:r.year,...r.shares}))}>
    <XAxis dataKey="year"/><YAxis domain={[0,100]} unit="%"/><Tooltip formatter={v=>Number(v).toFixed(2)+"%"}/>
    {shown.map(c=><Bar key={c.code} dataKey={String(c.code)} name={c.name} fill={c.color} stackId="classes" maxBarSize={54}/>)}</BarChart></ResponsiveContainer>
    <details><summary>Class shares in {last.year}</summary><table><thead><tr><th>Land-cover class</th><th>Area share</th></tr></thead><tbody>{shown.filter(c=>last.shares[c.code]>0).map(c=><tr key={c.code}><td>{c.name}</td><td>{last.shares[c.code].toFixed(2)}%</td></tr>)}</tbody></table></details>
    <Link to={"/explorer?factor=cover&year="+last.year}>View the {last.year} map ↗</Link>
    <p className="microcopy">GLC_FCS30D · Data through {latest} · Refreshed {new Date(data.refreshedAt).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})} MYT</p></section>
    <aside><h2>Reading This View</h2><h3>Environmental interpretation</h3><p>Land cover describes the vegetation, water and developed surfaces around a slope. Regional composition provides context for interpreting the local terrain.</p>
    <h3>Calculation</h3><p>P<sub>class</sub> = 100 × A<sub>class</sub> / A<sub>mapped</sub></p><p>Area-weighted estimates use the 1 km display grid sampled from the annual product. Small land-cover patches can be missed at this scale.</p>
    <h3>Summary</h3><p>{largest.name} accounted for the largest mapped share in {last.year} ({last.shares[largest.code].toFixed(1)}%).</p></aside></div></>;
}
