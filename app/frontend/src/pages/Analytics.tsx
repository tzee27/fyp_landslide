import {useEffect,useState} from "react";
import {Area,Bar,CartesianGrid,Cell,ComposedChart,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {Link} from "react-router-dom";
import {PageHeader} from "../components/Common";
import {LandCoverAnalytics} from "../components/LandCoverAnalytics";
import {apiBase,apiGet} from "../services/api";
import {useMapDates} from "../hooks/useMapDates";

const dynamic={
  rainfall:{name:"Rainfall",color:"#ae604a",meaning:"Rain entering the ground can increase pore pressure on a slope."},
  moisture:{name:"Soil moisture",color:"#357970",meaning:"Water content in the upper 7 cm describes how wet the surface soil was."},
  runoff:{name:"Surface runoff",color:"#577b99",meaning:"Surface flow can concentrate along drainage paths and contribute to erosion."}
};
type Factor=keyof typeof dynamic;
const references:Record<string,[string,string,string]>={
  elevation:["Elevation","m","SRTM elevation describes the terrain height at sampled locations."],
  slope:["Slope","°","Slope steepness influences the downslope component of gravity."],
  curvature:["Profile curvature","m⁻¹","Profile curvature describes how slope steepness changes downhill."],
  wetness:["Topographic wetness index","index","This terrain index describes the tendency for water to accumulate."],
  soil:["Soil composition","%","Texture influences how readily water enters and drains through surface soil."]
};
type Source={product:string;unit:string;first:string;last:string;latest:Record<string,string>;sourceTimestamp:string;recentDays?:Record<string,{slots:number;exact:boolean}>};
type Catalog={regions:string[];sources:Record<string,Source>;refreshedAt:string;lastRefresh:string|null;refresh:{state:string;updated:string;detail:string}|null};
type Summary={value:number|null;min:number|null;max:number|null;count:number;expected:number;coverage:number|null;peakDate:string|null};
type Results={chart:(Summary&{date:string;through:string})[];resolution:string;summary:Summary;missing:string[];belowCoverage:number;uncached:number;comparison:(Summary&{name:string})[];previous:number|null;stages:string[];job:{state:string;cursor:string;detail:string}|null;refreshedAt:string};
type Range={start:string;end:string};
const root="/api/environmental-analytics";
const number=(v:number|null|undefined)=>v==null?"Unavailable":v.toLocaleString("en-MY",{maximumFractionDigits:4});
const offset=(day:string,n:number)=>new Date(Date.parse(day)+86400000*n).toISOString().slice(0,10);
const localTime=(stamp:string)=>new Date(stamp).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"});
const colors=["#6e8997","#b48352","#8b7c9b","#629290","#7887a6","#b27f72"];

export default function Analytics(){
  const [catalog,setCatalog]=useState<Catalog>(),[error,setError]=useState("");
  const [reference,setReference]=useState("elevation"),[showReference,setShowReference]=useState(false);
  const [sourceChoice,setSourceChoice]=useState("latest");
  const [choice,setChoice]=useState(new URLSearchParams(location.search).get("factor")==="cover"?"cover":"rainfall"),[region,setRegion]=useState("Whole Malaysia");
  useEffect(()=>{
    const c=new AbortController();
    const load=()=>apiGet<Catalog>(root+"/catalog",c.signal).then(x=>{setCatalog(x);setError("")}).catch(e=>{if(!c.signal.aborted)setError(e.message)});
    void load();const timer=setInterval(load,30000);
    return ()=>{c.abort();clearInterval(timer)};
  },[]);
  const hourlyKey=choice+"_hourly";
  const useHourly=Boolean(catalog?.sources[hourlyKey]) && (sourceChoice==="hourly" || (sourceChoice==="latest" && (catalog?.sources[hourlyKey]?.latest[region]??"")>(catalog?.sources[choice]?.latest[region]??"")));
  const series=useHourly?hourlyKey:choice;
  return <div className="page environmental-page"><PageHeader number="03" title="Environmental Analytics" description="Explore environmental conditions across Malaysia’s slopes."/>
    <div className="filterbar"><label>Environmental factor<select value={choice} onChange={e=>{setChoice(e.target.value);setSourceChoice("latest")}}>
      {Object.entries(dynamic).map(([k,d])=><option key={k} value={k}>{d.name}</option>)}<option value="cover">Land-cover composition and change</option>
      </select></label>
      <label>Geography<select value={region} onChange={e=>setRegion(e.target.value)}>{(catalog?.regions??[region]).map(s=><option key={s}>{s}</option>)}</select></label>
      {(choice==="moisture"||choice==="runoff")&&<label>Observation source<select value={sourceChoice} onChange={e=>setSourceChoice(e.target.value)}>
        <option value="latest">Latest eligible series</option><option value="daily">ERA5-Land daily product</option>
        {catalog?.sources[hourlyKey]&&<option value="hourly">ERA5-Land hourly-derived daily</option>}</select></label>}</div>
    {error && <p role="alert">{error}</p>}
    {choice==="cover"?<LandCoverAnalytics region={region}/>:catalog?<WeatherView key={series} series={series} factor={choice as Factor} region={region} catalog={catalog}/>:!error&&<p role="status">Loading source availability…</p>}
    <details className="state-board" onToggle={e=>setShowReference(e.currentTarget.open)}><summary>Static Reference</summary>{showReference && <><label>Reference factor <select value={reference} onChange={e=>setReference(e.target.value)}>{Object.entries(references).map(([key,[label]])=><option key={key} value={key}>{label}</option>)}</select></label><ReferenceView key={region+reference} region={region} factor={reference}/></>}</details>
  </div>;
}

function WeatherView({factor,series,region,catalog}:{factor:Factor;series:string;region:string;catalog:Catalog}){
  const source=catalog.sources[series],info=dynamic[factor],latest=source.latest[region]??source.last;
  const [custom,setCustom]=useState<Range|null>(null);
  const start=custom?.start??latest,end=custom?.end??latest;
  const [draft,setDraft]=useState<Range>({start,end}),[result,setResult]=useState<Results>();
  const [error,setError]=useState(""),[retry,setRetry]=useState(0);
  const maps=useMapDates();
  useEffect(()=>setDraft({start,end}),[start,end]);
  useEffect(()=>{
    const c=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    const query=new URLSearchParams({factor:series,start,end});
    const read=()=>apiGet<Results>(root+"/range?"+query+"&region="+encodeURIComponent(region),c.signal);
    async function load(){
      try{
        let report=await read();
        if(c.signal.aborted)return;
        setResult(report);
        if(report.missing.length || report.comparison.some(row=>row.value===null)){
          const response=await fetch(apiBase+root+"/retrieve?"+query,{method:"POST",signal:c.signal});
          if(!response.ok)throw Error("Could not queue the selected dates.");
          report=await read();
        }
        while(!c.signal.aborted){
          setResult(report);
          if(report.job?.state!=="running" && report.job?.state!=="queued")break;
          await new Promise<void>(resolve=>{
            const done=()=>{clearTimeout(timer);c.signal.removeEventListener("abort",done);resolve()};
            timer=setTimeout(done,4000);c.signal.addEventListener("abort",done,{once:true});
          });
          if(!c.signal.aborted)report=await read();
        }
      }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"Retrieval failed.")}
    }
    setError("");setResult(undefined);void load();
    return ()=>{c.abort();clearTimeout(timer)};
  },[series,region,start,end,retry,catalog.refreshedAt]);
    const pick=(months:number)=>{
    let first=offset(latest,-6);
    if(months){
      const after=new Date(offset(latest,1)),day=after.getUTCDate();
      after.setUTCDate(1);after.setUTCMonth(after.getUTCMonth()-months);
      const lastDay=new Date(Date.UTC(after.getUTCFullYear(),after.getUTCMonth()+1,0)).getUTCDate();
      after.setUTCDate(Math.min(day,lastDay));first=after.toISOString().slice(0,10);
    }
    setCustom({start:first<source.first?source.first:first,end:latest});
  };
  const sum=result?.summary,water=factor==="moisture",unit=source.unit;
  const complete=result?.comparison.filter(x=>x.value!==null)??[];
  const missing=result?.comparison.filter(x=>x.value===null)??[];
  const job=result?.job;
  const direction=result?.chart.filter(x=>x.value!==null)??[];
  return <><form className="filterbar date-controls" onSubmit={e=>{e.preventDefault();setCustom({...draft})}}>
    <label>From date (UTC)<input required type="date" min={source.first} max={draft.end||source.last} value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/></label>
    <label>Through date (UTC)<input required type="date" min={draft.start||source.first} max={source.last} value={draft.end} onChange={e=>setDraft({...draft,end:e.target.value})}/></label>
    <button type="submit">Apply range</button><div className="range-presets">{[[0,"Past week"],[1,"Past month"],[12,"Past year"]].map(([n,label])=><button type="button" key={n} onClick={()=>pick(+n)}>{label}</button>)}</div></form>
    <p className="microcopy">Earliest source date · {source.first} UTC. Latest selectable day · {source.last} UTC. Historical days are retrieved on demand.</p>
    {factor==="rainfall" && source.recentDays && <details><summary>Recent IMERG coverage · latest eligible day in {region}: {source.latest[region]??"unavailable"}</summary>
      <p>Daily totals require 48 distinct half-hour slots from midnight through 23:30 UTC and at least 95% regional coverage.</p>
      <ul>{Object.entries(source.recentDays).reverse().map(([day,v])=><li key={day}>{day} UTC · {v.slots}/48 half-hours · {v.exact?"timestamp check passed":"incomplete or irregular"}</li>)}</ul></details>}
    {series.endsWith("_hourly")&&<details><summary>Recent ERA5-Land hourly coverage</summary>
      <ul>{Object.entries(source.recentDays??{}).reverse().map(([day,v])=><li key={day}>{day} UTC · {v.slots}/24 hourly records · {v.exact?"timestamp check passed":"incomplete or irregular"}</li>)}</ul></details>}
    {error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!result&&!error&&<p role="status">Checking cached observations…</p>}
    {result&&sum&&<>
    {job && ["running","queued","error"].includes(job.state)&&<p role="status">{job.detail||"Historical retrieval "+job.state+" · next UTC day "+job.cursor}{job.state==="error"&&<button onClick={()=>setRetry(n=>n+1)}>Retry retrieval</button>}</p>}
    <div className="analysis-layout"><section><h2>{info.name} in {region}</h2><p>{source.product}{series.endsWith("_hourly") && (water?" · daily mean of 24 hourly observations":" · sum of 24 hourly increments ending 01:00 through the following 00:00 UTC")}</p><p>{start} — {end} UTC · {result.resolution} · {unit}</p>
      <div className="analysis-metrics"><div><small>{water?"Mean water content":"Cumulative depth"}</small><strong>{number(sum.value)} {sum.value!==null&&unit}</strong></div>
      {water&&<div><small>Daily minimum</small><strong>{number(sum.min)}</strong></div>}<div><small>Daily maximum</small><strong>{number(sum.max)} {sum.max!==null&&unit}</strong></div><div><small>Eligible days</small><strong>{sum.count} / {sum.expected}</strong></div></div>
      {result.chart.some(x=>x.value!==null)?<ResponsiveContainer width="100%" height={340}><ComposedChart data={result.chart} margin={{left:8,right:16,bottom:12}}>
        <CartesianGrid vertical={false} stroke="#dfded4" strokeDasharray="3 5"/><XAxis dataKey="date" minTickGap={35} tick={{fontSize:12}}/><YAxis width={70} tick={{fontSize:12}}/>
        <Tooltip labelFormatter={(label,items)=>String(label)+" – "+(items[0]?.payload.through??label)+" UTC"} formatter={v=>number(Number(v))+" "+unit}/>
        {water?<Line dataKey="value" name={info.name} stroke={info.color} strokeWidth={3} connectNulls={false} isAnimationActive={false}/>:factor==="runoff"&&result.chart.length>20?<Area dataKey="value" name={info.name} stroke={info.color} fill="#dce7ee" connectNulls={false}/>:<Bar dataKey="value" name={info.name} fill={info.color} maxBarSize={48}/>}</ComposedChart></ResponsiveContainer>:<p>{job?.state==="running"||job?.state==="queued"?"Retrieving observations for this range…":job?.state==="error"?"Retrieval failed. Retry to resume from the last saved batch.":"No eligible observations for this region and date range."}</p>}
      {result.missing.length>0&&<details><summary>{result.missing.length} incomplete or unavailable days</summary><p >{result.belowCoverage} days below 95% spatial coverage. {result.uncached} days without a processed daily observation.</p><p className="missing-dates">{result.missing.join(", ")}</p></details>}
      {series===factor&&start===end&&maps[factor]?.[end]&&<Link to={"/explorer?factor="+factor+"&date="+end}>View this observation on the map ↗</Link>}
    </section><aside><h2>Reading This View</h2><h3>Environmental interpretation</h3><p>{info.meaning}</p><h3>Calculation</h3><p>{water?"Mean volumetric water content · θ̄ = Σθd / n":"Accumulated area-weighted depth · D = ΣDd"}. Monthly and annual values require a complete calendar period. Other intervals require all selected days.</p>
      <h3>Summary</h3><p>{sum.value!==null && ((water?"Mean soil moisture":"Cumulative "+info.name.toLowerCase())+" in "+region+" was "+number(sum.value)+" "+unit+". ")}{water&&sum.min!==null&&"Minimum daily moisture was "+number(sum.min)+" "+unit+". "}{sum.count?("Highest eligible daily value was "+number(sum.max)+" "+unit+" on "+sum.peakDate+" UTC."):"No eligible observations in this range."}
      {result.previous!==null&&sum.value!==null&&" The preceding "+sum.expected+"-day period measured "+number(result.previous)+" "+unit+"."}
      {water&&direction.length>1&&" The last displayed value is "+(direction.at(-1)!.value!>direction[0].value!?"higher than":direction.at(-1)!.value!<direction[0].value!?"lower than":"equal to")+" the first."}</p>
      <h3>Data Quality</h3><p>{sum.count} of {sum.expected} UTC days eligible in {region}, {start} through {end}. {sum.coverage!==null&&"Lowest recorded spatial coverage: "+number(100*sum.coverage)+"%. "}{source.product} · {factor==="rainfall"?"0.1° half-hourly precipitation rates integrated to mm":"approximately 11 km daily land reanalysis"}. Each daily result requires at least 95% area coverage. Regional averages can conceal local variation.</p></aside></div>
      <details className="state-board"><summary>Compare states and territories</summary><p>Ranked by {water?"mean soil moisture":"cumulative depth"} over the same {sum.expected} days. Putrajaya has no separate GAUL 2015 region.</p>
      {complete.length>0&&<ResponsiveContainer width="100%" height={50+complete.length*34}><ComposedChart layout="vertical" data={complete} margin={{right:24}}>
        <XAxis type="number" unit={" "+unit}/><YAxis dataKey="name" type="category" width={148} interval={0} tick={{fontSize:12}}/>
        <Tooltip formatter={(v,_name,item)=>number(Number(v))+" "+unit+" · minimum spatial coverage "+number(100*item.payload.coverage)+"%"}/>
        <Bar dataKey="value" name={info.name} maxBarSize={19}>{complete.map(r=><Cell key={r.name} fill={r.name===region?"#324e3d":colors[catalog.regions.indexOf(r.name)%colors.length]}/>)}</Bar></ComposedChart></ResponsiveContainer>}
        {missing.length>0&&<p>Incomplete regions · {missing.map(r=>r.name).join(", ")}</p>}</details>
      <footer className="analytics-meta"><p>{source.product} · {result.stages.join(", ")} · Latest complete cached day in {region} · {source.latest[region]??"unavailable"} UTC</p><p>Latest source timestamp · {source.sourceTimestamp} · Cache updated {localTime(result.refreshedAt)} MYT</p>
      <p>Last successful scheduled refresh · {catalog.lastRefresh?localTime(catalog.lastRefresh)+" MYT":"pending"}</p><p>Scheduled source check · {catalog.refresh?.state??"pending"} {catalog.refresh&&localTime(catalog.refresh.updated)+" MYT"} {catalog.refresh?.detail}</p></footer></>}
  </>;
}

function ReferenceView({factor,region}:{factor:string;region:string}){
  const [result,setResult]=useState<{chart:Record<string,number|string>[];date:string;n:number}>(),[error,setError]=useState("");
  const [name,unit,meaning]=references[factor];
  useEffect(()=>{const c=new AbortController();apiGet<NonNullable<typeof result>>(root+"/reference-summary?"+new URLSearchParams({factor,region}),c.signal).then(setResult).catch(e=>{if(!c.signal.aborted)setError(e.message)});return ()=>c.abort()},[factor,region]);
  if(!result)return <p role="status">{error||"Loading reference samples…"}</p>;
  return <div className="analysis-layout"><section><h2>{name} in {region}</h2><p>Static reference · {result.date} · {unit}</p>
    {result.n?<ResponsiveContainer width="100%" height={320}><ComposedChart data={result.chart}><CartesianGrid vertical={false}/><XAxis dataKey="label" hide={factor==="soil"} minTickGap={24}/><YAxis/><Tooltip/>
    {factor==="soil"?["clay","silt","sand"].map((s,i)=><Bar key={s} dataKey={s} stackId="soil" fill={["#985f45","#749377","#d7b56e"][i]}/>):<Bar dataKey="count" name="Sample count" fill="#b28058"/>}</ComposedChart></ResponsiveContainer>:<p>No measured samples in this geography.</p>}</section>
    <aside><h2>Reading This View</h2><h3>Environmental interpretation</h3><p>{meaning}</p><h3>Calculation</h3><p>{factor==="soil"?"Mean percentage of each texture fraction across complete samples.":"Number of measured samples in each value interval."}</p><h3>Summary</h3><p>{result.n.toLocaleString()} eligible reference locations.</p><h3>Data quality</h3><p>{factor==="soil"?"OpenLandMap":factor==="wetness"?"MERIT Hydro":"SRTM"} · January 2023 assessment grid. The distribution represents sampled locations.</p></aside></div>;
}
