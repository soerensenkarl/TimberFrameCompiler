import { FrameParams, DEFAULT_PARAMS } from '../types';

export class ControlPanel {
  private container: HTMLElement;
  private params: FrameParams;

  // Slider elements (store the range input + value display)
  private studSpacingInput!: HTMLInputElement;
  private wallHeightInput!: HTMLInputElement;
  private studWidthInput!: HTMLInputElement;
  private studDepthInput!: HTMLInputElement;
  private gridSnapInput!: HTMLInputElement;
  private noggingsInput!: HTMLInputElement;

  // Value display spans
  private studSpacingValue!: HTMLSpanElement;
  private wallHeightValue!: HTMLSpanElement;
  private studWidthValue!: HTMLSpanElement;
  private studDepthValue!: HTMLSpanElement;
  private gridSnapValue!: HTMLSpanElement;

  // Stats display
  private statsContainer!: HTMLElement;
  private statusText!: HTMLElement;
  private wallCountEl!: HTMLElement;
  private backendIndicator!: HTMLElement;

  // Callbacks
  onGenerate: (() => void) | null = null;
  onClear: (() => void) | null = null;
  onParamsChange: ((params: FrameParams) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.params = { ...DEFAULT_PARAMS };
    this.buildUI();
  }

  getParams(): FrameParams {
    return { ...this.params };
  }

  setStatus(text: string): void {
    this.statusText.textContent = text;
  }

  setBackendStatus(backend: 'python' | 'local'): void {
    if (backend === 'python') {
      this.backendIndicator.textContent = 'Python API';
      this.backendIndicator.style.color = '#2ecc71';
      this.backendIndicator.style.borderColor = '#2ecc71';
    } else {
      this.backendIndicator.textContent = 'Local (TS)';
      this.backendIndicator.style.color = '#e67e22';
      this.backendIndicator.style.borderColor = '#e67e22';
    }
  }

  updateStats(frame: { studs: number; plates: number; noggings: number; total: number } | null, wallCount: number): void {
    this.wallCountEl.textContent = `${wallCount}`;
    if (frame) {
      this.statsContainer.innerHTML = `
        <div class="stat"><span>Walls drawn</span><span>${wallCount}</span></div>
        <div class="stat"><span>Studs</span><span>${frame.studs}</span></div>
        <div class="stat"><span>Plates</span><span>${frame.plates}</span></div>
        <div class="stat"><span>Noggings</span><span>${frame.noggings}</span></div>
        <div class="stat"><span>Total members</span><span>${frame.total}</span></div>
      `;
    } else {
      this.statsContainer.innerHTML = `
        <div class="stat"><span>Walls drawn</span><span>${wallCount}</span></div>
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
    this.backendIndicator.textContent = 'Local (TS)';
    this.container.appendChild(this.backendIndicator);

    // Mode indicator
    const modeDiv = document.createElement('div');
    modeDiv.className = 'mode-indicator';
    this.statusText = modeDiv;
    modeDiv.textContent = 'Click to start drawing a wall';
    this.container.appendChild(modeDiv);

    // Parameters section
    const paramSection = document.createElement('div');
    paramSection.className = 'panel-section';

    const paramTitle = document.createElement('h3');
    paramTitle.textContent = 'Frame Parameters';
    paramSection.appendChild(paramTitle);

    const spacingResult = this.addSlider(paramSection, 'Stud Spacing', this.params.studSpacing * 1000, 200, 1200, 50, 'mm');
    this.studSpacingInput = spacingResult.input;
    this.studSpacingValue = spacingResult.valueSpan;

    const heightResult = this.addSlider(paramSection, 'Wall Height', this.params.wallHeight * 1000, 1800, 4000, 100, 'mm');
    this.wallHeightInput = heightResult.input;
    this.wallHeightValue = heightResult.valueSpan;

    const widthResult = this.addSlider(paramSection, 'Timber Width', this.params.studWidth * 1000, 30, 100, 5, 'mm');
    this.studWidthInput = widthResult.input;
    this.studWidthValue = widthResult.valueSpan;

    const depthResult = this.addSlider(paramSection, 'Timber Depth', this.params.studDepth * 1000, 45, 250, 5, 'mm');
    this.studDepthInput = depthResult.input;
    this.studDepthValue = depthResult.valueSpan;

    const snapResult = this.addSlider(paramSection, 'Grid Snap', this.params.gridSnap * 1000, 50, 1000, 50, 'mm');
    this.gridSnapInput = snapResult.input;
    this.gridSnapValue = snapResult.valueSpan;

    // Noggings checkbox
    const nogRow = document.createElement('div');
    nogRow.className = 'param-row';
    const nogLabel = document.createElement('label');
    nogLabel.style.display = 'flex';
    nogLabel.style.alignItems = 'center';
    nogLabel.style.gap = '8px';
    nogLabel.style.cursor = 'pointer';
    this.noggingsInput = document.createElement('input');
    this.noggingsInput.type = 'checkbox';
    this.noggingsInput.checked = this.params.noggings;
    this.noggingsInput.addEventListener('change', () => this.readParams());
    nogLabel.appendChild(this.noggingsInput);
    nogLabel.appendChild(document.createTextNode('Generate noggings'));
    nogRow.appendChild(nogLabel);
    paramSection.appendChild(nogRow);

    this.container.appendChild(paramSection);

    // Buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'button-group';

    const generateBtn = document.createElement('button');
    generateBtn.className = 'btn btn-primary';
    generateBtn.textContent = 'Generate Frame';
    generateBtn.addEventListener('click', () => this.onGenerate?.());
    btnGroup.appendChild(generateBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-danger';
    clearBtn.textContent = 'Clear All';
    clearBtn.addEventListener('click', () => this.onClear?.());
    btnGroup.appendChild(clearBtn);

    this.container.appendChild(btnGroup);

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
      Scroll: Zoom<br/>
      Escape: Cancel current wall<br/>
    `;
    this.container.appendChild(help);
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
    };
    this.onParamsChange?.(this.params);
  }
}
