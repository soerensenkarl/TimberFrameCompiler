import * as THREE from 'three';
import { SceneManager } from '../viewer/SceneManager';
import { WallManager } from '../core/WallManager';
import { Point2D, Phase } from '../types';

const PHASE_COLORS: Record<string, number> = {
  exterior: 0xe67e22,
  interior: 0x3498db,
};

export class DrawingTool {
  private sceneManager: SceneManager;
  private wallManager: WallManager;
  private gridSnap: number;
  private wallType: 'exterior' | 'interior' = 'exterior';

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private firstPoint: Point2D | null = null;
  private previewLine: THREE.Line | null = null;
  private snapIndicator: THREE.Mesh;
  private dimensionLabel: HTMLDivElement;
  private enabled = false;

  onStatusChange: ((status: string) => void) | null = null;

  constructor(sceneManager: SceneManager, wallManager: WallManager, gridSnap: number) {
    this.sceneManager = sceneManager;
    this.wallManager = wallManager;
    this.gridSnap = gridSnap;

    const indicatorGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xe67e22 });
    this.snapIndicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    this.snapIndicator.visible = false;
    this.sceneManager.scene.add(this.snapIndicator);

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

  setWallType(type: 'exterior' | 'interior'): void {
    this.wallType = type;
    const color = PHASE_COLORS[type];
    (this.snapIndicator.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    const canvas = this.sceneManager.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
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
  }

  private onMouseMove(event: MouseEvent): void {
    const point = this.projectToGrid(event);
    if (!point) {
      this.snapIndicator.visible = false;
      this.dimensionLabel.style.display = 'none';
      return;
    }

    this.snapIndicator.position.set(point.x, 0.01, point.z);
    this.snapIndicator.visible = true;

    if (this.firstPoint) {
      this.updatePreviewLine(this.firstPoint, point);
      this.updateDimensionLabel(this.firstPoint, point);
    } else {
      this.dimensionLabel.style.display = 'none';
    }
  }

  private onClick(event: MouseEvent): void {
    const point = this.projectToGrid(event);
    if (!point) return;

    if (!this.firstPoint) {
      this.firstPoint = point;
    } else {
      const start = this.firstPoint;
      const end = point;

      const dx = end.x - start.x;
      const dz = end.z - start.z;
      if (Math.sqrt(dx * dx + dz * dz) < 0.05) return;

      this.wallManager.addWall(start, end, this.wallType);

      if (this.previewLine) {
        this.sceneManager.wallPreviewGroup.remove(this.previewLine);
        this.previewLine.geometry.dispose();
        this.previewLine = null;
      }

      this.firstPoint = end;
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

    const color = PHASE_COLORS[this.wallType] ?? 0xe67e22;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.08 });

    this.previewLine = new THREE.Line(geometry, material);
    this.previewLine.computeLineDistances();
    this.sceneManager.wallPreviewGroup.add(this.previewLine);
  }

  private updateDimensionLabel(start: Point2D, end: Point2D): void {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthM = Math.sqrt(dx * dx + dz * dz);

    if (lengthM < 0.01) {
      this.dimensionLabel.style.display = 'none';
      return;
    }

    const midpoint = new THREE.Vector3((start.x + end.x) / 2, 0.1, (start.z + end.z) / 2);
    const screenPos = midpoint.clone().project(this.sceneManager.camera);
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    const screenX = ((screenPos.x + 1) / 2) * rect.width;
    const screenY = ((-screenPos.y + 1) / 2) * rect.height;

    const lengthMM = Math.round(lengthM * 1000);
    this.dimensionLabel.textContent = `${lengthMM} mm`;
    this.dimensionLabel.style.display = 'block';
    this.dimensionLabel.style.left = `${screenX}px`;
    this.dimensionLabel.style.top = `${screenY - 28}px`;
  }
}
