/**
 * WeaponOffsetConfig.ts — Weapon offset UI generator
 * Memungkinkan user customize posisi/rotasi/skala weapon per bone secara real-time
 */

export interface WeaponOffset {
    pos: [number, number, number];
    rot: [number, number, number];
    scale: [number, number, number];
}

/**
 * Create UI panel untuk adjust weapon offset
 * Return: object berisi updated offset values yang bisa disimpan
 */
export function createWeaponOffsetUI(
    weaponName: string,
    boneName: string,
    currentOffset: WeaponOffset,
    onUpdate: (offset: WeaponOffset) => void,
): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
        background: #2a2a3e;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 16px;
        margin: 12px 0;
        font-family: monospace;
        font-size: 12px;
        color: #aaa;
        max-width: 400px;
    `;

    const title = document.createElement("h3");
    title.textContent = `⚔️ ${weaponName} on ${boneName}`;
    title.style.cssText =
        "margin: 0 0 12px 0; color: #ffd700; font-size: 14px;";
    container.appendChild(title);

    // Helper untuk membuat slider
    const createSlider = (
        label: string,
        min: number,
        max: number,
        step: number,
        initialValue: number,
        onChange: (val: number) => void,
    ) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText =
            "margin: 8px 0; display: flex; gap: 8px; align-items: center;";

        const labelEl = document.createElement("label");
        labelEl.textContent = label;
        labelEl.style.cssText = "min-width: 80px; color: #888;";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(initialValue);
        slider.style.cssText =
            "flex: 1; cursor: pointer; accent-color: #ffd700;";

        const valueDisplay = document.createElement("span");
        valueDisplay.textContent = initialValue.toFixed(2);
        valueDisplay.style.cssText =
            "min-width: 50px; color: #ffd700; text-align: right;";

        slider.addEventListener("input", (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            valueDisplay.textContent = val.toFixed(2);
            onChange(val);
        });

        wrapper.appendChild(labelEl);
        wrapper.appendChild(slider);
        wrapper.appendChild(valueDisplay);
        return wrapper;
    };

    // Position
    const posSection = document.createElement("div");
    posSection.style.cssText =
        "border-top: 1px solid #444; padding-top: 8px; margin-top: 8px;";

    const posLabel = document.createElement("div");
    posLabel.textContent = "📍 Position";
    posLabel.style.cssText =
        "color: #ffd700; font-weight: bold; margin-bottom: 4px;";
    posSection.appendChild(posLabel);

    [
        { axis: "X", idx: 0, min: -1, max: 1 },
        { axis: "Y", idx: 1, min: -1, max: 1 },
        { axis: "Z", idx: 2, min: -1, max: 1 },
    ].forEach(({ axis, idx, min, max }) => {
        const slider = createSlider(
            `Pos ${axis}:`,
            min,
            max,
            0.01,
            currentOffset.pos[idx],
            (val) => {
                currentOffset.pos[idx] = val;
                onUpdate({ ...currentOffset });
            },
        );
        posSection.appendChild(slider);
    });
    container.appendChild(posSection);

    // Rotation
    const rotSection = document.createElement("div");
    rotSection.style.cssText =
        "border-top: 1px solid #444; padding-top: 8px; margin-top: 8px;";

    const rotLabel = document.createElement("div");
    rotLabel.textContent = "🔄 Rotation (radians)";
    rotLabel.style.cssText =
        "color: #ffd700; font-weight: bold; margin-bottom: 4px;";
    rotSection.appendChild(rotLabel);

    [
        { axis: "X", idx: 0, min: -Math.PI, max: Math.PI },
        { axis: "Y", idx: 1, min: -Math.PI, max: Math.PI },
        { axis: "Z", idx: 2, min: -Math.PI, max: Math.PI },
    ].forEach(({ axis, idx, min, max }) => {
        const slider = createSlider(
            `Rot ${axis}:`,
            min,
            max,
            0.01,
            currentOffset.rot[idx],
            (val) => {
                currentOffset.rot[idx] = val;
                onUpdate({ ...currentOffset });
            },
        );
        rotSection.appendChild(slider);
    });
    container.appendChild(rotSection);

    // Scale
    const scaleSection = document.createElement("div");
    scaleSection.style.cssText =
        "border-top: 1px solid #444; padding-top: 8px; margin-top: 8px;";

    const scaleLabel = document.createElement("div");
    scaleLabel.textContent = "📏 Scale";
    scaleLabel.style.cssText =
        "color: #ffd700; font-weight: bold; margin-bottom: 4px;";
    scaleSection.appendChild(scaleLabel);

    [
        { axis: "X", idx: 0, min: 0.1, max: 3 },
        { axis: "Y", idx: 1, min: 0.1, max: 3 },
        { axis: "Z", idx: 2, min: 0.1, max: 3 },
    ].forEach(({ axis, idx, min, max }) => {
        const slider = createSlider(
            `Scale ${axis}:`,
            min,
            max,
            0.01,
            currentOffset.scale[idx],
            (val) => {
                currentOffset.scale[idx] = val;
                onUpdate({ ...currentOffset });
            },
        );
        scaleSection.appendChild(slider);
    });
    container.appendChild(scaleSection);

    // Export button — generate code yang bisa dicopy
    const exportBtn = document.createElement("button");
    exportBtn.textContent = "📋 Copy Config";
    exportBtn.style.cssText = `
        margin-top: 12px;
        padding: 8px 16px;
        background: #ffd700;
        color: #1a1a2e;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        width: 100%;
    `;
    exportBtn.addEventListener("click", () => {
        const config = `{
    pos: [${currentOffset.pos[0].toFixed(3)}, ${currentOffset.pos[1].toFixed(3)}, ${currentOffset.pos[2].toFixed(3)}],
    rot: [${currentOffset.rot[0].toFixed(3)}, ${currentOffset.rot[1].toFixed(3)}, ${currentOffset.rot[2].toFixed(3)}],
    scale: [${currentOffset.scale[0].toFixed(3)}, ${currentOffset.scale[1].toFixed(3)}, ${currentOffset.scale[2].toFixed(3)}],
}`;
        navigator.clipboard.writeText(config);
        exportBtn.textContent = "✅ Copied!";
        setTimeout(() => {
            exportBtn.textContent = "📋 Copy Config";
        }, 2000);
    });
    container.appendChild(exportBtn);

    return container;
}

/**
 * Format offset object menjadi string yang copyable
 */
export function formatOffsetForCode(
    name: string,
    offset: WeaponOffset,
): string {
    return `${name}: {
    pos: [${offset.pos.map((p) => p.toFixed(3)).join(", ")}],
    rot: [${offset.rot.map((r) => r.toFixed(3)).join(", ")}],
    scale: [${offset.scale.map((s) => s.toFixed(3)).join(", ")}],
},`;
}
