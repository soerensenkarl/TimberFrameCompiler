/**
 * Client for the Python timber frame generator API.
 *
 * Calls the FastAPI backend to generate frames. Falls back to the
 * local TypeScript engine if the backend is unreachable.
 */

import { Wall, TimberFrame, TimberMember, FrameParams } from '../types';

const API_BASE = 'http://localhost:8000/api';

export interface ApiFrameResponse {
  frame: {
    members: Array<{
      start: { x: number; y: number; z: number };
      end: { x: number; y: number; z: number };
      width: number;
      depth: number;
      type: string;
      wall_id: string;
      tags: Record<string, string>;
    }>;
    stats: {
      total_members: number;
      studs: number;
      plates: number;
      noggings: number;
      other: number;
    };
  };
  rule_count: number;
  wall_count: number;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async generate(walls: Wall[], params: FrameParams): Promise<TimberFrame> {
    const body = {
      walls: walls.map(w => ({
        id: w.id,
        start: { x: w.start.x, z: w.start.z },
        end: { x: w.end.x, z: w.end.z },
      })),
      params: {
        stud_spacing: params.studSpacing,
        wall_height: params.wallHeight,
        stud_width: params.studWidth,
        stud_depth: params.studDepth,
        noggings: params.noggings,
        double_top_plate: false,
      },
      config: {
        wall_framing: 'platform',
        corner_treatment: 'butt',
      },
    };

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data: ApiFrameResponse = await response.json();

    // Map Python snake_case response to TypeScript camelCase types
    const members: TimberMember[] = data.frame.members.map(m => ({
      start: m.start,
      end: m.end,
      width: m.width,
      depth: m.depth,
      type: m.type as TimberMember['type'],
      wallId: m.wall_id,
    }));

    return {
      members,
      sourceWalls: walls,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
