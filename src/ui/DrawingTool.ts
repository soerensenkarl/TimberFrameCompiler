import * as THREE from 'three';
import { SceneManager } from '../viewer/SceneManager';
import { WallManager } from '../core/WallManager';
import { Point2D } from '../types';

export class DrawingTool {
  private sceneManager: SceneManager;
  private wallManager: WallManager;
  private gridSnap: number;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private firstPoint: Point2D | null = null;
  private previewLine: THREE.Line | null = null;
  private snapIndicator: THREE.Mesh;
  private dimensionLabel: HTMLDivElement;
  private enabled = false;

  // Callbacks
  onStatusChange: ((status: string) => void) | null = null;

  constructor(sceneManager: SceneManager, wallManager: WallManager, gridSnap: number) {
    this.sceneManager = sceneManager;
    this.wallManager = wallManager;
    this.gridSnap = gridSnap;

    // Create snap indicator (small sphere at cursor position)
    const indicatorGeo = new THREE.SphereGeometry(0.05, 16, 16);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xe67e22 });
    this.snapIndicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    this.snapIndicator.visible = false;
    this.sceneManager.scene.add(this.snapIndicator);

    // Create HTML dimension label overlay
    this.dimensionLabel = document.createElement('div');
    this.dimensionLabel.className = 'dimension-label';
    this.dimensionLabel.style.display = 'none';
    const viewport = this.sceneManager.renderer.domElement.parentElement!;
    viewport.appendChild(this.dimensionLabel);

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  setGridSnap(snap: number): void {
    this.gridSnap = snap;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    const canvas = this.sceneManager.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
    this.updateStatus();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    const canvas = this.sceneManager.renderer.domElement;
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeyDown);
    this.cancelDrawing();
    this.snapIndicator.visible = false;
  }

  cancelDrawing(): void {
    this.firstPoint = null;
    if (this.previewLine) {
      this.sceneManager.wallPreviewGroup.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine = null;
    }
    this.dimensionLabel.style.display = 'none';
    this.updateStatus();
  }

  private onMouseMove(event: MouseEvent): void {
    const point = this.projectToGrid(event);
    if (!point) {
      this.snapIndicator.visible = false;
      this.dimensionLabel.style.display = 'none';
      return;
    }

    // Update snap indicator
    this.snapIndicator.position.set(point.x, 0.01, point.z);
    this.snapIndicator.visible = true;

    // Update preview line and dimension label if we have a first point
    if (this.firstPoint) {
      this.updatePreviewLine(this.firstPoint, point);
      this.updateDimensionLabel(this.firstPoint, point, event);
    } else {
      this.dimensionLabel.style.display = 'none';
    }
  }

  private onClick(event: MouseEvent): void {
    const point = this.projectToGrid(event);
    if (!point) return;

    if (!this.firstPoint) {
      // First click: set start point
      this.firstPoint = point;
      this.updateStatus();
    } else {
      // Second click: create wall
      const start = this.firstPoint;
      const end = point;

      // Don't create zero-length walls
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      if (Math.sqrt(dx * dx + dz * dz) < 0.05) return;

      this.wallManager.addWall(start, end);

      // Clean up preview
      if (this.previewLine) {
        this.sceneManager.wallPreviewGroup.remove(this.previewLine);
        this.previewLine.geometry.dispose();
        this.previewLine = null;
      }

      // Reset for next wall — start from the end of the current wall
      this.firstPoint = end;
      this.updateStatus();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cancelDrawing();
    }
  }

  private projectToGrid(event: MouseEvent): Point2D | null {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);

    const intersects = this.raycaster.intersectObject(this.sceneManager.groundPlane);
    if (intersects.length === 0) return null;

    const hit = intersects[0].point;

    // Snap to grid
    const x = Math.round(hit.x / this.gridSnap) * this.gridSnap;
    const z = Math.round(hit.z / this.gridSnap) * this.gridSnap;

    return { x, z };
  }

  private updatePreviewLine(start: Point2D, end: Point2D): void {
    if (this.previewLine) {
      this.sceneManager.wallPreviewGroup.remove(this.previewLine);
      this.previewLine.geometry.dispose();
    }

    const points = [
      new THREE.Vector3(start.x, 0.02, start.z),
      new THREE.Vector3(end.x, 0.02, end.z),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0xe67e22,
      dashSize: 0.15,
      gapSize: 0.08,
    });

    this.previewLine = new THREE.Line(geometry, material);
    this.previewLine.computeLineDistances();
    this.sceneManager.wallPreviewGroup.add(this.previewLine);
  }

  private updateDimensionLabel(start: Point2D, end: Point2D, event: MouseEvent): void {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthM = Math.sqrt(dx * dx + dz * dz);

    if (lengthM < 0.01) {
      this.dimensionLabel.style.display = 'none';
      return;
    }

    // Project the midpoint of the line to screen coordinates
    const midpoint = new THREE.Vector3(
      (start.x + end.x) / 2,
      0.1,
      (start.z + end.z) / 2,
    );

    const screenPos = midpoint.clone().project(this.sceneManager.camera);
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    const screenX = ((screenPos.x + 1) / 2) * rect.width;
    const screenY = ((-screenPos.y + 1) / 2) * rect.height;

    // Format: show mm
    const lengthMM = Math.round(lengthM * 1000);
    this.dimensionLabel.textContent = `${lengthMM} mm`;
    this.dimensionLabel.style.display = 'block';
    this.dimensionLabel.style.left = `${screenX}px`;
    this.dimensionLabel.style.top = `${screenY - 28}px`;
  }

  private updateStatus(): void {
    if (this.firstPoint) {
      this.onStatusChange?.('Click to place wall endpoint (Esc to cancel)');
    } else {
      this.onStatusChange?.('Click to start drawing a wall');
    }
  }
}
