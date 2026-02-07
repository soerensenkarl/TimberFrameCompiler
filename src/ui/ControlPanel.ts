import { FrameParams, DEFAULT_PARAMS, TimberFrame } from '../types';

export class ControlPanel {
  private container: HTMLElement;
  private params: FrameParams;

  // Input elements
  private studSpacingInput!: HTMLInputElement;
  private wallHeightInput!: HTMLInputElement;
  private studWidthInput!: HTMLInputElement;
  private studDepthInput!: HTMLInputElement;
  private gridSnapInput!: HTMLInputElement;
  private noggingsInput!: HTMLInputElement;

  // Stats display
  private statsContainer!: HTMLElement;
  private statusText!: HTMLElement;
  private wallCountEl!: HTMLElement;

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

    this.studSpacingInput = this.addParam(paramSection, 'Stud Spacing (mm)', this.params.studSpacing * 1000, 200, 1200, 50);
    this.wallHeightInput = this.addParam(paramSection, 'Wall Height (mm)', this.params.wallHeight * 1000, 1800, 4000, 100);
    this.studWidthInput = this.addParam(paramSection, 'Timber Width (mm)', this.params.studWidth * 1000, 30, 100, 5);
    this.studDepthInput = this.addParam(paramSection, 'Timber Depth (mm)', this.params.studDepth * 1000, 45, 250, 5);
    this.gridSnapInput = this.addParam(paramSection, 'Grid Snap (mm)', this.params.gridSnap * 1000, 50, 1000, 50);

    // Noggings checkbox
    const nogRow = document.createElement('div');
    nogRow.className = 'param-row';
    const nogLabel = document.createElement('label');
    nogLabel.style.display = 'flex';
    nogLabel.style.alignItems = 'center';
    nogLabel.style.gap = '8px';
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

  private addParam(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number): HTMLInputElement {
    const row = document.createElement('div');
    row.className = 'param-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () => this.readParams());
    row.appendChild(input);

    parent.appendChild(row);
    return input;
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
