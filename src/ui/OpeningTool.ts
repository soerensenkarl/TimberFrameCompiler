import * as THREE from 'three';
import { SceneManager } from '../viewer/SceneManager';
import { WallManager } from '../core/WallManager';
import { Wall, Point2D, Opening } from '../types';

const WINDOW_COLOR = 0x5dade2;
const DOOR_COLOR = 0x58d68d;
const PREVIEW_OPACITY = 0.4;
const PLACED_OPACITY = 0.6;
const SNAP_THRESHOLD = 1.5; // max distance from wall to snap, in meters

export interface OpeningConfig {
  type: 'window' | 'door';
  width: number;
  height: number;
  sillHeight: number;
}

export class OpeningTool {
  private sceneManager: SceneManager;
  private wallManager: WallManager;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private config: OpeningConfig = { type: 'window', width: 0.9, height: 1.2, sillHeight: 0.9 };

  // Preview mesh (follows cursor)
  private previewMesh: THREE.Mesh | null = null;

  // Placed opening meshes
  private openingGroup: THREE.Group;
  private placedMeshes: Map<string, THREE.Mesh> = new Map();

  private enabled = false;
  private touchActive = false;
  private touchStartPos: { x: number; y: number } | null = null;

  constructor(sceneManager: SceneManager, wallManager: WallManager) {
    this.sceneManager = sceneManager;
    this.wallManager = wallManager;

    this.openingGroup = new THREE.Group();
    this.openingGroup.name = 'openingPreviews';
    this.sceneManager.scene.add(this.openingGroup);

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
  }

  setTouchActive(active: boolean): void {
    this.touchActive = active;
  }

  setConfig(config: OpeningConfig): void {
    this.config = { ...config };
    // Update preview mesh appearance on next move
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    const canvas = this.sceneManager.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.rebuildOpeningMeshes();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    const canvas = this.sceneManager.renderer.domElement;
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('click', this.onClick);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    this.clearPreview();
  }

  reset(): void {
    this.clearPreview();
    this.clearPlacedMeshes();
  }

  /** Rebuild the 3D indicators for all placed openings */
  rebuildOpeningMeshes(): void {
    this.clearPlacedMeshes();
    const openings = this.wallManager.getOpenings();
    const walls = this.wallManager.getWalls();
    const wallMap = new Map(walls.map(w => [w.id, w]));

    for (const opening of openings) {
      const wall = wallMap.get(opening.wallId);
      if (!wall) continue;
      const color = opening.type === 'window' ? WINDOW_COLOR : DOOR_COLOR;
      const mesh = this.createOpeningBox(wall, opening.position, opening.width, opening.height, opening.sillHeight, color, PLACED_OPACITY);
      this.openingGroup.add(mesh);
      this.placedMeshes.set(opening.id, mesh);
    }
  }

  // ─── Event handlers ───

  private onMouseMove(event: MouseEvent): void {
    const point = this.projectToGround(event);
    if (!point) {
      this.clearPreview();
      return;
    }

    const walls = this.wallManager.getWalls();
    const hit = this.nearestWallHit(point, walls, SNAP_THRESHOLD);

    if (!hit) {
      this.clearPreview();
      this.sceneManager.renderer.domElement.style.cursor = 'crosshair';
      return;
    }

    // Clamp position so opening doesn't extend past wall ends
    const halfW = this.config.width / 2;
    const clampedT = Math.max(halfW, Math.min(hit.wallLength - halfW, hit.t));

    // Create or update preview
    this.clearPreview();
    const color = this.config.type === 'window' ? WINDOW_COLOR : DOOR_COLOR;
    this.previewMesh = this.createOpeningBox(
      hit.wall, clampedT, this.config.width, this.config.height, this.config.sillHeight,
      color, PREVIEW_OPACITY,
    );
    this.sceneManager.scene.add(this.previewMesh);
    this.sceneManager.renderer.domElement.style.cursor = 'pointer';
  }

  private onClick(event: MouseEvent): void {
    const point = this.projectToGround(event);
    if (!point) return;

    const walls = this.wallManager.getWalls();
    const hit = this.nearestWallHit(point, walls, SNAP_THRESHOLD);
    if (!hit) return;

    // Check if clicking on an existing opening to delete it
    const wallOpenings = this.wallManager.getOpeningsForWall(hit.wall.id);
    for (const opening of wallOpenings) {
      const halfW = opening.width / 2;
      if (hit.t >= opening.position - halfW && hit.t <= opening.position + halfW) {
        this.wallManager.removeOpening(opening.id);
        this.rebuildOpeningMeshes();
        return;
      }
    }

    // Place new opening
    const halfW = this.config.width / 2;
    const clampedT = Math.max(halfW, Math.min(hit.wallLength - halfW, hit.t));

    // Check for overlap with existing openings on this wall
    for (const existing of wallOpenings) {
      const eLeft = existing.position - existing.width / 2;
      const eRight = existing.position + existing.width / 2;
      const nLeft = clampedT - halfW;
      const nRight = clampedT + halfW;
      if (nLeft < eRight && nRight > eLeft) return; // overlap — don't place
    }

    this.wallManager.addOpening(
      hit.wall.id, this.config.type,
      clampedT, this.config.width, this.config.height, this.config.sillHeight,
    );
    this.rebuildOpeningMeshes();
  }

  // ─── Touch handlers ───

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1 || !this.touchActive) return;
    e.preventDefault();
    const t = e.touches[0];
    this.touchStartPos = { x: t.clientX, y: t.clientY };
  }

  private onTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 1 || !this.touchActive) return;
    e.preventDefault();
    const t = e.touches[0];
    this.onMouseMove(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
  }

  private onTouchEnd(e: TouchEvent): void {
    if (!this.touchStartPos || !this.touchActive) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStartPos.x;
    const dy = t.clientY - this.touchStartPos.y;
    this.touchStartPos = null;
    if (Math.sqrt(dx * dx + dy * dy) < 15) {
      this.onClick(new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY }));
    }
  }

  // ─── Raycasting ───

  private projectToGround(event: MouseEvent): Point2D | null {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObject(this.sceneManager.groundPlane);
    if (intersects.length === 0) return null;
    const p = intersects[0].point;
    return { x: p.x, z: p.z };
  }

  private nearestWallHit(
    point: Point2D, walls: Wall[], threshold: number,
  ): { wall: Wall; t: number; wallLength: number; distance: number } | null {
    let best: { wall: Wall; t: number; wallLength: number; distance: number } | null = null;
    let bestDist = threshold;

    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.z - wall.start.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) continue;

      const apx = point.x - wall.start.x;
      const apz = point.z - wall.start.z;
      let t = (apx * dx + apz * dz) / (len * len);
      t = Math.max(0, Math.min(1, t));

      const cx = wall.start.x + dx * t;
      const cz = wall.start.z + dz * t;
      const dist = Math.sqrt((point.x - cx) ** 2 + (point.z - cz) ** 2);

      if (dist < bestDist) {
        bestDist = dist;
        best = { wall, t: t * len, wallLength: len, distance: dist };
      }
    }

    return best;
  }

  // ─── 3D helpers ───

  private createOpeningBox(
    wall: Wall, position: number, width: number, height: number,
    sillHeight: number, color: number, opacity: number,
  ): THREE.Mesh {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / len;
    const dirZ = dz / len;

    const cx = wall.start.x + dirX * position;
    const cz = wall.start.z + dirZ * position;
    const cy = sillHeight + height / 2;

    const geometry = new THREE.BoxGeometry(0.06, height, width);
    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, cz);
    mesh.rotation.y = Math.atan2(dx, dz);
    return mesh;
  }

  private clearPreview(): void {
    if (this.previewMesh) {
      this.sceneManager.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      (this.previewMesh.material as THREE.Material).dispose();
      this.previewMesh = null;
    }
  }

  private clearPlacedMeshes(): void {
    for (const mesh of this.placedMeshes.values()) {
      this.openingGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.placedMeshes.clear();
  }
}
