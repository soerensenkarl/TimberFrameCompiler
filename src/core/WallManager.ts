import { Wall, Point2D, Opening } from '../types';

let nextId = 1;
let nextOpeningId = 1;

export class WallManager {
  private walls: Map<string, Wall> = new Map();
  private openings: Map<string, Opening> = new Map();
  onChange: ((walls: Wall[]) => void) | null = null;

  addWall(start: Point2D, end: Point2D, wallType: 'exterior' | 'interior' = 'exterior'): Wall {
    const id = `wall-${nextId++}`;
    const wall: Wall = { id, start, end, wallType };
    this.walls.set(id, wall);
    this.notify();
    return wall;
  }

  removeWall(id: string): void {
    this.walls.delete(id);
    // Remove openings on this wall
    for (const [oid, o] of this.openings) {
      if (o.wallId === id) this.openings.delete(oid);
    }
    this.notify();
  }

  getWalls(): Wall[] {
    return Array.from(this.walls.values());
  }

  getExteriorWalls(): Wall[] {
    return this.getWalls().filter(w => w.wallType === 'exterior');
  }

  getInteriorWalls(): Wall[] {
    return this.getWalls().filter(w => w.wallType === 'interior');
  }

  clear(): void {
    this.walls.clear();
    this.openings.clear();
    nextId = 1;
    nextOpeningId = 1;
    this.notify();
  }

  getWallCount(): number {
    return this.walls.size;
  }

  /** Replace all exterior walls with a rectangle footprint (notifies once) */
  setFootprint(minX: number, minZ: number, maxX: number, maxZ: number): void {
    // Remove existing exterior walls and their openings
    for (const [id, w] of this.walls) {
      if (w.wallType === 'exterior') {
        this.walls.delete(id);
        for (const [oid, o] of this.openings) {
          if (o.wallId === id) this.openings.delete(oid);
        }
      }
    }

    // Add 4 walls (clockwise from top-left)
    const corners: Point2D[] = [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ];
    for (let i = 0; i < 4; i++) {
      const id = `wall-${nextId++}`;
      this.walls.set(id, {
        id,
        start: corners[i],
        end: corners[(i + 1) % 4],
        wallType: 'exterior',
      });
    }
    this.notify();
  }

  /** Get the bounding box of all exterior walls */
  getExteriorBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    const ext = this.getExteriorWalls();
    if (ext.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of ext) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.z, w.end.z);
      maxZ = Math.max(maxZ, w.start.z, w.end.z);
    }
    return { minX, maxX, minZ, maxZ };
  }

  // ─── Openings ───

  addOpening(
    wallId: string, type: 'window' | 'door',
    position: number, width: number, height: number, sillHeight: number,
  ): Opening {
    const id = `opening-${nextOpeningId++}`;
    const opening: Opening = { id, wallId, type, position, width, height, sillHeight };
    this.openings.set(id, opening);
    this.notify();
    return opening;
  }

  removeOpening(id: string): void {
    this.openings.delete(id);
    this.notify();
  }

  getOpenings(): Opening[] {
    return Array.from(this.openings.values());
  }

  getOpeningsForWall(wallId: string): Opening[] {
    return this.getOpenings().filter(o => o.wallId === wallId);
  }

  clearOpenings(): void {
    this.openings.clear();
    nextOpeningId = 1;
    this.notify();
  }

  /**
   * Load a pre-built example house:
   * ~8m x 6m exterior with interior partition walls, windows, and a front door.
   */
  loadExampleHouse(): void {
    this.clear();

    // Exterior walls (clockwise rectangle)
    const corners = [
      { x: -4, z: -3 },
      { x: 4, z: -3 },
      { x: 4, z: 3 },
      { x: -4, z: 3 },
    ];
    const extIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const w = this.addWallSilent(corners[i], corners[(i + 1) % 4], 'exterior');
      extIds.push(w.id);
    }

    // Interior walls
    // Horizontal partition splitting the house roughly in half (living area / bedrooms)
    this.addWallSilent({ x: -4, z: 0 }, { x: 1, z: 0 }, 'interior');
    // Vertical partition creating two bedrooms on the back half
    this.addWallSilent({ x: 0, z: 0 }, { x: 0, z: 3 }, 'interior');

    // Openings
    // Front wall (south, wall index 0: -4,-3 → 4,-3)
    // Front door (centered)
    this.addOpeningSilent(extIds[0], 'door', 4, 0.9, 2.1, 0);
    // Window left of door
    this.addOpeningSilent(extIds[0], 'window', 1.5, 1.0, 1.2, 0.9);
    // Window right of door
    this.addOpeningSilent(extIds[0], 'window', 6.5, 1.0, 1.2, 0.9);

    // Right wall (east, wall index 1: 4,-3 → 4,3)
    this.addOpeningSilent(extIds[1], 'window', 3, 1.0, 1.2, 0.9);

    // Back wall (north, wall index 2: 4,3 → -4,3)
    this.addOpeningSilent(extIds[2], 'window', 2, 1.0, 1.2, 0.9);
    this.addOpeningSilent(extIds[2], 'window', 6, 1.0, 1.2, 0.9);

    // Left wall (west, wall index 3: -4,3 → -4,-3)
    this.addOpeningSilent(extIds[3], 'window', 3, 1.0, 1.2, 0.9);

    this.notify();
  }

  /** Add wall without triggering onChange (for batch loading) */
  private addWallSilent(start: Point2D, end: Point2D, wallType: 'exterior' | 'interior'): Wall {
    const id = `wall-${nextId++}`;
    const wall: Wall = { id, start, end, wallType };
    this.walls.set(id, wall);
    return wall;
  }

  /** Add opening without triggering onChange (for batch loading) */
  private addOpeningSilent(
    wallId: string, type: 'window' | 'door',
    position: number, width: number, height: number, sillHeight: number,
  ): Opening {
    const id = `opening-${nextOpeningId++}`;
    const opening: Opening = { id, wallId, type, position, width, height, sillHeight };
    this.openings.set(id, opening);
    return opening;
  }

  private notify(): void {
    this.onChange?.(this.getWalls());
  }
}
