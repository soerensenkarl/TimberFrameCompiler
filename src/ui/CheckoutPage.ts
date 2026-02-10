import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TimberFrame, MemberType, Opening, FrameParams, Wall } from '../types';
import { MeshBuilder } from '../viewer/MeshBuilder';

/** Human-readable labels (singular) */
const MEMBER_LABELS: Record<MemberType, string> = {
  stud: 'Stud',
  king_stud: 'King Stud',
  bottom_plate: 'Bottom Plate',
  top_plate: 'Top Plate',
  double_top_plate: 'Double Top Plate',
  nogging: 'Nogging',
  rafter: 'Rafter',
  ridge_beam: 'Ridge Beam',
  collar_tie: 'Collar Tie',
  ceiling_joist: 'Ceiling Joist',
  fascia: 'Fascia',
  header: 'Header',
  trimmer: 'Trimmer',
  sill_plate: 'Sill Plate',
  cripple_stud: 'Cripple Stud',
  corner_stud: 'Corner Stud',
  partition_backer: 'Partition Backer',
};

/** Price per linear meter by cross-section area bracket ($/m) */
function pricePerMeter(width: number, depth: number): number {
  const area = width * depth * 1e6; // mm²
  if (area < 3000) return 2.80;
  if (area < 5000) return 4.20;
  if (area < 8000) return 5.60;
  if (area < 12000) return 7.50;
  return 9.80;
}

/** Group key: type + cross-section dims */
function groupKey(type: MemberType, w: number, d: number): string {
  return `${type}|${Math.round(w * 1000)}x${Math.round(d * 1000)}`;
}

interface LineItem {
  type: MemberType;
  label: string;
  sectionW: number; // mm
  sectionD: number; // mm
  count: number;
  totalLength: number; // meters
  unitPrice: number;   // $/m
  subtotal: number;
}

function buildLineItems(frame: TimberFrame): LineItem[] {
  const groups = new Map<string, LineItem>();

  for (const m of frame.members) {
    const dx = m.end.x - m.start.x;
    const dy = m.end.y - m.start.y;
    const dz = m.end.z - m.start.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ppm = pricePerMeter(m.width, m.depth);
    const key = groupKey(m.type, m.width, m.depth);

    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.totalLength += length;
      existing.subtotal += length * ppm;
    } else {
      groups.set(key, {
        type: m.type,
        label: MEMBER_LABELS[m.type] ?? m.type,
        sectionW: Math.round(m.width * 1000),
        sectionD: Math.round(m.depth * 1000),
        count: 1,
        totalLength: length,
        unitPrice: ppm,
        subtotal: length * ppm,
      });
    }
  }

  return Array.from(groups.values());
}

function wallLength(w: Wall): number {
  const dx = w.end.x - w.start.x;
  const dz = w.end.z - w.start.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export class CheckoutPage {
  private overlay: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private animFrameId = 0;
  onBack: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'checkout-overlay';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);
  }

  show(frame: TimberFrame, openings: Opening[], params: FrameParams): void {
    // ─── Compute data ───
    const items = buildLineItems(frame);
    const grandTotal = items.reduce((s, it) => s + it.subtotal, 0);
    const totalPieces = items.reduce((s, it) => s + it.count, 0);
    const totalLength = items.reduce((s, it) => s + it.totalLength, 0);

    const extWalls = frame.sourceWalls.filter(w => w.wallType === 'exterior');
    const intWalls = frame.sourceWalls.filter(w => w.wallType === 'interior');
    const doors = openings.filter(o => o.type === 'door');
    const windows = openings.filter(o => o.type === 'window');

    // Footprint bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of extWalls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.z, w.end.z);
      maxZ = Math.max(maxZ, w.start.z, w.end.z);
    }
    const fpW = maxX - minX;
    const fpD = maxZ - minZ;

    const extTotalLen = extWalls.reduce((s, w) => s + wallLength(w), 0);
    const intTotalLen = intWalls.reduce((s, w) => s + wallLength(w), 0);

    // ─── Build HTML ───
    this.overlay.innerHTML = `
      <div class="checkout-container">
        <div class="checkout-header">
          <button class="checkout-back-btn">&larr; Back</button>
          <h1 class="checkout-title">Checkout</h1>
        </div>

        <div class="checkout-preview" id="checkout-3d"></div>

        <div class="checkout-section">
          <div class="checkout-section-title">Building</div>
          <div class="checkout-kv">
            <span>Footprint</span><span>${fpW.toFixed(1)} &times; ${fpD.toFixed(1)} m</span>
          </div>
          <div class="checkout-kv">
            <span>Wall height</span><span>${(params.wallHeight * 1000).toFixed(0)} mm</span>
          </div>
          <div class="checkout-kv">
            <span>Exterior walls</span><span>${extWalls.length} &nbsp;(${extTotalLen.toFixed(1)} m)</span>
          </div>
          ${intWalls.length ? `<div class="checkout-kv"><span>Interior walls</span><span>${intWalls.length} &nbsp;(${intTotalLen.toFixed(1)} m)</span></div>` : ''}
          ${doors.length ? `<div class="checkout-kv"><span>Doors</span><span>${doors.length}</span></div>` : ''}
          ${windows.length ? `<div class="checkout-kv"><span>Windows</span><span>${windows.length}</span></div>` : ''}
          ${params.roof ? `<div class="checkout-kv"><span>Roof</span><span>${params.roof.type === 'gable' ? `Gable ${params.roof.pitchAngle}°` : 'Flat'}${params.roof.overhang > 0 ? `, ${(params.roof.overhang * 1000).toFixed(0)} mm overhang` : ''}</span></div>` : ''}
        </div>

        <div class="checkout-section">
          <div class="checkout-section-title">Timber &nbsp;<span class="checkout-dim">${totalPieces} pcs &middot; ${totalLength.toFixed(1)} m</span></div>
          <div class="checkout-list">
            ${items.map(it => `
              <div class="checkout-row">
                <div class="checkout-row-left">
                  <span class="checkout-row-name">${it.label}</span>
                  <span class="checkout-row-dim">${it.sectionW} &times; ${it.sectionD} mm</span>
                </div>
                <div class="checkout-row-mid">
                  ${it.count} pcs &middot; ${it.totalLength.toFixed(1)} m
                </div>
                <div class="checkout-row-price">$${it.subtotal.toFixed(2)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="checkout-total-row">
          <span>Total</span>
          <span class="checkout-total-price">$${grandTotal.toFixed(2)}</span>
        </div>
      </div>
    `;

    // Wire back button
    this.overlay.querySelector('.checkout-back-btn')!
      .addEventListener('click', () => { this.hide(); this.onBack?.(); });

    this.overlay.style.display = 'flex';

    // ─── 3D preview ───
    this.setup3DPreview(frame);
  }

  hide(): void {
    cancelAnimationFrame(this.animFrameId);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.overlay.style.display = 'none';
  }

  // ─── Interactive rotate-only 3D viewer ───

  private setup3DPreview(frame: TimberFrame): void {
    const container = this.overlay.querySelector('#checkout-3d') as HTMLElement;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Lighting (same as main viewer)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(10, 15, 10);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.4);
    fill.position.set(-5, 8, -5);
    scene.add(fill);

    // Build frame meshes
    const meshBuilder = new MeshBuilder();
    const group = meshBuilder.buildFrame(frame);
    scene.add(group);

    // Compute bounding box and fit camera
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Camera
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 350;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.3;
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
    camera.lookAt(center);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    // Controls — rotate only
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.update();

    // Resize on container size change
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    });
    ro.observe(container);

    // Animation loop
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }
}
