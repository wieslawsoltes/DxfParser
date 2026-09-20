import { SurfaceScheduler } from './surface-scheduler.js';

/** Register the reusable element without coupling runtime initialization to DOM state. */
export function registerCanvasElement(api) {
  if (typeof customElements === 'undefined' || customElements.get('skia-canvas')) return;
  class SkiaCanvasElement extends HTMLElement {
    static observedAttributes = ['backend', 'width', 'height'];
    constructor() {
      super(); this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = '<style>:host{display:block;min-height:160px}canvas{display:block;width:100%;height:100%}</style><canvas part="canvas"></canvas>';
      const event = (name, detail) => this.dispatchEvent(new CustomEvent(name, { detail }));
      this._scheduler = new SurfaceScheduler({
        getConfiguration: () => {
          const dpr = globalThis.devicePixelRatio || 1;
          const dimension = (name, fallback) => {
            const attribute = this.getAttribute(name);
            const size = attribute === null ? Math.max(1, Math.round(fallback * dpr)) : Number(attribute);
            if (!Number.isSafeInteger(size) || size < 1 || size > 2147483647) {
              throw new RangeError(`${name} must be a positive integer backing-store dimension.`);
            }
            return size;
          };
          return { width: dimension('width', this.clientWidth), height: dimension('height', this.clientHeight),
            backend: this.getAttribute('backend') || 'auto' };
        },
        createSurface: async configuration => {
          const element = document.createElement('canvas'); element.setAttribute('part', 'canvas');
          element.width = configuration.width; element.height = configuration.height;
          let surface;
          surface = await api.SKSurface.Create(element, { backend: configuration.backend,
            onDeviceLost: info => {
              if (surface && this.Surface !== surface) return;
              event('devicelost', info); void this._scheduler.Invalidate(true);
            }
          });
          return surface;
        },
        adoptSurface: surface => {
          this.shadowRoot.querySelector('canvas').replaceWith(surface.Element);
        },
        paint: (surface, configuration) => event('paintsurface', {
          Surface: surface, Canvas: surface.Canvas,
          Info: new api.SKImageInfo(configuration.width, configuration.height)
        }),
        onError: error => event('surfaceerror', error)
      });
      this._dprChanged = () => { this._watchDpr(); void this.InvalidateSurface(); };
    }
    get Surface() { return this._scheduler.Surface; }
    get Statistics() { return Object.freeze({ ...this._scheduler.Statistics }); }
    connectedCallback() {
      this._observer?.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this._observer = new ResizeObserver(() => { void this.InvalidateSurface(); });
        this._observer.observe(this);
      }
      this._watchDpr(); void this._scheduler.Connect();
    }
    disconnectedCallback() {
      this._observer?.disconnect(); this._observer = null;
      this._dprMedia?.removeEventListener('change', this._dprChanged); this._dprMedia = null;
      this._scheduler.Disconnect();
    }
    _watchDpr() {
      this._dprMedia?.removeEventListener('change', this._dprChanged);
      if (typeof matchMedia === 'function') {
        this._dprMedia = matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
        this._dprMedia.addEventListener('change', this._dprChanged, { once: true });
      }
    }
    attributeChangedCallback(name, previous, next) {
      if (previous !== next && this.isConnected) void this.InvalidateSurface();
    }
    InvalidateSurface() { return this._scheduler.Invalidate(); }
    RecreateSurface() { return this._scheduler.Invalidate(true); }
  }
  customElements.define('skia-canvas', SkiaCanvasElement);
}
