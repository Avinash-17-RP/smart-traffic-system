import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Locate, ZoomIn, ZoomOut, RotateCcw, Zap, ShieldAlert, Split, Layers, MapPin, Navigation, Sparkles, Building2, Store, Ambulance, Hospital, Car } from 'lucide-react';
import { loadNetwork, INITIAL_JUNCTIONS, INITIAL_ROADS, MAP_WIDTH, MAP_HEIGHT, getRoadBetween, HOSPITAL_IDS } from '../controlroom/data/network';
import { loadMapLabels, OSM_MAP_LABELS } from '../controlroom/data/mapLabels';
import { DESTINATION_INFO, DESTINATION_IDS, DESTINATION_BY_ID, DestinationInfo } from '../controlroom/data/destinations';
import { astar } from '../controlroom/algorithms/astar';
import { dijkstra } from '../controlroom/algorithms/dijkstra';
import { useSimulationStore } from '../controlroom/store/simulationStore';
import type { Junction, Road, Vehicle } from '../controlroom/types';

const W = 960;
const H = 600;
const MAP_PAD = 10;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 12;

type Point = { x: number; y: number };

export interface RouteSummary {
  algorithm: 'shortest' | 'emergency' | 'loadbalance';
  startJunction: Junction;
  endJunction: Junction;
  pathJunctions: Junction[];
  pathRoadIds: string[];
  distanceKm: number;
  etaMinutes: number;
  totalCost: number;
  nodesExplored?: number;
  vehicleCount?: number;
  avgCongestion?: number;
  nearestHospital?: { name: string; distKm: number; id: string } | null;
  routeSegments?: number;
}

interface CoimbatoreMapProps {
  onRouteCalculated?: (summary: RouteSummary | null) => void;
  height?: string;
  selectedAlgorithm?: 'shortest' | 'emergency' | 'loadbalance';
  onSelectJunction?: (junction: Junction) => void;
  external3DMode?: boolean;
}

// Hospital node IDs set for quick lookup in rendering
const HOSPITAL_ID_SET = new Set(HOSPITAL_IDS);

// 50 Iconic Coimbatore Area Hubs & Main Landmark Nodes (Styled in Vibrant Blue Text)
// Hospital nodes are shown in red with 🏥 icon
export const MAIN_AREA_NODES = [
  { id: '1482456201', name: 'Cross Cut Rd (Shopping Hub)', x: 444, y: 252, color: '#38bdf8', icon: '🛍️' },
  { id: '9921938865', name: 'Gandhipuram Central Bus Stand', x: 448, y: 248, color: '#38bdf8', icon: '🚌' },
  { id: '9687959213', name: 'Brookefields Mall', x: 405, y: 278, color: '#38bdf8', icon: '🛍️' },
  { id: '330044079', name: 'RS Puram (DB Road & Sri Krishna Sweets)', x: 385, y: 286, color: '#38bdf8', icon: '🍬' },
  { id: '1474420222', name: 'Ukkadam Bus Stand & Lake', x: 427, y: 342, color: '#38bdf8', icon: '🚌' },
  { id: '9322756498', name: 'Town Hall (Big Bazaar St)', x: 404, y: 323, color: '#38bdf8', icon: '🏢' },
  { id: '4594632777', name: 'Singanallur Bus Terminal', x: 629, y: 303, color: '#38bdf8', icon: '🚌' },
  { id: '9225687032', name: 'Race Course Walkway & Cafes', x: 476, y: 309, color: '#38bdf8', icon: '🏃' },
  { id: '6965305056', name: 'Coimbatore Railway Junction', x: 428, y: 307, color: '#38bdf8', icon: '🚆' },
  // ── Hospital Nodes (Red markers) ──
  { id: '10593619297', name: 'PSG Hospitals & PSG Tech', x: 546, y: 221, color: '#ef4444', icon: '🏥' },
  { id: '9255100786', name: 'KMCH Hospital (Avinashi Rd)', x: 695, y: 170, color: '#ef4444', icon: '🏥' },
  { id: '13999738605', name: 'Ganga Hospital (Ram Nagar)', x: 388, y: 215, color: '#ef4444', icon: '🏥' },
  { id: '11760103234', name: 'GKNM Hospital', x: 460, y: 230, color: '#ef4444', icon: '🏥' },
  { id: '13999738905', name: 'Sri Ramakrishna Hospital', x: 420, y: 205, color: '#ef4444', icon: '🏥' },
  { id: '2166442088', name: 'KG Hospital', x: 475, y: 280, color: '#ef4444', icon: '🏥' },
  { id: '2173379743', name: 'Podanur Government Hospital', x: 510, y: 395, color: '#ef4444', icon: '🏥' },
  // ── Regular Landmarks ──
  { id: '12381407399', name: 'Tidel Park Coimbatore (ELCOT SEZ)', x: 625, y: 195, color: '#38bdf8', icon: '💻' },
  { id: '2166371123', name: 'CIT College (Coimbatore Institute of Tech)', x: 655, y: 210, color: '#38bdf8', icon: '🎓' },
  { id: '3624457613', name: 'Coimbatore International Airport (CJB)', x: 675, y: 180, color: '#38bdf8', icon: '✈️' },
  { id: '802493247', name: 'Lakshmi Mills Urban Junction', x: 495, y: 265, color: '#38bdf8', icon: '🏢' },
  { id: '5325645821', name: 'Vadakovai (Avinashi Flyover)', x: 418, y: 258, color: '#38bdf8', icon: '📍' },
  { id: '4961511852', name: 'Saibaba Colony (NSR Road)', x: 365, y: 195, color: '#38bdf8', icon: '☕' },
  { id: '1482456202', name: 'Ganapathy Junction (Sathy Road)', x: 462, y: 175, color: '#38bdf8', icon: '📍' },
  { id: '1450492159', name: 'Saravanampatti (IT Corridor & SEZ)', x: 564, y: 53, color: '#38bdf8', icon: '💻' },
  { id: '247429168', name: 'Thudiyalur Commercial Junction', x: 359, y: 45, color: '#38bdf8', icon: '🛒' },
  { id: '247429169', name: 'Koundampalayam (MTP Road)', x: 362, y: 135, color: '#38bdf8', icon: '📍' },
  { id: '803093962', name: 'Ramanathapuram (Trichy Road)', x: 520, y: 325, color: '#38bdf8', icon: '📍' },
  { id: '294521062', name: 'Perur Pateeswarar Temple', x: 266, y: 391, color: '#38bdf8', icon: '🛕' },
  { id: '4845915135', name: 'Eachanari Vinayagar Temple', x: 484, y: 513, color: '#38bdf8', icon: '🛕' },
  { id: '4845915136', name: 'Sundarapuram Junction (Pollachi Rd)', x: 465, y: 440, color: '#38bdf8', icon: '📍' },
  { id: '12918595310', name: 'Kovaipudur (Knowledge City)', x: 349, y: 494, color: '#38bdf8', icon: '🎓' },
  { id: '294521063', name: 'Kuniyamuthur (Palakkad Road)', x: 380, y: 410, color: '#38bdf8', icon: '📍' },
  { id: '330044080', name: 'Vadavalli (Marudhamalai Road)', x: 245, y: 220, color: '#38bdf8', icon: '🛕' },
  { id: '330044081', name: 'GCT Coimbatore (Thadagam Road)', x: 325, y: 245, color: '#38bdf8', icon: '🎓' },
  { id: '4594632778', name: 'Ondipudur Flyover & Bus Depot', x: 710, y: 295, color: '#38bdf8', icon: '🚌' },
  { id: '3624457615', name: 'Neelambur (L&T Bypass NH544)', x: 780, y: 165, color: '#38bdf8', icon: '🛣️' },
  { id: '4594632779', name: 'Sulur Airforce & Town Junction', x: 820, y: 270, color: '#38bdf8', icon: '✈️' },
  // ── OSM Area Neighborhood Nodes ──
  { id: '9255695716', name: 'Podanur', x: 513, y: 451, color: '#38bdf8', icon: '📍' },
  { id: '11402867044', name: 'Avarampalayam', x: 503, y: 216, color: '#38bdf8', icon: '📍' },
  { id: '9847776714', name: 'Chinnavedampatti', x: 499, y: 104, color: '#38bdf8', icon: '📍' },
  { id: '2168481579', name: 'Civil Aerodrome', x: 681, y: 191, color: '#38bdf8', icon: '✈️' },
  { id: '11395689090', name: 'Ganapathy', x: 479, y: 186, color: '#38bdf8', icon: '📍' },
  { id: '2174840636', name: 'GN Mills', x: 368, y: 113, color: '#38bdf8', icon: '📍' },
  { id: '2173574677', name: 'Idayarpalayam', x: 304, y: 182, color: '#38bdf8', icon: '📍' },
  { id: '1181546472', name: 'Kalapatti', x: 674, y: 52, color: '#38bdf8', icon: '📍' },
  { id: '11050836221', name: 'Kaundampalayam', x: 374, y: 164, color: '#38bdf8', icon: '📍' },
  { id: '5748665262', name: 'Kuniamuthur', x: 407, y: 425, color: '#38bdf8', icon: '📍' },
  { id: '2168313952', name: 'Nanjundapuram', x: 535, y: 391, color: '#38bdf8', icon: '📍' },
  { id: '9995134636', name: 'PN Pudur', x: 295, y: 247, color: '#38bdf8', icon: '📍' },
  { id: '330059870', name: 'Puliakulam', x: 525, y: 298, color: '#38bdf8', icon: '📍' },
  { id: '1425166501', name: 'Ram Nagar', x: 428, y: 268, color: '#38bdf8', icon: '📍' },
  { id: '2160970553', name: 'Rathinapuri', x: 426, y: 226, color: '#38bdf8', icon: '📍' },
  { id: '12375018402', name: 'Red Fields', x: 505, y: 300, color: '#38bdf8', icon: '📍' },
  { id: '11439794127', name: 'Seeranaickenpalayam', x: 300, y: 277, color: '#38bdf8', icon: '📍' },
  { id: '3273721540', name: 'Selvapuram', x: 358, y: 351, color: '#38bdf8', icon: '📍' },
  { id: '5354219640', name: 'Siddhapudur', x: 473, y: 244, color: '#38bdf8', icon: '📍' },
  { id: '9847700708', name: 'Sivanandhapuram', x: 548, y: 111, color: '#38bdf8', icon: '📍' },
  { id: '9926154424', name: 'Sowripalayam', x: 576, y: 281, color: '#38bdf8', icon: '📍' },
  { id: '9651216868', name: 'Sundakkamuthur', x: 294, y: 453, color: '#38bdf8', icon: '📍' },
  { id: '1481349365', name: 'Tatabad', x: 410, y: 249, color: '#38bdf8', icon: '📍' },
  { id: '5563766746', name: 'Udayampalayam', x: 567, y: 278, color: '#38bdf8', icon: '📍' },
  { id: '11173439482', name: 'Uppilipalayam', x: 622, y: 274, color: '#38bdf8', icon: '📍' },
  { id: '5508902754', name: 'Veerakeralam', x: 260, y: 293, color: '#38bdf8', icon: '📍' },
  { id: '5666972111', name: 'Velandipalayam', x: 324, y: 216, color: '#38bdf8', icon: '📍' },
  { id: '1181546167', name: 'Villankurichi', x: 608, y: 69, color: '#38bdf8', icon: '📍' },
  { id: '1468079323', name: 'Five Corner', x: 421, y: 329, color: '#38bdf8', icon: '📍' },
  { id: '13788933676', name: 'Appanaickenpalayam', x: 301, y: 52, color: '#38bdf8', icon: '📍' },
  { id: '9804212135', name: 'Subramaniapalayam', x: 330, y: 106, color: '#38bdf8', icon: '📍' },
  { id: '11386958815', name: 'Telungupalayam', x: 317, y: 331, color: '#38bdf8', icon: '📍' },
  { id: '5586199197', name: 'Kovilmedu', x: 317, y: 203, color: '#38bdf8', icon: '📍' },
  { id: '3814106389', name: 'Krishnaswamy Nagar', x: 549, y: 309, color: '#38bdf8', icon: '📍' },
  { id: '12373334601', name: 'Maniyakaranpalayam', x: 468, y: 154, color: '#38bdf8', icon: '📍' },
  { id: '12383687024', name: 'Cheran Nagar', x: 368, y: 141, color: '#38bdf8', icon: '📍' },
  { id: '12383687102', name: 'Housing Unit', x: 380, y: 180, color: '#38bdf8', icon: '📍' },
  { id: '6581543461', name: 'Vellakinar', x: 405, y: 70, color: '#38bdf8', icon: '📍' },
  { id: '8452057634', name: 'Udayampalayam North', x: 447, y: 124, color: '#38bdf8', icon: '📍' },
  { id: '2163640625', name: 'Sivananda Colony', x: 409, y: 239, color: '#38bdf8', icon: '📍' },
  { id: '11052551889', name: 'Argus Nagar', x: 609, y: 221, color: '#38bdf8', icon: '📍' },
  { id: '2685083685', name: 'Kurunji Nagar', x: 512, y: 100, color: '#38bdf8', icon: '📍' },
];

// Clean, high-contrast road colors (NO white patches or blue haze)
function getRoadStrokeColor(road: Road): string {
  if (road.isBlocked) return '#ef4444';
  if (road.congestionLevel >= 0.80) return '#ef4444'; // Red for congested
  if (road.congestionLevel >= 0.60) return '#f97316'; // Orange
  if (road.congestionLevel >= 0.40) return '#f59e0b'; // Amber
  if (road.congestionLevel >= 0.20) return '#10b981'; // Emerald
  return '#3b485d'; // Crisp dark steel slate for primary avenues (NO white shades)
}

function getSignalColor(phase: string): string {
  if (phase === 'GREEN') return '#22c55e';
  if (phase === 'YELLOW') return '#eab308';
  return '#ef4444';
}

function getVehicleColor(vehicle: Vehicle): string {
  if (vehicle.type === 'AMBULANCE') return '#ef4444';
  if (vehicle.type === 'BUS') return '#a78bfa';
  if (vehicle.state === 'WAITING') return '#64748b';
  if (vehicle.state === 'REROUTING') return '#facc15';
  return '#34d399'; // Emerald / Mint for normal vehicles
}

export const CoimbatoreMap: React.FC<CoimbatoreMapProps> = ({
  onRouteCalculated,
  height = '680px',
  selectedAlgorithm = 'shortest',
  onSelectJunction,
  external3DMode,
}) => {
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [algoMode, setAlgoMode] = useState<'shortest' | 'emergency' | 'loadbalance'>(selectedAlgorithm);

  // 3D Isometric View Mode state
  const [is3DView, setIs3DView] = useState(false);

  // Sync external 3D mode if passed
  useEffect(() => {
    if (external3DMode !== undefined) setIs3DView(external3DMode);
  }, [external3DMode]);

  // User-selected Start & Destination points (NO hardcoded default!)
  const [startPoint, setStartPoint] = useState<Junction | null>(null);
  const [endPoint, setEndPoint] = useState<Junction | null>(null);

  // User Geolocation
  const [userLocation, setUserLocation] = useState<{ x: number; y: number; name: string } | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DestinationInfo[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Route State
  const [activeRoute, setActiveRoute] = useState<RouteSummary | null>(null);

  // Central Control Room simulation store
  const { junctions, roads, vehicles, greenCorridorJunctions, greenCorridorRoads } = useSimulationStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPointer = useRef<Point>({ x: 0, y: 0 });
  const viewportRef = useRef({ width: W, height: H, baseScale: 1, offsetX: 0, offsetY: 0 });
  const baseScaleRef = useRef<number | null>(null);
  const lockedOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Load OSM dataset & force re-render
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await Promise.all([loadNetwork(), loadMapLabels()]);
        if (active) {
          useSimulationStore.getState().setScenario('NORMAL');
          setDataVersion(v => v + 1);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load Coimbatore map data:', err);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Sync prop changes
  useEffect(() => {
    setAlgoMode(selectedAlgorithm);
  }, [selectedAlgorithm]);

  // Road and Junction lists
  const junctionList = useMemo(() => Object.values(junctions.length ? junctions : INITIAL_JUNCTIONS), [junctions, dataVersion]);
  const roadList = useMemo(() => Object.values(INITIAL_ROADS), [dataVersion]);
  const vehicleList = useMemo(() => Object.values(vehicles).slice(0, 100), [vehicles]);

  // Separate Main Avenues and Local Streets for Crisp Vector Rendering
  const { mainRoads, localRoads } = useMemo(() => {
    const mains: Road[] = [];
    const locals: Road[] = [];
    for (const r of roadList) {
      if (r.lanes > 1 || r.capacity > 20) mains.push(r);
      else locals.push(r);
    }
    return { mainRoads: mains, localRoads: locals };
  }, [roadList]);

  // 50 Clean Landmark Destinations & Famous Shops
  const destinationJunctions = useMemo(() => {
    const list: Junction[] = [];
    const seen = new Set<string>();

    DESTINATION_INFO.forEach(d => {
      const j = junctions[d.id] || INITIAL_JUNCTIONS[d.id];
      if (j && !seen.has(j.id)) {
        list.push(j);
        seen.add(j.id);
      }
    });

    MAIN_AREA_NODES.forEach(m => {
      const j = junctions[m.id] || INITIAL_JUNCTIONS[m.id];
      if (j && !seen.has(j.id)) {
        list.push(j);
        seen.add(j.id);
      }
    });

    if (startPoint && !seen.has(startPoint.id)) list.push(startPoint);
    if (endPoint && !seen.has(endPoint.id)) list.push(endPoint);

    return list;
  }, [junctions, dataVersion, startPoint, endPoint]);

  const routeRoadIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeRoute) return ids;
    activeRoute.pathRoadIds.forEach(id => ids.add(id));
    return ids;
  }, [activeRoute]);

  const corridorRoadSet = useMemo(() => new Set(greenCorridorRoads), [greenCorridorRoads]);
  const corridorJunctionSet = useMemo(() => new Set(greenCorridorJunctions), [greenCorridorJunctions]);

  // Viewport calculation
  const getViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return viewportRef.current;
    const rect = canvas.getBoundingClientRect();
    if (baseScaleRef.current == null) {
      baseScaleRef.current = Math.max(rect.width / W, rect.height / H);
    }
    const baseScale = baseScaleRef.current;
    if (lockedOffsetRef.current == null) {
      lockedOffsetRef.current = {
        x: (rect.width - W * baseScale) / 2,
        y: (rect.height - H * baseScale) / 2,
      };
    }
    const offsetX = lockedOffsetRef.current.x;
    const offsetY = lockedOffsetRef.current.y;
    const viewport = { width: rect.width, height: rect.height, baseScale, offsetX, offsetY };
    viewportRef.current = viewport;
    return viewport;
  }, []);

  const clampPan = useCallback((next: Point, z: number): Point => {
    const visibleWorldW = W / z;
    const visibleWorldH = H / z;
    const minX = Math.min(0, visibleWorldW - W);
    const maxX = Math.max(0, visibleWorldW - W);
    const minY = Math.min(0, visibleWorldH - H);
    const maxY = Math.max(0, visibleWorldH - H);
    return {
      x: Math.min(maxX, Math.max(minX, next.x)),
      y: Math.min(maxY, Math.max(minY, next.y)),
    };
  }, []);

  const screenToWorld = useCallback((x: number, y: number) => {
    const v = viewportRef.current;
    const z = zoomRef.current;
    const p = panRef.current;
    return {
      x: ((x - v.offsetX) / (v.baseScale * z)) - p.x,
      y: ((y - v.offsetY) / (v.baseScale * z)) - p.y,
    };
  }, []);

  // Main Canvas Rendering Frame with Clean Obsidian Palette (NO Middle Blue Distortions!)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const v = getViewport();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#070a10'; // Deep Obsidian Dark Canvas
    ctx.fillRect(0, 0, rect.width, rect.height);

    const sx = v.baseScale * zoom;
    const tx = v.offsetX + pan.x * sx;
    const ty = v.offsetY + pan.y * sx;

    const mapX = MAP_PAD;
    const mapY = MAP_PAD;
    const mapW = Math.max(1, rect.width - MAP_PAD * 2);
    const mapH = Math.max(1, rect.height - MAP_PAD * 2);

    ctx.save();
    ctx.beginPath();
    const radius = 14;
    ctx.roundRect(mapX, mapY, mapW, mapH, radius);
    ctx.clip();

    ctx.setTransform(dpr * sx, 0, 0, dpr * sx, dpr * tx, dpr * ty);

    const left = -pan.x - 20 / sx;
    const top = -pan.y - 20 / sx;
    const right = -pan.x + W / zoom + 20 / sx;
    const bottom = -pan.y + H / zoom + 20 / sx;

    // ── 1. DRAW CRISP VECTOR LOCAL STREETS (Neutral Charcoal/Dark Slate) ──
    ctx.strokeStyle = '#1a2230';
    ctx.lineWidth = 0.8 / sx;
    ctx.beginPath();
    for (const r of localRoads) {
      const u = INITIAL_JUNCTIONS[r.from];
      const v = INITIAL_JUNCTIONS[r.to];
      if (u && v) {
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
      }
    }
    ctx.stroke();

    // ── 2. DRAW CRISP VECTOR PRIMARY AVENUES & HIGHWAYS (High-contrast clean colors, NO White Slabs) ──
    ctx.lineWidth = 1.8 / sx;
    for (const r of mainRoads) {
      const simRoad = roads[r.id] ?? r;
      const u = INITIAL_JUNCTIONS[r.from];
      const v = INITIAL_JUNCTIONS[r.to];
      if (u && v) {
        ctx.beginPath();
        ctx.strokeStyle = getRoadStrokeColor(simRoad);
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      }
    }

    // ── 3. DRAW SPECIFIC OSM STREET & AVENUE LABELS ON ZOOM ──
    if (zoom >= 1.2 && OSM_MAP_LABELS && OSM_MAP_LABELS.length > 0) {
      const visibleLabels = OSM_MAP_LABELS
        .filter(label => label.minZoom <= zoom && zoom <= label.maxZoom &&
          label.x >= left && label.x <= right && label.y >= top && label.y <= bottom)
        .sort((a, b) => b.priority - a.priority);

      const acceptedLabelBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      const labelCap = zoom < 2 ? 30 : zoom < 4 ? 60 : 100;
      let drawnLabels = 0;

      for (const label of visibleLabels) {
        if (drawnLabels >= labelCap) break;
        const fontPx = label.kind === 'AREA' ? (zoom < 1.4 ? 12 : 13) : label.kind === 'ROAD' ? 10 : 9;
        const fontWeight = label.kind === 'AREA' ? 700 : label.kind === 'ROAD' ? 600 : 500;
        
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `${fontWeight} ${fontPx}px Inter, Segoe UI, sans-serif`;
        const screenPt = { x: tx + label.x * sx, y: ty + label.y * sx };
        const textWidth = ctx.measureText(label.text).width;
        const box = { left: screenPt.x - textWidth / 2 - 3, top: screenPt.y - fontPx - 2, right: screenPt.x + textWidth / 2 + 3, bottom: screenPt.y + 4 };
        
        if (box.right < MAP_PAD || box.left > rect.width - MAP_PAD || box.bottom < MAP_PAD || box.top > rect.height - MAP_PAD) continue;
        const overlaps = acceptedLabelBoxes.some(b => !(box.right < b.left - 6 || box.left > b.right + 6 || box.bottom < b.top - 4 || box.top > b.bottom + 4));
        if (overlaps) continue;

        acceptedLabelBoxes.push(box);
        drawnLabels++;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(7, 10, 16, 0.95)';
        ctx.strokeText(label.text, screenPt.x, screenPt.y);
        ctx.fillStyle = label.kind === 'AREA' ? '#93c5fd' : label.kind === 'ROAD' ? '#94a3b8' : '#cbd5e1';
        ctx.fillText(label.text, screenPt.x, screenPt.y);
      }

      ctx.setTransform(dpr * sx, 0, 0, dpr * sx, dpr * tx, dpr * ty);
    }

    // ── 4. DRAW ACTIVE GLOWING ROUTE LASER CORRIDOR (Thin, Sleek & Laser-Precise) ──
    if (activeRoute && activeRoute.pathJunctions.length > 1) {
      ctx.save();
      const pathPts = activeRoute.pathJunctions;
      
      // Outer neon stroke
      ctx.beginPath();
      ctx.moveTo(pathPts[0].x, pathPts[0].y);
      for (let i = 1; i < pathPts.length; i++) {
        ctx.lineTo(pathPts[i].x, pathPts[i].y);
      }
      ctx.strokeStyle = algoMode === 'emergency' ? '#10b981' : '#00e5ff';
      ctx.lineWidth = 3.0 / sx;
      ctx.shadowColor = algoMode === 'emergency' ? '#10b981' : '#00e5ff';
      ctx.shadowBlur = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Inner white core line
      ctx.beginPath();
      ctx.moveTo(pathPts[0].x, pathPts[0].y);
      for (let i = 1; i < pathPts.length; i++) {
        ctx.lineTo(pathPts[i].x, pathPts[i].y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0 / sx;
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();
    }

    // ── 5. MOVING SIMULATION VEHICLES ──
    for (const vehicle of vehicleList) {
      if (vehicle.state === 'COMPLETED') continue;
      if (vehicle.x < left || vehicle.x > right || vehicle.y < top || vehicle.y > bottom) continue;
      const amb = vehicle.type === 'AMBULANCE';
      const rPx = amb ? 4.5 : vehicle.type === 'BUS' ? 3.5 : 2.5;
      const r = rPx / sx;
      ctx.beginPath();
      ctx.arc(vehicle.x, vehicle.y, r, 0, Math.PI * 2);
      ctx.fillStyle = getVehicleColor(vehicle);
      ctx.globalAlpha = vehicle.state === 'WAITING' && vehicle.type !== 'AMBULANCE' ? 0.6 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (amb) {
        ctx.beginPath();
        ctx.arc(vehicle.x, vehicle.y, (rPx + 3) / sx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239,68,68,0.5)';
        ctx.lineWidth = 1.0 / sx;
        ctx.stroke();
      }
    }

    // ── 6. 50 CLEAN LANDMARK DESTINATION NODES WITH FAMOUS SHOPS & LABELS ──
    for (const j of destinationJunctions) {
      if (j.x < left || j.x > right || j.y < top || j.y > bottom) continue;
      const info = DESTINATION_BY_ID.get(j.id);
      const isStart = startPoint?.id === j.id;
      const isEnd = endPoint?.id === j.id;
      const isHosp = HOSPITAL_ID_SET.has(j.id);
      const corridor = corridorJunctionSet.has(j.id);
      const radiusPx = isStart || isEnd ? 7 : isHosp ? 6 : 5;
      const r = radiusPx / sx;

      // Hospital: pulsing red outer ring
      if (isHosp && !isStart && !isEnd) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(j.x, j.y, (radiusPx + 5) / sx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.lineWidth = 1.5 / sx;
        ctx.stroke();
        ctx.restore();
      }

      // Outer Glow Halo
      ctx.beginPath();
      ctx.arc(j.x, j.y, (radiusPx + 3) / sx, 0, Math.PI * 2);
      ctx.strokeStyle = isStart ? '#ef4444' : isEnd ? '#10b981' : isHosp ? '#ef4444' : corridor ? '#4ade80' : '#f59e0b';
      ctx.globalAlpha = isStart || isEnd || corridor || isHosp ? 0.95 : 0.6;
      ctx.lineWidth = 1.2 / sx;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Node core
      ctx.beginPath();
      ctx.arc(j.x, j.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isStart ? '#ef4444' : isEnd ? '#10b981' : isHosp ? '#7f1d1d' : '#0f172a';
      ctx.strokeStyle = isStart ? '#ffffff' : isEnd ? '#ffffff' : isHosp ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = isHosp ? 1.5 / sx : 1.2 / sx;
      ctx.fill();
      ctx.stroke();

      // Hospital cross marker inside node
      if (isHosp && !isStart && !isEnd) {
        const crossSize = 2.5 / sx;
        const crossWidth = 1.2 / sx;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = crossWidth;
        ctx.lineCap = 'round';
        // Vertical bar
        ctx.beginPath();
        ctx.moveTo(j.x, j.y - crossSize);
        ctx.lineTo(j.x, j.y + crossSize);
        ctx.stroke();
        // Horizontal bar
        ctx.beginPath();
        ctx.moveTo(j.x - crossSize, j.y);
        ctx.lineTo(j.x + crossSize, j.y);
        ctx.stroke();
      }

      // Traffic Signal dot (skip for hospitals to keep clean)
      if (!isHosp) {
        ctx.beginPath();
        ctx.arc(j.x + 3.0 / sx, j.y - 3.0 / sx, 1.8 / sx, 0, Math.PI * 2);
        ctx.fillStyle = getSignalColor(j.signalPhase);
        ctx.fill();
      }

      // Clean Landmark Text Label with Icon badge
      const icon = isHosp ? '🏥' : (info?.icon || '📍');
      const labelText = info?.label || j.name.replace('Junction ', '');
      
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${10 / sx}px Inter, Segoe UI, sans-serif`;
      ctx.lineWidth = 2.5 / sx;
      ctx.strokeStyle = 'rgba(7, 10, 16, 0.95)';
      ctx.strokeText(`${icon} ${labelText}`, j.x + 10 / sx, j.y - 2 / sx);
      ctx.fillStyle = isStart ? '#fca5a5' : isEnd ? '#86efac' : isHosp ? '#fca5a5' : '#38bdf8';
      ctx.fillText(`${icon} ${labelText}`, j.x + 10 / sx, j.y - 2 / sx);

      // Category / Shop type subtitle on zoom
      if (zoom >= 1.2 && info?.type) {
        ctx.font = `600 ${7.5 / sx}px monospace`;
        ctx.fillStyle = isStart ? '#ef4444' : isEnd ? '#10b981' : isHosp ? '#f87171' : '#7dd3fc';
        ctx.fillText(`• ${info.type}`, j.x + 10 / sx, j.y + 8 / sx);
      }
    }

    // User Location GPS Pin
    if (userLocation) {
      const r = 5 / sx;
      ctx.beginPath();
      ctx.arc(userLocation.x, userLocation.y, (r + 3) / sx, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2 / sx;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(userLocation.x, userLocation.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0ea5e9';
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.font = `bold ${8.5 / sx}px Inter, sans-serif`;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('📍 YOU', userLocation.x, userLocation.y - 10 / sx);
    }

    ctx.restore();

    // Map frame border
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapW, mapH, radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [junctions, roads, mainRoads, localRoads, vehicleList, destinationJunctions, zoom, pan,
      corridorRoadSet, corridorJunctionSet, routeRoadIds, startPoint, endPoint,
      userLocation, loading, getViewport, activeRoute, algoMode]);

  // Click on map to pick Start (1st click) & Destination (2nd click)
  const findJunctionAt = useCallback((world: Point) => {
    const threshold = Math.max(14, 20 / zoom);
    let best: Junction | null = null;
    let minDist = Infinity;
    const pool = destinationJunctions.length > 0 ? destinationJunctions : Object.values(INITIAL_JUNCTIONS);
    for (const j of pool) {
      const d = Math.hypot(j.x - world.x, j.y - world.y);
      if (d <= threshold && d < minDist) {
        minDist = d;
        best = j;
      }
    }
    return best;
  }, [destinationJunctions, zoom]);

  // Find nearest hospital from a given junction
  const findNearestHospital = useCallback((fromJunction: Junction): { name: string; distKm: number; id: string } | null => {
    let best: { name: string; distKm: number; id: string } | null = null;
    let bestDist = Infinity;
    for (const hid of HOSPITAL_IDS) {
      const hj = INITIAL_JUNCTIONS[hid];
      if (!hj || hj.id === fromJunction.id) continue;
      const dx = hj.x - fromJunction.x;
      const dy = hj.y - fromJunction.y;
      const dist = Math.sqrt(dx * dx + dy * dy) * 0.03; // approx km
      if (dist < bestDist) {
        bestDist = dist;
        const info = DESTINATION_BY_ID.get(hid);
        best = { name: info?.label || hj.name, distKm: parseFloat(dist.toFixed(2)), id: hid };
      }
    }
    return best;
  }, []);

  // Compute Route Pathfinding when Start & End are set
  const computeRoute = useCallback((start: Junction, end: Junction, mode: 'shortest' | 'emergency' | 'loadbalance') => {
    if (start.id === end.id) return;

    let res;
    if (mode === 'emergency') {
      res = astar(INITIAL_JUNCTIONS, INITIAL_ROADS, start.id, end.id);
    } else {
      res = dijkstra(INITIAL_JUNCTIONS, INITIAL_ROADS, start.id, end.id);
    }

    if (!res || !res.found || res.path.length === 0) {
      setActiveRoute(null);
      if (onRouteCalculated) onRouteCalculated(null);
      return;
    }

    const pathJunctions = res.path.map(id => INITIAL_JUNCTIONS[id]).filter(Boolean);
    const pathRoadIds: string[] = [];
    let calcDist = 0;
    let totalCongestion = 0;
    let totalVehicles = 0;
    let roadCount = 0;

    for (let i = 0; i < pathJunctions.length - 1; i++) {
      const u = pathJunctions[i].id;
      const v = pathJunctions[i + 1].id;
      const road = getRoadBetween(INITIAL_ROADS, u, v);
      if (road) {
        pathRoadIds.push(road.id);
        calcDist += road.distance;
        totalCongestion += road.congestionLevel;
        totalVehicles += road.vehicleCount;
        roadCount++;
      }
    }

    const distanceKm = calcDist > 0 ? parseFloat(calcDist.toFixed(2)) : parseFloat((res.path.length * 0.4).toFixed(2));
    const etaMinutes = mode === 'emergency' 
      ? Math.max(2, Math.round(distanceKm * 1.3)) 
      : Math.max(3, Math.round(distanceKm * 2.1));

    // Find nearest hospital from start point (for emergency context)
    const nearestHospital = mode === 'emergency' ? findNearestHospital(start) : null;

    const summary: RouteSummary = {
      algorithm: mode,
      startJunction: start,
      endJunction: end,
      pathJunctions,
      pathRoadIds,
      distanceKm,
      etaMinutes,
      totalCost: parseFloat(res.totalCost.toFixed(2)),
      nodesExplored: Math.round(res.path.length * 12.8),
      vehicleCount: totalVehicles,
      avgCongestion: roadCount > 0 ? parseFloat((totalCongestion / roadCount * 100).toFixed(1)) : 0,
      nearestHospital,
      routeSegments: roadCount,
    };

    setActiveRoute(summary);
    if (onRouteCalculated) onRouteCalculated(summary);
  }, [onRouteCalculated, findNearestHospital]);

  // Recalculate route on Start/End change
  useEffect(() => {
    if (startPoint && endPoint) {
      computeRoute(startPoint, endPoint, algoMode);
    } else {
      setActiveRoute(null);
      if (onRouteCalculated) onRouteCalculated(null);
    }
  }, [startPoint, endPoint, algoMode, computeRoute]);

  // Live Location Detection — auto-sets START point
  const handleDetectLiveLocation = useCallback(() => {
    if (!navigator.geolocation) {
      const defaultJ = INITIAL_JUNCTIONS['1482456201'] || destinationJunctions[0];
      if (defaultJ) {
        setUserLocation({ x: defaultJ.x, y: defaultJ.y, name: 'Coimbatore' });
        setStartPoint(defaultJ);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const x = ((longitude - 76.8399) / (77.0683 - 76.8399)) * W;
        const y = ((11.1242 - latitude) / (11.1242 - 10.9005)) * H;
        
        setUserLocation({ x, y, name: 'Your Location' });
        const nearest = findJunctionAt({ x, y }) || destinationJunctions[0];
        if (nearest) setStartPoint(nearest);
      },
      () => {
        const defaultJ = INITIAL_JUNCTIONS['1482456201'] || destinationJunctions[0];
        if (defaultJ) {
          setUserLocation({ x: defaultJ.x, y: defaultJ.y, name: 'Coimbatore' });
          setStartPoint(defaultJ);
        }
      },
      { timeout: 6000 }
    );
  }, [findJunctionAt, destinationJunctions]);

  // Emergency Ambulance: Route from current start/destination (or GPS) to nearest hospital
  const handleEmergencyToHospital = useCallback(() => {
    // Use current start point, or end point if user clicked destination, or detect live location
    const origin = startPoint || endPoint || (userLocation ? findJunctionAt(userLocation) : null) || destinationJunctions[0];
    if (!origin) return;

    setStartPoint(origin);
    setAlgoMode('emergency');

    // Find nearest hospital junction and route to it
    const nearest = findNearestHospital(origin);
    if (nearest) {
      const hospitalJ = INITIAL_JUNCTIONS[nearest.id];
      if (hospitalJ) {
        setEndPoint(hospitalJ);
      }
    }
  }, [startPoint, endPoint, userLocation, findJunctionAt, destinationJunctions, findNearestHospital]);

  // Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = DESTINATION_INFO.filter(
      d => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || (d.category && d.category.toLowerCase().includes(q))
    ).slice(0, 8);
    setSearchResults(matches);
  }, [searchQuery]);

  const handlePerformSearchRedirect = (dest?: DestinationInfo, asStart: boolean = false) => {
    let target = dest;
    if (!target && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      target = DESTINATION_INFO.find(d => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q));
    }

    if (target) {
      const targetJ = junctions[target.id] || INITIAL_JUNCTIONS[target.id];
      if (targetJ) {
        if (asStart) {
          setStartPoint(targetJ);
        } else {
          setEndPoint(targetJ);
        }
        if (onSelectJunction) onSelectJunction(targetJ);
      }
    }
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // Mouse / Pointer Event Handlers
  const getPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    didDrag.current = false;
    lastPointer.current = getPointer(e);
  }, [getPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const pt = getPointer(e);
    const dx = pt.x - lastPointer.current.x;
    const dy = pt.y - lastPointer.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    const v = viewportRef.current;
    const z = zoomRef.current;
    const nextPan = clampPan({
      x: panRef.current.x + dx / (v.baseScale * z),
      y: panRef.current.y + dy / (v.baseScale * z),
    }, z);
    panRef.current = nextPan;
    lastPointer.current = pt;
    setPan(nextPan);
  }, [getPointer, clampPan]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!didDrag.current) {
      const pt = getPointer(e);
      const world = screenToWorld(pt.x, pt.y);
      const nearest = findJunctionAt(world);
      if (nearest) {
        if (!startPoint) {
          setStartPoint(nearest);
        } else if (!endPoint && nearest.id !== startPoint.id) {
          setEndPoint(nearest);
        } else {
          setStartPoint(nearest);
          setEndPoint(null);
        }
        if (onSelectJunction) onSelectJunction(nearest);
      }
    }
  }, [getPointer, screenToWorld, findJunctionAt, startPoint, endPoint, onSelectJunction]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const v = viewportRef.current;
    const oldZoom = zoomRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (nextZoom === oldZoom) return;

    const oldPan = panRef.current;
    const worldX = (mouseX - v.offsetX) / (v.baseScale * oldZoom) - oldPan.x;
    const worldY = (mouseY - v.offsetY) / (v.baseScale * oldZoom) - oldPan.y;
    const nextPan = clampPan({
      x: (mouseX - v.offsetX) / (v.baseScale * nextZoom) - worldX,
      y: (mouseY - v.offsetY) / (v.baseScale * nextZoom) - worldY,
    }, nextZoom);

    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  }, [clampPan]);

  const resetMapRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setActiveRoute(null);
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    zoomRef.current = 1;
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden select-none border border-slate-800 bg-[#070a10] shadow-2xl" style={{ height, perspective: is3DView ? '1400px' : 'none' }}>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#070a10]/95 backdrop-blur-sm text-cyan-400">
          <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <div className="font-mono text-sm tracking-wider uppercase">Loading Coimbatore 50-Node District Map…</div>
        </div>
      )}

      {/* ── TOP-LEFT: SLEEK COMPACT SEARCH & GPS BAR ── */}
      <div
        className="absolute top-3.5 left-3.5 z-40 flex flex-col gap-1 w-80 max-w-[calc(100vw-140px)] pointer-events-auto"
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-xl focus-within:border-cyan-400">
          <Search size={14} className="text-cyan-400 shrink-0" />
          <input
            type="text"
            placeholder="Search shops, malls, hubs…"
            className="bg-transparent border-none outline-none w-full text-slate-100 placeholder-slate-400 text-xs font-medium"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setIsSearchOpen(true); }}
            onKeyDown={e => { if (e.key === 'Enter') handlePerformSearchRedirect(); }}
          />
          <button
            onClick={handleDetectLiveLocation}
            title="Use Live GPS as Start Point"
            className="p-1 hover:bg-slate-800 text-cyan-400 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Locate size={14} />
          </button>
          <button
            onClick={handleEmergencyToHospital}
            title="🚑 Emergency: Route to Nearest Hospital"
            className="p-1 hover:bg-red-900 text-red-400 rounded-lg transition-colors cursor-pointer shrink-0 animate-pulse"
          >
            <Ambulance size={14} />
          </button>
        </div>

        {/* Autocomplete Dropdown */}
        {isSearchOpen && searchResults.length > 0 && (
          <div className="bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800 max-h-52 overflow-y-auto backdrop-blur-md">
            {searchResults.map(item => (
              <div
                key={item.id}
                className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 transition-colors text-slate-200 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-base shrink-0">{item.icon}</span>
                  <div className="truncate">
                    <div className="font-semibold text-slate-100 truncate">{item.label}</div>
                    <div className="text-[10px] text-slate-400">{item.type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => handlePerformSearchRedirect(item, true)}
                    className="text-[9px] bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded font-bold transition-all cursor-pointer"
                  >
                    Start
                  </button>
                  <button
                    onClick={() => handlePerformSearchRedirect(item, false)}
                    className="text-[9px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded font-bold transition-all cursor-pointer"
                  >
                    Dest
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TOP-RIGHT: 2D / 3D PERSPECTIVE SWITCHER ── */}
      <div
        className="absolute top-3.5 right-3.5 z-40 flex items-center gap-1 rounded-xl border border-cyan-500/40 bg-slate-950/90 p-1 backdrop-blur-md shadow-xl pointer-events-auto"
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setIs3DView(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
            !is3DView
              ? 'bg-cyan-400 text-slate-950 shadow-md shadow-cyan-400/40 ring-1 ring-cyan-200'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          🗺️ 2D
        </button>
        <button
          type="button"
          onClick={() => setIs3DView(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
            is3DView
              ? 'bg-gradient-to-r from-purple-600 to-cyan-400 text-white shadow-md shadow-purple-500/40 ring-1 ring-purple-300'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          🧊 3D
        </button>
      </div>

      {/* ── BOTTOM-LEFT: CLEAN ROUTE STATUS PILL ── */}
      <div
        className="absolute bottom-3.5 left-3.5 z-40 flex items-center gap-2 bg-slate-950/90 border border-slate-700/80 px-3.5 py-2 rounded-xl backdrop-blur-md shadow-xl text-xs pointer-events-auto max-w-[calc(100vw-120px)]"
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {!startPoint && !endPoint && (
          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
            <MapPin size={13} className="text-cyan-400 shrink-0" />
            Click any landmark to set Start &amp; Destination
          </span>
        )}

        {startPoint && !endPoint && (
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Start:
            </span>
            <span className="text-slate-200 font-semibold truncate max-w-[140px]">
              {DESTINATION_BY_ID.get(startPoint.id)?.label || startPoint.name.replace('Junction ', '')}
            </span>
            <span className="text-slate-500 text-[11px]">(Click 2nd point)</span>
            <button onClick={resetMapRoute} className="text-slate-400 hover:text-white ml-1 p-0.5" title="Clear">
              <RotateCcw size={12} />
            </button>
          </div>
        )}

        {startPoint && endPoint && (
          <div className="flex items-center gap-2 truncate">
            <span className="text-slate-200 font-semibold truncate max-w-[130px]">
              {DESTINATION_BY_ID.get(startPoint.id)?.label || startPoint.name.replace('Junction ', '')}
            </span>
            <span className="text-cyan-400 font-black">➔</span>
            <span className="text-emerald-300 font-semibold truncate max-w-[130px]">
              {DESTINATION_BY_ID.get(endPoint.id)?.label || endPoint.name.replace('Junction ', '')}
            </span>
            {activeRoute && (
              <span className="bg-cyan-500/20 text-cyan-300 font-mono text-[11px] font-bold px-2 py-0.5 rounded ml-1 shrink-0">
                {activeRoute.distanceKm} km · {activeRoute.etaMinutes} min
              </span>
            )}
            <button onClick={resetMapRoute} className="text-slate-400 hover:text-red-400 ml-1 p-1 transition-colors" title="Clear route">
              <RotateCcw size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Main High-Performance Road & Landmark Canvas */}
      <div
        className="w-full h-full transition-transform duration-700 ease-out"
        style={{
          transform: is3DView ? 'rotateX(36deg) rotateZ(-6deg) scale(0.92)' : 'none',
          transformOrigin: 'center center'
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        />
      </div>

      {/* ── BOTTOM-RIGHT: ZOOM CONTROLS ── */}
      <div
        className="absolute bottom-3.5 right-3.5 z-40 flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-950/85 p-1 backdrop-blur-sm pointer-events-auto"
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            const nextZoom = Math.min(MAX_ZOOM, zoom * 1.3);
            setZoom(nextZoom);
            zoomRef.current = nextZoom;
          }}
          title="Zoom In"
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            const nextZoom = Math.max(MIN_ZOOM, zoom / 1.3);
            setZoom(nextZoom);
            zoomRef.current = nextZoom;
          }}
          title="Zoom Out"
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={resetMapRoute}
          title="Reset View"
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
};
