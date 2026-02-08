import * as THREE from 'three';
import { TimberFrame, TimberMember, MemberType } from '../types';

const MEMBER_COLORS: Record<MemberType, number> = {
  stud: 0xc8a26e,
  bottom_plate: 0xa07840,
  top_plate: 0xa07840,
  nogging: 0xb8925a,
  rafter: 0x8B6914,
  ridge_beam: 0x704214,
  collar_tie: 0x9B7530,
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

    if (length < 0.001) return new THREE.Mesh();

    const geometry = new THREE.BoxGeometry(member.depth, member.width, length);
    const material = this.getMaterial(member.type);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(
      (member.start.x + member.end.x) / 2,
      (member.start.y + member.end.y) / 2 + member.width / 2,
      (member.start.z + member.end.z) / 2,
    );

    if (Math.abs(dy) > 0.99 * length) {
      mesh.rotation.x = Math.PI / 2;
    } else if (Math.abs(dy) < 0.01) {
      const angle = Math.atan2(dx, dz);
      mesh.rotation.y = angle;
    } else {
      // Angled member (rafters)
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      mesh.setRotationFromQuaternion(quat);
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
        color: MEMBER_COLORS[type] ?? 0xc8a26e,
        roughness: 0.85,
        metalness: 0.0,
      });
      this.material_cache.set(type, mat);
    }
    return mat;
  }

  getMemberCount(frame: TimberFrame): { studs: number; plates: number; noggings: number; rafters: number; total: number } {
    let studs = 0, plates = 0, noggings = 0, rafters = 0;
    for (const m of frame.members) {
      if (m.type === 'stud') studs++;
      else if (m.type === 'nogging') noggings++;
      else if (m.type === 'rafter' || m.type === 'ridge_beam' || m.type === 'collar_tie') rafters++;
      else plates++;
    }
    return { studs, plates, noggings, rafters, total: frame.members.length };
  }
}
