/**
 * RenderModeUI.ts — Rendering mode selector UI
 * Allows user to toggle WebGL ↔ WebGPU + shows capability info
 */

import { renderModeManager, RenderMode } from "./RenderMode";

export function initRenderModeUI(): void {
    const container = document.getElementById("controls-container");
    if (!container) {
        console.warn("[RenderModeUI] No controls-container found");
        return;
    }

    // Create mode selector section
    const section = document.createElement("div");
    section.id = "render-mode-section";
    section.style.cssText = `
        border: 1px solid #00ffaa;
        border-radius: 4px;
        padding: 10px;
        margin-top: 10px;
        background: rgba(0, 255, 170, 0.05);
        font-family: monospace;
        font-size: 12px;
        color: #00ffaa;
    `;

    // Title
    const title = document.createElement("div");
    title.textContent = "🎨 Render Mode";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "8px";
    section.appendChild(title);

    // Capabilities info
    const capabilities = renderModeManager.getCapabilities();
    const capInfo = document.createElement("div");
    capInfo.style.marginBottom = "8px";
    capInfo.style.fontSize = "11px";
    capInfo.innerHTML = `
        WebGL: ${capabilities.supportsWebGL ? "✓" : "✗"} | 
        WebGPU: ${capabilities.supportsWebGPU ? "✓" : "✗"}<br>
        Recommended: <strong>${capabilities.recommendedMode.toUpperCase()}</strong>
    `;
    section.appendChild(capInfo);

    // Mode selector
    const modeDiv = document.createElement("div");
    modeDiv.style.display = "flex";
    modeDiv.style.gap = "8px";
    modeDiv.style.marginBottom = "8px";

    const modes: RenderMode[] = [
        RenderMode.AUTO,
        RenderMode.WEBGL,
        RenderMode.WEBGPU,
    ];
    const currentMode = renderModeManager.getMode();

    modes.forEach((mode) => {
        const btn = document.createElement("button");
        btn.textContent = mode.toUpperCase();
        btn.style.cssText = `
            padding: 4px 8px;
            background: ${currentMode === mode ? "#00ffaa" : "transparent"};
            color: ${currentMode === mode ? "#000" : "#00ffaa"};
            border: 1px solid #00ffaa;
            border-radius: 3px;
            cursor: pointer;
            font-family: monospace;
            font-size: 11px;
            transition: all 0.2s;
        `;

        btn.onmouseover = () => {
            if (currentMode !== mode) {
                btn.style.background = "rgba(0, 255, 170, 0.2)";
            }
        };
        btn.onmouseout = () => {
            if (currentMode !== mode) {
                btn.style.background = "transparent";
            }
        };

        btn.onclick = () => {
            renderModeManager.setMode(mode);
            showModeChangeWarning(mode);
            setTimeout(() => location.reload(), 1500);
        };

        modeDiv.appendChild(btn);
    });

    section.appendChild(modeDiv);

    // Current mode info
    const currentInfo = document.createElement("div");
    currentInfo.id = "render-mode-info";
    currentInfo.style.fontSize = "11px";
    currentInfo.textContent = `Current: ${currentMode === RenderMode.AUTO ? capabilities.recommendedMode : currentMode}`;
    section.appendChild(currentInfo);

    container.appendChild(section);
}

function showModeChangeWarning(mode: RenderMode): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background: #1a1a1a;
        border: 2px solid #00ffaa;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        color: #00ffaa;
        font-family: monospace;
        font-size: 14px;
    `;
    box.innerHTML = `
        <div style="margin-bottom: 10px;">Switching to ${mode.toUpperCase()}</div>
        <div style="font-size: 12px; opacity: 0.7;">Reloading in 1.5s...</div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}
