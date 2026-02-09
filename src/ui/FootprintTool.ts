import * as THREE from 'three';
import { SceneManager } from '../viewer/SceneManager';
import { WallManager } from '../core/WallManager';
import { Point2D } from '../types';

const COLOR = 0xe67e22;
const ARROW_COLOR = 0x2196f3;
const MIN_SIZE = 0.5; // minimum footprint dimension in meters

export interface Footprint {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export class FootprintTool {
  private sceneManager: SceneManager;
  private wallManager: WallManager;
  private gridSnap: number;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // State
  private state: 'idle' | 'dragging' | 'placed' = 'idle';
  private dragStart: Point2D | null = null;
  private footprint: Footprint | null = null;

  // 3D preview
  private rectLine: THREE.LineLoop | null = null;

  // Resize arrows (cone meshes for easy clicking)
  private arrowX: THREE.Mesh;
  private arrowZ: THREE.Mesh;
  private resizing: 'x' | 'z' | null = null;

  // Dimension labels
  private widthLabel: HTMLDivElement;
  private depthLabel: HTMLDivElement;

  // Snap indicator
  private snapIndicator: THREE.Mesh;

  private enabled = false;
  private touchActive = false;

  constructor(sceneManager: SceneManager, wallManager: WallManager, gridSnap: number) {
    this.sceneManager = sceneManager;
    this.wallManager = wallManager;
    this.gridSnap = gridSnap;

    // Snap indicator
    const geo = new THREE.SphereGeometry(0.06, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: COLOR });
    this.snapIndicator = new THREE.Mesh(geo, mat);
    this.snapIndicator.visible = false;
    this.sceneManager.scene.add(this.snapIndicator);

    // Arrows — cones pointing outward from the rectangle edges
    this.arrowX = this.createArrowCone('x');
    this.arrowZ = this.createArrowCone('z');
    this.sceneManager.scene.add(this.arrowX);
    this.sceneManager.scene.add(this.arrowZ);

    // Dimension labels
    const viewport = this.sceneManager.renderer.domElement.parentElement!;
    this.widthLabel = document.createElement('div');
    this.widthLabel.className = 'dimension-label';
    this.widthLabel.style.display = 'none';
    viewport.appendChild(this.widthLabel);

    this.depthLabel = document.createElement('div');
    this.depthLabel.className = 'dimension-label dimension-label-depth';
    this.depthLabel.style.display = 'none';
    viewport.appendChild(this.depthLabel);

    // Bind handlers
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
  }

  setGridSnap(snap: number): void {
    this.gridSnap = snap;
  }

  setTouchActive(active: boolean): void {
    this.touchActive = active;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    const canvas = this.sceneManager.renderer.domElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });

    // If exterior walls already exist, enter placed state
    const bounds = this.wallManager.getExteriorBounds();
    if (bounds && this.wallManager.getExteriorWalls().length >= 4) {
      this.footprint = { ...bounds };
      this.state = 'placed';
      this.updateRectLine();
      this.updateArrows();
      this.updateDimensionLabels();
    }
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    const canvas = this.sceneManager.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);

    this.snapIndicator.visible = false;
    this.arrowX.visible = false;
    this.arrowZ.visible = false;
    this.widthLabel.style.display = 'none';
    this.depthLabel.style.display = 'none';
    this.resizing = null;

    if (this.rectLine) {
      this.sceneManager.wallPreviewGroup.remove(this.rectLine);
      this.rectLine.geometry.dispose();
      this.rectLine = null;
    }
  }

  reset(): void {
    this.state = 'idle';
    this.dragStart = null;
    this.footprint = null;
    this.resizing = null;
    this.arrowX.visible = false;
    this.arrowZ.visible = false;
    this.widthLabel.style.display = 'none';
    this.depthLabel.style.display = 'none';
    this.snapIndicator.visible = false;

    if (this.rectLine) {
      this.sceneManager.wallPreviewGroup.remove(this.rectLine);
      this.rectLine.geometry.dispose();
      this.rectLine = null;
    }
  }

  // ─── Event handlers ───

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;

    // In placed state, check for arrow hit first
    if (this.state === 'placed') {
      const hit = this.hitTestArrows(event);
      if (hit) {
        this.resizing = hit;
        return;
      }
    }

    // Start new rectangle drag
    if (this.state === 'idle' || this.state === 'placed') {
      const point = this.projectToGrid(event);
      if (!point) return;
      this.dragStart = point;
      this.state = 'dragging';
      // Clear old footprint if re-dragging
      this.arrowX.visible = false;
      this.arrowZ.visible = false;
    }
  }

  private onMouseMove(event: MouseEvent): void {
    const point = this.projectToGrid(event);

    // Dragging out a new rectangle
    if (this.state === 'dragging' && this.dragStart && point) {
      this.snapIndicator.visible = false;
      this.footprint = {
        minX: Math.min(this.dragStart.x, point.x),
        minZ: Math.min(this.dragStart.z, point.z),
        maxX: Math.max(this.dragStart.x, point.x),
        maxZ: Math.max(this.dragStart.z, point.z),
      };
      this.updateRectLine();
      this.updateDimensionLabels();
      return;
    }

    // Resizing with an arrow
    if (this.state === 'placed' && this.resizing && point && this.footprint) {
      if (this.resizing === 'x') {
        this.footprint.maxX = Math.max(this.footprint.minX + MIN_SIZE, point.x);
        // Re-snap maxX
        this.footprint.maxX = Math.round(this.footprint.maxX / this.gridSnap) * this.gridSnap;
        if (this.footprint.maxX <= this.footprint.minX) {
          this.footprint.maxX = this.footprint.minX + this.gridSnap;
        }
      } else {
        this.footprint.maxZ = Math.max(this.footprint.minZ + MIN_SIZE, point.z);
        this.footprint.maxZ = Math.round(this.footprint.maxZ / this.gridSnap) * this.gridSnap;
        if (this.footprint.maxZ <= this.footprint.minZ) {
          this.footprint.maxZ = this.footprint.minZ + this.gridSnap;
        }
      }
      this.updateRectLine();
      this.updateArrows();
      this.updateDimensionLabels();
      this.wallManager.setFootprint(this.footprint.minX, this.footprint.minZ, this.footprint.maxX, this.footprint.maxZ);
      return;
    }

    // Idle — show snap cursor
    if (point) {
      this.snapIndicator.position.set(point.x, 0.01, point.z);
      this.snapIndicator.visible = this.state === 'idle';
    } else {
      this.snapIndicator.visible = false;
    }

    // Hover feedback on arrows in placed state
    if (this.state === 'placed' && !this.resizing) {
      const hit = this.hitTestArrows(event);
      const canvas = this.sceneManager.renderer.domElement;
      canvas.style.cursor = hit ? (hit === 'x' ? 'ew-resize' : 'ns-resize') : 'crosshair';
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;

    if (this.state === 'dragging' && this.footprint) {
      const w = this.footprint.maxX - this.footprint.minX;
      const d = this.footprint.maxZ - this.footprint.minZ;

      if (w < MIN_SIZE || d < MIN_SIZE) {
        // Too small — cancel
        this.state = 'idle';
        this.footprint = null;
        this.dragStart = null;
        this.clearRectLine();
        this.widthLabel.style.display = 'none';
        this.depthLabel.style.display = 'none';
        return;
      }

      this.state = 'placed';
      this.dragStart = null;
      this.wallManager.setFootprint(
        this.footprint.minX, this.footprint.minZ,
        this.footprint.maxX, this.footprint.maxZ,
      );
      this.updateArrows();
      this.updateDimensionLabels();
      return;
    }

    if (this.resizing) {
      this.resizing = null;
    }
  }

  // ─── Touch handlers ───

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) {
      // Second finger appeared — cancel any in-progress drag
      if (this.state === 'dragging') {
        this.state = 'idle';
        this.dragStart = null;
        this.clearRectLine();
        this.widthLabel.style.display = 'none';
        this.depthLabel.style.display = 'none';
      }
      if (this.resizing) {
        this.sceneManager.controls.enabled = true;
      }
      this.resizing = null;
      return;
    }

    const t = e.touches[0];
    const synth = new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY, button: 0 });

    // Always allow arrow resize, even when draw mode is off
    if (this.state === 'placed') {
      const hit = this.hitTestArrows(synth);
      if (hit) {
        e.preventDefault();
        this.resizing = hit;
        this.sceneManager.controls.enabled = false;
        return;
      }
    }

    if (!this.touchActive) return; // Let OrbitControls handle orbit
    e.preventDefault();
    this.onMouseDown(synth);
  }

  private onTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    // Allow move when resizing an arrow OR when draw mode is active
    if (!this.resizing && !this.touchActive) return;
    e.preventDefault();
    const t = e.touches[0];
    this.onMouseMove(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
  }

  private onTouchEnd(e: TouchEvent): void {
    const wasResizing = this.resizing;
    if (!wasResizing && !this.touchActive) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    this.onMouseUp(new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, button: 0 }));
    if (wasResizing) {
      this.sceneManager.controls.enabled = true;
    }
  }

  // ─── Raycasting ───

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

  private hitTestArrows(event: MouseEvent): 'x' | 'z' | null {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);

    if (this.arrowX.visible) {
      const hits = this.raycaster.intersectObject(this.arrowX, true);
      if (hits.length > 0) return 'x';
    }
    if (this.arrowZ.visible) {
      const hits = this.raycaster.intersectObject(this.arrowZ, true);
      if (hits.length > 0) return 'z';
    }
    return null;
  }

  // ─── Visual updates ───

  private updateRectLine(): void {
    this.clearRectLine();
    if (!this.footprint) return;

    const { minX, minZ, maxX, maxZ } = this.footprint;
    const y = 0.02;
    const points = [
      new THREE.Vector3(minX, y, minZ),
      new THREE.Vector3(maxX, y, minZ),
      new THREE.Vector3(maxX, y, maxZ),
      new THREE.Vector3(minX, y, maxZ),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = this.state === 'placed'
      ? new THREE.LineBasicMaterial({ color: COLOR })
      : new THREE.LineDashedMaterial({ color: COLOR, dashSize: 0.15, gapSize: 0.08 });

    this.rectLine = new THREE.LineLoop(geometry, material);
    if (this.state !== 'placed') {
      this.rectLine.computeLineDistances();
    }
    this.sceneManager.wallPreviewGroup.add(this.rectLine);
  }

  private clearRectLine(): void {
    if (this.rectLine) {
      this.sceneManager.wallPreviewGroup.remove(this.rectLine);
      this.rectLine.geometry.dispose();
      this.rectLine = null;
    }
  }

  private updateArrows(): void {
    if (!this.footprint) return;
    const { minX, minZ, maxX, maxZ } = this.footprint;
    const midZ = (minZ + maxZ) / 2;
    const midX = (minX + maxX) / 2;

    // X arrow — at midpoint of the maxX edge, pointing in +X
    this.arrowX.position.set(maxX + 0.35, 0.25, midZ);
    this.arrowX.visible = true;

    // Z arrow — at midpoint of the maxZ edge, pointing in +Z
    this.arrowZ.position.set(midX, 0.25, maxZ + 0.35);
    this.arrowZ.visible = true;
  }

  updateDimensionLabels(): void {
    if (!this.footprint) {
      this.widthLabel.style.display = 'none';
      this.depthLabel.style.display = 'none';
      return;
    }

    const { minX, minZ, maxX, maxZ } = this.footprint;
    const widthM = maxX - minX;
    const depthM = maxZ - minZ;

    // Width label — along the top edge (minZ side)
    this.setLabelAtWorldPos(this.widthLabel, (minX + maxX) / 2, 0.1, minZ - 0.3, `${Math.round(widthM * 1000)} mm`);

    // Depth label — along the left edge (minX side)
    this.setLabelAtWorldPos(this.depthLabel, minX - 0.3, 0.1, (minZ + maxZ) / 2, `${Math.round(depthM * 1000)} mm`);
  }

  private setLabelAtWorldPos(label: HTMLDivElement, wx: number, wy: number, wz: number, text: string): void {
    const pos = new THREE.Vector3(wx, wy, wz).project(this.sceneManager.camera);
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    const screenX = ((pos.x + 1) / 2) * rect.width;
    const screenY = ((-pos.y + 1) / 2) * rect.height;

    label.textContent = text;
    label.style.display = 'block';
    label.style.left = `${screenX}px`;
    label.style.top = `${screenY - 14}px`;
  }

  // ─── Arrow mesh creation ───

  private createArrowCone(direction: 'x' | 'z'): THREE.Mesh {
    const coneGeo = new THREE.ConeGeometry(0.2, 0.4, 12);
    const coneMat = new THREE.MeshStandardMaterial({
      color: ARROW_COLOR,
      emissive: ARROW_COLOR,
      emissiveIntensity: 0.3,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);

    if (direction === 'x') {
      // Point in +X: rotate the +Y tip toward +X
      cone.rotation.z = -Math.PI / 2;
    } else {
      // Point in +Z: rotate the +Y tip toward +Z
      cone.rotation.x = Math.PI / 2;
    }

    cone.visible = false;
    return cone;
  }
}
