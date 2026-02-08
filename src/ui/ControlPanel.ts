import { FrameParams, RoofConfig, Phase, DEFAULT_PARAMS } from '../types';

const PHASE_META: Record<Phase, { label: string; number: string; desc: string; color: string }> = {
  exterior: { label: 'Exterior Walls', number: '1', desc: 'Draw the outline of your building', color: '#e67e22' },
  interior: { label: 'Interior Walls', number: '2', desc: 'Add interior partition walls', color: '#3498db' },
  openings: { label: 'Openings', number: '3', desc: 'Windows & doors (coming soon)', color: '#9b59b6' },
  roof: { label: 'Roof', number: '4', desc: 'Configure your roof shape', color: '#2ecc71' },
  done: { label: 'Complete', number: '✓', desc: 'Your timber frame is ready', color: '#2ecc71' },
};

const PHASE_ORDER: Phase[] = ['exterior', 'interior', 'openings', 'roof', 'done'];

export class ControlPanel {
  private container: HTMLElement;
  private params: FrameParams;
  private currentPhase: Phase = 'exterior';

  // Phase step elements
  private stepEls: Map<Phase, HTMLElement> = new Map();
  private phaseTitle!: HTMLElement;
  private phaseDesc!: HTMLElement;

  // Param sliders
  private studSpacingInput!: HTMLInputElement;
  private wallHeightInput!: HTMLInputElement;
  private studWidthInput!: HTMLInputElement;
  private studDepthInput!: HTMLInputElement;
  private gridSnapInput!: HTMLInputElement;
  private noggingsInput!: HTMLInputElement;

  // Roof controls
  private roofSection!: HTMLElement;
  private pitchInput!: HTMLInputElement;
  private overhangInput!: HTMLInputElement;
  private ridgeXBtn!: HTMLButtonElement;
  private ridgeZBtn!: HTMLButtonElement;

  // Navigation
  private nextBtn!: HTMLButtonElement;
  private backBtn!: HTMLButtonElement;

  // Stats
  private statsContainer!: HTMLElement;
  private wallCountEl!: HTMLElement;
  private backendIndicator!: HTMLElement;

  // Phase-specific sections
  private drawingHint!: HTMLElement;
  private openingsHint!: HTMLElement;
  private paramSection!: HTMLElement;

  // Callbacks
  onPhaseChange: ((phase: Phase) => void) | null = null;
  onGenerate: (() => void) | null = null;
  onClear: (() => void) | null = null;
  onParamsChange: ((params: FrameParams) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.params = { ...DEFAULT_PARAMS };
    this.buildUI();
    this.updatePhaseUI();
  }

  getParams(): FrameParams {
    return { ...this.params };
  }

  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  setPhase(phase: Phase): void {
    this.currentPhase = phase;
    this.updatePhaseUI();
  }

  setBackendStatus(backend: 'python' | 'local'): void {
    if (backend === 'python') {
      this.backendIndicator.textContent = 'Python API';
      this.backendIndicator.style.color = '#2ecc71';
      this.backendIndicator.style.borderColor = '#2ecc71';
    } else {
      this.backendIndicator.textContent = 'Local Engine';
      this.backendIndicator.style.color = '#e67e22';
      this.backendIndicator.style.borderColor = '#e67e22';
    }
  }

  updateStats(frame: { studs: number; plates: number; noggings: number; rafters: number; total: number } | null, wallCount: number): void {
    this.wallCountEl.textContent = `${wallCount}`;
    if (frame) {
      this.statsContainer.innerHTML = `
        <div class="stat"><span>Walls</span><span>${wallCount}</span></div>
        <div class="stat"><span>Studs</span><span>${frame.studs}</span></div>
        <div class="stat"><span>Plates</span><span>${frame.plates}</span></div>
        <div class="stat"><span>Noggings</span><span>${frame.noggings}</span></div>
        <div class="stat"><span>Rafters</span><span>${frame.rafters}</span></div>
        <div class="stat stat-total"><span>Total members</span><span>${frame.total}</span></div>
      `;
    } else {
      this.statsContainer.innerHTML = `
        <div class="stat"><span>Walls</span><span>${wallCount}</span></div>
        <div class="stat"><span>Total members</span><span>0</span></div>
      `;
    }
  }

  private buildUI(): void {
    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Timber Frame Compiler';
    this.container.appendChild(title);

    // Backend indicator
    this.backendIndicator = document.createElement('div');
    this.backendIndicator.className = 'backend-indicator';
    this.backendIndicator.textContent = 'Local Engine';
    this.container.appendChild(this.backendIndicator);

    // Phase stepper
    const stepper = document.createElement('div');
    stepper.className = 'phase-stepper';
    for (const phase of PHASE_ORDER) {
      if (phase === 'done') continue;
      const meta = PHASE_META[phase];
      const step = document.createElement('div');
      step.className = 'phase-step';
      step.dataset.phase = phase;
      step.innerHTML = `<span class="step-num">${meta.number}</span><span class="step-label">${meta.label}</span>`;
      step.addEventListener('click', () => {
        const idx = PHASE_ORDER.indexOf(phase);
        const curIdx = PHASE_ORDER.indexOf(this.currentPhase);
        if (idx <= curIdx) {
          this.currentPhase = phase;
          this.updatePhaseUI();
          this.onPhaseChange?.(this.currentPhase);
        }
      });
      stepper.appendChild(step);
      this.stepEls.set(phase, step);
    }
    this.container.appendChild(stepper);

    // Phase info
    const phaseInfo = document.createElement('div');
    phaseInfo.className = 'phase-info';
    this.phaseTitle = document.createElement('div');
    this.phaseTitle.className = 'phase-title';
    this.phaseDesc = document.createElement('div');
    this.phaseDesc.className = 'phase-desc';
    phaseInfo.appendChild(this.phaseTitle);
    phaseInfo.appendChild(this.phaseDesc);
    this.container.appendChild(phaseInfo);

    // Drawing hint (shown during exterior/interior phases)
    this.drawingHint = document.createElement('div');
    this.drawingHint.className = 'drawing-hint';
    this.drawingHint.innerHTML = `
      <div class="hint-item">Click to place wall points</div>
      <div class="hint-item">Walls chain automatically</div>
      <div class="hint-item">Press <kbd>Esc</kbd> to finish chain</div>
    `;
    this.container.appendChild(this.drawingHint);

    // Openings hint (shown during openings phase)
    this.openingsHint = document.createElement('div');
    this.openingsHint.className = 'openings-hint';
    this.openingsHint.innerHTML = `
      <div class="hint-item coming-soon">Window and door placement will be available in a future update. Press Next to continue.</div>
    `;
    this.container.appendChild(this.openingsHint);

    // Roof configuration section
    this.roofSection = document.createElement('div');
    this.roofSection.className = 'panel-section roof-section';

    const roofTitle = document.createElement('h3');
    roofTitle.textContent = 'Roof Configuration';
    this.roofSection.appendChild(roofTitle);

    // Pitch slider
    const pitchResult = this.addSlider(this.roofSection, 'Pitch Angle', 30, 10, 60, 1, '°');
    this.pitchInput = pitchResult.input;

    // Overhang slider
    const overhangResult = this.addSlider(this.roofSection, 'Overhang', 300, 0, 1000, 50, 'mm');
    this.overhangInput = overhangResult.input;

    // Ridge axis toggle
    const axisRow = document.createElement('div');
    axisRow.className = 'axis-toggle';
    const axisLabel = document.createElement('div');
    axisLabel.className = 'axis-label';
    axisLabel.textContent = 'Ridge Direction';
    axisRow.appendChild(axisLabel);

    const axisBtns = document.createElement('div');
    axisBtns.className = 'axis-buttons';
    this.ridgeXBtn = document.createElement('button');
    this.ridgeXBtn.className = 'btn btn-axis active';
    this.ridgeXBtn.textContent = 'Along X';
    this.ridgeXBtn.addEventListener('click', () => this.setRidgeAxis('x'));
    this.ridgeZBtn = document.createElement('button');
    this.ridgeZBtn.className = 'btn btn-axis';
    this.ridgeZBtn.textContent = 'Along Z';
    this.ridgeZBtn.addEventListener('click', () => this.setRidgeAxis('z'));
    axisBtns.appendChild(this.ridgeXBtn);
    axisBtns.appendChild(this.ridgeZBtn);
    axisRow.appendChild(axisBtns);
    this.roofSection.appendChild(axisRow);

    this.container.appendChild(this.roofSection);

    // Frame parameters section
    this.paramSection = document.createElement('div');
    this.paramSection.className = 'panel-section';

    const paramTitle = document.createElement('h3');
    paramTitle.textContent = 'Frame Parameters';
    this.paramSection.appendChild(paramTitle);

    const spacingResult = this.addSlider(this.paramSection, 'Stud Spacing', this.params.studSpacing * 1000, 200, 1200, 50, 'mm');
    this.studSpacingInput = spacingResult.input;

    const heightResult = this.addSlider(this.paramSection, 'Wall Height', this.params.wallHeight * 1000, 1800, 4000, 100, 'mm');
    this.wallHeightInput = heightResult.input;

    const widthResult = this.addSlider(this.paramSection, 'Timber Width', this.params.studWidth * 1000, 30, 100, 5, 'mm');
    this.studWidthInput = widthResult.input;

    const depthResult = this.addSlider(this.paramSection, 'Timber Depth', this.params.studDepth * 1000, 45, 250, 5, 'mm');
    this.studDepthInput = depthResult.input;

    const snapResult = this.addSlider(this.paramSection, 'Grid Snap', this.params.gridSnap * 1000, 50, 1000, 50, 'mm');
    this.gridSnapInput = snapResult.input;

    // Noggings checkbox
    const nogRow = document.createElement('div');
    nogRow.className = 'param-row';
    const nogLabel = document.createElement('label');
    nogLabel.className = 'checkbox-label';
    this.noggingsInput = document.createElement('input');
    this.noggingsInput.type = 'checkbox';
    this.noggingsInput.checked = this.params.noggings;
    this.noggingsInput.addEventListener('change', () => this.readParams());
    nogLabel.appendChild(this.noggingsInput);
    nogLabel.appendChild(document.createTextNode('Generate noggings'));
    nogRow.appendChild(nogLabel);
    this.paramSection.appendChild(nogRow);

    this.container.appendChild(this.paramSection);

    // Navigation buttons
    const navGroup = document.createElement('div');
    navGroup.className = 'nav-group';

    this.backBtn = document.createElement('button');
    this.backBtn.className = 'btn btn-secondary';
    this.backBtn.textContent = 'Back';
    this.backBtn.addEventListener('click', () => this.goBack());
    navGroup.appendChild(this.backBtn);

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'btn btn-primary btn-next';
    this.nextBtn.textContent = 'Next';
    this.nextBtn.addEventListener('click', () => this.goNext());
    navGroup.appendChild(this.nextBtn);

    this.container.appendChild(navGroup);

    // Stats
    const statsSection = document.createElement('div');
    statsSection.className = 'status-bar';
    this.wallCountEl = document.createElement('span');
    this.statsContainer = document.createElement('div');
    this.updateStats(null, 0);
    statsSection.appendChild(this.statsContainer);
    this.container.appendChild(statsSection);

    // Help text
    const help = document.createElement('div');
    help.className = 'help-text';
    help.innerHTML = `
      <strong>Controls:</strong><br/>
      Left click: Draw walls<br/>
      Right drag: Rotate view<br/>
      Middle drag: Pan view<br/>
      Scroll: Zoom &middot; Escape: Cancel
    `;
    this.container.appendChild(help);
  }

  private updatePhaseUI(): void {
    const meta = PHASE_META[this.currentPhase];
    const curIdx = PHASE_ORDER.indexOf(this.currentPhase);

    // Update stepper
    for (const [phase, el] of this.stepEls) {
      const idx = PHASE_ORDER.indexOf(phase);
      el.classList.toggle('active', phase === this.currentPhase);
      el.classList.toggle('completed', idx < curIdx);
      el.classList.toggle('clickable', idx < curIdx);
      el.style.setProperty('--step-color', idx <= curIdx ? PHASE_META[phase].color : '#555');
    }

    // Phase info
    this.phaseTitle.textContent = meta.label;
    this.phaseTitle.style.color = meta.color;
    this.phaseDesc.textContent = meta.desc;

    // Show/hide sections based on phase
    const isDrawing = this.currentPhase === 'exterior' || this.currentPhase === 'interior';
    this.drawingHint.style.display = isDrawing ? 'block' : 'none';
    this.openingsHint.style.display = this.currentPhase === 'openings' ? 'block' : 'none';
    this.roofSection.style.display = this.currentPhase === 'roof' ? 'flex' : 'none';

    // Navigation buttons
    this.backBtn.style.display = curIdx > 0 && this.currentPhase !== 'done' ? 'block' : 'none';

    if (this.currentPhase === 'done') {
      this.nextBtn.textContent = 'Start Over';
      this.nextBtn.className = 'btn btn-danger btn-next';
    } else if (this.currentPhase === 'roof') {
      this.nextBtn.textContent = 'Generate Frame';
      this.nextBtn.className = 'btn btn-primary btn-next';
      this.nextBtn.style.background = '#2ecc71';
    } else {
      const nextPhase = PHASE_ORDER[curIdx + 1];
      this.nextBtn.textContent = `Next: ${PHASE_META[nextPhase].label}`;
      this.nextBtn.className = 'btn btn-primary btn-next';
      this.nextBtn.style.background = '';
    }
    this.nextBtn.style.display = 'block';
  }

  private goNext(): void {
    if (this.currentPhase === 'done') {
      this.onClear?.();
      this.currentPhase = 'exterior';
      this.updatePhaseUI();
      this.onPhaseChange?.(this.currentPhase);
      return;
    }

    if (this.currentPhase === 'roof') {
      // Build roof config from UI
      this.params.roof = this.buildRoofConfig();
      this.readParams();
      this.onGenerate?.();
      this.currentPhase = 'done';
      this.updatePhaseUI();
      this.onPhaseChange?.(this.currentPhase);
      return;
    }

    const curIdx = PHASE_ORDER.indexOf(this.currentPhase);
    if (curIdx < PHASE_ORDER.length - 1) {
      this.currentPhase = PHASE_ORDER[curIdx + 1];
      this.updatePhaseUI();
      this.onPhaseChange?.(this.currentPhase);
    }
  }

  private goBack(): void {
    const curIdx = PHASE_ORDER.indexOf(this.currentPhase);
    if (curIdx > 0) {
      this.currentPhase = PHASE_ORDER[curIdx - 1];
      this.updatePhaseUI();
      this.onPhaseChange?.(this.currentPhase);
    }
  }

  private setRidgeAxis(axis: 'x' | 'z'): void {
    this.ridgeXBtn.classList.toggle('active', axis === 'x');
    this.ridgeZBtn.classList.toggle('active', axis === 'z');
  }

  private buildRoofConfig(): RoofConfig {
    return {
      type: 'gable',
      pitchAngle: parseFloat(this.pitchInput.value),
      overhang: parseFloat(this.overhangInput.value) / 1000,
      ridgeAxis: this.ridgeXBtn.classList.contains('active') ? 'x' : 'z',
    };
  }

  private addSlider(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
  ): { input: HTMLInputElement; valueSpan: HTMLSpanElement } {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const lbl = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = label;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'slider-value';
    valueSpan.textContent = `${value} ${unit}`;

    lbl.appendChild(nameSpan);
    lbl.appendChild(valueSpan);
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    input.addEventListener('input', () => {
      valueSpan.textContent = `${input.value} ${unit}`;
      this.readParams();
    });

    row.appendChild(input);
    parent.appendChild(row);

    return { input, valueSpan };
  }

  private readParams(): void {
    this.params = {
      studSpacing: parseFloat(this.studSpacingInput.value) / 1000,
      wallHeight: parseFloat(this.wallHeightInput.value) / 1000,
      studWidth: parseFloat(this.studWidthInput.value) / 1000,
      studDepth: parseFloat(this.studDepthInput.value) / 1000,
      gridSnap: parseFloat(this.gridSnapInput.value) / 1000,
      noggings: this.noggingsInput.checked,
      roof: this.params.roof,
    };
    this.onParamsChange?.(this.params);
  }
}
