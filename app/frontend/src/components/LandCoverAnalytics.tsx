import {useState} from "react";
import {apiBase} from "../services/api";
import {coverPath,imageUrl,names,palettes,useCoverCatalog,usePreview,valid,type Product} from "../services/coverCatalog";

const pct=(n:number)=>n.toFixed(2)+"%";
const change=(n:number)=>(n>0?"+":"")+n.toFixed(2)+" pp";
export function LandCoverAnalytics({region}:{region:string}){
  const {years,errors}=useCoverCatalog();
  const [product,setProduct]=useState<Product>("dynamic"),[year,setYear]=useState(0),[baseline,setBaseline]=useState(0);
  const periods=years[product],current=periods.find(y=>y.year===year)??periods.at(-1);
  const earlier=periods.filter(y=>current&&y.year<current.year);
  const previous=earlier.find(y=>y.year===baseline)??earlier.at(-1);
  const map=usePreview(product,current,region);
  const row=current?.rows.find(r=>r.region===region&&valid(r)),prior=previous?.rows.find(r=>r.region===region&&valid(r));
  const classes=palettes[product].map(c=>{
    const value=row?.shares[c.code]??0,base=prior?.shares[c.code]??0;
    return {...c,value,base,delta:value-base};
  });
  const shown=classes.filter(c=>c.value>0||c.base>0);
  const sorted=[...shown].sort((a,b)=>b.delta-a.delta);
  const highest=sorted[0],lowest=sorted.at(-1),dominant=[...shown].sort((a,b)=>b.value-a.value)[0];
  const span=Math.max(.000001,...shown.map(c=>Math.abs(c.delta)));
  return <><div className="filterbar"><label>Land-cover source<select value={product} onChange={e=>{setProduct(e.target.value as Product);setYear(0);setBaseline(0)}}>{Object.entries(names).map(([k,name])=><option key={k} value={k}>{name}</option>)}</select></label>
    {current&&<label>Reference year<select value={current.year} onChange={e=>{setYear(+e.target.value);setBaseline(0)}}>{periods.map(y=><option key={y.year} value={y.year}>{y.year}{y.ytd?" · year to date":""}</option>)}</select></label>}
    {!!previous&&<label>Comparison year<select value={previous.year} onChange={e=>setBaseline(+e.target.value)}>{earlier.map(y=><option key={y.year}>{y.year}</option>)}</select></label>}</div>
    {errors[product]&&<p role="status">{errors[product]}</p>}
    {!current?<p>Waiting for a validated {names[product]} export.</p>:<>
    <div className="analysis-layout"><section><h2>Land cover in {region}</h2><p>{names[product]} · {current.year} · {current.ytd?"Year to date through "+current.through:"Annual reference"}</p>
    {map?.meta?<a href={imageUrl(product,current,region)} target="_blank" rel="noreferrer" title="Open map preview at full size"><img className="cover-preview" src={imageUrl(product,current,region)} alt={names[product]+" land cover in "+region+" for "+current.year}/></a>:<p role="status">{map?.error??"Loading map…"}</p>}
    <p className="microcopy">Transparent areas have no mapped class. Preview resolution is approximately 1 km.</p>
    <details><summary>Map legend</summary>{classes.map(c=><div className="cover-class" key={c.code}><i style={{background:c.color}}/>{c.name}{"description" in c && typeof c.description==="string" && " · "+c.description}</div>)}</details>
    {product==="dynamic"&&<a href={apiBase+coverPath+"/dynamic-world/"+current.year+"/map"}>Download national GeoTIFF</a>}</section>
    <aside><h2>Reading This View</h2>{row&&dominant?<><h3>{dominant.name}</h3><p>Largest class · {pct(dominant.value)} of mapped area.</p>
    <dl><dt>Mapped coverage</dt><dd>{pct(row.coverage*100)}</dd><dt>Valid mapped area</dt><dd>{map?.meta?Math.round(map.meta.areaKm2).toLocaleString()+" km²":"Unavailable"}</dd><dt>Classes represented</dt><dd>{classes.filter(c=>c.value>0).length}</dd></dl>
    <h3>Share of mapped area</h3><div className="cover-stack">{classes.filter(c=>c.value>0).map(c=><span key={c.code} style={{width:c.value+"%",background:c.color}} title={c.name+" · "+pct(c.value)}/>)}</div></>:<p>No eligible classification for this region.</p>}
    <p>{product==="dynamic"?"Dynamic World uses cloud-masked imagery, a 0.60 confidence threshold and at least three classified months. Clearer areas may be overrepresented.":"GLC_FCS30D uses its historical land-cover classes on a sampled overview grid."}</p>
    <small>Processed through {current.through} · Latest available reference {periods.at(-1)?.year} · Exported {current.refreshedAt.slice(0,10)}</small></aside></div>
    <section className="state-board"><h2>{previous?"Change in mapped class shares":"Mapped class shares"}</h2>
    {previous&&prior&&row?<><p>{previous.year} ({pct(prior.coverage*100)} mapped) to {current.year} ({pct(row.coverage*100)} mapped). {current.ytd&&"The later period is year to date. "}{highest?.delta>0&&highest.name+" increased most ("+change(highest.delta)+"). "}{lowest&&lowest.delta<0&&lowest.name+" decreased most ("+change(lowest.delta)+")."}</p><p>Each share uses that year’s valid area. Differences can reflect coverage and seasonal sampling as well as land-cover change.</p></>:<p>No earlier comparable observation for this selection.</p>}
    <p>Comparisons stay within {names[product]}. GLC_FCS30D and Dynamic World classify land differently, so a 2022–2023 class difference is unavailable.</p>
    {row&&<table className="cover-table"><thead><tr><th>Land-cover class</th>{prior&&<th>{previous?.year}</th>}<th>{current.year}</th>{prior&&<th>Change (percentage points)</th>}</tr></thead><tbody>{shown.map(c=><tr key={c.code}><td><i style={{background:c.color}}/>{c.name}</td>{prior&&<td>{pct(c.base)}</td>}<td>{pct(c.value)}</td>{prior&&<td><div className="cover-delta" aria-hidden="true"><b style={{background:c.color,width:Math.abs(c.delta)/span*50+"%",left:c.delta>=0?"50%":(50-Math.abs(c.delta)/span*50)+"%"}}/></div>{change(c.delta)}</td>}</tr>)}</tbody></table>}</section><details className="state-board"><summary>Compare regions in {current.year}</summary>{current.rows.filter(valid).map(r=>{const top=palettes[product].reduce((a,b)=>(r.shares[b.code]??0)>(r.shares[a.code]??0)?b:a);return <p key={r.region}>{r.region} · {pct(r.coverage*100)} mapped · {top.name} {pct(r.shares[top.code])}</p>})}</details></>}</>;
}
