import React, { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from './store/simulationStore';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { NetworkCanvas } from './components/NetworkCanvas';
import { RightSidebar } from './components/RightSidebar';
import { BottomPanel } from './components/BottomPanel';
import { JunctionModal } from './components/JunctionModal';
import { RoadModal } from './components/RoadModal';
import { DemoMode } from './components/DemoMode';

const TICK_INTERVAL = 1000;

export const App: React.FC = () => {
  const { isRunning, settings, runTick } = useSimulationStore();
  const timerRef = useRef<number | null>(null);

  // Adjustable dashboard panel sizes.
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(240);
  const [bottomHeight, setBottomHeight] = useState(190);
  const resizing = useRef<'left' | 'right' | 'bottom' | null>(null);
  const resizeStart = useRef({ x: 0, y: 0, left: 220, right: 240, bottom: 190 });

  useEffect(() => {
    if (isRunning) {
      const realInterval = TICK_INTERVAL / settings.speed;
      timerRef.current = window.setInterval(() => runTick(), realInterval);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isRunning, settings.speed, runTick]);

  useEffect(() => {
    useSimulationStore.getState().setScenario('NORMAL');
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const mode = resizing.current;
      if (!mode) return;
      const start = resizeStart.current;
      if (mode === 'left') {
        setLeftWidth(Math.max(180, Math.min(380, start.left + e.clientX - start.x)));
      } else if (mode === 'right') {
        setRightWidth(Math.max(200, Math.min(380, start.right - (e.clientX - start.x))));
      } else {
        setBottomHeight(Math.max(180, Math.min(520, start.bottom - (e.clientY - start.y))));
      }
    };
    const up = () => { resizing.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const beginResize = (mode: 'left' | 'right' | 'bottom', e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = mode;
    resizeStart.current = { x: e.clientX, y: e.clientY, left: leftWidth, right: rightWidth, bottom: bottomHeight };
    document.body.style.cursor = mode === 'bottom' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="control-room-root w-full h-full flex flex-col overflow-hidden text-sm relative" style={{ background: 'var(--bg-primary)' }}>
      <TopBar />

      <div className="flex-1 flex overflow-hidden relative">
        <LeftSidebar width={leftWidth} />

        <div className="panel-resize-handle panel-resize-left" onPointerDown={e => beginResize('left', e)} title="Drag to resize left panel" />

        <main className="flex-1 flex flex-col relative overflow-hidden bg-[#050a14] min-w-0">
          <div className="flex-1 relative overflow-hidden flex items-center justify-center min-h-0">
            <NetworkCanvas />
          </div>

          <DemoMode />

          <div className="flex flex-col flex-shrink-0 z-10" style={{ height: bottomHeight }}>
            <div className="panel-resize-handle panel-resize-bottom" onPointerDown={e => beginResize('bottom', e)} title="Drag to resize bottom panels" />
            <BottomPanel height={bottomHeight} />
          </div>
        </main>

        <div className="panel-resize-handle panel-resize-right" onPointerDown={e => beginResize('right', e)} title="Drag to resize right panel" />
        <RightSidebar width={rightWidth} />
      </div>

      <JunctionModal />
      <RoadModal />
    </div>
  );
};

export default App;
