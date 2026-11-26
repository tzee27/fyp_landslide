export type Factor = "rainfall"|"moisture"|"runoff";
export type Row = {factor: Factor; region: string; date: string; value: number | null; coverage: number; processingStatus?: string[]};
export type ObservationExport = {refreshedAt: string; regions: string[]; sources: Record<Factor,{product:string;unit:string}>; rows: Row[]};
export const valid = (row: Row) => row.value !== null && row.coverage >= .95;
export const format = (v: number | null) => v === null ? "Unavailable" : v.toLocaleString("en-MY",{maximumFractionDigits:3});
export const days = (from:string,to:string) => 1 + (Date.parse(to)-Date.parse(from))/86400000;

export function periods(rows:Row[], resolution:string, factor:Factor) {
  const groups = new Map<string,Row[]>();
  for (const row of rows) {
    const key = resolution==="Hourly"?row.date:row.date.slice(0,resolution==="Daily"?10:resolution==="Monthly"?7:4);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key,group);
  }
  return [...groups].map(([date,group])=>{
    const [year,month] = date.split("-").map(Number);
    const expected = resolution==="Daily"||resolution==="Hourly"?1:resolution==="Monthly"?new Date(Date.UTC(year,month,0)).getUTCDate():days(date+"-01-01",date+"-12-31");
    const sum = group.reduce((a,r)=>a+(r.value??0),0);
    return {date,value:group.length===expected && new Set(group.map(r=>r.date)).size===expected && group.every(valid)?sum/(factor==="moisture"?expected:1):null};
  });
}
