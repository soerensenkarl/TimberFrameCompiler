import { Wall, Opening, TimberMember, TimberFrame, FrameParams, RoofConfig } from '../types';

export class TimberEngine {
  generate(walls: Wall[], params: FrameParams, openings: Opening[] = []): TimberFrame {
    const members: TimberMember[] = [];
    for (const wall of walls) {
      const wallOpenings = openings
        .filter(o => o.wallId === wall.id)
        .sort((a, b) => a.position - b.position);
      members.push(...this.generateWallFrame(wall, params, wallOpenings));
    }
    if (params.roof) {
      members.push(...this.generateRoof(walls, params));
    }
    return { members, sourceWalls: walls };
  }

  private generateWallFrame(wall: Wall, params: FrameParams, openings: Opening[]): TimberMember[] {
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

    if (openings.length === 0) {
      // No openings — regular studs + noggings
      const studPositions = this.computeStudPositions(wallLength, studSpacing);
      this.addFullStuds(members, wall, params, studPositions, dirX, dirZ);
      if (noggings && studPositions.length >= 2) {
        this.addNoggings(members, wall, params, studPositions, dirX, dirZ, wallHeight / 2);
      }
      return members;
    }

    // Build opening zones
    const zones = openings.map(o => ({
      left: o.position - o.width / 2,
      right: o.position + o.width / 2,
      headerY: studWidth + o.sillHeight + o.height,
      sillY: studWidth + o.sillHeight,
      opening: o,
    }));

    // Compute stud positions
    const studPositions = this.computeStudPositions(wallLength, studSpacing);

    // For each stud position: full stud, or cripple studs if inside an opening
    for (const t of studPositions) {
      const baseX = wall.start.x + dirX * t;
      const baseZ = wall.start.z + dirZ * t;
      const zone = zones.find(z => t > z.left + 0.02 && t < z.right - 0.02);

      if (zone) {
        // Cripple stud above header
        if (zone.headerY + studWidth < wallHeight - studWidth) {
          members.push({
            start: { x: baseX, y: zone.headerY + studWidth, z: baseZ },
            end: { x: baseX, y: wallHeight - studWidth, z: baseZ },
            width: studWidth, depth: studDepth,
            type: 'cripple_stud', wallId: wall.id,
          });
        }
        // Cripple stud below sill (windows only)
        if (zone.opening.type === 'window' && zone.sillY - studWidth > studWidth + 0.02) {
          members.push({
            start: { x: baseX, y: studWidth, z: baseZ },
            end: { x: baseX, y: zone.sillY - studWidth, z: baseZ },
            width: studWidth, depth: studDepth,
            type: 'cripple_stud', wallId: wall.id,
          });
        }
      } else {
        // Full-height stud
        members.push({
          start: { x: baseX, y: studWidth, z: baseZ },
          end: { x: baseX, y: wallHeight - studWidth, z: baseZ },
          width: studWidth, depth: studDepth,
          type: 'stud', wallId: wall.id,
        });
      }
    }

    // Per-opening framing: king studs, trimmers, header, sill
    for (const zone of zones) {
      const lx = wall.start.x + dirX * zone.left;
      const lz = wall.start.z + dirZ * zone.left;
      const rx = wall.start.x + dirX * zone.right;
      const rz = wall.start.z + dirZ * zone.right;

      // King studs (full height at opening edges)
      members.push({
        start: { x: lx, y: studWidth, z: lz },
        end: { x: lx, y: wallHeight - studWidth, z: lz },
        width: studWidth, depth: studDepth,
        type: 'stud', wallId: wall.id,
      });
      members.push({
        start: { x: rx, y: studWidth, z: rz },
        end: { x: rx, y: wallHeight - studWidth, z: rz },
        width: studWidth, depth: studDepth,
        type: 'stud', wallId: wall.id,
      });

      // Trimmer studs (bottom plate to header)
      const trimLx = lx + dirX * studDepth;
      const trimLz = lz + dirZ * studDepth;
      const trimRx = rx - dirX * studDepth;
      const trimRz = rz - dirZ * studDepth;
      members.push({
        start: { x: trimLx, y: studWidth, z: trimLz },
        end: { x: trimLx, y: zone.headerY, z: trimLz },
        width: studWidth, depth: studDepth,
        type: 'trimmer', wallId: wall.id,
      });
      members.push({
        start: { x: trimRx, y: studWidth, z: trimRz },
        end: { x: trimRx, y: zone.headerY, z: trimRz },
        width: studWidth, depth: studDepth,
        type: 'trimmer', wallId: wall.id,
      });

      // Header (horizontal, spans the opening)
      members.push({
        start: { x: lx, y: zone.headerY, z: lz },
        end: { x: rx, y: zone.headerY, z: rz },
        width: studWidth, depth: studDepth * 1.5,
        type: 'header', wallId: wall.id,
      });

      // Sill plate (windows only)
      if (zone.opening.type === 'window') {
        members.push({
          start: { x: lx, y: zone.sillY, z: lz },
          end: { x: rx, y: zone.sillY, z: rz },
          width: studWidth, depth: studDepth,
          type: 'sill_plate', wallId: wall.id,
        });
      }
    }

    // Noggings in clear zones (between openings)
    if (noggings) {
      const noggingY = wallHeight / 2;
      const clearStuds: number[] = [];
      for (const t of studPositions) {
        const inOpening = zones.some(z => t > z.left + 0.02 && t < z.right - 0.02);
        if (!inOpening) clearStuds.push(t);
      }
      // Add opening edge positions to get noggings right up to openings
      for (const z of zones) {
        clearStuds.push(z.left, z.right);
      }
      clearStuds.sort((a, b) => a - b);
      // Deduplicate
      const unique = clearStuds.filter((v, i, a) => i === 0 || v - a[i - 1] > 0.02);

      for (let i = 0; i < unique.length - 1; i++) {
        const t1 = unique[i], t2 = unique[i + 1];
        // Don't add nogging across an opening
        const spansOpening = zones.some(z => t1 < z.left && t2 > z.right);
        const insideOpening = zones.some(z => t1 >= z.left - 0.02 && t2 <= z.right + 0.02);
        if (spansOpening || insideOpening) continue;
        if (t2 - t1 < 0.05) continue;

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

  private addFullStuds(
    members: TimberMember[], wall: Wall, params: FrameParams,
    positions: number[], dirX: number, dirZ: number,
  ): void {
    const { studWidth, studDepth, wallHeight } = params;
    for (const t of positions) {
      const x = wall.start.x + dirX * t;
      const z = wall.start.z + dirZ * t;
      members.push({
        start: { x, y: studWidth, z },
        end: { x, y: wallHeight - studWidth, z },
        width: studWidth, depth: studDepth,
        type: 'stud', wallId: wall.id,
      });
    }
  }

  private addNoggings(
    members: TimberMember[], wall: Wall, params: FrameParams,
    positions: number[], dirX: number, dirZ: number, y: number,
  ): void {
    const { studWidth, studDepth } = params;
    for (let i = 0; i < positions.length - 1; i++) {
      const t1 = positions[i], t2 = positions[i + 1];
      members.push({
        start: { x: wall.start.x + dirX * t1, y, z: wall.start.z + dirZ * t1 },
        end: { x: wall.start.x + dirX * t2, y, z: wall.start.z + dirZ * t2 },
        width: studWidth, depth: studDepth,
        type: 'nogging', wallId: wall.id,
      });
    }
  }

  private generateRoof(walls: Wall[], params: FrameParams): TimberMember[] {
    const members: TimberMember[] = [];
    const roof = params.roof!;
    const { wallHeight, studSpacing, studWidth, studDepth } = params;

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

    if (roof.ridgeAxis === 'x') {
      const halfSpan = (maxZ - minZ) / 2;
      const ridgeHeight = wallHeight + Math.tan(pitchRad) * halfSpan;
      const ridgeMidZ = (minZ + maxZ) / 2;

      members.push({
        start: { x: minX - overhang, y: ridgeHeight, z: ridgeMidZ },
        end: { x: maxX + overhang, y: ridgeHeight, z: ridgeMidZ },
        width: studWidth * 1.5, depth: studDepth * 1.5,
        type: 'ridge_beam', wallId: '',
      });

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
