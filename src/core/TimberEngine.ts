import { Wall, Opening, TimberMember, TimberFrame, FrameParams, Point2D } from '../types';

/**
 * TimberEngine — generates a structurally-correct timber stud frame
 * following standard platform-framing conventions:
 *
 * - Bottom plate (sole plate) runs full wall length
 * - Double top plate with staggered laps at corners/intersections
 * - Studs on-center (OC) layout from the wall start
 * - 3-stud corner assemblies at L-junctions (California corners)
 * - Partition backers (ladder blocking) at T-junctions
 * - King studs + jack studs (trimmers) at openings
 * - Built-up headers sized to span, bearing on jack studs
 * - Cripple studs above headers and below sills maintain OC layout
 * - Sill plates for windows span between jack studs
 * - Noggings (blocking/dwangs) at mid-height in clear bays
 * - Gable roof: ridge board, common rafters, ceiling joists, collar ties, fascia
 */

// Tolerance for floating-point comparisons (meters)
const EPS = 0.005;

interface WallDir {
  dx: number;
  dz: number;
  length: number;
  dirX: number; // unit direction along wall
  dirZ: number;
  normX: number; // outward-facing normal (left of direction)
  normZ: number;
}

interface Junction {
  point: Point2D;
  wallIds: string[];
  type: 'corner' | 'tee'; // corner = exactly 2 walls meet; tee = 3+ or interior meets exterior
}

interface OpeningZone {
  left: number;   // distance along wall to left edge of rough opening
  right: number;  // distance along wall to right edge of rough opening
  headerY: number; // top of header (bottom plate + sill height + opening height)
  sillY: number;   // bottom of sill plate (bottom plate + sill height)
  opening: Opening;
}

export class TimberEngine {
  generate(walls: Wall[], params: FrameParams, openings: Opening[] = []): TimberFrame {
    const members: TimberMember[] = [];
    const wallDirs = new Map<string, WallDir>();

    // Pre-compute wall directions
    for (const wall of walls) {
      wallDirs.set(wall.id, this.computeWallDir(wall));
    }

    // Detect junctions (corners and T-intersections)
    const junctions = this.detectJunctions(walls);

    // Generate each wall's frame
    for (const wall of walls) {
      const wallOpenings = openings
        .filter(o => o.wallId === wall.id)
        .sort((a, b) => a.position - b.position);
      const dir = wallDirs.get(wall.id)!;
      // Use exterior depth for exterior walls, standard depth for interior
      const wallParams = wall.wallType === 'exterior'
        ? { ...params, studDepth: params.exteriorStudDepth }
        : params;
      members.push(...this.generateWallFrame(wall, dir, wallParams, wallOpenings, junctions, walls, wallDirs));
    }

    // Corner assemblies and partition backers
    members.push(...this.generateJunctionFraming(junctions, walls, wallDirs, params));

    // Roof
    if (params.roof) {
      members.push(...this.generateRoof(walls, params));
    }

    return { members, sourceWalls: walls };
  }

  // ─── Wall direction computation ───

  private computeWallDir(wall: Wall): WallDir {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const dirX = length > EPS ? dx / length : 0;
    const dirZ = length > EPS ? dz / length : 0;
    // Normal points to the "left" of the wall direction (exterior-facing by convention)
    const normX = -dirZ;
    const normZ = dirX;
    return { dx, dz, length, dirX, dirZ, normX, normZ };
  }

  // ─── Junction detection ───

  private detectJunctions(walls: Wall[]): Junction[] {
    const junctions: Junction[] = [];
    const pointMap = new Map<string, { point: Point2D; wallIds: string[] }>();

    const key = (p: Point2D) => `${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`;

    for (const wall of walls) {
      for (const pt of [wall.start, wall.end]) {
        const k = key(pt);
        if (!pointMap.has(k)) {
          pointMap.set(k, { point: { x: pt.x, z: pt.z }, wallIds: [] });
        }
        const entry = pointMap.get(k)!;
        if (!entry.wallIds.includes(wall.id)) {
          entry.wallIds.push(wall.id);
        }
      }

      // Check if any wall endpoint lies along (not at endpoints of) another wall → T-junction
      for (const other of walls) {
        if (other.id === wall.id) continue;
        for (const pt of [wall.start, wall.end]) {
          if (this.isPointOnSegment(pt, other.start, other.end)) {
            // pt is on the interior of 'other' wall segment
            const k = key(pt);
            if (!pointMap.has(k)) {
              pointMap.set(k, { point: { x: pt.x, z: pt.z }, wallIds: [] });
            }
            const entry = pointMap.get(k)!;
            if (!entry.wallIds.includes(wall.id)) entry.wallIds.push(wall.id);
            if (!entry.wallIds.includes(other.id)) entry.wallIds.push(other.id);
          }
        }
      }
    }

    for (const entry of pointMap.values()) {
      if (entry.wallIds.length >= 2) {
        // Determine if it's a corner (endpoint-to-endpoint) or tee (one wall's endpoint on another's mid)
        const isTee = entry.wallIds.some(wid => {
          const w = walls.find(ww => ww.id === wid)!;
          return this.isPointOnSegmentInterior(entry.point, w.start, w.end);
        });
        junctions.push({
          point: entry.point,
          wallIds: entry.wallIds,
          type: isTee ? 'tee' : 'corner',
        });
      }
    }

    return junctions;
  }

  private isPointOnSegment(pt: Point2D, a: Point2D, b: Point2D): boolean {
    const abx = b.x - a.x, abz = b.z - a.z;
    const abLen = Math.sqrt(abx * abx + abz * abz);
    if (abLen < EPS) return false;
    const apx = pt.x - a.x, apz = pt.z - a.z;
    const t = (apx * abx + apz * abz) / (abLen * abLen);
    if (t < EPS / abLen || t > 1 - EPS / abLen) return false;
    const projX = a.x + t * abx, projZ = a.z + t * abz;
    const dist = Math.sqrt((pt.x - projX) ** 2 + (pt.z - projZ) ** 2);
    return dist < EPS * 2;
  }

  private isPointOnSegmentInterior(pt: Point2D, a: Point2D, b: Point2D): boolean {
    const abx = b.x - a.x, abz = b.z - a.z;
    const abLen = Math.sqrt(abx * abx + abz * abz);
    if (abLen < EPS) return false;
    const apx = pt.x - a.x, apz = pt.z - a.z;
    const t = (apx * abx + apz * abz) / (abLen * abLen);
    // "Interior" means not at the very start or end
    if (t < 0.01 || t > 0.99) return false;
    const projX = a.x + t * abx, projZ = a.z + t * abz;
    const dist = Math.sqrt((pt.x - projX) ** 2 + (pt.z - projZ) ** 2);
    return dist < EPS * 2;
  }

  // ─── Single wall frame generation ───

  private generateWallFrame(
    wall: Wall,
    dir: WallDir,
    params: FrameParams,
    openings: Opening[],
    junctions: Junction[],
    allWalls: Wall[],
    wallDirs: Map<string, WallDir>,
  ): TimberMember[] {
    const members: TimberMember[] = [];
    const { studSpacing, wallHeight, studWidth, studDepth } = params;
    const plateThick = studWidth; // plates are the same timber turned flat

    if (dir.length < 0.01) return members;

    // ── Plates ──
    // Bottom plate (sole plate): full wall length
    members.push(this.createPlate(wall, params, 'bottom'));
    // Top plate: full wall length
    members.push(this.createPlate(wall, params, 'top'));
    // Double top plate: full wall length, offset up by one plate thickness
    members.push({
      start: { x: wall.start.x, y: wallHeight - plateThick, z: wall.start.z },
      end: { x: wall.end.x, y: wallHeight - plateThick, z: wall.end.z },
      width: plateThick,
      depth: studDepth,
      type: 'double_top_plate',
      wallId: wall.id,
    });

    // ── Build opening zones ──
    const zones: OpeningZone[] = openings.map(o => ({
      left: o.position - o.width / 2,
      right: o.position + o.width / 2,
      headerY: plateThick + o.sillHeight + o.height,
      sillY: plateThick + o.sillHeight,
      opening: o,
    }));

    // ── Compute on-center stud positions ──
    // Standard: first stud at 0 (wall start), then every studSpacing OC, end stud at wallLength
    const studPositions = this.computeStudPositionsOC(dir.length, studSpacing);

    // Identify which stud positions are at junction points (don't double up with corner/partition studs)
    const junctionPositions = new Set<number>();
    for (const junc of junctions) {
      const t = this.projectPointOntoWall(junc.point, wall, dir);
      if (t !== null) {
        // Mark positions near this junction
        for (const sp of studPositions) {
          if (Math.abs(sp - t) < studDepth + EPS) {
            junctionPositions.add(sp);
          }
        }
      }
    }

    // ── Place studs ──
    for (const t of studPositions) {
      const baseX = wall.start.x + dir.dirX * t;
      const baseZ = wall.start.z + dir.dirZ * t;

      // Check if this position falls inside an opening zone
      const zone = zones.find(z => t > z.left + EPS && t < z.right - EPS);

      if (zone) {
        // Cripple stud above header — maintains OC layout
        const headerHeight = studWidth * 2; // doubled header
        const crippleTop = wallHeight - plateThick * 2; // bottom of top plate
        if (zone.headerY + headerHeight + EPS < crippleTop) {
          members.push({
            start: { x: baseX, y: zone.headerY + headerHeight, z: baseZ },
            end: { x: baseX, y: crippleTop, z: baseZ },
            width: studWidth, depth: studDepth,
            type: 'cripple_stud', wallId: wall.id,
          });
        }
        // Cripple stud below sill (windows only)
        if (zone.opening.type === 'window' && zone.sillY > plateThick + EPS) {
          members.push({
            start: { x: baseX, y: plateThick, z: baseZ },
            end: { x: baseX, y: zone.sillY, z: baseZ },
            width: studWidth, depth: studDepth,
            type: 'cripple_stud', wallId: wall.id,
          });
        }
      } else {
        // Skip if this is a junction position (corner/partition studs handle it)
        if (junctionPositions.has(t) && t > EPS && t < dir.length - EPS) continue;

        // Full-height stud: top of bottom plate to bottom of top plate
        const studBottom = plateThick;
        const studTop = wallHeight - plateThick * 2; // bottom of top plate
        if (studTop - studBottom > EPS) {
          members.push({
            start: { x: baseX, y: studBottom, z: baseZ },
            end: { x: baseX, y: studTop, z: baseZ },
            width: studWidth, depth: studDepth,
            type: 'stud', wallId: wall.id,
          });
        }
      }
    }

    // ── Per-opening framing: king studs, jack studs, header, sill ──
    for (const zone of zones) {
      this.frameOpening(members, wall, dir, params, zone, studPositions);
    }

    // ── Noggings (blocking) at mid-height in clear bays ──
    if (params.noggings) {
      this.addNoggingsWithOpenings(members, wall, dir, params, studPositions, zones);
    }

    return members;
  }

  // ─── Opening framing (king studs, jack studs, header, sill, cripples) ───

  private frameOpening(
    members: TimberMember[],
    wall: Wall,
    dir: WallDir,
    params: FrameParams,
    zone: OpeningZone,
    studPositions: number[],
  ): void {
    const { studWidth, studDepth, wallHeight } = params;
    const plateThick = studWidth;

    // Rough opening edges
    const kingLeftT = zone.left;
    const kingRightT = zone.right;

    // King stud positions (at the edges of the rough opening, full height)
    const klx = wall.start.x + dir.dirX * kingLeftT;
    const klz = wall.start.z + dir.dirZ * kingLeftT;
    const krx = wall.start.x + dir.dirX * kingRightT;
    const krz = wall.start.z + dir.dirZ * kingRightT;

    const studBottom = plateThick;
    const studTop = wallHeight - plateThick * 2; // bottom of top plate

    // King studs — full height, frame the rough opening
    members.push({
      start: { x: klx, y: studBottom, z: klz },
      end: { x: klx, y: studTop, z: klz },
      width: studWidth, depth: studDepth,
      type: 'king_stud', wallId: wall.id,
    });
    members.push({
      start: { x: krx, y: studBottom, z: krz },
      end: { x: krx, y: studTop, z: krz },
      width: studWidth, depth: studDepth,
      type: 'king_stud', wallId: wall.id,
    });

    // Jack studs (trimmers) — tight against king studs on the inside, support the header
    const jackLeftT = kingLeftT + studWidth;
    const jackRightT = kingRightT - studWidth;
    const jlx = wall.start.x + dir.dirX * jackLeftT;
    const jlz = wall.start.z + dir.dirZ * jackLeftT;
    const jrx = wall.start.x + dir.dirX * jackRightT;
    const jrz = wall.start.z + dir.dirZ * jackRightT;

    // Jack studs run from bottom plate to underside of header
    members.push({
      start: { x: jlx, y: studBottom, z: jlz },
      end: { x: jlx, y: zone.headerY, z: jlz },
      width: studWidth, depth: studDepth,
      type: 'trimmer', wallId: wall.id,
    });
    members.push({
      start: { x: jrx, y: studBottom, z: jrz },
      end: { x: jrx, y: zone.headerY, z: jrz },
      width: studWidth, depth: studDepth,
      type: 'trimmer', wallId: wall.id,
    });

    // Header — spans from king stud to king stud, sits on top of jack studs
    // Header depth is typically the full width of the wall cavity minus a gap
    // Standard: double 2x lumber with plywood spacer = depth matching wall studs
    const headerDepth = studDepth;
    const headerWidth = studWidth * 2; // doubled header for structural integrity
    members.push({
      start: { x: klx, y: zone.headerY, z: klz },
      end: { x: krx, y: zone.headerY, z: krz },
      width: headerWidth, depth: headerDepth,
      type: 'header', wallId: wall.id,
    });

    // Sill plate (windows only) — spans between jack studs
    if (zone.opening.type === 'window') {
      members.push({
        start: { x: jlx, y: zone.sillY, z: jlz },
        end: { x: jrx, y: zone.sillY, z: jrz },
        width: studWidth, depth: studDepth,
        type: 'sill_plate', wallId: wall.id,
      });
    }
  }

  // ─── Junction framing (corners and T-intersections) ───

  private generateJunctionFraming(
    junctions: Junction[],
    walls: Wall[],
    wallDirs: Map<string, WallDir>,
    params: FrameParams,
  ): TimberMember[] {
    const members: TimberMember[] = [];
    const { studWidth, wallHeight } = params;
    const plateThick = studWidth;
    const studBottom = plateThick;
    const studTop = wallHeight - plateThick * 2; // bottom of top plate

    for (const junc of junctions) {
      if (junc.type === 'corner') {
        // L-corner: 3-stud assembly
        // Place extra studs at the corner point for each connecting wall
        // This creates a nailing surface for interior finish on both walls
        const jWalls = junc.wallIds.map(id => walls.find(w => w.id === id)!);

        for (const w of jWalls) {
          const d = wallDirs.get(w.id)!;
          const depth = w.wallType === 'exterior' ? params.exteriorStudDepth : params.studDepth;
          // Offset a backer stud along the wall normal (creates nailing surface)
          const bx = junc.point.x + d.normX * depth;
          const bz = junc.point.z + d.normZ * depth;

          if (studTop > studBottom + EPS) {
            members.push({
              start: { x: bx, y: studBottom, z: bz },
              end: { x: bx, y: studTop, z: bz },
              width: studWidth, depth,
              type: 'corner_stud', wallId: w.id,
            });
          }
        }
      } else {
        // T-junction: partition backer (ladder blocking or extra stud)
        // Find the wall that is being intersected (the "through" wall)
        const throughWalls = junc.wallIds.filter(wid => {
          const w = walls.find(ww => ww.id === wid)!;
          return this.isPointOnSegmentInterior(junc.point, w.start, w.end);
        });
        const buttingWalls = junc.wallIds.filter(wid => !throughWalls.includes(wid));

        for (const twId of throughWalls) {
          const tw = walls.find(w => w.id === twId)!;
          const td = wallDirs.get(twId)!;
          const depth = tw.wallType === 'exterior' ? params.exteriorStudDepth : params.studDepth;

          // Place a backer stud on each side of the butting wall, offset by studDepth along the through wall
          for (const _bwId of buttingWalls) {
            // Two backer studs straddling the intersection point, nailed to the through wall's top/bottom plates
            const t = this.projectPointOntoWallT(junc.point, tw, td);
            if (t === null) continue;

            const offset = depth * 0.75;
            for (const side of [-1, 1]) {
              const bt = t + side * offset;
              if (bt < EPS || bt > td.length - EPS) continue;
              const bx = tw.start.x + td.dirX * bt;
              const bz = tw.start.z + td.dirZ * bt;

              if (studTop > studBottom + EPS) {
                members.push({
                  start: { x: bx, y: studBottom, z: bz },
                  end: { x: bx, y: studTop, z: bz },
                  width: studWidth, depth,
                  type: 'partition_backer', wallId: twId,
                });
              }
            }
          }
        }
      }
    }

    return members;
  }

  // ─── Noggings with opening awareness ───

  private addNoggingsWithOpenings(
    members: TimberMember[],
    wall: Wall,
    dir: WallDir,
    params: FrameParams,
    studPositions: number[],
    zones: OpeningZone[],
  ): void {
    const { studWidth, studDepth, wallHeight } = params;
    const plateThick = studWidth;
    const noggingY = (plateThick + wallHeight - plateThick * 2) / 2; // mid-height of stud cavity

    // Collect all stud-like positions (regular studs + opening edges)
    const allPositions: number[] = [...studPositions];
    for (const z of zones) {
      allPositions.push(z.left, z.right);
      // Also add jack stud positions
      allPositions.push(z.left + studWidth, z.right - studWidth);
    }
    allPositions.sort((a, b) => a - b);

    // Deduplicate
    const unique = allPositions.filter((v, i, a) => i === 0 || v - a[i - 1] > EPS);

    for (let i = 0; i < unique.length - 1; i++) {
      const t1 = unique[i], t2 = unique[i + 1];
      if (t2 - t1 < studDepth + EPS) continue; // too short

      // Don't add nogging if this span is inside an opening
      const insideOpening = zones.some(z =>
        t1 >= z.left - EPS && t2 <= z.right + EPS
      );
      if (insideOpening) continue;

      // Don't add nogging across an entire opening
      const spansOpening = zones.some(z => t1 < z.left - EPS && t2 > z.right + EPS);
      if (spansOpening) continue;

      members.push({
        start: {
          x: wall.start.x + dir.dirX * t1,
          y: noggingY,
          z: wall.start.z + dir.dirZ * t1,
        },
        end: {
          x: wall.start.x + dir.dirX * t2,
          y: noggingY,
          z: wall.start.z + dir.dirZ * t2,
        },
        width: studWidth, depth: studDepth,
        type: 'nogging', wallId: wall.id,
      });
    }
  }

  // ─── Roof generation ───

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

    const overhang = roof.overhang;
    const rafterWidth = roof.rafterWidth;
    const rafterDepth = roof.rafterDepth;

    // ── Flat roof ──
    if (roof.type === 'flat') {
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;

      // Joists span the shorter direction for structural efficiency
      const joistAlongZ = spanZ <= spanX;
      const primarySpan = joistAlongZ ? spanZ : spanX;
      const secondarySpan = joistAlongZ ? spanX : spanZ;

      const joistCount = Math.max(1, Math.round(secondarySpan / studSpacing));
      const joistStep = secondarySpan / joistCount;

      for (let i = 0; i <= joistCount; i++) {
        if (joistAlongZ) {
          const x = minX + i * joistStep;
          members.push({
            start: { x, y: wallHeight, z: minZ - overhang },
            end: { x, y: wallHeight, z: maxZ + overhang },
            width: rafterDepth, depth: rafterWidth,
            type: 'ceiling_joist', wallId: '',
          });
        } else {
          const z = minZ + i * joistStep;
          members.push({
            start: { x: minX - overhang, y: wallHeight, z },
            end: { x: maxX + overhang, y: wallHeight, z },
            width: rafterDepth, depth: rafterWidth,
            type: 'ceiling_joist', wallId: '',
          });
        }
      }

      // Fascia boards on all four edges (standing on edge)
      members.push({
        start: { x: minX - overhang, y: wallHeight, z: minZ - overhang },
        end: { x: maxX + overhang, y: wallHeight, z: minZ - overhang },
        width: rafterDepth, depth: studWidth,
        type: 'fascia', wallId: '',
      });
      members.push({
        start: { x: minX - overhang, y: wallHeight, z: maxZ + overhang },
        end: { x: maxX + overhang, y: wallHeight, z: maxZ + overhang },
        width: rafterDepth, depth: studWidth,
        type: 'fascia', wallId: '',
      });
      members.push({
        start: { x: minX - overhang, y: wallHeight, z: minZ - overhang },
        end: { x: minX - overhang, y: wallHeight, z: maxZ + overhang },
        width: rafterDepth, depth: studWidth,
        type: 'fascia', wallId: '',
      });
      members.push({
        start: { x: maxX + overhang, y: wallHeight, z: minZ - overhang },
        end: { x: maxX + overhang, y: wallHeight, z: maxZ + overhang },
        width: rafterDepth, depth: studWidth,
        type: 'fascia', wallId: '',
      });

      return members;
    }

    // ── Gable roof ──
    const pitchRad = (roof.pitchAngle * Math.PI) / 180;

    const ridgeWidth = rafterWidth * 1.5;
    const ridgeDepth = rafterDepth * 1.2;

    if (roof.ridgeAxis === 'x') {
      const halfSpan = (maxZ - minZ) / 2;
      const ridgeHeight = wallHeight + Math.tan(pitchRad) * halfSpan;
      const ridgeMidZ = (minZ + maxZ) / 2;
      const spanX = maxX - minX;

      // Ridge board
      members.push({
        start: { x: minX - overhang, y: ridgeHeight, z: ridgeMidZ },
        end: { x: maxX + overhang, y: ridgeHeight, z: ridgeMidZ },
        width: ridgeWidth, depth: ridgeDepth,
        type: 'ridge_beam', wallId: '',
      });

      // Rafter spacing matches stud spacing for load transfer
      const rafterCount = Math.max(1, Math.round(spanX / studSpacing));
      const rafterStep = spanX / rafterCount;

      for (let i = 0; i <= rafterCount; i++) {
        const x = minX + i * rafterStep;

        // South-side rafter (minZ)
        members.push({
          start: { x, y: wallHeight, z: minZ - overhang },
          end: { x, y: ridgeHeight, z: ridgeMidZ },
          width: rafterWidth, depth: rafterDepth,
          type: 'rafter', wallId: '',
        });
        // North-side rafter (maxZ)
        members.push({
          start: { x, y: ridgeHeight, z: ridgeMidZ },
          end: { x, y: wallHeight, z: maxZ + overhang },
          width: rafterWidth, depth: rafterDepth,
          type: 'rafter', wallId: '',
        });

        // Ceiling joist — spans between wall plates, ties rafter feet together
        members.push({
          start: { x, y: wallHeight, z: minZ },
          end: { x, y: wallHeight, z: maxZ },
          width: rafterWidth, depth: rafterDepth,
          type: 'ceiling_joist', wallId: '',
        });

        // Collar tie — horizontal brace between opposing rafters at ~2/3 height
        if (halfSpan > 1.0) { // only add collar ties for meaningful spans
          const collarFraction = 0.6; // 60% up from wall plate to ridge
          const collarY = wallHeight + Math.tan(pitchRad) * halfSpan * collarFraction;
          const collarHalfZ = halfSpan * (1 - collarFraction);
          members.push({
            start: { x, y: collarY, z: ridgeMidZ - collarHalfZ },
            end: { x, y: collarY, z: ridgeMidZ + collarHalfZ },
            width: studWidth, depth: studDepth,
            type: 'collar_tie', wallId: '',
          });
        }
      }

      // Fascia boards along eave lines
      members.push({
        start: { x: minX - overhang, y: wallHeight, z: minZ - overhang },
        end: { x: maxX + overhang, y: wallHeight, z: minZ - overhang },
        width: studWidth, depth: rafterDepth,
        type: 'fascia', wallId: '',
      });
      members.push({
        start: { x: minX - overhang, y: wallHeight, z: maxZ + overhang },
        end: { x: maxX + overhang, y: wallHeight, z: maxZ + overhang },
        width: studWidth, depth: rafterDepth,
        type: 'fascia', wallId: '',
      });
    } else {
      // Ridge along Z axis
      const halfSpan = (maxX - minX) / 2;
      const ridgeHeight = wallHeight + Math.tan(pitchRad) * halfSpan;
      const ridgeMidX = (minX + maxX) / 2;
      const spanZ = maxZ - minZ;

      // Ridge board
      members.push({
        start: { x: ridgeMidX, y: ridgeHeight, z: minZ - overhang },
        end: { x: ridgeMidX, y: ridgeHeight, z: maxZ + overhang },
        width: ridgeWidth, depth: ridgeDepth,
        type: 'ridge_beam', wallId: '',
      });

      const rafterCount = Math.max(1, Math.round(spanZ / studSpacing));
      const rafterStep = spanZ / rafterCount;

      for (let i = 0; i <= rafterCount; i++) {
        const z = minZ + i * rafterStep;

        // West-side rafter (minX)
        members.push({
          start: { x: minX - overhang, y: wallHeight, z },
          end: { x: ridgeMidX, y: ridgeHeight, z },
          width: rafterWidth, depth: rafterDepth,
          type: 'rafter', wallId: '',
        });
        // East-side rafter (maxX)
        members.push({
          start: { x: ridgeMidX, y: ridgeHeight, z },
          end: { x: maxX + overhang, y: wallHeight, z },
          width: rafterWidth, depth: rafterDepth,
          type: 'rafter', wallId: '',
        });

        // Ceiling joist
        members.push({
          start: { x: minX, y: wallHeight, z },
          end: { x: maxX, y: wallHeight, z },
          width: rafterWidth, depth: rafterDepth,
          type: 'ceiling_joist', wallId: '',
        });

        // Collar tie
        if (halfSpan > 1.0) {
          const collarFraction = 0.6;
          const collarY = wallHeight + Math.tan(pitchRad) * halfSpan * collarFraction;
          const collarHalfX = halfSpan * (1 - collarFraction);
          members.push({
            start: { x: ridgeMidX - collarHalfX, y: collarY, z },
            end: { x: ridgeMidX + collarHalfX, y: collarY, z },
            width: studWidth, depth: studDepth,
            type: 'collar_tie', wallId: '',
          });
        }
      }

      // Fascia boards
      members.push({
        start: { x: minX - overhang, y: wallHeight, z: minZ - overhang },
        end: { x: minX - overhang, y: wallHeight, z: maxZ + overhang },
        width: studWidth, depth: rafterDepth,
        type: 'fascia', wallId: '',
      });
      members.push({
        start: { x: maxX + overhang, y: wallHeight, z: minZ - overhang },
        end: { x: maxX + overhang, y: wallHeight, z: maxZ + overhang },
        width: studWidth, depth: rafterDepth,
        type: 'fascia', wallId: '',
      });
    }

    return members;
  }

  // ─── Stud position helpers ───

  /**
   * Standard on-center stud layout:
   * - First stud at position 0 (wall start)
   * - Studs at every studSpacing interval
   * - Last stud at wallLength (wall end)
   * - If the last interval is very short (< studSpacing * 0.25), merge with previous
   */
  private computeStudPositionsOC(wallLength: number, studSpacing: number): number[] {
    const positions: number[] = [0];
    let pos = studSpacing;
    while (pos < wallLength - EPS) {
      positions.push(pos);
      pos += studSpacing;
    }
    // End stud
    const last = positions[positions.length - 1];
    if (wallLength - last > studSpacing * 0.25) {
      positions.push(wallLength);
    } else if (positions.length > 1) {
      // Replace last stud with end position to avoid tiny bay
      positions[positions.length - 1] = wallLength;
    }
    return positions;
  }

  // ─── Plate creation ───

  private createPlate(wall: Wall, params: FrameParams, position: 'top' | 'bottom'): TimberMember {
    const plateThick = params.studWidth;
    let y: number;
    if (position === 'bottom') {
      y = 0;
    } else {
      // First top plate sits just below the double top plate
      y = params.wallHeight - plateThick * 2;
    }
    return {
      start: { x: wall.start.x, y, z: wall.start.z },
      end: { x: wall.end.x, y, z: wall.end.z },
      width: plateThick,
      depth: params.studDepth,
      type: position === 'bottom' ? 'bottom_plate' : 'top_plate',
      wallId: wall.id,
    };
  }

  // ─── Projection helpers ───

  private projectPointOntoWall(pt: Point2D, wall: Wall, dir: WallDir): number | null {
    const apx = pt.x - wall.start.x;
    const apz = pt.z - wall.start.z;
    const t = apx * dir.dirX + apz * dir.dirZ;
    if (t < -EPS || t > dir.length + EPS) return null;

    // Check perpendicular distance
    const projX = wall.start.x + dir.dirX * t;
    const projZ = wall.start.z + dir.dirZ * t;
    const dist = Math.sqrt((pt.x - projX) ** 2 + (pt.z - projZ) ** 2);
    if (dist > EPS * 10) return null;

    return t;
  }

  private projectPointOntoWallT(pt: Point2D, wall: Wall, dir: WallDir): number | null {
    const apx = pt.x - wall.start.x;
    const apz = pt.z - wall.start.z;
    return apx * dir.dirX + apz * dir.dirZ;
  }
}
