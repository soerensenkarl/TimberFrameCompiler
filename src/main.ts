import { SceneManager } from './viewer/SceneManager';
import { MeshBuilder } from './viewer/MeshBuilder';
import { TimberEngine } from './core/TimberEngine';
import { WallManager } from './core/WallManager';
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
const engine = new TimberEngine();
const wallManager = new WallManager();
const controlPanel = new ControlPanel(controlsContainer);

const gridSnap = controlPanel.getParams().gridSnap;

// FootprintTool for exterior phase (rectangle drag + resize arrows)
const footprintTool = new FootprintTool(sceneManager, wallManager, gridSnap);

// DrawingTool for interior phase (click-to-chain walls)
const drawingTool = new DrawingTool(sceneManager, wallManager, gridSnap);

// OpeningTool for openings phase (click near wall to place window/door)
const openingTool = new OpeningTool(sceneManager, wallManager);

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
function regenerate(): void {
  const walls = wallManager.getWalls();
  const params = controlPanel.getParams();
  const openings = wallManager.getOpenings();

  clearFrame();

  if (walls.length === 0) {
    controlPanel.updateStats(null, 0);
    return;
  }

  const frame = engine.generate(walls, params, openings);
  const group = meshBuilder.buildFrame(frame);
  sceneManager.frameGroup.add(group);

  const stats = meshBuilder.getMemberCount(frame);
  controlPanel.updateStats(stats, walls.length);
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

// Wire: load example house
controlPanel.onLoadExample = () => {
  // Reset tools
  footprintTool.disable();
  drawingTool.cancelDrawing();
  drawingTool.disable();
  openingTool.disable();
  openingTool.reset();
  clearFrame();
  clearPreviews();
  footprintTool.reset();

  // Load the example and enable roof
  wallManager.loadExampleHouse();
  controlPanel.setPhase('done');
  const params = controlPanel.getParams();
  params.roof = { type: 'gable', pitchAngle: 30, overhang: 0.3, ridgeAxis: 'x', rafterWidth: 0.045, rafterDepth: 0.14 };
  onPhaseChange('done');
};

// ─── Mobile pull-up handle ───

const pullHandle = document.createElement('div');
pullHandle.className = 'pull-handle';
pullHandle.innerHTML = `<svg class="pull-handle-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg><div class="pull-handle-bar"></div>`;
controlsContainer.prepend(pullHandle);

pullHandle.addEventListener('click', () => {
  controlsContainer.classList.toggle('panel-open');
});

// Update dimension labels every frame so they track the camera
sceneManager.onUpdate = () => {
  footprintTool.updateDimensionLabels();
};

// Start in exterior phase with footprint tool
footprintTool.enable();
activeToolRef = footprintTool;
drawToggle.style.display = isTouchDevice ? 'flex' : 'none';
sceneManager.start();
