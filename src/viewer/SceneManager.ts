import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface TouchGestureState {
  cx: number;    // center X (screen pixels)
  cy: number;    // center Y (screen pixels)
  dist: number;  // distance between fingers (pixels)
  angle: number; // angle between fingers (radians)
}

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
  private touchGesture: TouchGestureState | null = null;

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

    // Touch: single finger = orbit by default, two-finger handled by us (pan + zoom)
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: undefined as unknown as THREE.TOUCH,
    };

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

    // Custom two-finger touch navigation: simultaneous pan + zoom + rotate
    this.setupTouchNavigation();
  }

  /** Callbacks invoked every frame (for label tracking, etc.) */
  onUpdate: (() => void) | null = null;

  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.onUpdate?.();
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

  /** Toggle single-finger touch: true = tool draws, false = orbit */
  setTouchToolMode(active: boolean): void {
    this.controls.touches = {
      ONE: active ? undefined as unknown as THREE.TOUCH : THREE.TOUCH.ROTATE,
      TWO: undefined as unknown as THREE.TOUCH,
    };
  }

  // ─── Custom two-finger touch navigation (pan + zoom) ───

  private setupTouchNavigation(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        this.touchGesture = this.computeTouchState(e.touches);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const curr = this.computeTouchState(e.touches);
        if (this.touchGesture) {
          this.applyTouchGesture(this.touchGesture, curr);
        }
        this.touchGesture = curr;
      } else {
        this.touchGesture = null;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.touchGesture = null;
    }, { passive: false });
  }

  private computeTouchState(touches: TouchList): TouchGestureState {
    const t0 = touches[0];
    const t1 = touches[1];
    const dx = t1.clientX - t0.clientX;
    const dy = t1.clientY - t0.clientY;
    return {
      cx: (t0.clientX + t1.clientX) / 2,
      cy: (t0.clientY + t1.clientY) / 2,
      dist: Math.sqrt(dx * dx + dy * dy),
      angle: Math.atan2(dy, dx),
    };
  }

  private applyTouchGesture(prev: TouchGestureState, curr: TouchGestureState): void {
    const offset = this.camera.position.clone().sub(this.controls.target);

    // Zoom (pinch): scale camera distance from target
    if (prev.dist > 10) {
      const zoomRatio = prev.dist / curr.dist;
      const newLen = offset.length() * zoomRatio;
      if (newLen > 0.5 && newLen < 100) {
        offset.multiplyScalar(zoomRatio);
      }
    }

    this.camera.position.copy(this.controls.target).add(offset);

    // Pan (two-finger drag): translate camera + target together
    const dcx = curr.cx - prev.cx;
    const dcy = curr.cy - prev.cy;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const fovFactor = 2 * Math.tan(this.camera.fov * Math.PI / 360);
    const panScale = offset.length() * fovFactor / this.renderer.domElement.clientHeight;
    const panDelta = new THREE.Vector3()
      .addScaledVector(right, -dcx * panScale)
      .addScaledVector(up, dcy * panScale);
    this.camera.position.add(panDelta);
    this.controls.target.add(panDelta);
  }
}
