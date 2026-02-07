/** 2D point on the floor plane (X-Z in Three.js Y-up convention) */
export interface Point2D {
  x: number;
  z: number;
}

/** 3D point */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** A wall segment defined by two floor-plane endpoints */
export interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
}

/** Type of timber member in the frame */
export type MemberType = 'stud' | 'bottom_plate' | 'top_plate' | 'nogging';

/** A single piece of timber positioned in 3D space */
export interface TimberMember {
  start: Point3D;
  end: Point3D;
  width: number;
  depth: number;
  type: MemberType;
  wallId: string;
}

/** The complete generated timber frame */
export interface TimberFrame {
  members: TimberMember[];
  sourceWalls: Wall[];
}

/** User-adjustable frame generation parameters */
export interface FrameParams {
  /** Center-to-center stud spacing in meters (default: 0.6 for 600mm) */
  studSpacing: number;
  /** Wall height in meters (default: 2.4) */
  wallHeight: number;
  /** Stud width (narrow face) in meters (default: 0.045 for 45mm) */
  studWidth: number;
  /** Stud depth (wide face) in meters (default: 0.095 for 95mm) */
  studDepth: number;
  /** Grid snap increment in meters (default: 0.1) */
  gridSnap: number;
  /** Whether to generate mid-height noggings (default: true) */
  noggings: boolean;
}

/** Default frame parameters (metric, common Scandinavian/European dimensions) */
export const DEFAULT_PARAMS: FrameParams = {
  studSpacing: 0.6,
  wallHeight: 2.4,
  studWidth: 0.045,
  studDepth: 0.095,
  gridSnap: 0.1,
  noggings: true,
};
