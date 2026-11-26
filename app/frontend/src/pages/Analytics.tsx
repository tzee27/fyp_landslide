import { periods, valid, format, days, type Row, type Factor, type ObservationExport } from "../services/environmentPeriods";
import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {LandCoverAnalytics} from "../components/LandCoverAnalytics";
import {Link} from "react-router-dom";
import {useMapDates} from "../hooks/useMapDates";
import { PageHeader } from "../components/Common";
import { apiGet } from "../services/api";

const factors = {
  rainfall: ["Rainfall", "Rain entering the ground can increase pore pressure and contribute to slope instability."],
  moisture: ["Surface soil moisture", "Water content in the upper 7 cm provides context for how wet the surface soil was."],
  runoff: ["Surface runoff", "Runoff can concentrate water along drainage paths and contribute to erosion."],
} as const;
function Tabs({items,current,select,label}:{items:string[];current:string;select:(s:string)=>void;label:string}) {
  return <nav className="analysis-tabs" aria-label={label}>{items.map(s=><button key={s} aria-pressed={current===s} onClick={()=>select(s)}>{s}</button>)}</nav>;
}
export default function Analytics(){
  const mapDates=useMapDates();
  const [data,setData]=useState<ObservationExport>(),[error,setError]=useState("");
  const [choice,setFactor]=useState<Factor|"cover">("rainfall"),[region,setRegion]=useState("Whole Malaysia");
  const factor=choice==="cover"?"rainfall":choice;
  const [mode,setMode]=useState("Historical Analytics"),[period,setPeriod]=useState("Daily");
  const [start,setStart]=useState(""),[end,setEnd]=useState("");
  useEffect(()=>{const c=new AbortController(); apiGet<ObservationExport>("/api/environmental-observations",c.signal).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message)});return ()=>c.abort()},[]);
  const observations=data?.rows.filter(r=>r.factor===factor && r.region===region)??[];
  const daily=observations.filter(r=>r.date.length===10);
  const hours=observations.filter(r=>r.date.length===13);
  const historical=mode==="Historical Analytics";
  const resolutions=["Hourly","Daily","Monthly","Yearly"].filter(s=>s==="Hourly"?hours.some(r=>valid(r) && (!start||r.date.slice(0,start.length)>=start) && (!end||r.date.slice(0,end.length)<=end)):s==="Daily"||periods(daily,s,factor).some(r=>r.value!==null));
  const resolution=historical && resolutions.includes(period)?period:"Daily";
  const hourly=resolution==="Hourly";
  const rows=hourly?hours:daily;
  const buckets=periods(rows,resolution,factor);
  const dates=buckets.filter(b=>b.value!==null).map(b=>b.date);
  const latest=dates.at(-1);
  let recentStart=dates.length-1;
  if(resolution==="Daily") while(recentStart>0 && days(dates[recentStart-1],dates[recentStart])===2) recentStart--;
  else recentStart=0;
  const from=historical && dates.includes(start)?start:historical?dates[recentStart]:latest;
  const to=historical && dates.includes(end)?end:latest;
  const key=(r:Row)=>r.date.slice(0,hourly?13:resolution==="Daily"?10:resolution==="Monthly"?7:4);
  const inRange=(r:Row)=>r.date.length===(hourly?13:10) && !!from && !!to && key(r)>=from && key(r)<=to;
  const selected=rows.filter(inRange);
  const visible=buckets.filter(b=>from && to && b.date>=from && b.date<=to);
  const asTime=(date:string)=>Date.parse(date.length===13?date+":00:00Z":date.length===7?date+"-01":date.length===4?date+"-01-01":date);
  const chart=visible.flatMap((b,i)=>{
    const previous=visible[i-1];
    const time=asTime(b.date);
    if(!previous)return [{...b,time}];
    const next=new Date(asTime(previous.date));
    if(hourly)next.setUTCHours(next.getUTCHours()+1);
    else if(resolution==="Daily")next.setUTCDate(next.getUTCDate()+1);
    else if(resolution==="Monthly")next.setUTCMonth(next.getUTCMonth()+1);
    else next.setUTCFullYear(next.getUTCFullYear()+1);
    return next.getTime()<time?[{date:"Missing observations",time:next.getTime(),value:null},{...b,time}]:[{...b,time}];
  });
  const axisDate=(ms:number)=>new Date(ms).toISOString().slice(0,hourly?13:resolution==="Daily"?10:resolution==="Monthly"?7:4).replace("T"," ");
  const stamp=(s:string)=>Date.parse(hourly?s+":00:00Z":s);
  const first=selected[0]?.date,last=selected.at(-1)?.date;
  const expected=first&&last?1+(stamp(last)-stamp(first))/(hourly?3600000:86400000):0;
  const aggregate=(rs:Row[])=>expected && rs.length===expected && rs.every(valid)?rs.reduce((n,r)=>n+(r.value??0),0)/(factor==="moisture"?expected:1):null;
  const value=aggregate(selected),unit=data?.sources[factor].unit??"";
  const peak=chart.filter(r=>r.value!==null).sort((a,b)=>b.value!-a.value!)[0];
  const comparison=(data?.regions??[]).filter(name=>name!=="Whole Malaysia").map(name=>({name,value:aggregate(data!.rows.filter(r=>r.factor===factor && r.region===name && inRange(r)))})).sort((a,b)=>(b.value??-1)-(a.value??-1));
  return <div className="page"><PageHeader number="03" title="Environmental Analytics" description="Explore environmental conditions across Malaysia’s slopes."/>
    <div className="filterbar"><label>Environmental factor<select value={choice} onChange={e=>{setFactor(e.target.value as Factor|"cover");setStart("");setEnd("")}}>{Object.entries(factors).map(([k,v])=><option key={k} value={k}>{v[0]}</option>)}<option value="cover">Land-cover composition</option></select></label>
    <label>Geography<select value={region} onChange={e=>{setRegion(e.target.value);setStart("");setEnd("")}}>{(data?.regions??[region]).map(s=><option key={s}>{s}</option>)}</select></label></div>
    <Tabs label="Analytics mode" items={["Historical Analytics","Latest Available"]} current={mode} select={setMode}/>
    {choice==="cover"?<LandCoverAnalytics key={region} historical={historical} region={region}/>:<>{historical && <><Tabs label="Time resolution" items={resolutions} current={resolution} select={next=>{
      const candidates=periods(next==="Hourly"?hours:daily,next,factor).filter(r=>r.value!==null).map(r=>r.date);
      const inWindow=candidates.filter(d=>(!from||d.slice(0,Math.min(d.length,from.length))>=from.slice(0,d.length))&&(!to||d.slice(0,Math.min(d.length,to.length))<=to.slice(0,d.length)));
      setPeriod(next);setStart(inWindow[0]??"");setEnd(inWindow.at(-1)??"");
    }}/><div className="filterbar">
    <label>From (UTC)<select value={from??""} onChange={e=>setStart(e.target.value)}>{dates.filter(d=>!to||d<=to).map(d=><option key={d}>{d}</option>)}</select></label>
    <label>Through (UTC)<select value={to??""} onChange={e=>setEnd(e.target.value)}>{dates.filter(d=>!from||d>=from).map(d=><option key={d}>{d}</option>)}</select></label></div></>}
    {!data?<p role="status">{error||"Loading environmental observations…"}</p>:<div className="analysis-layout"><section>
    <h2>{factors[factor][0]} in {region}</h2><p>{!historical && "Observation date · "}{from??"Unavailable"}{to!==from && " – "+to} UTC</p>
    <div className="analysis-metrics"><div><small>{factor==="moisture"?"Mean water content":"Area-weighted accumulation"}</small><strong>{format(value)} {value!==null&&unit}</strong></div>
    <div><small>Eligible {hourly?"hours":"days"}</small><strong>{selected.filter(valid).length} / {expected}</strong></div>
    <div><small>Minimum spatial coverage</small><strong>{selected.length?format(Math.min(...selected.map(r=>r.coverage))*100)+"%":"Unavailable"}</strong></div></div>
    {historical && <h3>{resolution} {factors[factor][0].toLowerCase()} ({unit})</h3>}
    {historical && chart.some(r=>r.value!==null) && <ResponsiveContainer width="100%" height={275}><ComposedChart data={chart}><CartesianGrid vertical={false} strokeDasharray="3 4"/><XAxis dataKey="time" type="number" scale="time" domain={["dataMin","dataMax"]} ticks={chart.length<=10?chart.map(r=>r.time):undefined} tickFormatter={axisDate} minTickGap={24}/><YAxis unit={" "+unit} width={80}/><Tooltip labelFormatter={v=>axisDate(Number(v))+" UTC"}/>{factor==="moisture" || hourly?<Line name={factors[factor][0]+" ("+unit+")"} dataKey="value" stroke="#BF694E" connectNulls={false} isAnimationActive={false}/>:<Bar name={factors[factor][0]+" ("+unit+")"} dataKey="value" fill="#BF694E" maxBarSize={48}/>}</ComposedChart></ResponsiveContainer>}
    {region==="Whole Malaysia" && <details open={!historical}><summary>Compare states and territories</summary><ResponsiveContainer width="100%" height={Math.max(120,34*comparison.filter(r=>r.value!==null).length+60)}><ComposedChart layout="vertical" data={comparison.filter(r=>r.value!==null)}><XAxis type="number"/><YAxis type="category" dataKey="name" width={155} interval={0}/><Tooltip/><Bar name={factors[factor][0]+" ("+unit+")"} dataKey="value" fill="#62866b"/></ComposedChart></ResponsiveContainer><small>Incomplete regions: {comparison.filter(r=>r.value===null).map(r=>r.name).join(", ")||"none"}.</small></details>}
    {from===to && from && mapDates[factor]?.[from]?<Link to={"/explorer?factor="+factor+"&date="+from}>View this observation on the map ↗</Link>:<small>No spatial export for this exact period.</small>}
    <p className="microcopy">{factor==="rainfall" && "IMERG catalogue stage: "+([...new Set(selected.flatMap(row=>row.processingStatus??[]))].join(", ")||"unspecified")+" · "}{data.sources[factor].product} · Data through {latest??"unavailable"} UTC · Processed {new Date(data.refreshedAt).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})} MYT</p>
    </section><aside><h2>Reading This View</h2><h3>Environmental interpretation</h3><p>{factors[factor][1]}</p><h3>Calculation</h3><p>{hourly?"Each complete pair of half-hourly precipitation rates contributes one hour of depth.":factor==="moisture"?"Mean of area-weighted daily water content.":"Sum of area-weighted daily water depths."}</p><p>{hourly?<span>R<sub>hour</sub> = 0.5 (r₁ + r₂)</span>:factor==="moisture"?<span>θ̄ = (Σ θ<sub>d</sub>) / n</span>:<span>R = Σ R<sub>d</sub></span>}</p><h3>Summary</h3><p>{peak?"Highest displayed value: "+format(peak.value)+" "+unit+" on "+peak.date+" UTC.":"No eligible observation in this period."}</p>{expected>selected.filter(valid).length && <p>The selected range has gaps. A full-period statistic is unavailable.</p>}</aside></div>}</>}
    </div>;
}
