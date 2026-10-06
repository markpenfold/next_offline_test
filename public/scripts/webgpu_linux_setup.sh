#!/bin/bash

# Exit on unexpected errors
set -e

echo "🚀 Enforcing full Vulkan & WebGPU hardware acceleration for Google Chrome..."

DESKTOP_FILE="$HOME/.local/share/applications/google-chrome.desktop"
SYSTEM_DESKTOP="/usr/share/applications/google-chrome.desktop"
BACKUP_DESKTOP="$HOME/.local/share/applications/google-chrome.desktop.bak"

# Full bundle of Vulkan, WebGPU, Skia, ANGLE, and GPU driver flags
FLAGS="--enable-features=Vulkan,UseSkiaRenderer,WebGPUService,DefaultANGLEVulkan,VulkanFromANGLE --enable-unsafe-webgpu --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --use-gl=angle --use-angle=vulkan"

# Ensure user application folder exists
mkdir -p "$HOME/.local/share/applications"

# Create a safety backup if creating/modifying the shortcut for the first time
if [ -f "$DESKTOP_FILE" ] && [ ! -f "$BACKUP_DESKTOP" ]; then
    cp "$DESKTOP_FILE" "$BACKUP_DESKTOP"
    echo "📦 Created backup of desktop shortcut at $BACKUP_DESKTOP"
elif [ ! -f "$DESKTOP_FILE" ] && [ -f "$SYSTEM_DESKTOP" ]; then
    cp "$SYSTEM_DESKTOP" "$DESKTOP_FILE"
    echo "📦 Copied system Chrome desktop shortcut to local directory."
fi

# Apply flag overrides cleanly across all Exec entries in the shortcut
if [ -f "$DESKTOP_FILE" ]; then
    # Reset any previous flag additions on Exec lines to avoid endless appending
    sed -i 's|Exec=/usr/bin/google-chrome-stable.*|Exec=/usr/bin/google-chrome-stable|g' "$DESKTOP_FILE"
    
    # Inject the complete flag string into Exec commands
    sed -i "s|Exec=/usr/bin/google-chrome-stable|Exec=/usr/bin/google-chrome-stable $FLAGS|g" "$DESKTOP_FILE"
    echo "✅ Applied full Vulkan/WebGPU flag overrides to Chrome desktop shortcut."
else
    echo "⚠️ Could not locate google-chrome.desktop shortcut. Skipping desktop launcher update."
fi

echo ""
echo "================================================================="
echo "🔄 Terminating running Chrome instances & relaunching..."
echo "================================================================="

# Force terminate active Chrome, Chromium, and renderer processes
pkill -9 -f "chrome" 2>/dev/null || killall -9 google-chrome 2>/dev/null || true

# Pause to allow process handles, GPU locks, and sockets to release cleanly
sleep 1.5

# Detect browser binary and relaunch detached in the background
if command -v google-chrome-stable &> /dev/null; then
    nohup google-chrome-stable $FLAGS >/dev/null 2>&1 &
elif command -v google-chrome &> /dev/null; then
    nohup google-chrome $FLAGS >/dev/null 2>&1 &
elif command -v chromium-browser &> /dev/null; then
    nohup chromium-browser $FLAGS >/dev/null 2>&1 &
elif command -v chromium &> /dev/null; then
    nohup chromium $FLAGS >/dev/null 2>&1 &
else
    echo "❌ Could not auto-launch browser. Please open Chrome manually from your application menu."
    exit 0
fi

echo "✨ Success! Chrome restarted with full WebGPU & Vulkan hardware acceleration."