export type MapLabelKind = 'AREA' | 'ROAD' | 'LANDMARK';
export interface MapLabel { id:string; text:string; x:number; y:number; lat:number; lon:number; kind:MapLabelKind; priority:number; minZoom:number; maxZoom:number; highway:string; place:string; amenity:string; }
export let OSM_MAP_LABELS: MapLabel[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
export async function loadMapLabels(): Promise<void> {
  if (loaded) return; if (loading) return loading;
  loading = fetch('/data/mapLabels.json', { cache:'no-store' }).then(r => { if (!r.ok) throw new Error(`Map labels load failed: ${r.status}`); return r.json() as Promise<MapLabel[]>; }).then(v => { OSM_MAP_LABELS = v; loaded = true; });
  try { await loading; } finally { loading = null; }
}
