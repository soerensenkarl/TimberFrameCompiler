import { SceneManager } from './viewer/SceneManager';
import { MeshBuilder } from './viewer/MeshBuilder';
import { TimberEngine } from './core/TimberEngine';
import { WallManager } from './core/WallManager';
import { ApiClient } from './core/ApiClient';
import { DrawingTool } from './ui/DrawingTool';
import { FootprintTool } from './ui/FootprintTool';
import { OpeningTool } from './ui/OpeningTool';
import { ControlPanel } from './ui/ControlPanel';
import { Phase } from './types';

// Initialize subsystems
const viewport = document.getElementById('viewport')!;
const controlsContainer = document.getElementById('controls')!;

const sceneManager = new SceneManager(viewport);
const meshBuilder = new MeshBuilder();
const localEngine = new TimberEngine();
const apiClient = new ApiClient();
const wallManager = new WallManager();
const controlPanel = new ControlPanel(controlsContainer);

const gridSnap = controlPanel.getParams().gridSnap;

// FootprintTool for exterior phase (rectangle drag + resize arrows)
const footprintTool = new FootprintTool(sceneManager, wallManager, gridSnap);

// DrawingTool for interior phase (click-to-chain walls)
const drawingTool = new DrawingTool(sceneManager, wallManager, gridSnap);

// OpeningTool for openings phase (click near wall to place window/door)
const openingTool = new OpeningTool(sceneManager, wallManager);

// Track whether the Python backend is available
let useApi = false;

// Check API health on startup
apiClient.healthCheck().then(ok => {
  useApi = ok;
  controlPanel.setBackendStatus(ok ? 'python' : 'local');
});

// Debounce helper for rapid slider changes
let regenerateTimer: ReturnType<typeof setTimeout> | null = null;
function regenerateDebounced(): void {
  if (regenerateTimer) clearTimeout(regenerateTimer);
  regenerateTimer = setTimeout(() => regenerate(), 80);
}

// Clear the generated frame from the scene
function clearFrame(): void {
  while (sceneManager.frameGroup.children.length > 0) {
    sceneManager.frameGroup.remove(sceneManager.frameGroup.children[0]);
  }
}

// Clear wall preview lines from the scene
function clearPreviews(): void {
  while (sceneManager.wallPreviewGroup.children.length > 0) {
    sceneManager.wallPreviewGroup.remove(sceneManager.wallPreviewGroup.children[0]);
  }
}

// Regenerate timber frame from current walls + params + openings
async function regenerate(): Promise<void> {
  const walls = wallManager.getWalls();
  const params = controlPanel.getParams();
  const openings = wallManager.getOpenings();

  clearFrame();

  if (walls.length === 0) {
    controlPanel.updateStats(null, 0);
    return;
  }

  try {
    let frame;
    if (useApi) {
      frame = await apiClient.generate(walls, params);
    } else {
      frame = localEngine.generate(walls, params, openings);
    }

    const group = meshBuilder.buildFrame(frame);
    sceneManager.frameGroup.add(group);

    const stats = meshBuilder.getMemberCount(frame);
    controlPanel.updateStats(stats, walls.length);
  } catch (err) {
    if (useApi) {
      console.warn('API call failed, falling back to local engine:', err);
      useApi = false;
      controlPanel.setBackendStatus('local');
      const frame = localEngine.generate(walls, params, openings);
      const group = meshBuilder.buildFrame(frame);
      sceneManager.frameGroup.add(group);
      const stats = meshBuilder.getMemberCount(frame);
      controlPanel.updateStats(stats, walls.length);
    }
  }

  // Update opening count in panel
  controlPanel.updateOpeningCount(openings.length);
}

// ─── Draw-mode toggle for touch devices ───

const drawToggle = document.createElement('button');
drawToggle.className = 'draw-toggle';
drawToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
drawToggle.style.display = 'none';
viewport.appendChild(drawToggle);

let touchDrawActive = false;
let activeToolRef: { setTouchActive: (a: boolean) => void } | null = null;
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function setTouchDrawMode(active: boolean): void {
  touchDrawActive = active;
  drawToggle.classList.toggle('active', active);
  sceneManager.setTouchToolMode(active);
  activeToolRef?.setTouchActive(active);
}

drawToggle.addEventListener('click', () => {
  setTouchDrawMode(!touchDrawActive);
});

// Phase transition handler
function onPhaseChange(phase: Phase): void {
  // Disable all tools first
  footprintTool.disable();
  drawingTool.cancelDrawing();
  drawingTool.disable();
  openingTool.disable();

  // Reset touch draw mode
  setTouchDrawMode(false);
  activeToolRef = null;

  switch (phase) {
    case 'exterior':
      footprintTool.enable();
      activeToolRef = footprintTool;
      break;
    case 'interior':
      drawingTool.setWallType('interior');
      drawingTool.enable();
      activeToolRef = drawingTool;
      break;
    case 'openings':
      openingTool.setConfig(controlPanel.getOpeningConfig());
      openingTool.enable();
      activeToolRef = openingTool;
      break;
    case 'roof':
      break;
    case 'done':
      break;
  }

  // Show draw toggle on touch devices when a tool is active
  drawToggle.style.display = (activeToolRef && isTouchDevice) ? 'flex' : 'none';

  // Re-render frame preview whenever phase changes
  regenerate();
}

// Wire: phase changes from control panel
controlPanel.onPhaseChange = onPhaseChange;

// Wire: generate button (from roof phase)
controlPanel.onGenerate = () => regenerate();

// Wire: clear / start over
controlPanel.onClear = () => {
  wallManager.clear();
  clearFrame();
  clearPreviews();
  footprintTool.reset();
  drawingTool.cancelDrawing();
  openingTool.reset();
  controlPanel.updateStats(null, 0);
  controlPanel.updateOpeningCount(0);
};

// Wire: wall changes trigger live regeneration
wallManager.onChange = () => {
  regenerate();
  // Rebuild opening meshes if the tool is active
  openingTool.rebuildOpeningMeshes();
};

// Wire: parameter slider changes update grid snap and regenerate
controlPanel.onParamsChange = (params) => {
  footprintTool.setGridSnap(params.gridSnap);
  drawingTool.setGridSnap(params.gridSnap);
  regenerateDebounced();
};

// Wire: opening config changes from control panel
controlPanel.onOpeningConfigChange = (config) => {
  openingTool.setConfig(config);
};

// ─── Mobile mode toggle ───

const mobileToggle = document.createElement('button');
mobileToggle.className = 'mobile-toggle';
mobileToggle.title = 'Toggle mobile layout';
mobileToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="1" width="14" height="22" rx="2"/><line x1="9" y1="19" x2="15" y2="19"/></svg>`;
viewport.appendChild(mobileToggle);

// Panel toggle button (hamburger, visible in mobile mode)
const panelToggle = document.createElement('button');
panelToggle.className = 'panel-toggle';
panelToggle.title = 'Toggle controls panel';
panelToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`;
viewport.appendChild(panelToggle);

// Panel drag handle (inside panel, tapping it closes the panel)
const panelHandle = document.createElement('div');
panelHandle.className = 'panel-handle';
panelHandle.innerHTML = '<div class="panel-handle-bar"></div>';
controlsContainer.prepend(panelHandle);

mobileToggle.addEventListener('click', () => {
  const entering = !document.body.classList.contains('mobile-mode');
  document.body.classList.toggle('mobile-mode', entering);
  mobileToggle.classList.toggle('active', entering);
  if (!entering) {
    controlsContainer.classList.remove('panel-open');
    panelToggle.classList.remove('active');
  }
  setTimeout(() => sceneManager.resize(), 350);
});

panelToggle.addEventListener('click', () => {
  const opening = !controlsContainer.classList.contains('panel-open');
  controlsContainer.classList.toggle('panel-open', opening);
  panelToggle.classList.toggle('active', opening);
});

panelHandle.addEventListener('click', () => {
  controlsContainer.classList.remove('panel-open');
  panelToggle.classList.remove('active');
});

// ─── Example house ───

function loadExampleHouse(): void {
  // Suppress onChange to avoid intermediate renders
  const savedOnChange = wallManager.onChange;
  wallManager.onChange = null;

  // Clear everything
  wallManager.clear();
  clearFrame();
  clearPreviews();
  footprintTool.reset();
  drawingTool.cancelDrawing();
  openingTool.reset();
  controlPanel.updateOpeningCount(0);

  // Footprint: 10m x 8m
  wallManager.setFootprint(0, 0, 10, 8);

  // Interior walls: central + two cross walls -> 4 rooms
  wallManager.addWall({ x: 5, z: 0 }, { x: 5, z: 8 }, 'interior');
  wallManager.addWall({ x: 0, z: 4 }, { x: 5, z: 4 }, 'interior');
  wallManager.addWall({ x: 5, z: 4 }, { x: 10, z: 4 }, 'interior');

  // Find walls by geometry for opening placement
  const walls = wallManager.getWalls();
  const find = (sx: number, sz: number, ex: number, ez: number) =>
    walls.find(w =>
      Math.abs(w.start.x - sx) < 0.1 && Math.abs(w.start.z - sz) < 0.1 &&
      Math.abs(w.end.x - ex) < 0.1 && Math.abs(w.end.z - ez) < 0.1
    );

  const bottom = find(0, 0, 10, 0);    // front wall, 10m
  const right = find(10, 0, 10, 8);     // right wall, 8m
  const top = find(10, 8, 0, 8);        // back wall, 10m
  const left = find(0, 8, 0, 0);        // left wall, 8m
  const central = find(5, 0, 5, 8);     // central vertical, 8m
  const leftCross = find(0, 4, 5, 4);   // left horizontal, 5m
  const rightCross = find(5, 4, 10, 4); // right horizontal, 5m

  // Front wall: door + window
  if (bottom) {
    wallManager.addOpening(bottom.id, 'door', 2.5, 0.9, 2.1, 0);
    wallManager.addOpening(bottom.id, 'window', 7.5, 1.2, 1.2, 0.9);
  }
  // Right wall: 2 windows
  if (right) {
    wallManager.addOpening(right.id, 'window', 2, 1.2, 1.2, 0.9);
    wallManager.addOpening(right.id, 'window', 6, 1.0, 1.2, 0.9);
  }
  // Back wall: 2 windows
  if (top) {
    wallManager.addOpening(top.id, 'window', 2.5, 1.0, 1.2, 0.9);
    wallManager.addOpening(top.id, 'window', 7.5, 1.2, 1.2, 0.9);
  }
  // Left wall: 2 windows
  if (left) {
    wallManager.addOpening(left.id, 'window', 2, 1.2, 1.2, 0.9);
    wallManager.addOpening(left.id, 'window', 6, 1.5, 1.2, 0.9);
  }
  // Interior doors
  if (central) wallManager.addOpening(central.id, 'door', 2, 0.8, 2.1, 0);
  if (leftCross) wallManager.addOpening(leftCross.id, 'door', 2.5, 0.8, 2.1, 0);
  if (rightCross) wallManager.addOpening(rightCross.id, 'door', 2.5, 0.8, 2.1, 0);

  // Restore onChange and finalize
  wallManager.onChange = savedOnChange;
  controlPanel.setPhase('done');
  onPhaseChange('done');
}

controlPanel.onLoadExample = () => loadExampleHouse();

// Start in exterior phase with footprint tool
footprintTool.enable();
activeToolRef = footprintTool;
drawToggle.style.display = isTouchDevice ? 'flex' : 'none';
sceneManager.start();
