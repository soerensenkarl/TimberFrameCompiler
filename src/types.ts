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
  wallType: 'exterior' | 'interior';
}

/** An opening (window or door) placed on a wall */
export interface Opening {
  id: string;
  wallId: string;
  type: 'window' | 'door';
  position: number;   // distance along wall from start to center, in meters
  width: number;      // meters
  height: number;     // meters
  sillHeight: number; // meters above floor (0 for doors)
}

/** Type of timber member in the frame */
export type MemberType =
  | 'stud' | 'king_stud' | 'bottom_plate' | 'top_plate' | 'nogging'
  | 'rafter' | 'ridge_beam' | 'collar_tie' | 'ceiling_joist' | 'fascia'
  | 'header' | 'trimmer' | 'sill_plate' | 'cripple_stud'
  | 'corner_stud' | 'partition_backer';

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

/** Roof configuration */
export interface RoofConfig {
  type: 'gable';
  pitchAngle: number;   // degrees
  overhang: number;      // meters
  ridgeAxis: 'x' | 'z'; // which axis the ridge runs along
}

/** User-adjustable frame generation parameters */
export interface FrameParams {
  studSpacing: number;
  wallHeight: number;
  studWidth: number;
  studDepth: number;
  gridSnap: number;
  noggings: boolean;
  roof: RoofConfig | null;
}

/** Design phases */
export type Phase = 'exterior' | 'interior' | 'openings' | 'roof' | 'done';

/** Default frame parameters */
export const DEFAULT_PARAMS: FrameParams = {
  studSpacing: 0.6,
  wallHeight: 2.4,
  studWidth: 0.045,
  studDepth: 0.095,
  gridSnap: 0.5,
  noggings: true,
  roof: null,
};
