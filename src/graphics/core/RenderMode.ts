/**
 * RenderMode.ts — Dual rendering mode system (WebGL + WebGPU)
 * Manages renderer selection, capability detection, mode switching.
 */

export enum RenderMode {
    WEBGL = "webgl",
    WEBGPU = "webgpu",
    AUTO = "auto",
}

export interface RenderCapabilities {
    supportsWebGPU: boolean;
    supportsWebGL: boolean;
    recommendedMode: RenderMode;
}

class RenderModeManager {
    private currentMode: RenderMode = RenderMode.AUTO;
    private capabilities: RenderCapabilities = {
        supportsWebGPU: false,
        supportsWebGL: true, // Default safe assumption
        recommendedMode: RenderMode.WEBGL,
    };

    async detectCapabilities(): Promise<RenderCapabilities> {
        // Check WebGPU support
        const hasWebGPU = !!(navigator as any).gpu;
        this.capabilities.supportsWebGPU = hasWebGPU;

        // Check WebGL support (usually available)
        try {
            const canvas = document.createElement("canvas");
            const gl =
                canvas.getContext("webgl2") || canvas.getContext("webgl");
            this.capabilities.supportsWebGL = !!gl;
        } catch (e) {
            this.capabilities.supportsWebGL = false;
        }

        // Determine recommended mode
        if (hasWebGPU) {
            this.capabilities.recommendedMode = RenderMode.WEBGPU;
        } else {
            this.capabilities.recommendedMode = RenderMode.WEBGL;
        }

        console.log("[RenderMode] Capabilities:", this.capabilities);
        return this.capabilities;
    }

    setMode(mode: RenderMode): void {
        this.currentMode = mode;
        localStorage.setItem("renderer-mode", mode);
        console.log(`[RenderMode] Set to ${mode}`);
    }

    getMode(): RenderMode {
        const stored = localStorage.getItem(
            "renderer-mode",
        ) as RenderMode | null;
        if (stored && Object.values(RenderMode).includes(stored)) {
            this.currentMode = stored;
        }
        return this.currentMode;
    }

    resolveMode(): RenderMode {
        const mode = this.getMode();
        if (mode === RenderMode.AUTO) {
            return this.capabilities.recommendedMode;
        }
        return mode;
    }

    getCapabilities(): RenderCapabilities {
        return this.capabilities;
    }
}

export const renderModeManager = new RenderModeManager();
