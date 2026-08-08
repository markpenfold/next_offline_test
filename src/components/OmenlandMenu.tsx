'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useDATAStore } from '@/stores/useDataStore';
import { useAppStore } from '@/providers/AppStoreProvider';
import { saveProject } from '@/components/data/diskOPFS';

export function OmenMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 1. App / User State
  const activeAccount = useAppStore((s) => s.activeAccount);
  const userId = useAppStore((s) => s.userId);
  const accountId = activeAccount?.id || userId || null;

  // 2. Data & GPU Store State
  const activeProjectName = useDATAStore((state) => state.activeProjectName);
  const projectConfig = useDATAStore((state) => (state as any).projectConfig);
  const setFinderOpen = useDATAStore((state) => state.setFinderOpen);
  
  // Geological Time Settings
  const isGeologicalTime = useDATAStore((state) => state.isGeologicalTime);
  const setIsGeologicalTime = useDATAStore((state) => state.setIsGeologicalTime);

  const gpuStatus = useDATAStore((state) => state.gpuStatus);
  const useWebGL = useDATAStore((state) => state.useWebGL);
  const resetGpuPreference = useDATAStore((state) => state.resetGpuPreference);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Direct Menu Actions ---

  const handleSaveProject = async () => {
    setIsOpen(false);
    if (!accountId) {
      console.warn('Cannot save: No active account ID found.');
      return;
    }

    const success = await saveProject(
      accountId,
      activeProjectName,
      projectConfig || {}
    );

    if (success) {
      console.log(`✅ Saved project [${activeProjectName || 'session'}] to OPFS`);
    }
  };

  const handleFindProjects = () => {
    setIsOpen(false);
    if (typeof setFinderOpen === 'function') {
      setFinderOpen(true);
    }
  };

  const handleResetGPU = async () => {
    setIsOpen(false);
    await resetGpuPreference();
    window.location.reload();
  };

  const handleOpenDocs = () => {
    setIsOpen(false);
    window.open('/docs/webgpu-setup', '_blank');
  };

  return (
    <div className="relative inline-block text-left font-sans z-50" ref={menuRef}>
      {/* Menu Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 shadow-md backdrop-blur-md transition cursor-pointer text-xs font-semibold"
      >
        <span className="text-sm">☰</span>
        <span>Menu</span>
        <span className="text-[10px] text-slate-400">▼</span>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md text-slate-100 p-2 space-y-3 divide-y divide-slate-800/80">
          
          {/* Section 1: Project Operations */}
          <div className="space-y-1 pt-1">
            <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span>Project Management</span>
              {activeProjectName && (
                <span className="text-[10px] text-amber-400 font-mono truncate max-w-[120px]">
                  {activeProjectName}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveProject}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-800 text-slate-200 flex items-center justify-between transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>💾</span> Save Project
              </span>
              <kbd className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                Ctrl+S
              </kbd>
            </button>

            <button
              type="button"
              onClick={handleFindProjects}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
            >
              <span>📂</span> Find / Load Projects
            </button>
          </div>

          {/* Section 2: Time Settings */}
          <div className="pt-2 space-y-1">
            <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Time Scale
            </div>
            <label className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-800 text-slate-200 transition cursor-pointer select-none">
              <span className="flex items-center gap-2">
                <span>⏳</span> Deep Geological Time
              </span>
              <input
                type="checkbox"
                checked={isGeologicalTime}
                onChange={(e) => setIsGeologicalTime(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </label>
            <div className="px-3 text-[10px] text-slate-400">
              {isGeologicalTime ? "Full History (Geological Scale)" : "Limited to 50,000 years"}
            </div>
          </div>

          {/* Section 3: Graphics & Hardware Engine */}
          <div className="pt-2 space-y-2">
            <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span>Graphics Engine</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                  !useWebGL && gpuStatus?.supported
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                    : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                }`}
              >
                {!useWebGL && gpuStatus?.supported ? '🚀 WebGPU' : '🛡️ WebGL Fallback'}
              </span>
            </div>

            {/* Current Hardware Detail */}
            <div className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Platform:</span>
                <span className="text-slate-200 font-medium">
                  {gpuStatus?.os || 'Detecting...'} / {gpuStatus?.browser || ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Hardware WebGPU:</span>
                <span className={gpuStatus?.supported ? 'text-emerald-400' : 'text-amber-400'}>
                  {gpuStatus?.supported ? 'Available' : 'Blocked / Unavailable'}
                </span>
              </div>
            </div>

            {/* GPU Actions */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleResetGPU}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <span>🔄</span> Re-test & Reset GPU
              </button>

              <button
                type="button"
                onClick={handleOpenDocs}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-800 text-amber-400 flex items-center justify-between transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>🔧</span> Hardware Setup Guide
                </span>
                <span className="text-[10px]">↗</span>
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}