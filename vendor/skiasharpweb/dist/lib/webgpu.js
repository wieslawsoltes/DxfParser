/**
 * Small, genuine WebGPU presentation and primitive-rasterization backend.
 *
 * Primitive colors are straight RGBA floats in [0, 1]. Pixel uploads contain
 * premultiplied RGBA8 bytes, as returned by a premultiplied Skia surface.
 * This backend does not implement the complete Skia raster pipeline on WebGPU:
 * unsupported frames can be rendered by Skia and uploaded with presentPixels.
 */

const PIXEL_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let points = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = points[index];
  var output: VertexOutput;
  output.position = vec4f(p, 0.0, 1.0);
  output.uv = vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return output;
}
@group(0) @binding(0) var imageSampler: sampler;
@group(0) @binding(1) var imageTexture: texture_2d<f32>;
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(imageTexture, imageSampler, input.uv);
}`;

const PRIMITIVE_SHADER = /* wgsl */ `
struct VertexInput {
  @location(0) center: vec2f,
  @location(1) axisX: vec2f,
  @location(2) axisY: vec2f,
  @location(3) color: vec4f,
  @location(4) shape: vec3f,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) local: vec2f,
  @location(2) @interpolate(flat) shape: vec3f,
};
@vertex fn vertexMain(input: VertexInput, @builtin(vertex_index) index: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0),
                               vec2f(-1.0,-1.0), vec2f(1.0,1.0), vec2f(-1.0,1.0));
  let local = corners[index] * (input.shape.xy + vec2f(1.0));
  var output: VertexOutput;
  output.position = vec4f(input.center + local.x * input.axisX + local.y * input.axisY, 0.0, 1.0);
  output.color = input.color;
  output.local = local;
  output.shape = input.shape;
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let q = abs(input.local) - input.shape.xy;
  let boxDistance = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
  let circleDistance = length(input.local) - input.shape.x;
  let distance = select(boxDistance, circleDistance, input.shape.z > 0.5);
  let coverage = clamp(0.5 - distance / max(fwidth(distance), 0.0001), 0.0, 1.0);
  let alpha = input.color.a * coverage;
  return vec4f(input.color.rgb * alpha, alpha);
}`;

// One instance contains the center, two basis vectors, color, and shape.
// The shader expands it to six corners: 52 uploaded bytes instead of 264.
const FLOATS_PER_INSTANCE = 13;
const INSTANCE_STRIDE = FLOATS_PER_INSTANCE * 4;

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function readColor(value, name = 'color', output = [0,0,0,0]) {
  if (!value || value.length !== 4) throw new TypeError(`${name} must contain four RGBA components.`);
  for(let index=0;index<4;index++){
    const component=value[index];
    if(typeof component!=='number'||!Number.isFinite(component))throw new TypeError(`${name}[${index}] must be a finite number.`);
    output[index]=Math.min(1,Math.max(0,component));
  }
  return output;
}

function premultipliedClear(color) {
  return { r: color[0] * color[3], g: color[1] * color[3], b: color[2] * color[3], a: color[3] };
}

function byteView(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('Pixel data must be an ArrayBuffer, Uint8Array, or Uint8ClampedArray.');
}

/**
 * Create a renderer. Rejects when a usable adapter/device/canvas context or
 * validated pipelines cannot be created. The caller can then use WebGL/Canvas.
 *
 * Lines have butt caps; all native primitives use analytic edge antialiasing.
 * Geometry is expressed in physical canvas pixels without an implicit transform.
 * All draws use source-over blending. A clear replaces the whole canvas.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{onDeviceLost?: (info: GPUDeviceLostInfo) => void}} options
 */
export async function createWebGPUBackend(canvas, { onDeviceLost } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas is required.');
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) throw new Error('WebGPU is unavailable in this browser or context.');
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter is available.');
  const device = await adapter.requestDevice({ label: 'Skia-compatible web rendering device' });
  let context;
  let disposed = false;
  let deviceLoss = null;
  let uncapturedError = null;
  // Device-local reporting: never silence the browser globally. A failed frame
  // rejects FlushAsync so the owning host can retire this backend and replay.
  const onUncapturedError = event => {
    if (disposed) return;
    uncapturedError ||= new Error('WebGPU: ' + (event.error?.message || 'uncaptured device error'));
    event.preventDefault?.();
  };
  device.addEventListener?.('uncapturederror', onUncapturedError);
  let mode = 'ready';
  let width = 0;
  let height = 0;
  let uploadTexture = null;
  let uploadBindGroup = null;
  let uploadWidth = 0;
  let uploadHeight = 0;
  let vertexBuffer = null;
  let vertexCapacity = 0;
  let vertices = new Float32Array(0);
  const commandColor = [0,0,0,0];
  let pixelPipeline;
  let primitivePipeline;
  let sampler;
  const textureBindings = new WeakMap();
  const statistics = {frames:0,primitiveCount:0,uploadedBytes:0,lastUploadBytes:0};
  const format = gpu.getPreferredCanvasFormat();
  const textureUsage = globalThis.GPUTextureUsage;
  const bufferUsage = globalThis.GPUBufferUsage;

  // A loss can happen during initialization or between frames. Never continue
  // submitting work to the lost device; let the owner rebuild its fallback.
  device.lost.then(info => {
    deviceLoss = info;
    if (!disposed && typeof onDeviceLost === 'function') {
      try { onDeviceLost(info); } catch (error) { console.error('WebGPU device-loss callback failed:', error); }
    }
  }).catch(() => {});

  function assertUsable() {
    if (disposed) throw new Error('The WebGPU backend has been disposed.');
    if (uncapturedError) throw uncapturedError;
    if (deviceLoss) throw new Error(`The WebGPU device was lost: ${deviceLoss.message || deviceLoss.reason || 'unknown reason'}`);
  }

  function validateSize(w, h) {
    const maxSize = device.limits.maxTextureDimension2D;
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || w > maxSize || h > maxSize) {
      throw new RangeError(`Canvas dimensions must be positive integers no larger than ${maxSize}.`);
    }
  }

  function resize(w, h) {
    assertUsable();
    validateSize(w, h);
    if (w === width && h === height && canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    context.configure({ device, format, alphaMode: 'premultiplied', usage: textureUsage.RENDER_ATTACHMENT });
    width = w;
    height = h;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    device.removeEventListener?.('uncapturederror', onUncapturedError);
    mode = 'disposed';
    uploadTexture?.destroy();
    vertexBuffer?.destroy();
    uploadTexture = null;
    uploadBindGroup = null;
    vertexBuffer = null;
    vertices = new Float32Array(0);
    try { context?.unconfigure(); } catch { /* A lost context may already be unconfigured. */ }
    device.destroy();
  }

  try {
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('A WebGPU context could not be created for this canvas.');
    if (!textureUsage || !bufferUsage) throw new Error('WebGPU resource constants are unavailable.');
    device.pushErrorScope('validation');
    let scopedError;
    try {
      const pixelModule = device.createShaderModule({ label: 'RGBA presentation shader', code: PIXEL_SHADER });
      const primitiveModule = device.createShaderModule({ label: 'Analytic primitive shader', code: PRIMITIVE_SHADER });
      const diagnostics = await Promise.all([pixelModule, primitiveModule].map(async module => {
        if (!module.getCompilationInfo) return [];
        const info = await module.getCompilationInfo();
        return info.messages.filter(message => message.type === 'error');
      }));
      const shaderErrors = diagnostics.flat();
      if (shaderErrors.length) throw new Error(`WebGPU shader compilation failed: ${shaderErrors.map(error => error.message).join('; ')}`);
      [pixelPipeline, primitivePipeline] = await Promise.all([
        device.createRenderPipelineAsync({
          label: 'Premultiplied Skia raster presentation', layout: 'auto',
          vertex: { module: pixelModule, entryPoint: 'vertexMain' },
          fragment: { module: pixelModule, entryPoint: 'fragmentMain', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        }),
        device.createRenderPipelineAsync({
          label: 'Native antialiased primitive rendering', layout: 'auto',
          vertex: {
            module: primitiveModule, entryPoint: 'vertexMain',
            buffers: [{ arrayStride: INSTANCE_STRIDE, stepMode: 'instance', attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'float32x2' },
              { shaderLocation: 3, offset: 24, format: 'float32x4' },
              { shaderLocation: 4, offset: 40, format: 'float32x3' },
            ] }],
          },
          fragment: {
            module: primitiveModule, entryPoint: 'fragmentMain',
            targets: [{ format, blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            } }],
          },
          primitive: { topology: 'triangle-list' },
        }),
      ]);
      sampler = device.createSampler({ label: 'Pixel-exact sampler', magFilter: 'nearest', minFilter: 'nearest' });
    } finally {
      scopedError = await device.popErrorScope();
    }
    if (scopedError) throw new Error(`WebGPU initialization failed: ${scopedError.message}`);
    resize(Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1));
  } catch (error) {
    dispose();
    throw error;
  }

  function presentPixels(bytes, w, h) {
    assertUsable();
    validateSize(w, h);
    const source = byteView(bytes);
    const required = w * h * 4;
    if (source.byteLength < required) throw new RangeError(`Pixel data requires at least ${required} bytes.`);
    resize(w, h);
    if (!uploadTexture || uploadWidth !== w || uploadHeight !== h) {
      uploadTexture?.destroy();
      uploadTexture = device.createTexture({
        label: 'Skia premultiplied RGBA upload', size: { width: w, height: h, depthOrArrayLayers: 1 },
        format: 'rgba8unorm', usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST,
      });
      uploadBindGroup = device.createBindGroup({
        label: 'Skia raster texture binding', layout: pixelPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: uploadTexture.createView() }],
      });
      uploadWidth = w;
      uploadHeight = h;
    }
    // GPUQueue.writeTexture has no 256-byte row-alignment requirement. That
    // restriction belongs to command-encoder buffer/texture copies instead.
    // https://www.w3.org/TR/webgpu/#dom-gpuqueue-writetexture
    device.queue.writeTexture({ texture: uploadTexture }, source.subarray(0, required),
      { offset: 0, bytesPerRow: w * 4, rowsPerImage: h }, { width: w, height: h, depthOrArrayLayers: 1 });
    const encoder = device.createCommandEncoder({ label: 'Skia raster presentation' });
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear', storeOp: 'store',
    }] });
    pass.setPipeline(pixelPipeline);
    pass.setBindGroup(0, uploadBindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    mode = 'skia-raster-upload';
    statistics.frames++;statistics.primitiveCount=0;statistics.lastUploadBytes=required;statistics.uploadedBytes+=required;
  }

  // Graphite draws into a persistent texture so snapshots and subsequent frames
  // do not depend on the canvas swap chain. Presentation remains entirely on GPU.
  function presentTexture(texture,w=texture.width,h=texture.height){
    assertUsable();validateSize(w,h);resize(w,h);
    let binding=textureBindings.get(texture);
    if(!binding){binding=device.createBindGroup({label:'Graphite texture presentation',layout:pixelPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:sampler},{binding:1,resource:texture.createView()}]});textureBindings.set(texture,binding);}
    const encoder=device.createCommandEncoder({label:'Graphite presentation'}),pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
    pass.setPipeline(pixelPipeline);pass.setBindGroup(0,binding);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);
    mode='skia-graphite-webgpu';statistics.frames++;statistics.primitiveCount=0;statistics.lastUploadBytes=0;
  }

  function presentPrimitives(commands, w, h) {
    assertUsable();
    validateSize(w, h);
    if (!Array.isArray(commands)) throw new TypeError('Primitive commands must be an array.');
    // A whole-canvas clear replaces all earlier draws, which may be discarded.
    let first = 0;
    let clear = [0, 0, 0, 0];
    for (let index = commands.length - 1; index >= 0; index--) {
      if (commands[index]?.type === 'clear') {
        clear = readColor(commands[index].color);
        first = index + 1;
        break;
      }
    }
    const maximumFloats = (commands.length - first) * FLOATS_PER_INSTANCE;
    if (maximumFloats * 4 > device.limits.maxBufferSize) throw new RangeError('The primitive frame exceeds the device buffer limit.');
    if (vertices.length < maximumFloats) vertices = new Float32Array(Math.min(Math.floor(device.limits.maxBufferSize/4), Math.max(1024, 2 ** Math.ceil(Math.log2(maximumFloats)))));
    let cursor = 0;

    function quad(cx, cy, halfWidth, halfHeight, cos, sin, color, shapeKind) {
      vertices[cursor++] = cx / w * 2 - 1;
      vertices[cursor++] = 1 - cy / h * 2;
      vertices[cursor++] = cos * 2 / w;
      vertices[cursor++] = -sin * 2 / h;
      vertices[cursor++] = -sin * 2 / w;
      vertices[cursor++] = -cos * 2 / h;
      vertices[cursor++] = color[0];
      vertices[cursor++] = color[1];
      vertices[cursor++] = color[2];
      vertices[cursor++] = color[3];
      vertices[cursor++] = halfWidth;
      vertices[cursor++] = halfHeight;
      vertices[cursor++] = shapeKind;
    }

    for (let index = first; index < commands.length; index++) {
      const command = commands[index];
      if (!command || typeof command !== 'object') throw new TypeError(`Command ${index} must be an object.`);
      const color = readColor(command.color, 'color', commandColor);
      switch (command.type) {
        case 'rect': {
          const rect = command.rect;
          if (!rect || rect.length !== 4) throw new TypeError('A rectangle requires [x, y, width, height].');
          const x=finite(rect[0],'rect[0]'),y=finite(rect[1],'rect[1]'),rw=finite(rect[2],'rect[2]'),rh=finite(rect[3],'rect[3]');
          if (rw !== 0 && rh !== 0 && color[3] > 0) quad(x + rw / 2, y + rh / 2, Math.abs(rw) / 2, Math.abs(rh) / 2, 1, 0, color, 0);
          break;
        }
        case 'circle': {
          const cx = finite(command.cx, 'cx');
          const cy = finite(command.cy, 'cy');
          const radius = finite(command.r, 'r');
          if (radius > 0 && color[3] > 0) quad(cx, cy, radius, radius, 1, 0, color, 1);
          break;
        }
        case 'line': {
          const x1 = finite(command.x1, 'x1');
          const y1 = finite(command.y1, 'y1');
          const x2 = finite(command.x2, 'x2');
          const y2 = finite(command.y2, 'y2');
          const lineWidth = finite(command.width, 'width');
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.hypot(dx, dy);
          if (length > 0 && lineWidth > 0 && color[3] > 0) {
            quad((x1 + x2) / 2, (y1 + y2) / 2, length / 2, lineWidth / 2, dx / length, dy / length, color, 0);
          }
          break;
        }
        default: throw new TypeError(`Unsupported native WebGPU primitive: ${String(command.type)}.`);
      }
    }
    resize(w, h);
    const byteLength = cursor * 4;
    if (byteLength > 0) {
      if (!vertexBuffer || vertexCapacity < byteLength) {
        vertexBuffer?.destroy();
        vertexCapacity = Math.min(device.limits.maxBufferSize, Math.max(4096, 2 ** Math.ceil(Math.log2(byteLength))));
        vertexBuffer = device.createBuffer({ label: 'Native primitive instances', size: vertexCapacity,
          usage: bufferUsage.VERTEX | bufferUsage.COPY_DST });
      }
      device.queue.writeBuffer(vertexBuffer, 0, vertices.buffer, 0, byteLength);
    }
    const encoder = device.createCommandEncoder({ label: 'Native primitive frame' });
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: context.getCurrentTexture().createView(), clearValue: premultipliedClear(clear),
      loadOp: 'clear', storeOp: 'store',
    }] });
    if (byteLength > 0) {
      pass.setPipeline(primitivePipeline);
      pass.setVertexBuffer(0, vertexBuffer, 0, byteLength);
      pass.draw(6, cursor / FLOATS_PER_INSTANCE);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
    mode = 'native-primitives';
    statistics.frames++;statistics.primitiveCount=cursor/FLOATS_PER_INSTANCE;statistics.lastUploadBytes=byteLength;statistics.uploadedBytes+=byteLength;
  }

  async function runChecked(action) {
    assertUsable();
    device.pushErrorScope('out-of-memory');
    device.pushErrorScope('internal');
    device.pushErrorScope('validation');
    let value, failure;
    try { value = await action(); await device.queue.onSubmittedWorkDone(); }
    catch (error) { failure = error; }
    // Always balance scopes, even after a synchronous WASM import exception.
    for (let i = 0; i < 3; i++) {
      try {
        const error = await device.popErrorScope();
        if (error && !failure) failure = new Error('WebGPU: ' + error.message);
      } catch (error) { failure ||= error; }
    }
    if (failure) throw failure;
    assertUsable();
    return value;
  }

  return {
    runChecked,
    device, context, kind: 'webgpu', format,
    get mode() { return mode; },
    get width() { return width; },
    get height() { return height; },
    get statistics(){return {...statistics};},
    adapterInfo: Object.freeze({vendor:adapter.info?.vendor??'',architecture:adapter.info?.architecture??'',device:adapter.info?.device??'',description:adapter.info?.description??'',isFallbackAdapter:adapter.info?.isFallbackAdapter??null}),
    async waitForCompletion(){assertUsable();await device.queue.onSubmittedWorkDone();assertUsable();},
    resize, presentPixels, presentPrimitives, presentTexture, dispose,
  };
}
