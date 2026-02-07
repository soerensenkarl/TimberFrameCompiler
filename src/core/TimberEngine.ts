import { Wall, TimberMember, TimberFrame, FrameParams, Point2D, Point3D } from '../types';

export class TimberEngine {
  generate(walls: Wall[], params: FrameParams): TimberFrame {
    const members: TimberMember[] = [];
    for (const wall of walls) {
      members.push(...this.generateWallFrame(wall, params));
    }
    return { members, sourceWalls: walls };
  }

  private generateWallFrame(wall: Wall, params: FrameParams): TimberMember[] {
    const members: TimberMember[] = [];
    const { studSpacing, wallHeight, studWidth, studDepth, noggings } = params;

    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const wallLength = Math.sqrt(dx * dx + dz * dz);

    if (wallLength < 0.01) return members;

    // Unit direction along the wall
    const dirX = dx / wallLength;
    const dirZ = dz / wallLength;

    // Perpendicular direction (for timber depth offset) - rotated 90 degrees
    const normX = -dirZ;
    const normZ = dirX;

    // Bottom plate: runs the full wall length at y=0
    members.push(this.createPlate(wall, params, 'bottom'));

    // Top plate: runs the full wall length at y=wallHeight - studWidth
    members.push(this.createPlate(wall, params, 'top'));

    // Studs: vertical members between the plates
    const studPositions = this.computeStudPositions(wallLength, studSpacing);

    for (const t of studPositions) {
      const baseX = wall.start.x + dirX * t;
      const baseZ = wall.start.z + dirZ * t;

      const stud: TimberMember = {
        start: {
          x: baseX,
          y: studWidth,  // sits on top of the bottom plate
          z: baseZ,
        },
        end: {
          x: baseX,
          y: wallHeight - studWidth,  // sits below the top plate
          z: baseZ,
        },
        width: studWidth,
        depth: studDepth,
        type: 'stud',
        wallId: wall.id,
      };
      members.push(stud);
    }

    // Noggings: horizontal bracing at mid-height between studs
    if (noggings && studPositions.length >= 2) {
      const noggingY = wallHeight / 2;
      for (let i = 0; i < studPositions.length - 1; i++) {
        const t1 = studPositions[i];
        const t2 = studPositions[i + 1];

        const nog: TimberMember = {
          start: {
            x: wall.start.x + dirX * t1,
            y: noggingY,
            z: wall.start.z + dirZ * t1,
          },
          end: {
            x: wall.start.x + dirX * t2,
            y: noggingY,
            z: wall.start.z + dirZ * t2,
          },
          width: studWidth,
          depth: studDepth,
          type: 'nogging',
          wallId: wall.id,
        };
        members.push(nog);
      }
    }

    return members;
  }

  /** Compute positions along the wall (as distances from start) where studs should go */
  private computeStudPositions(wallLength: number, studSpacing: number): number[] {
    const positions: number[] = [0]; // always a stud at the start

    let pos = studSpacing;
    while (pos < wallLength - 0.01) {
      positions.push(pos);
      pos += studSpacing;
    }

    // Always a stud at the end (if not already very close to the last one)
    const lastPos = positions[positions.length - 1];
    if (wallLength - lastPos > 0.05) {
      positions.push(wallLength);
    }

    return positions;
  }

  private createPlate(wall: Wall, params: FrameParams, position: 'top' | 'bottom'): TimberMember {
    const y = position === 'bottom' ? 0 : params.wallHeight - params.studWidth;

    return {
      start: {
        x: wall.start.x,
        y: y,
        z: wall.start.z,
      },
      end: {
        x: wall.end.x,
        y: y,
        z: wall.end.z,
      },
      width: params.studWidth,
      depth: params.studDepth,
      type: position === 'bottom' ? 'bottom_plate' : 'top_plate',
      wallId: wall.id,
    };
  }
}
