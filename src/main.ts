import { SceneManager } from './viewer/SceneManager';
import { MeshBuilder } from './viewer/MeshBuilder';
import { TimberEngine } from './core/TimberEngine';
import { WallManager } from './core/WallManager';
import { DrawingTool } from './ui/DrawingTool';
import { ControlPanel } from './ui/ControlPanel';

// Initialize subsystems
const viewport = document.getElementById('viewport')!;
const controlsContainer = document.getElementById('controls')!;

const sceneManager = new SceneManager(viewport);
const meshBuilder = new MeshBuilder();
const engine = new TimberEngine();
const wallManager = new WallManager();
const controlPanel = new ControlPanel(controlsContainer);

const drawingTool = new DrawingTool(
  sceneManager,
  wallManager,
  controlPanel.getParams().gridSnap,
);

// Wire: drawing tool status updates the panel
drawingTool.onStatusChange = (status) => controlPanel.setStatus(status);

// Wire: regenerate timber frame from current walls + params
function regenerate(): void {
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

  const frame = engine.generate(walls, params);
  const group = meshBuilder.buildFrame(frame);
  sceneManager.frameGroup.add(group);

  const stats = meshBuilder.getMemberCount(frame);
  controlPanel.updateStats(stats, walls.length);
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
  // Also clear wall preview lines
  while (sceneManager.wallPreviewGroup.children.length > 0) {
    sceneManager.wallPreviewGroup.remove(sceneManager.wallPreviewGroup.children[0]);
  }
  drawingTool.cancelDrawing();
  controlPanel.updateStats(null, 0);
};

// Wire: parameter changes update grid snap and regenerate
controlPanel.onParamsChange = (params) => {
  drawingTool.setGridSnap(params.gridSnap);
  regenerate();
};

// Start
drawingTool.enable();
sceneManager.start();
