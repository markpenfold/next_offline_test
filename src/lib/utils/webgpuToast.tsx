// lib/utils/webgpuToast.tsx
import toast from 'react-hot-toast';
import { WebGPUStatus } from './general';
import './webgputoast.css';

export function showWebGPUToast(status: WebGPUStatus) {
  toast.custom(
    (t) => {
      const setupCommand = `curl -sSL ${window.location.origin}/scripts/webgpu_linux_setup.sh | bash`;

      const handleOpenGuide = () => {
        window.open('/docs/webgpu-setup', '_blank');
      };

      const handleCopyLinuxScript = () => {
        navigator.clipboard.writeText(setupCommand);
        toast.success('Terminal command copied to clipboard!');
      };

      const handleClose = () => {
        toast.dismiss(t.id);
      };

      return (
        <div className={`webgpu-toast-card ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
          {/* Close Button - Fixed Top Right */}
          <button
            type="button"
            onClick={handleClose}
            className="webgpu-toast-close"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Header */}
          <div className="webgpu-toast-header">
            <span className="webgpu-toast-icon">⚠️</span>
            <div className="webgpu-toast-body">
              <h4 className="webgpu-toast-title">
                WebGPU Required
              </h4>
              <p className="webgpu-toast-message">
                This app requires WebGPU compute features. Hardware acceleration is currently unavailable on <strong>{status.os} / {status.browser}</strong>
              </p>
            </div>
          </div>

          {/* Linux Terminal Command Box */}
          {status.os === 'Linux' ? (
            <div className="webgpu-toast-script-container">
              <span className="webgpu-toast-script-label">
                🐧 Linux Setup Command
              </span>
              <div className="webgpu-toast-cmd-box">
                <code className="webgpu-toast-code">
                  {setupCommand}
                </code>
                <button
                  type="button"
                  onClick={handleCopyLinuxScript}
                  className="webgpu-toast-btn-copy"
                >
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <div className="webgpu-toast-footer">
              <button
                type="button"
                onClick={handleOpenGuide}
                className="webgpu-toast-btn-secondary"
              >
                <span>🔧 Enable WebGPU Guide</span>
                <span>↗</span>
              </button>
            </div>
          )}
        </div>
      );
    },
    {
      id: 'webgpu-status-toast',
      duration: Infinity,
    }
  );
}