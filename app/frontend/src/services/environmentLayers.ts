export const environmentLayers = [
  {key:"terrain",name:"Elevation",group:"Terrain",unit:"m",range:"0–4,100",colors:"#307753 0%,#8db464 2.44%,#f0d77b 12.2%,#c68b45 24.4%,#93553c 48.8%,#f9f7e8",source:"SRTM · February 2000",description:"Green lowlands rise through gold uplands to pale peaks. Shading reveals ridges and valleys."},
  {key:"slope",name:"Slope",group:"Terrain",unit:"°",range:"0–90",colors:"#e8efb1,#b34420",source:"SRTM · February 2000",description:"Steepness derived from the 1 km overview terrain. Local slopes can be steeper."},
  {key:"aspect",name:"Aspect",group:"Terrain",unit:"°",range:"N 0 · E 90 · S 180 · W 270 · N 360",colors:"#436a9b,#d7af67,#ac6355,#658b72,#436a9b",source:"SRTM · February 2000",description:"Compass direction of the downhill slope at 1 km scale. Flat areas have no direction."},
  {key:"curvature",name:"Terrain curvature",group:"Terrain",unit:"m⁻¹",range:"−0.0003 to +0.0003",colors:"#805a92,#f5efd9,#427e71",source:"SRTM · February 2000",description:"Overview elevation Laplacian at 1 km scale. Negative values mark convex ground and positive values mark concave ground; extreme values share the endpoint colours."},
  {key:"roads",name:"Major roads",group:"Infrastructure and hydrology",unit:"",range:"Motorways and trunk roads",colors:"#985a41,#985a41",source:"© OpenStreetMap contributors · Geofabrik · snapshot date unspecified",description:"Simplified major road centrelines within Malaysia."},
  {key:"rivers",name:"Rivers",group:"Infrastructure and hydrology",unit:"",range:"Mapped river",colors:"#3e7398,#3e7398",source:"© OpenStreetMap contributors · Geofabrik · snapshot date unspecified",description:"Mapped river lines clipped to Malaysia. Smaller streams are excluded from this overview."},
  {key:"cover",name:"Land cover",group:"Land cover",unit:"class",range:"",colors:"",source:"GLC_FCS30D",description:"Each colour identifies the mapped land-cover class at a sampled raster pixel in the selected year."},
  ...[
    ["clay","Clay","#f3e4c9,#65392c"],["sand","Sand","#fff1ba,#aa6716"],
    ["silt","Silt","#e5edcf,#386347"],["bdod","Bulk density","#d6eff0,#156076"]
  ].map(([key,name,colors])=>({key,name,colors,group:"Soil",unit:key==="bdod"?"g/cm³":"%",range:key==="bdod"?"0–3":"0–100",source:"SoilGrids · static reference, observation year unspecified",description:key==="bdod"?"Dry soil mass per unit volume in the upper 5 cm.":"Estimated "+name.toLowerCase()+" content in the upper 5 cm of soil."}))
];
