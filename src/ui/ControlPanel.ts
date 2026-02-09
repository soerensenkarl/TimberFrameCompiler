import { FrameParams, RoofConfig, Phase, DEFAULT_PARAMS } from '../types';
import { OpeningConfig } from './OpeningTool';

const PHASE_META: Record<Phase, { label: string; number: string; desc: string; color: string }> = {
  exterior: { label: 'Exterior Walls', number: '1', desc: 'Draw the outline of your building', color: '#e67e22' },
  interior: { label: 'Interior Walls', number: '2', desc: 'Add interior partition walls', color: '#3498db' },
  openings: { label: 'Openings', number: '3', desc: 'Place windows and doors on walls', color: '#9b59b6' },
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
  private exteriorStudDepthInput!: HTMLInputElement;
  private gridSnapInput!: HTMLInputElement;
  private noggingsInput!: HTMLInputElement;

  // Roof controls
  private roofSection!: HTMLElement;
  private pitchInput!: HTMLInputElement;
  private overhangInput!: HTMLInputElement;
  private ridgeXBtn!: HTMLButtonElement;
  private ridgeZBtn!: HTMLButtonElement;

  // Opening controls
  private openingsSection!: HTMLElement;
  private openingWindowBtn!: HTMLButtonElement;
  private openingDoorBtn!: HTMLButtonElement;
  private openingWidthInput!: HTMLInputElement;
  private openingHeightInput!: HTMLInputElement;
  private sillHeightRow!: HTMLElement;
  private sillHeightInput!: HTMLInputElement;
  private openingCountEl!: HTMLElement;

  // Navigation
  private nextBtn!: HTMLButtonElement;
  private backBtn!: HTMLButtonElement;

  // Stats
  private statsContainer!: HTMLElement;
  private wallCountEl!: HTMLElement;

  // Phase-specific sections
  private drawingHint!: HTMLElement;
  private paramSection!: HTMLElement;
  private paramSectionTitle!: HTMLElement;
  private exteriorStudDepthRow!: HTMLElement;
  private studDepthRow!: HTMLElement;

  // Opening config state
  private openingConfig: OpeningConfig = { type: 'window', width: 0.9, height: 1.2, sillHeight: 0.9 };

  // Callbacks
  onPhaseChange: ((phase: Phase) => void) | null = null;
  onGenerate: (() => void) | null = null;
  onClear: (() => void) | null = null;
  onParamsChange: ((params: FrameParams) => void) | null = null;
  onOpeningConfigChange: ((config: OpeningConfig) => void) | null = null;
  onLoadExample: (() => void) | null = null;

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

  getOpeningConfig(): OpeningConfig {
    return { ...this.openingConfig };
  }

  setPhase(phase: Phase): void {
    this.currentPhase = phase;
    this.updatePhaseUI();
  }

  updateOpeningCount(count: number): void {
    this.openingCountEl.textContent = `${count} opening${count !== 1 ? 's' : ''} placed`;
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

    // Phase stepper (positioned at top of menu)
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
        if (phase === this.currentPhase) return;
        this.currentPhase = phase;
        this.updatePhaseUI();
        this.onPhaseChange?.(this.currentPhase);
      });
      stepper.appendChild(step);
      this.stepEls.set(phase, step);
    }
    this.container.appendChild(stepper);

    // Scrollable body (everything below the stepper)
    const body = document.createElement('div');
    body.className = 'panel-body';

    // Phase info
    const phaseInfo = document.createElement('div');
    phaseInfo.className = 'phase-info';
    this.phaseTitle = document.createElement('div');
    this.phaseTitle.className = 'phase-title';
    this.phaseDesc = document.createElement('div');
    this.phaseDesc.className = 'phase-desc';
    phaseInfo.appendChild(this.phaseTitle);
    phaseInfo.appendChild(this.phaseDesc);
    body.appendChild(phaseInfo);

    // Drawing hint (shown during exterior/interior phases, content set per-phase)
    this.drawingHint = document.createElement('div');
    this.drawingHint.className = 'drawing-hint';
    body.appendChild(this.drawingHint);

    // Openings section
    this.buildOpeningsSection();
    // Move openings section from container into body
    body.appendChild(this.openingsSection);

    // Roof configuration section
    this.roofSection = document.createElement('div');
    this.roofSection.className = 'panel-section roof-section';

    const roofTitle = document.createElement('h3');
    roofTitle.textContent = 'Roof Configuration';
    this.roofSection.appendChild(roofTitle);

    const pitchResult = this.addSlider(this.roofSection, 'Pitch Angle', 30, 10, 60, 1, '°');
    this.pitchInput = pitchResult.input;

    const overhangResult = this.addSlider(this.roofSection, 'Overhang', 300, 0, 1000, 50, 'mm');
    this.overhangInput = overhangResult.input;

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

    body.appendChild(this.roofSection);

    // Frame parameters section
    this.paramSection = document.createElement('div');
    this.paramSection.className = 'panel-section';

    this.paramSectionTitle = document.createElement('h3');
    this.paramSectionTitle.textContent = 'Frame Parameters';
    this.paramSection.appendChild(this.paramSectionTitle);

    const spacingResult = this.addSlider(this.paramSection, 'Stud Spacing', this.params.studSpacing * 1000, 200, 1200, 50, 'mm');
    this.studSpacingInput = spacingResult.input;

    const heightResult = this.addSlider(this.paramSection, 'Wall Height', this.params.wallHeight * 1000, 1800, 4000, 100, 'mm');
    this.wallHeightInput = heightResult.input;

    const widthResult = this.addSlider(this.paramSection, 'Timber Width', this.params.studWidth * 1000, 30, 100, 5, 'mm');
    this.studWidthInput = widthResult.input;

    const extDepthResult = this.addSlider(this.paramSection, 'Exterior Timber Depth', this.params.exteriorStudDepth * 1000, 45, 250, 5, 'mm');
    this.exteriorStudDepthInput = extDepthResult.input;
    this.exteriorStudDepthRow = extDepthResult.input.parentElement as HTMLElement;

    const depthResult = this.addSlider(this.paramSection, 'Interior Timber Depth', this.params.studDepth * 1000, 45, 250, 5, 'mm');
    this.studDepthInput = depthResult.input;
    this.studDepthRow = depthResult.input.parentElement as HTMLElement;

    const snapResult = this.addSlider(this.paramSection, 'Grid Snap', this.params.gridSnap * 1000, 50, 1000, 50, 'mm');
    this.gridSnapInput = snapResult.input;

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

    body.appendChild(this.paramSection);

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

    body.appendChild(navGroup);

    // Stats
    const statsSection = document.createElement('div');
    statsSection.className = 'status-bar';
    this.wallCountEl = document.createElement('span');
    this.statsContainer = document.createElement('div');
    this.updateStats(null, 0);
    statsSection.appendChild(this.statsContainer);
    body.appendChild(statsSection);

    // Help text
    const help = document.createElement('div');
    help.className = 'help-text';
    help.innerHTML = `
      <strong>Controls:</strong><br/>
      Left click: Draw walls<br/>
      Right drag: Rotate &middot; Middle drag: Pan<br/>
      Scroll: Zoom &middot; Escape: Cancel
    `;
    body.appendChild(help);

    // Load example button (at bottom of menu)
    const exampleBtn = document.createElement('button');
    exampleBtn.className = 'btn btn-example';
    exampleBtn.textContent = 'Load Example House';
    exampleBtn.addEventListener('click', () => this.onLoadExample?.());
    body.appendChild(exampleBtn);

    this.container.appendChild(body);
  }

  private buildOpeningsSection(): void {
    this.openingsSection = document.createElement('div');
    this.openingsSection.className = 'panel-section openings-section';

    // Type toggle
    const typeLabel = document.createElement('h3');
    typeLabel.textContent = 'Opening Type';
    this.openingsSection.appendChild(typeLabel);

    const typeBtns = document.createElement('div');
    typeBtns.className = 'axis-buttons';
    this.openingWindowBtn = document.createElement('button');
    this.openingWindowBtn.className = 'btn btn-opening active';
    this.openingWindowBtn.textContent = 'Window';
    this.openingWindowBtn.addEventListener('click', () => this.setOpeningType('window'));
    this.openingDoorBtn = document.createElement('button');
    this.openingDoorBtn.className = 'btn btn-opening';
    this.openingDoorBtn.textContent = 'Door';
    this.openingDoorBtn.addEventListener('click', () => this.setOpeningType('door'));
    typeBtns.appendChild(this.openingWindowBtn);
    typeBtns.appendChild(this.openingDoorBtn);
    this.openingsSection.appendChild(typeBtns);

    // Width slider
    const widthResult = this.addSlider(this.openingsSection, 'Width', 900, 400, 2400, 50, 'mm');
    this.openingWidthInput = widthResult.input;
    this.openingWidthInput.addEventListener('input', () => this.readOpeningConfig());

    // Height slider
    const heightResult = this.addSlider(this.openingsSection, 'Height', 1200, 400, 2400, 50, 'mm');
    this.openingHeightInput = heightResult.input;
    this.openingHeightInput.addEventListener('input', () => this.readOpeningConfig());

    // Sill height slider (windows only)
    this.sillHeightRow = document.createElement('div');
    this.sillHeightRow.className = 'slider-row';
    const sillResult = this.addSlider(this.openingsSection, 'Sill Height', 900, 200, 1500, 50, 'mm');
    this.sillHeightInput = sillResult.input;
    this.sillHeightRow = sillResult.input.parentElement!;
    this.sillHeightInput.addEventListener('input', () => this.readOpeningConfig());

    // Hints
    const hint = document.createElement('div');
    hint.className = 'drawing-hint';
    hint.innerHTML = `
      <div class="hint-item">Click near a wall to place</div>
      <div class="hint-item">Click on an opening to remove it</div>
    `;
    this.openingsSection.appendChild(hint);

    // Count
    this.openingCountEl = document.createElement('div');
    this.openingCountEl.className = 'opening-count';
    this.openingCountEl.textContent = '0 openings placed';
    this.openingsSection.appendChild(this.openingCountEl);

    this.container.appendChild(this.openingsSection);
  }

  private setOpeningType(type: 'window' | 'door'): void {
    this.openingWindowBtn.classList.toggle('active', type === 'window');
    this.openingDoorBtn.classList.toggle('active', type === 'door');

    // Update height default when switching type
    if (type === 'door') {
      this.openingHeightInput.value = '2100';
      const span = this.openingHeightInput.parentElement?.querySelector('.slider-value');
      if (span) span.textContent = '2100 mm';
    } else {
      this.openingHeightInput.value = '1200';
      const span = this.openingHeightInput.parentElement?.querySelector('.slider-value');
      if (span) span.textContent = '1200 mm';
    }

    // Show/hide sill height
    this.sillHeightRow.style.display = type === 'window' ? 'flex' : 'none';

    this.readOpeningConfig();
  }

  private readOpeningConfig(): void {
    const type = this.openingWindowBtn.classList.contains('active') ? 'window' as const : 'door' as const;
    this.openingConfig = {
      type,
      width: parseFloat(this.openingWidthInput.value) / 1000,
      height: parseFloat(this.openingHeightInput.value) / 1000,
      sillHeight: type === 'door' ? 0 : parseFloat(this.sillHeightInput.value) / 1000,
    };
    this.onOpeningConfigChange?.(this.openingConfig);
  }

  private updatePhaseUI(): void {
    const meta = PHASE_META[this.currentPhase];
    const curIdx = PHASE_ORDER.indexOf(this.currentPhase);

    // Update stepper — all steps are always clickable
    for (const [phase, el] of this.stepEls) {
      const idx = PHASE_ORDER.indexOf(phase);
      el.classList.toggle('active', phase === this.currentPhase);
      el.classList.toggle('completed', idx < curIdx);
      el.classList.add('clickable');
      el.style.setProperty('--step-color', PHASE_META[phase].color);
    }

    // Phase info
    this.phaseTitle.textContent = meta.label;
    this.phaseTitle.style.color = meta.color;
    this.phaseDesc.textContent = meta.desc;

    // Show/hide sections per phase
    if (this.currentPhase === 'exterior') {
      this.drawingHint.innerHTML = `
        <div class="hint-item">Click and drag to draw the footprint</div>
        <div class="hint-item">Drag arrows to resize</div>
      `;
      this.drawingHint.style.display = 'block';
    } else if (this.currentPhase === 'interior') {
      this.drawingHint.innerHTML = `
        <div class="hint-item">Click to place wall points</div>
        <div class="hint-item">Walls chain automatically</div>
        <div class="hint-item">Press <kbd>Esc</kbd> to finish chain</div>
      `;
      this.drawingHint.style.display = 'block';
    } else {
      this.drawingHint.style.display = 'none';
    }
    this.openingsSection.style.display = this.currentPhase === 'openings' ? 'flex' : 'none';
    this.roofSection.style.display = this.currentPhase === 'roof' ? 'flex' : 'none';

    // Frame parameters: only show for exterior and interior phases
    const showParams = this.currentPhase === 'exterior' || this.currentPhase === 'interior';
    this.paramSection.style.display = showParams ? 'block' : 'none';
    if (showParams) {
      this.paramSectionTitle.textContent = this.currentPhase === 'exterior'
        ? 'Exterior Wall Parameters'
        : 'Interior Wall Parameters';
      this.exteriorStudDepthRow.style.display = this.currentPhase === 'exterior' ? 'flex' : 'none';
      this.studDepthRow.style.display = this.currentPhase === 'interior' ? 'flex' : 'none';
    }

    // Apply roof config when entering roof or done phase for live preview
    if (this.currentPhase === 'roof' || this.currentPhase === 'done') {
      this.params.roof = this.buildRoofConfig();
    }

    // Navigation buttons
    this.backBtn.style.display = curIdx > 0 && this.currentPhase !== 'done' ? 'block' : 'none';

    if (this.currentPhase === 'done') {
      this.nextBtn.textContent = 'Start Over';
      this.nextBtn.className = 'btn btn-danger btn-next';
    } else if (this.currentPhase === 'roof') {
      this.nextBtn.textContent = 'Finish';
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
    if (this.currentPhase === 'roof') {
      this.readParams();
    }
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
      exteriorStudDepth: parseFloat(this.exteriorStudDepthInput.value) / 1000,
      gridSnap: parseFloat(this.gridSnapInput.value) / 1000,
      noggings: this.noggingsInput.checked,
      roof: (this.currentPhase === 'roof' || this.currentPhase === 'done')
        ? this.buildRoofConfig()
        : this.params.roof,
    };
    this.onParamsChange?.(this.params);
  }
}
