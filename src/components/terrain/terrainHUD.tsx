'use client';

import React, { useMemo } from 'react';
import { useDATAStore } from '@/stores/useDataStore';
import { Calendar, Crosshair } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';

export function MasterBufferHUD() {
  const hoverCoord = useUIStore((s) => s.hoverCoord);
  const masterBuffer = useDATAStore((s) => s.masterBuffer);
  const activeSlotsMetadata = useDATAStore((s) => s.activeSlotsMetadata);
  const windowStartYear = useDATAStore((s) => s.windowStartYear);
  const stepsize = useDATAStore((s) => s.stepsize);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);

  const breakdown = useMemo(() => {
    if (!hoverCoord || !masterBuffer || !activeSlotsMetadata) return null;

    // 1. Map World Pos [-200, 200] -> UV [0, 1]
    const u = Math.max(0, Math.min(1, (hoverCoord.x + 200) / 400));
    const v = Math.max(0, Math.min(1, (hoverCoord.z + 200) / 400));

    // 2. 32x32 Cell Coordinates
    const col = Math.min(31, Math.floor(u * 32));
    const row = Math.min(31, Math.floor(v * 32));

    // 3. Buffer Lookup Index
    const gridIndex = row * 32 + col;

    // 4. Year Offset Math
    const yearOffset = gridIndex + Math.floor(row / 31);
    const hoverYear = windowStartYear !== null ? windowStartYear + yearOffset * stepsize : null;
    
    // 5. Stride through Master Buffer using true GPU slotIndex (Order of Addition)
    let totalDensity = 0;
    const layers = [];

    for (let i = 0; i < activeSlotsMetadata.length; i++) {
      const meta = activeSlotsMetadata[i];
      
      // Use explicit GPU slot index (defaults to index if unassigned)
      const slotIndex = (meta as any).id ?? i;
      
      const bufferOffset = slotIndex * 1024 + gridIndex;
      const count = Math.round(masterBuffer[bufferOffset] || 0);
     // console.log("fetching data for ", activeSlotsMetadata[i].name, "offset i: ", i, 'offset slotIndex:', meta.id, "COUNT: ", count)
      //console.log("ACTIVE MOTHERFUCKING METADATA ON DEM SLOTS:", activeSlotsMetadata);

      if (count > 0) {
        totalDensity += count;
        layers.push({
          id: meta.id,
          name: meta.name,
          color: meta.color,
          count,
          scaledWeight: Math.log2(count + 1),
          slotIndex,
        });
      }
    }

    // Sort layers strictly by GPU slotIndex to match the 3D terrain vertical stack
    layers.sort((a, b) => a.slotIndex - b.slotIndex);

    const totalScaledWeight = layers.reduce((sum, l) => sum + l.scaledWeight, 0);

    return {
      col,
      row,
      gridIndex,
      hoverYear,
      totalDensity,
      layers,
      totalScaledWeight,
    };
  }, [hoverCoord, masterBuffer, activeSlotsMetadata, windowStartYear, stepsize]);

  if (!hoverCoord) return null;

  const formatYear = (year: number | null) => {
    if (year === null) return 'N/A';
    if (isGeologicalTime) return `${year} Ma`;
    
    const roundedYear = Math.round(year);
    return roundedYear < 0 ? `${Math.abs(roundedYear)} BC` : `${roundedYear} AD`;
  };

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-50 w-72 rounded-lg border border-zinc-800 bg-zinc-950/90 p-3 font-mono text-xs text-zinc-100 shadow-2xl backdrop-blur-md select-none">
      
      {/* Header: Probe Year & Cell Index */}
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
          <Calendar className="h-3.5 w-3.5" />
          <span>SPOT YEAR</span>
        </div>
        <div className="flex items-center gap-2">
          {breakdown && (
            <span className="text-[10px] text-zinc-500 font-mono">
              [{breakdown.col},{breakdown.row}]
            </span>
          )}
          <span className="rounded bg-amber-500/10 px-2 py-0.5 font-bold text-amber-300 border border-amber-500/20">
            {formatYear(breakdown?.hoverYear ?? null)}
          </span>
        </div>
      </div>

      {/* Composition Breakdown or Empty State */}
      {breakdown && breakdown.layers.length > 0 ? (
        <div className="my-2 flex items-stretch gap-3 max-h-64 overflow-y-auto pr-0.5">
          {/* Stack Bar: flex-col-reverse places Slot 0 (Base) at bottom, Slot N (Peak) at top */}
          <div className="flex w-2.5 flex-col-reverse overflow-hidden rounded bg-zinc-900 border border-zinc-800 shrink-0">
            {breakdown.layers.map((layer) => {
              const heightPct = breakdown.totalScaledWeight > 0
                ? (layer.scaledWeight / breakdown.totalScaledWeight) * 100
                : 0;
              return (
                <div
                  key={layer.id}
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: layer.color,
                  }}
                />
              );
            })}
          </div>

          {/* Category Items: Replaced slice with scrollable list; reversed so Peak layer is listed first at top */}
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            {[...breakdown.layers].reverse().map((layer) => (
              <div key={layer.id} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                  <span className="truncate text-zinc-300 font-medium">{layer.name}</span>
                </div>
                <span className="font-bold text-zinc-100">{layer.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="my-3 flex flex-col items-center justify-center gap-1 text-center text-zinc-500 py-2">
          <Crosshair className="h-4 w-4 text-zinc-600" />
          <span className="text-[11px]">No active events in cell</span>
        </div>
      )}

      {/* Footer Total */}
      <div className="mt-2 flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[11px]">
        <span className="text-zinc-400">Total Density</span>
        <span className="font-bold text-emerald-400 text-sm">
          {breakdown?.totalDensity ?? 0}
        </span>
      </div>

    </div>
  );
}