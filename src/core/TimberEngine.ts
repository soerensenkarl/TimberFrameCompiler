import { Wall, TimberMember, TimberFrame, FrameParams, RoofConfig } from '../types';

export class TimberEngine {
  generate(walls: Wall[], params: FrameParams): TimberFrame {
    const members: TimberMember[] = [];
    for (const wall of walls) {
      members.push(...this.generateWallFrame(wall, params));
    }
    if (params.roof) {
      members.push(...this.generateRoof(walls, params));
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

    const dirX = dx / wallLength;
    const dirZ = dz / wallLength;

    // Bottom plate
    members.push(this.createPlate(wall, params, 'bottom'));
    // Top plate
    members.push(this.createPlate(wall, params, 'top'));

    // Studs
    const studPositions = this.computeStudPositions(wallLength, studSpacing);
    for (const t of studPositions) {
      const baseX = wall.start.x + dirX * t;
      const baseZ = wall.start.z + dirZ * t;
      members.push({
        start: { x: baseX, y: studWidth, z: baseZ },
        end: { x: baseX, y: wallHeight - studWidth, z: baseZ },
        width: studWidth, depth: studDepth,
        type: 'stud', wallId: wall.id,
      });
    }

    // Noggings
    if (noggings && studPositions.length >= 2) {
      const noggingY = wallHeight / 2;
      for (let i = 0; i < studPositions.length - 1; i++) {
        const t1 = studPositions[i], t2 = studPositions[i + 1];
        members.push({
          start: { x: wall.start.x + dirX * t1, y: noggingY, z: wall.start.z + dirZ * t1 },
          end: { x: wall.start.x + dirX * t2, y: noggingY, z: wall.start.z + dirZ * t2 },
          width: studWidth, depth: studDepth,
          type: 'nogging', wallId: wall.id,
        });
      }
    }

    return members;
  }

  private generateRoof(walls: Wall[], params: FrameParams): TimberMember[] {
    const members: TimberMember[] = [];
    const roof = params.roof!;
    const { wallHeight, studSpacing, studWidth, studDepth } = params;

    // Find bounding box of exterior walls
    const ext = walls.filter(w => w.wallType === 'exterior');
    if (ext.length === 0) return members;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of ext) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.z, w.end.z);
      maxZ = Math.max(maxZ, w.start.z, w.end.z);
    }

    const pitchRad = (roof.pitchAngle * Math.PI) / 180;
    const overhang = roof.overhang;
    const ridgeAxis = roof.ridgeAxis;

    if (ridgeAxis === 'x') {
      const halfSpan = (maxZ - minZ) / 2;
      const ridgeHeight = wallHeight + Math.tan(pitchRad) * halfSpan;
      const ridgeMidZ = (minZ + maxZ) / 2;

      // Ridge beam
      members.push({
        start: { x: minX - overhang, y: ridgeHeight, z: ridgeMidZ },
        end: { x: maxX + overhang, y: ridgeHeight, z: ridgeMidZ },
        width: studWidth * 1.5, depth: studDepth * 1.5,
        type: 'ridge_beam', wallId: '',
      });

      // Rafters
      const spanX = maxX - minX;
      const rafterCount = Math.max(1, Math.floor(spanX / studSpacing));
      for (let i = 0; i <= rafterCount; i++) {
        const x = minX + (i / rafterCount) * spanX;
        members.push({
          start: { x, y: wallHeight, z: minZ - overhang },
          end: { x, y: ridgeHeight, z: ridgeMidZ },
          width: studWidth, depth: studDepth,
          type: 'rafter', wallId: '',
        });
        members.push({
          start: { x, y: ridgeHeight, z: ridgeMidZ },
          end: { x, y: wallHeight, z: maxZ + overhang },
          width: studWidth, depth: studDepth,
          type: 'rafter', wallId: '',
        });
      }
    } else {
      const halfSpan = (maxX - minX) / 2;
      const ridgeHeight = wallHeight + Math.tan(pitchRad) * halfSpan;
      const ridgeMidX = (minX + maxX) / 2;

      members.push({
        start: { x: ridgeMidX, y: ridgeHeight, z: minZ - overhang },
        end: { x: ridgeMidX, y: ridgeHeight, z: maxZ + overhang },
        width: studWidth * 1.5, depth: studDepth * 1.5,
        type: 'ridge_beam', wallId: '',
      });

      const spanZ = maxZ - minZ;
      const rafterCount = Math.max(1, Math.floor(spanZ / studSpacing));
      for (let i = 0; i <= rafterCount; i++) {
        const z = minZ + (i / rafterCount) * spanZ;
        members.push({
          start: { x: minX - overhang, y: wallHeight, z },
          end: { x: ridgeMidX, y: ridgeHeight, z },
          width: studWidth, depth: studDepth,
          type: 'rafter', wallId: '',
        });
        members.push({
          start: { x: ridgeMidX, y: ridgeHeight, z },
          end: { x: maxX + overhang, y: wallHeight, z },
          width: studWidth, depth: studDepth,
          type: 'rafter', wallId: '',
        });
      }
    }

    return members;
  }

  private computeStudPositions(wallLength: number, studSpacing: number): number[] {
    const positions: number[] = [0];
    let pos = studSpacing;
    while (pos < wallLength - 0.01) {
      positions.push(pos);
      pos += studSpacing;
    }
    if (wallLength - positions[positions.length - 1] > 0.05) {
      positions.push(wallLength);
    }
    return positions;
  }

  private createPlate(wall: Wall, params: FrameParams, position: 'top' | 'bottom'): TimberMember {
    const y = position === 'bottom' ? 0 : params.wallHeight - params.studWidth;
    return {
      start: { x: wall.start.x, y, z: wall.start.z },
      end: { x: wall.end.x, y, z: wall.end.z },
      width: params.studWidth, depth: params.studDepth,
      type: position === 'bottom' ? 'bottom_plate' : 'top_plate',
      wallId: wall.id,
    };
  }
}
