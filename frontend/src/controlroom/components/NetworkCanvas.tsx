import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import type { Road, Vehicle } from '../types';
import { DESTINATION_IDS } from '../data/destinations';
import { DESTINATION_BY_ID } from '../data/destinations';
import { INITIAL_JUNCTIONS, INITIAL_ROADS } from '../data/network';
import { OSM_MAP_LABELS } from '../data/mapLabels';

const W = 960;
const H = 600;
const MAX_RENDER_VEHICLES = 120;
const MAP_PAD = 10;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 12;

type Point = { x: number; y: number };

function getRoadStrokeColor(road: Road): string {
  if (road.isBlocked) return '#ef4444';
  if (road.status === 'EMERGENCY_ROUTE') return '#4ade80';
  if (road.congestionLevel >= 0.80) return '#ef4444';
  if (road.congestionLevel >= 0.60) return '#f97316';
  if (road.congestionLevel >= 0.40) return '#f59e0b';
  if (road.congestionLevel >= 0.20) return '#10b981';
  return '#334155'; // Clean neutral slate (NO blue)
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
  return '#34d399';
}

interface Props {
  width?: number;
  height?: number;
}

/**
 * OSM map renderer.
 *
 * The full OSM graph is kept for routing, but the dashboard deliberately shows
 * only user-facing destination nodes instead of thousands of geometry nodes.
 * Canvas + viewport clipping keeps the large graph responsive.
 */
export const NetworkCanvas: React.FC<Props> = ({ width = W, height = H }) => {
  const {
    junctions, roads, vehicles, greenCorridorJunctions, greenCorridorRoads,
    activeAlgorithm, selectJunction, selectRoad, selectedJunctionId, selectedRoadId,
    blockRoadMode, setBlockRoadMode, blockRoadFirstJunctionId, setBlockRoadFirstJunctionId,
    blockRoadBetweenJunctions, blockRoad,
  } = useSimulationStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [is3DView, setIs3DView] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panFrameRef = useRef<number | null>(null);
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPointer = useRef<Point>({ x: 0, y: 0 });
  const viewportRef = useRef({ width, height, baseScale: 1, offsetX: 0, offsetY: 0 });
  const roadLayerRef = useRef<HTMLCanvasElement | null>(null);
  const baseScaleRef = useRef<number | null>(null);
  const lockedOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Static geometry never changes; simulation state only supplies dynamic traffic/signal fields.
  const junctionList = useMemo(() => Object.values(junctions), [junctions]);
  const roadList = useMemo(() => Object.values(INITIAL_ROADS), []);
  const vehicleList = useMemo(() => Object.values(vehicles).slice(0, MAX_RENDER_VEHICLES), [vehicles]);

  const destinationJunctions = useMemo(() => (
    junctionList.filter(j => DESTINATION_IDS.has(j.id) || j.id === selectedJunctionId)
  ), [junctionList, selectedJunctionId]);

  const routeRoadIds = useMemo(() => {
    const ids = new Set<string>();
    const path = activeAlgorithm?.path;
    if (!path) return ids;
    for (let i = 0; i < path.length - 1; i++) {
      ids.add(`${path[i]}-${path[i + 1]}`);
      ids.add(`${path[i + 1]}-${path[i]}`);
    }
    return ids;
  }, [activeAlgorithm?.path]);

  const corridorRoadSet = useMemo(() => new Set(greenCorridorRoads), [greenCorridorRoads]);
  const corridorJunctionSet = useMemo(() => new Set(greenCorridorJunctions), [greenCorridorJunctions]);

  const getViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return viewportRef.current;
    const rect = canvas.getBoundingClientRect();
    // Lock the geographic scale after the first layout. Resizing side/bottom
    // panels changes the visible window, not the map's zoom/scale.
    if (baseScaleRef.current == null) {
      baseScaleRef.current = Math.max(rect.width / W, rect.height / H); // cover fit
    }
    const baseScale = baseScaleRef.current;
    // Lock both scale AND world origin after the first layout. Resizing the
    // side/log panels must reveal more or less of the same map, not recenter or
    // rescale the geography underneath the user's cursor.
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
    // pan is expressed in world units added to the map origin. At zoom > 1 the
    // visible world is smaller than the 960x600 map, so pan is constrained to
    // the exact range that keeps at least one map edge inside the viewport.
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

  // Rasterize the full road network once per simulation-state change. During
  // zoom/pan we only transform this bitmap, avoiding 96k path operations per
  // mouse event. A 2x backing canvas keeps the roads reasonably crisp.
  useEffect(() => {
    const layer = document.createElement('canvas');
    layer.width = W * 2;
    layer.height = H * 2;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';

    const groups = new Map<string, Path2D>();
    const blocked = new Path2D();
    for (const geometryRoad of roadList) {
      const road = roads[geometryRoad.id] ?? geometryRoad;
      const a = INITIAL_JUNCTIONS[road.from];
      const b = INITIAL_JUNCTIONS[road.to];
      if (!a || !b) continue;
      if (road.isBlocked) {
        blocked.moveTo(a.x, a.y);
        blocked.lineTo(b.x, b.y);
        continue;
      }
      if (routeRoadIds.has(road.id) || corridorRoadSet.has(road.id) || road.id === selectedRoadId) continue;
      const color = getRoadStrokeColor(road);
      let path = groups.get(color);
      if (!path) { path = new Path2D(); groups.set(color, path); }
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
    for (const [color, path] of groups) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.82;
      ctx.lineWidth = 0.78;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.15;
    ctx.setLineDash([6, 4]);
    ctx.stroke(blocked);
    ctx.setLineDash([]);

    const route = new Path2D();
    const overlayIds = new Set<string>();
    for (const id of routeRoadIds) overlayIds.add(id);
    for (const id of corridorRoadSet) overlayIds.add(id);
    if (selectedRoadId) overlayIds.add(selectedRoadId);
    for (const id of overlayIds) {
      const road = roads[id] ?? INITIAL_ROADS[id];
      if (!road || road.isBlocked) continue;
      const a = INITIAL_JUNCTIONS[road.from];
      const b = INITIAL_JUNCTIONS[road.to];
      if (!a || !b) continue;
      route.moveTo(a.x, a.y);
      route.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = activeAlgorithm?.algorithm === 'ASTAR' ? '#4ade80' : '#38bdf8';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2.1;
    ctx.stroke(route);
    ctx.globalAlpha = 1;
    roadLayerRef.current = layer;
  }, [roads, roadList, routeRoadIds, corridorRoadSet, selectedRoadId, activeAlgorithm?.algorithm]);

  // One canvas draw for the lightweight dynamic layer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const v = getViewport();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#020814';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const sx = v.baseScale * zoom;
    const tx = v.offsetX + pan.x * sx;
    const ty = v.offsetY + pan.y * sx;

    // Map boundary. Everything outside this rounded city viewport is hidden.
    const mapX = MAP_PAD;
    const mapY = MAP_PAD;
    const mapW = Math.max(1, rect.width - MAP_PAD * 2);
    const mapH = Math.max(1, rect.height - MAP_PAD * 2);

    ctx.save();
    ctx.beginPath();
    const radius = 9;
    ctx.roundRect(mapX, mapY, mapW, mapH, radius);
    ctx.clip();

    ctx.setTransform(dpr * sx, 0, 0, dpr * sx, dpr * tx, dpr * ty);

    // Subtle grid at low zoom only.
    if (zoom < 3) {
      ctx.strokeStyle = 'rgba(30,80,140,0.07)';
      ctx.lineWidth = 0.45 / sx;
      const startX = Math.floor((-pan.x - 80) / 40) * 40;
      const startY = Math.floor((-pan.y - 80) / 40) * 40;
      const endX = -pan.x + W / zoom + 80;
      const endY = -pan.y + H / zoom + 80;
      ctx.beginPath();
      for (let x = startX; x <= endX; x += 40) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y <= endY; y += 40) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    }

    const left = -pan.x - 20 / sx;
    const top = -pan.y - 20 / sx;
    const right = -pan.x + W / zoom + 20 / sx;
    const bottom = -pan.y + H / zoom + 20 / sx;

    // The road network is cached as a bitmap in world coordinates. Drawing one
    // image here makes zooming/panning essentially independent of graph size.
    if (roadLayerRef.current) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(roadLayerRef.current, 0, 0, W, H);
    }

    // OSM place/road/landmark labels. These are static map metadata, not traffic state.
    // Labels are filtered by zoom and decluttered in SCREEN space so the full OSM
    // dataset can be shown without turning the map into a wall of text.
    const visibleLabels = OSM_MAP_LABELS
      .filter(label => label.minZoom <= zoom && zoom <= label.maxZoom &&
        label.x >= left && label.x <= right && label.y >= top && label.y <= bottom)
      .sort((a, b) => b.priority - a.priority);

    const acceptedLabelBoxes: Array<{ left:number; top:number; right:number; bottom:number }> = [];
    const labelCap = zoom < 1.15 ? 28 : zoom < 2 ? 55 : zoom < 4 ? 90 : 130;
    const worldToScreen = (x:number, y:number) => ({ x: tx + x * sx, y: ty + y * sx });
    let drawnLabels = 0;

    for (const label of visibleLabels) {
      if (drawnLabels >= labelCap) break;
      const p = worldToScreen(label.x, label.y);
      const fontPx = label.kind === 'AREA' ? (zoom < 1.4 ? 13 : 14) : label.kind === 'ROAD' ? 10 : 9;
      const fontWeight = label.kind === 'AREA' ? 700 : label.kind === 'ROAD' ? 500 : 600;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fontWeight} ${fontPx}px Inter, Segoe UI, sans-serif`;
      const textWidth = ctx.measureText(label.text).width;
      const padX = label.kind === 'AREA' ? 4 : 3;
      const box = { left:p.x - textWidth/2 - padX, top:p.y - fontPx - 3, right:p.x + textWidth/2 + padX, bottom:p.y + 4 };
      if (box.right < MAP_PAD || box.left > rect.width - MAP_PAD || box.bottom < MAP_PAD || box.top > rect.height - MAP_PAD) continue;
      const overlaps = acceptedLabelBoxes.some(b => !(box.right < b.left - 5 || box.left > b.right + 5 || box.bottom < b.top - 4 || box.top > b.bottom + 4));
      if (overlaps) continue;

      acceptedLabelBoxes.push(box);
      drawnLabels++;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = label.kind === 'AREA' ? 3 : 2.5;
      ctx.strokeStyle = 'rgba(2,8,20,0.92)';
      ctx.strokeText(label.text, p.x, p.y);
      ctx.fillStyle = label.kind === 'AREA' ? 'rgba(226,239,255,0.9)' : label.kind === 'ROAD' ? 'rgba(148,163,184,0.78)' : 'rgba(191,219,254,0.72)';
      ctx.fillText(label.text, p.x, p.y);
    }

    // Restore world transform after screen-space text.
    ctx.setTransform(dpr * sx, 0, 0, dpr * sx, dpr * tx, dpr * ty);

    // Vehicles remain small and screen-stable while zooming.
    for (const vehicle of vehicleList) {
      if (vehicle.state === 'COMPLETED') continue;
      if (vehicle.x < left || vehicle.x > right || vehicle.y < top || vehicle.y > bottom) continue;
      const amb = vehicle.type === 'AMBULANCE';
      const rPx = amb ? 5 : vehicle.type === 'BUS' ? 4 : 3;
      const r = rPx / sx;
      ctx.beginPath();
      ctx.arc(vehicle.x, vehicle.y, r, 0, Math.PI * 2);
      ctx.fillStyle = getVehicleColor(vehicle);
      ctx.globalAlpha = vehicle.state === 'WAITING' && vehicle.type !== 'AMBULANCE' ? 0.6 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (amb) {
        ctx.beginPath();
        ctx.arc(vehicle.x, vehicle.y, (rPx + 5) / sx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239,68,68,0.45)';
        ctx.lineWidth = 1.2 / sx;
        ctx.stroke();
      }
    }

    // ── BLOCKED ROADS HIGH-VISIBILITY IDENTITY ──
    const blockedRoadList = Object.values(roads).filter(r => r.isBlocked);
    for (const r of blockedRoadList) {
      const a = INITIAL_JUNCTIONS[r.from];
      const b = INITIAL_JUNCTIONS[r.to];
      if (!a || !b) continue;

      ctx.save();

      // 1. Glowing Neon Red Hazard Aura
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.lineWidth = 8 / sx;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 2. High-Contrast Red Hazard Dashed Line
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.5 / sx;
      ctx.setLineDash([7 / sx, 4 / sx]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Road Block Barrier Badge at Midpoint
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const badgeR = 8.5 / sx;

      // Outer hazard ring
      ctx.beginPath();
      ctx.arc(midX, midY, badgeR + 3 / sx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 1.5 / sx;
      ctx.stroke();

      // Red filled circle
      ctx.beginPath();
      ctx.arc(midX, midY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2 / sx;
      ctx.stroke();

      // White No-Entry Bar
      ctx.beginPath();
      ctx.rect(midX - 5 / sx, midY - 1.2 / sx, 10 / sx, 2.4 / sx);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Text Label: "⛔ BLOCKED"
      ctx.font = `bold ${8 / sx}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = 'rgba(2, 8, 20, 0.95)';
      ctx.lineWidth = 2.5 / sx;
      ctx.strokeText('⛔ BLOCKED', midX, midY - 9 / sx);
      ctx.fillStyle = '#fca5a5';
      ctx.fillText('⛔ BLOCKED', midX, midY - 9 / sx);

      // 4. Endpoint hazard warning rings
      for (const endPt of [a, b]) {
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 6.5 / sx, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5 / sx;
        ctx.stroke();
      }

      ctx.restore();
    }

    // ── HIGHLIGHT 1ST SELECTED JUNCTION IN ROAD BLOCK MODE ──
    if (blockRoadMode && blockRoadFirstJunctionId) {
      const j1 = junctions[blockRoadFirstJunctionId] || INITIAL_JUNCTIONS[blockRoadFirstJunctionId];
      if (j1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(j1.x, j1.y, 11 / sx, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3 / sx;
        ctx.stroke();

        ctx.font = `bold ${9 / sx}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(2, 8, 20, 0.95)';
        ctx.lineWidth = 2.5 / sx;
        ctx.strokeText('📍 [1] SELECTED', j1.x, j1.y - 12 / sx);
        ctx.fillStyle = '#fde68a';
        ctx.fillText('📍 [1] SELECTED', j1.x, j1.y - 12 / sx);
        ctx.restore();
      }
    }

    // ONLY user-facing destination markers are drawn. Ordinary OSM geometry nodes
    // remain invisible unless they become the selected/routed endpoint.
    for (const j of destinationJunctions) {
      if (j.x < left || j.x > right || j.y < top || j.y > bottom) continue;
      const info = DESTINATION_BY_ID.get(j.id);
      const selected = j.id === selectedJunctionId;
      const corridor = corridorJunctionSet.has(j.id);
      const radiusPx = selected ? 7 : 5.5;
      const r = radiusPx / sx;

      // Outer destination halo.
      ctx.beginPath();
      ctx.arc(j.x, j.y, (radiusPx + 4) / sx, 0, Math.PI * 2);
      ctx.strokeStyle = corridor ? '#4ade80' : selected ? '#38bdf8' : '#60a5fa';
      ctx.globalAlpha = corridor || selected ? 0.9 : 0.55;
      ctx.lineWidth = 1.2 / sx;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(j.x, j.y, r, 0, Math.PI * 2);
      ctx.fillStyle = corridor ? '#064e2b' : selected ? '#082f49' : '#0b1f35';
      ctx.strokeStyle = corridor ? '#4ade80' : selected ? '#38bdf8' : '#60a5fa';
      ctx.lineWidth = 1.4 / sx;
      ctx.fill();
      ctx.stroke();

      // Tiny signal status dot; only for destination nodes.
      ctx.beginPath();
      ctx.arc(j.x + 3 / sx, j.y - 3 / sx, 2 / sx, 0, Math.PI * 2);
      ctx.fillStyle = getSignalColor(j.signalPhase);
      ctx.fill();

      // Hospital cross is useful without adding another giant marker.
      if (j.isHospital || info?.type === 'Hospital') {
        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${8 / sx}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', j.x, j.y);
      }

      // Destination label is always modest in size and only appears for the small
      // curated destination set. This makes zooming useful instead of noisy.
      if (info) {
        const labelIndex = destinationJunctions.findIndex(d => d.id === j.id);
        // Keep the initial city view readable. Zooming in progressively reveals
        // the complete landmark labels and categories.
        const showLabel = zoom >= 1.15 || labelIndex < 0 || labelIndex % 2 === 0;
        if (showLabel) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = `600 ${10 / sx}px Inter, Segoe UI, sans-serif`;
          ctx.fillStyle = selected ? '#e0f2fe' : '#b6c8dc';
          ctx.fillText(info.label, j.x + 10 / sx, j.y - 2 / sx);
          if (zoom >= 1.4) {
            ctx.font = `${8 / sx}px monospace`;
            ctx.fillStyle = '#64748b';
            ctx.fillText(info.type, j.x + 10 / sx, j.y + 9 / sx);
          }
        }
      }
    }

    if (zoom < 1.8) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(30,80,140,0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('SIMULATION — NOT REAL COIMBATORE TRAFFIC DATA', W / 2, H - 12);
    }

    ctx.restore();

    // Crisp map frame is screen-space and doesn't scale with zoom.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapW, mapH, radius);
    ctx.strokeStyle = 'rgba(56,189,248,0.24)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [junctions, roads, roadList, vehicleList, destinationJunctions, zoom, pan,
      corridorRoadSet, corridorJunctionSet, routeRoadIds, activeAlgorithm?.algorithm,
      selectedJunctionId, selectedRoadId, getViewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => getViewport());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [getViewport]);

  const getPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const findJunctionAt = useCallback((world: Point) => {
    const threshold = Math.max(8, 14 / zoom);
    let best: { id: string; d: number } | null = null;
    for (const j of destinationJunctions) {
      const d = Math.hypot(j.x - world.x, j.y - world.y);
      if (d <= threshold && (!best || d < best.d)) best = { id: j.id, d };
    }
    if (best) return best.id;
    const fallbackThresh = Math.max(6, 11 / zoom);
    for (const j of Object.values(INITIAL_JUNCTIONS)) {
      const d = Math.hypot(j.x - world.x, j.y - world.y);
      if (d <= fallbackThresh && (!best || d < best.d)) best = { id: j.id, d };
    }
    return best?.id ?? null;
  }, [destinationJunctions, zoom]);

  const findRoadAt = useCallback((world: Point) => {
    // Road picking is intentionally bounded to visible roads. It is a click-only
    // operation, so it does not affect animation performance.
    const threshold = Math.max(5, 9 / zoom);
    let best: { id: string; d: number } | null = null;
    for (const road of roadList) {
      const a = INITIAL_JUNCTIONS[road.from];
      const b = INITIAL_JUNCTIONS[road.to];
      if (!a || !b) continue;
      if (Math.max(a.x, b.x) < world.x - 35 || Math.min(a.x, b.x) > world.x + 35 ||
          Math.max(a.y, b.y) < world.y - 35 || Math.min(a.y, b.y) > world.y + 35) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / len2)) : 0;
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const d = Math.hypot(world.x - px, world.y - py);
      if (d <= threshold && (!best || d < best.d)) best = { id: road.id, d };
    }
    return best?.id ?? null;
  }, [roadList, zoom]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const v = viewportRef.current;
    const oldZoom = zoomRef.current;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (nextZoom === oldZoom) return;

    // Keep the exact world point under the mouse fixed while changing scale.
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

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    didDrag.current = false;
    lastPointer.current = getPointer(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [getPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const p = getPointer(e);
    const dx = p.x - lastPointer.current.x;
    const dy = p.y - lastPointer.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true;
    lastPointer.current = p;
    const v = viewportRef.current;
    const z = zoomRef.current;
    panRef.current = clampPan({
      x: panRef.current.x + dx / (v.baseScale * z),
      y: panRef.current.y + dy / (v.baseScale * z),
    }, z);
    // Pointer events can arrive much faster than React can render. Coalesce them
    // into one state update per animation frame.
    if (panFrameRef.current == null) {
      panFrameRef.current = requestAnimationFrame(() => {
        panFrameRef.current = null;
        setPan(panRef.current);
      });
    }
  }, [getPointer, clampPan]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = false;
    if (panFrameRef.current != null) {
      cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
      setPan(panRef.current);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (didDrag.current) { didDrag.current = false; return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const junction = findJunctionAt(world);
    const road = findRoadAt(world);

    if (blockRoadMode) {
      if (junction) {
        if (!blockRoadFirstJunctionId) {
          setBlockRoadFirstJunctionId(junction);
        } else {
          blockRoadBetweenJunctions(blockRoadFirstJunctionId, junction);
        }
        return;
      }
      if (road) {
        blockRoad(road);
        setBlockRoadMode(false);
        return;
      }
      return;
    }

    if (junction) {
      selectJunction(junction === selectedJunctionId ? null : junction);
      return;
    }
    if (road) {
      selectRoad(road === selectedRoadId ? null : road);
      return;
    }
    selectJunction(null);
    selectRoad(null);
  }, [screenToWorld, findJunctionAt, findRoadAt, selectJunction, selectRoad, selectedJunctionId, selectedRoadId,
      blockRoadMode, blockRoadFirstJunctionId, setBlockRoadFirstJunctionId, blockRoadBetweenJunctions, blockRoad, setBlockRoadMode]);

  const resetViewport = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: 'var(--bg-primary)', perspective: is3DView ? '1400px' : 'none' }}
    >
      <div
        className="w-full h-full transition-transform duration-700 ease-out"
        style={{
          transform: is3DView ? 'rotateX(36deg) rotateZ(-6deg) scale(0.92)' : 'none',
          transformOrigin: 'center center'
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="network-canvas block w-full h-full"
          style={{ cursor: dragging.current ? 'grabbing' : 'grab', touchAction: 'none' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleClick}
        />
      </div>

      {/* ── HIGH VISIBILITY 2D / 3D PERSPECTIVE SWITCHER BUTTONS ── */}
      <div className="absolute right-3 top-3 flex items-center gap-2 z-30">
        <div className="flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-slate-950/90 p-1 backdrop-blur-md shadow-xl">
          <button
            type="button"
            onClick={() => setIs3DView(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              !is3DView
                ? 'bg-cyan-400 text-slate-950 shadow-cyan-400/40 ring-1 ring-cyan-200'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            🗺️ 2D VIEW
          </button>
          <button
            type="button"
            onClick={() => setIs3DView(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              is3DView
                ? 'bg-gradient-to-r from-purple-600 to-cyan-400 text-white shadow-purple-500/40 ring-1 ring-purple-300 animate-pulse'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            🧊 3D VIEW
          </button>
        </div>

        <div className="flex gap-1 rounded-xl border border-slate-700/70 bg-slate-950/85 p-1 backdrop-blur-sm">
          <button type="button" className="map-control" onClick={() => { const z = Math.min(MAX_ZOOM, zoomRef.current * 1.25); zoomRef.current = z; setZoom(z); }}>+</button>
          <button type="button" className="map-control" onClick={() => { const z = Math.max(MIN_ZOOM, zoomRef.current / 1.25); zoomRef.current = z; panRef.current = clampPan(panRef.current, z); setZoom(z); setPan(panRef.current); }}>−</button>
          <button type="button" className="map-control" onClick={resetViewport}>⟳</button>
        </div>
      </div>

      <div className="absolute left-3 top-3 rounded-md border border-slate-700/70 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400 backdrop-blur-sm pointer-events-none">
        DESTINATIONS • {destinationJunctions.length}
      </div>

      {/* ── ROAD BLOCK MODE INTERACTIVE BANNER ── */}
      {blockRoadMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-950/95 border border-red-500/80 shadow-[0_0_30px_rgba(239,68,68,0.35)] backdrop-blur-md text-xs">
          <span className="flex h-3 w-3 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <div className="flex flex-col text-left">
            <span className="text-red-400 font-extrabold tracking-wide uppercase text-[10px]">
              🚧 Road Block Mode
            </span>
            <span className="text-slate-100 font-semibold text-xs">
              {!blockRoadFirstJunctionId
                ? 'Click 1st junction on the map to start'
                : `1st: ${DESTINATION_BY_ID.get(blockRoadFirstJunctionId)?.label || junctions[blockRoadFirstJunctionId]?.name || 'Junction 1'} → Click 2nd junction to block!`}
            </span>
          </div>
          <button
            onClick={() => setBlockRoadMode(false)}
            className="ml-2 px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-700/80 text-red-200 text-xs font-bold transition-all cursor-pointer"
          >
            ✕ Cancel
          </button>
        </div>
      )}

      <div className="absolute left-3 bottom-3 rounded-md border border-slate-700/80 bg-slate-950/92 px-3 py-2.5 backdrop-blur-sm pointer-events-none min-w-[122px]">
        <div className="text-[9px] font-bold tracking-wider text-slate-500 mb-2">MAP LEGEND</div>
        <div className="flex flex-col gap-1.5 text-[9px] text-slate-400">
          <span className="flex items-center gap-2"><i className="legend-dot legend-car" />Car</span>
          <span className="flex items-center gap-2"><i className="legend-dot legend-bus" />Bus</span>
          <span className="flex items-center gap-2"><i className="legend-dot legend-ambulance" />Ambulance</span>
          <span className="flex items-center gap-2"><i className="legend-landmark" />Destination / Landmark</span>
          <span className="flex items-center gap-2"><i className="legend-line legend-road" />Road</span>
          <span className="flex items-center gap-2"><i className="legend-line legend-route" />Active route / Green corridor</span>
          <span className="flex items-center gap-2"><span className="inline-block w-4 h-1.5 rounded-sm bg-red-500 shadow-[0_0_6px_#ef4444]" />⛔ Blocked Road</span>
        </div>
      </div>
      <div className="absolute right-3 bottom-3 rounded-md border border-slate-700/60 bg-slate-950/75 px-2 py-1 text-[9px] text-slate-500 pointer-events-none">
        Scroll: zoom · Drag: pan · Click landmark/road: inspect
      </div>
    </div>
  );
};
