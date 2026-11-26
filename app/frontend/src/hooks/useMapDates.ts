import {useEffect,useState} from "react";

type MapMetadata = {source:string; status:string[]; unit:string; maximum:number; colors:string[]};
export type MapDates = Record<string, Record<string,MapMetadata>>;
export function useMapDates(){
  const [maps,setMaps]=useState<MapDates>({});
  useEffect(()=>{
    const controller=new AbortController();
    fetch(import.meta.env.BASE_URL+"data/environmental-map-dates.json",{signal:controller.signal})
      .then(response=>response.ok?response.json():{})
      .then(setMaps).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  return maps;
}
