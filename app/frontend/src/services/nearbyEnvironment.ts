import {geoContains, geoDistance} from "d3-geo";
import {apiGet} from "./api";

type Sample = GeoJSON.Feature<GeoJSON.Point,Record<string,number>>;
async function loadReferences(){
  const [points, boundary]=await Promise.all([
    apiGet<GeoJSON.FeatureCollection<GeoJSON.Point,Record<string,number>>>("/api/environmental-reference"),
    fetch(import.meta.env.BASE_URL+"data/malaysia.json").then(r=>{
      if(!r.ok) throw Error("Country outline unavailable");
      return r.json();
    })
  ]);
  return {points,boundary};
}
let cached:ReturnType<typeof loadReferences>|undefined;
export async function nearbyEnvironment(location:[number,number]){
  cached??=loadReferences().catch(error=>{cached=undefined;throw error});
  const {points,boundary}=await cached;
  if(!geoContains(boundary,location))return null;
  let nearest:Sample|undefined;
  // A 10 km square has a centre-to-corner distance of about 7.1 km.
  let distance=7.1;
  for(const f of points.features){
    if(!Object.values(f.properties).some(Number.isFinite))continue;
    const km=geoDistance(location,f.geometry.coordinates as [number,number])*6371;
    if(km<=distance){nearest=f;distance=km}
  }
  return nearest?{values:nearest.properties,distance}:null;
}
