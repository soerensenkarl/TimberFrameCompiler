import { TimberFrame, MemberType } from '../types';

/** Human-readable labels for member types */
const MEMBER_LABELS: Record<MemberType, string> = {
  stud: 'Studs',
  king_stud: 'King Studs',
  bottom_plate: 'Bottom Plates',
  top_plate: 'Top Plates',
  double_top_plate: 'Double Top Plates',
  nogging: 'Noggings',
  rafter: 'Rafters',
  ridge_beam: 'Ridge Beams',
  collar_tie: 'Collar Ties',
  ceiling_joist: 'Ceiling Joists',
  fascia: 'Fascia Boards',
  header: 'Headers',
  trimmer: 'Trimmers',
  sill_plate: 'Sill Plates',
  cripple_stud: 'Cripple Studs',
  corner_stud: 'Corner Studs',
  partition_backer: 'Partition Backers',
};

/** Price per linear meter by cross-section area bracket ($/m) */
function pricePerMeter(width: number, depth: number): number {
  const area = width * depth * 1e6; // mm^2
  if (area < 3000) return 2.80;
  if (area < 5000) return 4.20;
  if (area < 8000) return 5.60;
  if (area < 12000) return 7.50;
  return 9.80;
}

interface LineItem {
  type: MemberType;
  label: string;
  count: number;
  totalLength: number; // meters
  unitPrice: number;   // $ per meter
  subtotal: number;
}

function buildLineItems(frame: TimberFrame): LineItem[] {
  const groups = new Map<MemberType, { count: number; totalLength: number; unitPrice: number }>();

  for (const m of frame.members) {
    const dx = m.end.x - m.start.x;
    const dy = m.end.y - m.start.y;
    const dz = m.end.z - m.start.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ppm = pricePerMeter(m.width, m.depth);

    const existing = groups.get(m.type);
    if (existing) {
      existing.count++;
      existing.totalLength += length;
    } else {
      groups.set(m.type, { count: 1, totalLength: length, unitPrice: ppm });
    }
  }

  const items: LineItem[] = [];
  for (const [type, g] of groups) {
    items.push({
      type,
      label: MEMBER_LABELS[type] ?? type,
      count: g.count,
      totalLength: g.totalLength,
      unitPrice: g.unitPrice,
      subtotal: g.totalLength * g.unitPrice,
    });
  }

  return items;
}

export class CheckoutPage {
  private overlay: HTMLElement;
  onBack: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'checkout-overlay';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);
  }

  show(frame: TimberFrame, screenshotDataUrl: string): void {
    const items = buildLineItems(frame);
    const grandTotal = items.reduce((sum, it) => sum + it.subtotal, 0);
    const totalMembers = items.reduce((sum, it) => sum + it.count, 0);
    const totalLength = items.reduce((sum, it) => sum + it.totalLength, 0);

    this.overlay.innerHTML = `
      <div class="checkout-container">
        <div class="checkout-header">
          <button class="checkout-back-btn">&larr; Back to Designer</button>
          <h1 class="checkout-title">Checkout</h1>
        </div>

        <div class="checkout-preview">
          <img src="${screenshotDataUrl}" alt="Timber frame preview" class="checkout-preview-img" />
        </div>

        <div class="checkout-summary-header">
          <h2>Order Summary</h2>
          <span class="checkout-meta">${totalMembers} members &middot; ${totalLength.toFixed(1)}m total timber</span>
        </div>

        <div class="checkout-table">
          <div class="checkout-table-head">
            <span class="col-item">Item</span>
            <span class="col-qty">Qty</span>
            <span class="col-length">Length</span>
            <span class="col-rate">Rate</span>
            <span class="col-subtotal">Subtotal</span>
          </div>
          ${items.map(it => `
            <div class="checkout-table-row">
              <span class="col-item">${it.label}</span>
              <span class="col-qty">${it.count}</span>
              <span class="col-length">${it.totalLength.toFixed(1)}m</span>
              <span class="col-rate">$${it.unitPrice.toFixed(2)}/m</span>
              <span class="col-subtotal">$${it.subtotal.toFixed(2)}</span>
            </div>
          `).join('')}
          <div class="checkout-table-total">
            <span class="col-item">Total</span>
            <span class="col-qty"></span>
            <span class="col-length"></span>
            <span class="col-rate"></span>
            <span class="col-subtotal">$${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div class="checkout-footer">
          <div class="checkout-total-banner">
            <span>Total</span>
            <span class="checkout-total-price">$${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;

    this.overlay.querySelector('.checkout-back-btn')!.addEventListener('click', () => {
      this.hide();
      this.onBack?.();
    });

    this.overlay.style.display = 'flex';
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }
}
