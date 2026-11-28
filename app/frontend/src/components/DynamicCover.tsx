import {useEffect,useState} from "react";
import {apiBase,apiGet} from "../services/api";

const labels=["Water","Trees","Grass","Flooded vegetation","Crops","Shrub and scrub","Built surfaces","Bare ground","Snow and ice"];
const colors=["#419bdf","#397d49","#88b053","#7a87c6","#e49635","#b39e58","#bf584e","#a49587","#a3bdd4"];
const descriptions=["Open surface water","Land dominated by tree canopy","Open grassy vegetation","Vegetation mixed with standing water","Cultivated fields","Low woody vegetation","Buildings, roads and other developed surfaces","Exposed soil, rock or sand","Snow or ice cover"];
type Row={region:string;coverage:number;shares:number[]};
type Year={year:number;through:string;sourceThrough:string;start:string;ytd:boolean;refreshedAt:string;rows:Row[]};
type Data={years:Year[];refresh:{lastSuccess?:string;state?:string}};
const path="/api/environmental-analytics/dynamic-world";
export function DynamicCover({region}:{region:string}){
  const [data,setData]=useState<Data>(),[error,setError]=useState(""),[choice,setChoice]=useState("");
  useEffect(()=>{
    const c=new AbortController();
    const load=()=>apiGet<Data>(path,c.signal).then(d=>{setData(d);setError("")}).catch(e=>{if(!c.signal.aborted)setError(e.message)});
    void load(); const timer=setInterval(load,60000); return ()=>{clearInterval(timer);c.abort()};
  },[]);
  const item=data?.years.find(y=>String(y.year)===choice)??data?.years.at(-1);
  if(!item)return <p role="status">{error||(!data?"Loading land-cover exports…":"No validated Dynamic World export available.")} {data?.refresh.state}</p>;
  const row=item.rows.find(r=>r.region===region);
  const dominant=row?.shares.indexOf(Math.max(...row.shares))??-1;
  return <><div className="filterbar"><label>Reference year<select value={item.year} onChange={e=>setChoice(e.target.value)}>{data?.years.map(y=><option key={y.year} value={y.year}>{y.year}{y.ytd?" · year to date":""}</option>)}</select></label></div>
    <div className="analysis-layout"><section><h2>Land-cover composition in {region}</h2><p>Dynamic World V1 · {item.start} through {item.through} UTC · {item.ytd?"Year to date":"Annual composite"}</p>
    {row?.shares.length?<>{labels.map((name,i)=><div key={name}><small>{name} · {row.shares[i].toFixed(2)}%</small><div style={{background:colors[i],width:row.shares[i]+"%",height:8}}/></div>)}</>:<p>No eligible classified grid cells.</p>}
    <details><summary>Class definitions</summary><dl>{labels.map((name,i)=><div key={name}><dt>{i} · {name}</dt><dd>{descriptions[i]}</dd></div>)}</dl></details>
    <p><a href={apiBase+path+"/"+item.year+"/map"}>Download classified overview (GeoTIFF)</a></p></section>
    <aside><h2>Reading This View</h2><p>{dominant>=0 && row && labels[dominant]+" covered "+row.shares[dominant].toFixed(2)+"% of classified area in "+region+"."}</p>
    <p>Mapped coverage · {((row?.coverage??0)*100).toFixed(2)}%. Class shares use valid latitude-weighted 1 km grid samples of 10 m imagery.</p>
    <p>Each tile contributes its latest acquisition per month. Cloud masking and a minimum class probability of 0.60 exclude uncertain observations. The most frequent class across at least three valid months determines each grid cell.</p>
    <p>Persistent cloud and uncertain classifications can leave large gaps. Percentages describe the mapped portion only and may overrepresent easily classified land cover.</p>
    <p>Latest source acquisition · {item.sourceThrough} UTC. Latest processed acquisition · {item.through} UTC. Exported {item.refreshedAt}. Refresh · {data?.refresh.state??"awaiting scheduled check"} {data?.refresh.lastSuccess}</p></aside></div>
    <details><summary>Compare state coverage and dominant classes</summary>{item.rows.filter(r=>r.region!=="Whole Malaysia").map(r=><p key={r.region}>{r.region} · {(100*r.coverage).toFixed(1)}% mapped · {r.shares.length?labels[r.shares.indexOf(Math.max(...r.shares))]:"unclassified"}</p>)}</details>{error&&<p role="status">{error}</p>}</>;
}
