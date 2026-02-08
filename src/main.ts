import { SceneManager } from './viewer/SceneManager';
import { MeshBuilder } from './viewer/MeshBuilder';
import { TimberEngine } from './core/TimberEngine';
import { WallManager } from './core/WallManager';
import { ApiClient } from './core/ApiClient';
import { DrawingTool } from './ui/DrawingTool';
import { FootprintTool } from './ui/FootprintTool';
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

// Regenerate timber frame from current walls + params
async function regenerate(): Promise<void> {
  const walls = wallManager.getWalls();
  const params = controlPanel.getParams();

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
      frame = localEngine.generate(walls, params);
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
      const frame = localEngine.generate(walls, params);
      const group = meshBuilder.buildFrame(frame);
      sceneManager.frameGroup.add(group);
      const stats = meshBuilder.getMemberCount(frame);
      controlPanel.updateStats(stats, walls.length);
    }
  }
}

// Phase transition handler
function onPhaseChange(phase: Phase): void {
  // Disable both tools first
  footprintTool.disable();
  drawingTool.cancelDrawing();
  drawingTool.disable();

  switch (phase) {
    case 'exterior':
      footprintTool.enable();
      break;
    case 'interior':
      drawingTool.setWallType('interior');
      drawingTool.enable();
      break;
    case 'openings':
      // Openings not yet implemented
      break;
    case 'roof':
      break;
    case 'done':
      // Final generation already triggered by ControlPanel
      break;
  }

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
  controlPanel.updateStats(null, 0);
};

// Wire: wall changes trigger live regeneration
wallManager.onChange = () => regenerate();

// Wire: parameter slider changes update grid snap and regenerate
controlPanel.onParamsChange = (params) => {
  footprintTool.setGridSnap(params.gridSnap);
  drawingTool.setGridSnap(params.gridSnap);
  regenerateDebounced();
};

// Start in exterior phase with footprint tool
footprintTool.enable();
sceneManager.start();
