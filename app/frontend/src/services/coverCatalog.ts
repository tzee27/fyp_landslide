import {useEffect,useState} from "react";
import {apiBase,apiGet} from "./api";
import historicClasses from "./landCoverClasses.json";
import dynamicClasses from "./dynamicCoverClasses.json";

export type Product="dynamic"|"glc";
export type Row={region:string;coverage:number;shares:Record<string,number>};
export type Period={year:number;through:string;sourceThrough?:string;ytd:boolean;refreshedAt:string;rows:Row[]};
export const palettes={glc:historicClasses,dynamic:dynamicClasses};
export const names={glc:"GLC_FCS30D",dynamic:"Dynamic World V1"};
export const coverPath="/api/environmental-analytics";
export const previewUrl=(p:Product,y:Period,kind:string,region:string)=>coverPath+"/cover-preview/"+p+"/"+y.year+"/"+kind+"?"+new URLSearchParams({region,v:y.refreshedAt});
export const imageUrl=(p:Product,y:Period,region:string)=>apiBase+previewUrl(p,y,"image",region);
export const valid=(r:Row)=>r.coverage>0&&r.coverage<=1&&Object.values(r.shares).every(v=>Number.isFinite(v)&&v>=0)&&Math.abs(Object.values(r.shares).reduce((a,b)=>a+b,0)-100)<.001;

export function useCoverCatalog(){
  const [years,setYears]=useState<Record<Product,Period[]>>({glc:[],dynamic:[]});
  const [errors,setErrors]=useState<Record<string,string>>({});
  useEffect(()=>{
    const c=new AbortController();
    async function load(p:Product){
      try{
        let periods:Period[];
        if(p==="dynamic"){
          periods=(await apiGet<{years:Period[]}>(coverPath+"/dynamic-world",c.signal)).years;
        }else{
          const resp=await fetch(import.meta.env.BASE_URL+"data/land-cover-composition.json",{signal:c.signal,cache:"no-cache"});
          if(!resp.ok)throw Error();
          const d:{rows:(Row&{year:number})[];refreshedAt:string}=await resp.json();
          periods=[...new Set(d.rows.map(r=>r.year))].map(year=>({year,through:year+"-12-31",ytd:false,refreshedAt:d.refreshedAt,rows:d.rows.filter(r=>r.year===year)}));
        }
        const published=periods.filter(y=>y.rows.some(r=>r.region==="Whole Malaysia"&&valid(r))).sort((a,b)=>a.year-b.year);
        setYears(previous=>({...previous,[p]:published}));
        setErrors(previous=>({...previous,[p]:""}));
      }catch{if(!c.signal.aborted)setErrors(previous=>({...previous,[p]:names[p]+" catalogue unavailable."}));}
    }
    const refresh=()=>{void load("dynamic");void load("glc")};
    refresh();const timer=setInterval(refresh,60000);return ()=>{clearInterval(timer);c.abort()};
  },[]);
  return {years,errors};
}
export type CoverMeta={areaKm2:number;coordinates:[[number,number],[number,number],[number,number],[number,number]]};
export function usePreview(product:Product,period:Period|undefined,region:string){
  const path=period?previewUrl(product,period,"metadata",region):"";
  const [state,setState]=useState<{path:string;meta?:CoverMeta;error?:string}>();
  useEffect(()=>{
    if(!path)return;
    const c=new AbortController();
    apiGet<CoverMeta>(path,c.signal).then(meta=>setState({path,meta})).catch(()=>{if(!c.signal.aborted)setState({path,error:"Map preview unavailable."})});
    return ()=>c.abort();
  },[path]);
  return state?.path===path?state:undefined;
}
