import { SceneManager } from './viewer/SceneManager';
import { MeshBuilder } from './viewer/MeshBuilder';
import { TimberEngine } from './core/TimberEngine';
import { WallManager } from './core/WallManager';
import { ApiClient } from './core/ApiClient';
import { DrawingTool } from './ui/DrawingTool';
import { ControlPanel } from './ui/ControlPanel';

// Initialize subsystems
const viewport = document.getElementById('viewport')!;
const controlsContainer = document.getElementById('controls')!;

const sceneManager = new SceneManager(viewport);
const meshBuilder = new MeshBuilder();
const localEngine = new TimberEngine();
const apiClient = new ApiClient();
const wallManager = new WallManager();
const controlPanel = new ControlPanel(controlsContainer);

const drawingTool = new DrawingTool(
  sceneManager,
  wallManager,
  controlPanel.getParams().gridSnap,
);

// Track whether the Python backend is available
let useApi = false;

// Check API health on startup
apiClient.healthCheck().then(ok => {
  useApi = ok;
  controlPanel.setBackendStatus(ok ? 'python' : 'local');
});

// Wire: drawing tool status updates the panel
drawingTool.onStatusChange = (status) => controlPanel.setStatus(status);

// Debounce helper for rapid slider changes
let regenerateTimer: ReturnType<typeof setTimeout> | null = null;
function regenerateDebounced(): void {
  if (regenerateTimer) clearTimeout(regenerateTimer);
  regenerateTimer = setTimeout(() => regenerate(), 80);
}

// Wire: regenerate timber frame from current walls + params
async function regenerate(): Promise<void> {
  const walls = wallManager.getWalls();
  const params = controlPanel.getParams();

  // Clear existing frame
  while (sceneManager.frameGroup.children.length > 0) {
    sceneManager.frameGroup.remove(sceneManager.frameGroup.children[0]);
  }

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
    // If API fails, fall back to local engine
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

// Wire: wall changes trigger regeneration
wallManager.onChange = () => regenerate();

// Wire: generate button
controlPanel.onGenerate = () => regenerate();

// Wire: clear button
controlPanel.onClear = () => {
  wallManager.clear();
  while (sceneManager.frameGroup.children.length > 0) {
    sceneManager.frameGroup.remove(sceneManager.frameGroup.children[0]);
  }
  while (sceneManager.wallPreviewGroup.children.length > 0) {
    sceneManager.wallPreviewGroup.remove(sceneManager.wallPreviewGroup.children[0]);
  }
  drawingTool.cancelDrawing();
  controlPanel.updateStats(null, 0);
};

// Wire: parameter changes update grid snap and regenerate
controlPanel.onParamsChange = (params) => {
  drawingTool.setGridSnap(params.gridSnap);
  regenerateDebounced();
};

// Start
drawingTool.enable();
sceneManager.start();
