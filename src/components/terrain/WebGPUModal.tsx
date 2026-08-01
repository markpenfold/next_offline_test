// components/WebGPUGuideModal.tsx
'use client';

import React from 'react';
import { WebGPUStatus } from '@/lib/utils/general';

interface Props {
  status: WebGPUStatus;
  isOpen: boolean;
  onClose: () => void;
}

export function WebGPUGuideModal({ status, isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-700 p-6 text-slate-100 shadow-2xl space-y-4">
        <h3 className="text-lg font-bold text-slate-100">
          Enable WebGPU on {status.os}
        </h3>

        {status.os === 'Linux' ? (
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-amber-400">Ubuntu / Linux Chrome Flags:</p>
            <p>Linux Chrome disables Vulkan by default. You can enable hardware WebGPU in 60 seconds:</p>
            <ol className="list-decimal ml-4 space-y-1 text-slate-400">
              <li>Open <code className="text-amber-300">chrome://flags</code> in your address bar</li>
              <li>Set <strong>Vulkan</strong> (<code className="text-amber-300">#enable-vulkan</code>) to <strong>Enabled</strong></li>
              <li>Set <strong>Override software rendering list</strong> (<code className="text-amber-300">#ignore-gpu-blocklist</code>) to <strong>Enabled</strong></li>
              <li>Click <strong>Relaunch</strong> at the bottom right</li>
            </ol>
          </div>
        ) : (
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-slate-200">System Compatibility:</p>
            <p>Native WebGPU is supported out of the box on:</p>
            <ul className="list-disc ml-4 space-y-1 text-slate-400">
              <li>Windows 10/11 (Chrome, Edge)</li>
              <li>macOS (Chrome, Safari 18+)</li>
              <li>Android (Chrome 121+)</li>
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}