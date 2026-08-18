// lib/utils/webgpuToast.tsx
import toast from 'react-hot-toast';
import { WebGPUStatus } from './general';
import { useUIStore } from '@/stores/useUIStore';

export function showWebGPUToast(status: WebGPUStatus) {
  toast.custom(
    (t) => {
      // 1. Action: Fallback to WebGL, persist preference to OPFS, & Dismiss Toast
      const handleAcceptWebGL = () => {
        useUIStore.getState().setGpuPreference('webgl');
        toast.dismiss(t.id);
      };

      // 2. Action: Open Hardware Setup Guide in a new tab
      const handleOpenGuide = () => {
        window.open('/docs/webgpu-setup', '_blank');
      };

      return (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } relative max-w-md w-full bg-slate-900/95 border border-amber-500/40 shadow-2xl rounded-xl p-4 text-slate-100 pointer-events-auto flex flex-col gap-3 font-sans backdrop-blur-md z-[9999]`}
        >
          {/* 3. Top-Right 'X' Close Button */}
          <button
            type="button"
            onClick={handleAcceptWebGL}
            className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition text-sm flex items-center justify-center w-6 h-6 cursor-pointer"
            title="Close and use WebGL fallback"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Toast Header */}
          <div className="flex items-start gap-3 pr-6">
            <span className="text-xl leading-none">⚠️</span>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-400">
                WebGPU Unavailable
              </h4>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Hardware acceleration is blocked on <strong>{status.os} / {status.browser}</strong>. Compute shaders require WebGPU or Vulkan driver access.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={handleOpenGuide}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
            >
              <span>🔧 How to Enable</span>
              <span className="text-[10px]">↗</span>
            </button>
            <button
              type="button"
              onClick={handleAcceptWebGL}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white transition shadow-sm cursor-pointer"
            >
              ⚡ Use WebGL Fallback
            </button>
          </div>
        </div>
      );
    },
    {
      id: 'webgpu-status-toast',
      duration: Infinity, // Stays visible until user clicks an action or 'X'
    }
  );
}