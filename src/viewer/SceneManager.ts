import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  readonly frameGroup: THREE.Group;
  readonly wallPreviewGroup: THREE.Group;
  readonly groundPlane: THREE.Mesh;

  private container: HTMLElement;
  private gridHelper: THREE.GridHelper;

  constructor(container: HTMLElement) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    this.camera.position.set(8, 6, 8);
    this.camera.lookAt(0, 1, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    // Controls - use right mouse for orbit, middle for pan
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = {
      LEFT: undefined as any,  // Reserved for drawing tool
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 15, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8899bb, 0.4);
    fillLight.position.set(-5, 8, -5);
    this.scene.add(fillLight);

    // Grid
    this.gridHelper = new THREE.GridHelper(20, 40, 0x444466, 0x2a2a4a);
    this.scene.add(this.gridHelper);

    // Invisible ground plane for raycasting
    const planeGeo = new THREE.PlaneGeometry(100, 100);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    this.groundPlane = new THREE.Mesh(planeGeo, planeMat);
    this.groundPlane.rotation.x = -Math.PI / 2; // Lay flat on X-Z
    this.groundPlane.position.y = 0;
    this.scene.add(this.groundPlane);

    // Groups for timber frame and wall previews
    this.frameGroup = new THREE.Group();
    this.frameGroup.name = 'timberFrame';
    this.scene.add(this.frameGroup);

    this.wallPreviewGroup = new THREE.Group();
    this.wallPreviewGroup.name = 'wallPreviews';
    this.scene.add(this.wallPreviewGroup);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(container);
  }

  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setGridSize(size: number, divisions: number): void {
    this.scene.remove(this.gridHelper);
    this.gridHelper = new THREE.GridHelper(size, divisions, 0x444466, 0x2a2a4a);
    this.scene.add(this.gridHelper);
  }
}
