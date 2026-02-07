import * as THREE from 'three';
import { TimberFrame, TimberMember, MemberType } from '../types';

// Color palette for different timber member types
const MEMBER_COLORS: Record<MemberType, number> = {
  stud: 0xc8a26e,         // Light wood
  bottom_plate: 0xa07840,  // Darker wood
  top_plate: 0xa07840,     // Darker wood
  nogging: 0xb8925a,       // Medium wood
};

export class MeshBuilder {
  private material_cache: Map<MemberType, THREE.MeshStandardMaterial> = new Map();

  buildFrame(frame: TimberFrame): THREE.Group {
    const group = new THREE.Group();
    group.name = 'generatedFrame';

    for (const member of frame.members) {
      const mesh = this.buildMember(member);
      group.add(mesh);
    }

    return group;
  }

  private buildMember(member: TimberMember): THREE.Mesh {
    const dx = member.end.x - member.start.x;
    const dy = member.end.y - member.start.y;
    const dz = member.end.z - member.start.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 0.001) {
      // Degenerate member, return empty mesh
      return new THREE.Mesh();
    }

    // Create box geometry: x=width, y=depth, z=length
    // We'll orient so that local Z aligns with the member span direction
    const geometry = new THREE.BoxGeometry(member.depth, member.width, length);

    const material = this.getMaterial(member.type);
    const mesh = new THREE.Mesh(geometry, material);

    // Position at midpoint
    mesh.position.set(
      (member.start.x + member.end.x) / 2,
      (member.start.y + member.end.y) / 2 + member.width / 2,
      (member.start.z + member.end.z) / 2,
    );

    // Orient the mesh so its local Z-axis aligns with the start->end direction
    const direction = new THREE.Vector3(dx, dy, dz).normalize();

    if (Math.abs(dy) > 0.99 * length) {
      // Vertical member (stud): rotate local Z to point up
      mesh.rotation.x = Math.PI / 2;
    } else {
      // Horizontal member: compute angle on X-Z plane
      const angle = Math.atan2(dx, dz);
      mesh.rotation.y = angle;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: member.type, wallId: member.wallId };

    return mesh;
  }

  private getMaterial(type: MemberType): THREE.MeshStandardMaterial {
    let mat = this.material_cache.get(type);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: MEMBER_COLORS[type],
        roughness: 0.85,
        metalness: 0.0,
      });
      this.material_cache.set(type, mat);
    }
    return mat;
  }

  getMemberCount(frame: TimberFrame): { studs: number; plates: number; noggings: number; total: number } {
    let studs = 0, plates = 0, noggings = 0;
    for (const m of frame.members) {
      if (m.type === 'stud') studs++;
      else if (m.type === 'nogging') noggings++;
      else plates++;
    }
    return { studs, plates, noggings, total: frame.members.length };
  }
}
