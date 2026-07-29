import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// @ts-ignore
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Loader Manager & Hooks
export const loadingManager = new THREE.LoadingManager();

loadingManager.onStart = (url) => {
    const overlay = document.getElementById("loader-overlay");
    if (overlay) {
        overlay.classList.remove("fade-out");
    }
    const statusText = document.getElementById("loader-status-text");
    if (statusText) {
        const file = url.split("/").pop() || "";
        statusText.textContent = `Memulai unduhan: ${file}`;
    }
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const percent = Math.round((itemsLoaded / itemsTotal) * 100);
    const progressBar = document.getElementById("loader-progress-bar");
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    const percentText = document.getElementById("loader-percent-text");
    if (percentText) {
        percentText.textContent = `${percent}%`;
    }
    const statusText = document.getElementById("loader-status-text");
    if (statusText) {
        const file = url.split("/").pop() || "";
        statusText.textContent = `Memuat [${itemsLoaded}/${itemsTotal}]: ${file}`;
    }
};

loadingManager.onLoad = () => {
    const progressBar = document.getElementById("loader-progress-bar");
    if (progressBar) {
        progressBar.style.width = "100%";
    }
    const percentText = document.getElementById("loader-percent-text");
    if (percentText) {
        percentText.textContent = "100%";
    }
    const statusText = document.getElementById("loader-status-text");
    if (statusText) {
        statusText.textContent = "Inisialisasi selesai!";
    }
    setTimeout(() => {
        const overlay = document.getElementById("loader-overlay");
        if (overlay) {
            overlay.classList.add("fade-out");
        }
    }, 400);
};

loadingManager.onError = (url) => {
    console.error(`Gagal memuat: ${url}`);
    const statusText = document.getElementById("loader-status-text");
    if (statusText) {
        statusText.textContent = `Gagal memuat: ${url.split("/").pop()}`;
        statusText.style.color = "#ff4444";
    }
};


export const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
// ponytail: no DRACOLoader — gltfpack output uses Meshopt, not Draco. Saves ~500KB wasm.


// Canvas & WebGLRenderer
export const canvas = document.getElementById("canvas") as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1.0); // ponytail: cap to 1.0 to resolve camera drag lag on integrated GPUs
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Scene & Fog
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbde4ff);
scene.fog = new THREE.Fog(0xbde4ff, 70, 180);

// Camera
export const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
);
camera.position.set(0, 25, 30);
camera.lookAt(0, 0, 0);
camera.name = "mainCamera";
scene.add(camera);

// OrbitControls
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 5;
controls.maxDistance = 55;

// ponytail: Throttle high-polling-rate gaming mouse events (e.g. 1000Hz+) to max 100Hz
// This blocks excessive events in the capture phase before they reach OrbitControls, preventing main thread lag.
let lastPointerMoveTime = 0;
canvas.addEventListener(
    "pointermove",
    (e) => {
        const now = performance.now();
        if (now - lastPointerMoveTime < 10) {
            e.stopImmediatePropagation();
        } else {
            lastPointerMoveTime = now;
        }
    },
    { capture: true },
);

// Lights
export const hemiLight = new THREE.HemisphereLight(0xffffff, 0xc2e2b5, 2.2);
scene.add(hemiLight);

export const sun = new THREE.DirectionalLight(0xfffaf0, 2.8);
sun.position.set(-60, 40, 20);
scene.add(sun);

export const ambient = new THREE.AmbientLight(0xdce9f6, 1.2);
scene.add(ambient);

// Window resizing handler
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
