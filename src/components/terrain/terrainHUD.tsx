'use client';

import React, { useMemo } from 'react';
import { useDATAStore } from '@/stores/useDataStore';
import { Calendar, Crosshair } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import styles from '@/app/styles/hud.module.css';

export function MasterBufferHUD() {
  const hoverCoord = useUIStore((s) => s.hoverCoord);
  const masterBuffer = useDATAStore((s) => s.masterBuffer);
  const activeSlotsMetadata = useDATAStore((s) => s.activeSlotsMetadata);
  const windowStartYear = useDATAStore((s) => s.windowStartYear);
  const stepsize = useDATAStore((s) => s.stepsize);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);

  const breakdown = useMemo(() => {
    if (!hoverCoord || !masterBuffer || !activeSlotsMetadata) return null;

    const u = Math.max(0, Math.min(1, (hoverCoord.x + 200) / 400));
    const v = Math.max(0, Math.min(1, (hoverCoord.z + 200) / 400));

    const col = Math.min(31, Math.floor(u * 32));
    const row = Math.min(31, Math.floor(v * 32));
    const gridIndex = row * 32 + col;

    const yearOffset = gridIndex + Math.floor(row / 31);
    const hoverYear = windowStartYear !== null ? windowStartYear + yearOffset * stepsize : null;
    
    let totalDensity = 0;
    const layers = [];

    for (let i = 0; i < activeSlotsMetadata.length; i++) {
      const meta = activeSlotsMetadata[i];
      const slotIndex = typeof meta.slotIndex === 'number' 
        ? meta.slotIndex 
        : typeof meta.id === 'number' 
          ? meta.id 
          : i;
      
      const bufferOffset = slotIndex * 1024 + gridIndex;
      const count = Math.round(masterBuffer[bufferOffset] || 0);

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

    layers.sort((a, b) => a.slotIndex - b.slotIndex);
    const totalScaledWeight = layers.reduce((sum, l) => sum + l.scaledWeight, 0);

    return { col, row, gridIndex, hoverYear, totalDensity, layers, totalScaledWeight };
  }, [hoverCoord, masterBuffer, activeSlotsMetadata, windowStartYear, stepsize]);

  if (!hoverCoord) return null;

  const formatYear = (year: number | null) => {
    if (year === null) return 'N/A';
    if (isGeologicalTime) return `${year} Ma`;
    
    const roundedYear = Math.round(year);
    return roundedYear < 0 ? `${Math.abs(roundedYear)} BC` : `${roundedYear} AD`;
  };

  return (
    <div className={styles.hudContainer}>
      
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Calendar className={styles.headerIcon} />
          <span>SPOT YEAR</span>
        </div>
        <div className={styles.headerRight}>
          {breakdown && (
            <span className={styles.cellCoords}>
              [{breakdown.col},{breakdown.row}]
            </span>
          )}
          <span className={styles.yearBadge}>
            {formatYear(breakdown?.hoverYear ?? null)}
          </span>
        </div>
      </div>

      {/* Breakdown or Empty State */}
      {breakdown && breakdown.layers.length > 0 ? (
        <div className={styles.contentWrapper}>
          <div className={styles.stackBar}>
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

          <div className={styles.layersList}>
            {[...breakdown.layers].reverse().map((layer) => (
              <div key={layer.id} className={styles.layerRow}>
                <div className={styles.layerMeta}>
                  <span className={styles.layerDot} style={{ backgroundColor: layer.color }} />
                  <span className={styles.layerName}>{layer.name}</span>
                </div>
                <span className={styles.layerCount}>{layer.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Crosshair className={styles.emptyIcon} />
          <span className={styles.emptyText}>No active events in cell</span>
        </div>
      )}

      {/* Footer Total */}
      <div className={styles.footer}>
        <span className={styles.footerLabel}>Total Density</span>
        <span className={styles.footerValue}>
          {breakdown?.totalDensity ?? 0}
        </span>
      </div>

    </div>
  );
}