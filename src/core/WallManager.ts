import { Wall, Point2D } from '../types';

let nextId = 1;

export class WallManager {
  private walls: Map<string, Wall> = new Map();
  onChange: ((walls: Wall[]) => void) | null = null;

  addWall(start: Point2D, end: Point2D): Wall {
    const id = `wall-${nextId++}`;
    const wall: Wall = { id, start, end };
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

  clear(): void {
    this.walls.clear();
    this.notify();
  }

  getWallCount(): number {
    return this.walls.size;
  }

  private notify(): void {
    this.onChange?.(this.getWalls());
  }
}
