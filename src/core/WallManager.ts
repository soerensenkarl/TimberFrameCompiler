import { Wall, Point2D } from '../types';

let nextId = 1;

export class WallManager {
  private walls: Map<string, Wall> = new Map();
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
    nextId = 1;
    this.notify();
  }

  getWallCount(): number {
    return this.walls.size;
  }

  /** Replace all exterior walls with a rectangle footprint (notifies once) */
  setFootprint(minX: number, minZ: number, maxX: number, maxZ: number): void {
    // Remove existing exterior walls
    for (const [id, w] of this.walls) {
      if (w.wallType === 'exterior') this.walls.delete(id);
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

  private notify(): void {
    this.onChange?.(this.getWalls());
  }
}
