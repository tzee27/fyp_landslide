import type {
  Incident,
  EnvironmentalLayer,
  SourceFreshness,
  ModelResult,
  SeriesPoint,
} from "../types";
export const categoryScale = [
  { name: "Very Low", max: 0.2, color: "#6e99b4" },
  { name: "Low", max: 0.4, color: "#84aea3" },
  { name: "Moderate", max: 0.6, color: "#d7c78b" },
  { name: "High", max: 0.8, color: "#d7ac77" },
  { name: "Very High", max: 1, color: "#c76957" },
];
export const classify = (score: number) =>
  categoryScale.find((c) => score <= c.max) ?? categoryScale[4];
export const places = [
  { name: "Malaysia", center: [109.5, 4] as [number, number], zoom: 4.7 },
  {
    name: "Cameron Highlands, Pahang",
    center: [101.38, 4.48] as [number, number],
    zoom: 10,
  },
  {
    name: "Hulu Langat, Selangor",
    center: [101.85, 3.1] as [number, number],
    zoom: 10,
  },
  {
    name: "Shah Alam, Selangor",
    center: [101.53, 3.08] as [number, number],
    zoom: 11,
  },
  {
    name: "Kundasang, Sabah",
    center: [116.58, 5.99] as [number, number],
    zoom: 10,
  },
  {
    name: "Kuching, Sarawak",
    center: [110.35, 1.55] as [number, number],
    zoom: 9,
  },
];
export const incidents: Incident[] = [
  {
    id: "seri-nilam",
    title: "Pangsapuri Seri Nilam",
    state: "Selangor",
    district: "Shah Alam",
    locality: "Near Jalan Sigma U6/14",
    reportedAt: "2026-11-02",
    occurredAt: null,
    kind: "reported-area",
    precision: "Named locality; exact event location unverified",
    coordinates: null,
    locator: [101.53, 3.15],
    description:
      "Historical demonstration scenario supplied in the project brief. Reports are grouped as one candidate event. The locality locator is not a landslide initiation point. Article URLs and occurrence date await source verification.",
    impacts: "Not independently verified",
    evidence: [
      {
        publisher: "RTM",
        title: "Supporting report described in the project brief",
        classification: "New occurrence",
      },
      {
        publisher: "Sinar Harian",
        title: "Related coverage described in the project brief",
        classification: "Follow-up report",
      },
    ],
    demo: true,
  },
  {
    id: "hulu-langat",
    title: "Hulu Langat district report",
    state: "Selangor",
    district: "Hulu Langat",
    locality: "District-level demonstration",
    reportedAt: "2026-10-28",
    occurredAt: null,
    kind: "reported-area",
    precision: "District-level; no event coordinates",
    coordinates: null,
    locator: [101.87, 3.12],
    description:
      "Synthetic ADINet-style report demonstrating area-level uncertainty. This is not a verified ADINet event or a training observation.",
    impacts: "Not available",
    evidence: [
      {
        publisher: "ADINet-style fixture",
        title: "Illustrative district report; original record not connected",
        classification: "New occurrence",
      },
    ],
    demo: true,
  },
  {
    id: "cameron-catalogue",
    title: "Cameron Highlands catalogue example",
    state: "Pahang",
    district: "Cameron Highlands",
    locality: "Synthetic sample point",
    reportedAt: "2020-11-12",
    occurredAt: "2020-11-10",
    kind: "historical",
    precision: "Synthetic point; not an actual COOLR record",
    coordinates: [101.38, 4.48],
    locator: [101.38, 4.48],
    description:
      "COOLR-format historical fixture for testing the interface. Coordinates and date are illustrative, not a sourced historical observation. Excluded from real model training.",
    impacts: "Not available",
    evidence: [
      {
        publisher: "COOLR-style fixture",
        title: "Illustrative historical catalogue entry",
        classification: "Retrospective article",
      },
    ],
    demo: true,
  },
  {
    id: "kundasang-sample",
    title: "Kundasang point example",
    state: "Sabah",
    district: "Ranau",
    locality: "Synthetic point verification example",
    reportedAt: "2024-01-18",
    occurredAt: "2024-01-17",
    kind: "verified-point",
    precision: "Demo of verified-point schema only",
    coordinates: [116.58, 5.99],
    locator: [116.58, 5.99],
    description:
      "Synthetic record showing how a precisely verified event would appear. No real verification or observed event is claimed.",
    impacts: "Not available",
    evidence: [],
    demo: true,
  },
  {
    id: "sarawak-lead",
    title: "Sarawak coverage awaiting review",
    state: "Sarawak",
    district: "Kuching",
    locality: "Illustrative news lead",
    reportedAt: "2026-10-26",
    occurredAt: null,
    kind: "news-lead",
    precision: "Unverified; excluded from occurrence counts",
    coordinates: null,
    locator: [110.35, 1.55],
    description:
      "Synthetic news lead for the review workflow. Not a confirmed landslide.",
    impacts: "Not available",
    evidence: [],
    demo: true,
  },
];
export const kindLabels = {
  "reported-area": "Reported area",
  "verified-point": "Verified point · demo",
  historical: "Historical fixture",
  "news-lead": "Unverified lead",
};
export const layers: EnvironmentalLayer[] = [
  {
    id: "susceptibility",
    name: "Susceptibility",
    group: "Model output",
    status: "demo",
    temporal: false,
  },
  ...["Elevation", "Slope", "Aspect", "Curvature", "Hillshade"].map((name) => ({
    id: name.toLowerCase(),
    name,
    group: "Terrain",
    status: "not-configured" as const,
    temporal: false,
  })),
  ...["Clay", "Sand", "Silt", "Bulk density"].map((name) => ({
    id: name.toLowerCase(),
    name,
    group: "Soil",
    status: "not-configured" as const,
    temporal: false,
  })),
  ...["Lithology", "Major faults", "Minor faults", "Distance to faults"].map(
    (name) => ({
      id: name.toLowerCase(),
      name,
      group: "Geology",
      status: "not-configured" as const,
      temporal: false,
    }),
  ),
  ...["Land cover", "Vegetation"].map((name) => ({
    id: name.toLowerCase(),
    name,
    group: "Land cover",
    status: "not-configured" as const,
    temporal: true,
  })),
  ...["Roads", "Waterways", "Distance to roads", "Distance to waterways"].map(
    (name) => ({
      id: name.toLowerCase(),
      name,
      group: "Infrastructure",
      status: "not-configured" as const,
      temporal: false,
    }),
  ),
  ...[
    "Daily rainfall",
    "Antecedent rainfall",
    "Soil moisture",
    "NASA LHASA external nowcast",
  ].map((name) => ({
    id: name.toLowerCase(),
    name,
    group: "Dynamic conditions",
    status: "not-configured" as const,
    temporal: true,
  })),
];
export const sources: SourceFreshness[] = [
  ["NASA COOLR", "Historical point inventory", "https://landslides.nasa.gov/"],
  [
    "JMG inventory",
    "Government inventory and geology",
    "https://www.jmg.gov.my/",
  ],
  [
    "ASEAN ADINet",
    "Reported area-level incidents",
    "https://adinet.ahacentre.org/",
  ],
  [
    "NASA SRTM",
    "Elevation and derived terrain",
    "https://www.earthdata.nasa.gov/",
  ],
  ["SoilGrids", "Soil composition and bulk density", "https://soilgrids.org/"],
  [
    "GLC_FCS30D / Dynamic World",
    "Land-cover histories",
    "https://dynamicworld.app/",
  ],
  [
    "OpenStreetMap / Geofabrik",
    "Roads and waterways",
    "https://download.geofabrik.de/asia/malaysia-singapore-brunei.html",
  ],
  ["NASA GPM IMERG", "Rainfall observations", "https://gpm.nasa.gov/"],
  ["METMalaysia", "Weather conditions", "https://www.met.gov.my/"],
  [
    "NASA LHASA",
    "External modelled hazard nowcast, not occurrences",
    "https://landslides.nasa.gov/",
  ],
  [
    "NADMA / publishers",
    "Original reports and evidence",
    "https://www.nadma.gov.my/",
  ],
].map(([name, purpose, url]) => ({
  name,
  purpose,
  url,
  status: "Not configured",
  updatedAt: null,
}));
export const models: ModelResult[] = [
  "Logistic Regression",
  "Random Forest",
  "XGBoost",
].map((name) => ({
  name,
  version: null,
  auc: null,
  precision: null,
  recall: null,
  f1: null,
  status: "Not trained",
}));
const rain = [7, 12, 4, 0, 18, 32, 21, 8, 5, 14, 39, 48, 27, 15];
export function timeSeries(location: string): SeriesPoint[] {
  const multiplier = location.includes("Sabah")
    ? 1.3
    : location.includes("Sarawak")
      ? 0.8
      : 1;
  return rain.map((r, i) => ({
    day: "Oct " + (i + 18),
    rainfall: Math.round(r * multiplier),
    antecedent: Math.round(
      rain.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b, 0) *
        multiplier,
    ),
    moisture: Math.round(38 + r * 0.46 * multiplier),
  }));
}
export const featureIllustration = [
  { name: "Slope", value: 28 },
  { name: "Antecedent rainfall", value: 22 },
  { name: "Lithology", value: 16 },
  { name: "Land cover", value: 13 },
  { name: "Road proximity", value: 11 },
  { name: "Soil composition", value: 10 },
];
export const demoZones: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    { c: [101.38, 4.48], score: 0.84 },
    { c: [101.85, 3.1], score: 0.65 },
    { c: [116.58, 5.99], score: 0.91 },
    { c: [110.35, 1.55], score: 0.34 },
    { c: [102.5, 4.3], score: 0.51 },
    { c: [113.7, 3.3], score: 0.15 },
  ].map(({ c, score }) => ({
    type: "Feature",
    properties: {
      score,
      color: classify(score).color,
      label: classify(score).name,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [c[0] - 0.12, c[1] - 0.1],
          [c[0] + 0.12, c[1] - 0.1],
          [c[0] + 0.12, c[1] + 0.1],
          [c[0] - 0.12, c[1] + 0.1],
          [c[0] - 0.12, c[1] - 0.1],
        ],
      ],
    },
  })),
};
