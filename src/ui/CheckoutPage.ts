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
  partition_backer: 'Partition Backer',
};

const ROOF_TYPES: Set<MemberType> = new Set([
  'rafter', 'ridge_beam', 'collar_tie', 'ceiling_joist', 'fascia',
]);

/** Price per linear meter in DKK by cross-section area bracket */
function pricePerMeter(width: number, depth: number): number {
  const area = width * depth * 1e6; // mm²
  if (area < 3000) return 20;
  if (area < 5000) return 30;
  if (area < 8000) return 40;
  if (area < 12000) return 55;
  return 70;
}

/** Format a number as Danish kroner */
function dkk(n: number): string {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
}

type WallCategory = 'exterior' | 'interior' | 'roof';

interface LineItem {
  label: string;
  sectionW: number; // mm
  sectionD: number; // mm
  count: number;
  totalLength: number; // meters
  subtotal: number;
}

interface CategoryGroup {
  category: WallCategory;
  title: string;
  items: LineItem[];
  subtotal: number;
  pieces: number;
  length: number;
}

function buildGroupedItems(frame: TimberFrame): CategoryGroup[] {
  // Build wallId → wallType lookup
  const wallTypeMap = new Map<string, 'exterior' | 'interior'>();
  for (const w of frame.sourceWalls) {
    wallTypeMap.set(w.id, w.wallType);
  }

  // Group key: category|type|WxD
  const groups = new Map<string, { cat: WallCategory; item: LineItem }>();

  for (const m of frame.members) {
    const dx = m.end.x - m.start.x;
    const dy = m.end.y - m.start.y;
    const dz = m.end.z - m.start.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ppm = pricePerMeter(m.width, m.depth);

    let cat: WallCategory;
    if (ROOF_TYPES.has(m.type)) {
      cat = 'roof';
    } else {
      const wt = wallTypeMap.get(m.wallId);
      cat = wt ?? 'exterior';
    }

    const sw = Math.round(m.width * 1000);
    const sd = Math.round(m.depth * 1000);
    const key = `${cat}|${m.type}|${sw}x${sd}`;

    const existing = groups.get(key);
    if (existing) {
      existing.item.count++;
      existing.item.totalLength += length;
      existing.item.subtotal += length * ppm;
    } else {
      groups.set(key, {
        cat,
        item: {
          label: MEMBER_LABELS[m.type] ?? m.type,
          sectionW: sw,
          sectionD: sd,
          count: 1,
          totalLength: length,
          subtotal: length * ppm,
        },
      });
    }
  }

  // Collect into categories
  const catMap = new Map<WallCategory, LineItem[]>();
  for (const { cat, item } of groups.values()) {
    let arr = catMap.get(cat);
    if (!arr) { arr = []; catMap.set(cat, arr); }
    arr.push(item);
  }

  const order: { cat: WallCategory; title: string }[] = [
    { cat: 'exterior', title: 'Exterior Walls' },
    { cat: 'interior', title: 'Interior Walls' },
    { cat: 'roof', title: 'Roof' },
  ];

  const result: CategoryGroup[] = [];
  for (const { cat, title } of order) {
    const items = catMap.get(cat);
    if (!items || items.length === 0) continue;
    result.push({
      category: cat,
      title,
      items,
      subtotal: items.reduce((s, it) => s + it.subtotal, 0),
      pieces: items.reduce((s, it) => s + it.count, 0),
      length: items.reduce((s, it) => s + it.totalLength, 0),
    });
  }
  return result;
}

function wallLength(w: Wall): number {
  const dx = w.end.x - w.start.x;
  const dz = w.end.z - w.start.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function renderRow(it: LineItem): string {
  return `<div class="checkout-row">
    <div class="checkout-row-left">
      <span class="checkout-row-name">${it.label}</span>
      <span class="checkout-row-dim">${it.sectionW} &times; ${it.sectionD} mm</span>
    </div>
    <div class="checkout-row-mid">${it.count} pcs &middot; ${it.totalLength.toFixed(1)} m</div>
    <div class="checkout-row-price">${dkk(it.subtotal)}</div>
  </div>`;
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
    const groups = buildGroupedItems(frame);
    const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);
    const totalPieces = groups.reduce((s, g) => s + g.pieces, 0);
    const totalLength = groups.reduce((s, g) => s + g.length, 0);

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
          ${groups.map(g => `
            <div class="checkout-group">
              <div class="checkout-group-title">${g.title}<span class="checkout-dim">${g.pieces} pcs &middot; ${g.length.toFixed(1)} m</span></div>
              <div class="checkout-list">
                ${g.items.map(renderRow).join('')}
              </div>
              <div class="checkout-group-subtotal">
                <span>Subtotal</span>
                <span>${dkk(g.subtotal)}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="checkout-total-row">
          <span>Total</span>
          <span class="checkout-total-price">${dkk(grandTotal)}</span>
        </div>
      </div>
    `;

    // Wire back button
    this.overlay.querySelector('.checkout-back-btn')!
      .addEventListener('click', () => { this.hide(); this.onBack?.(); });

    this.overlay.style.display = 'flex';

    // Defer 3D setup — retry until the container has layout dimensions
    this.waitAndSetup3D(frame, 0);
  }

  private waitAndSetup3D(frame: TimberFrame, attempt: number): void {
    if (attempt > 20) return; // give up after ~1s
    const container = this.overlay.querySelector('#checkout-3d') as HTMLElement;
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
      setTimeout(() => this.waitAndSetup3D(frame, attempt + 1), 50);
      return;
    }
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

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Lighting
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
