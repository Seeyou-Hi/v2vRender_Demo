import * as T from './vendor/three.module.js';
import { makeCaptureCamera, cameraMetadata } from './data-capture.js';
import { makeViewportCaptureCamera } from './viewport-camera.js';
import { GPUStreamResolver } from './gpu-frame-resolver.js';

// The stream only needs RGB and the visual depth control, with the same 2x2
// sampling as exports. No surface IDs, metric arrays or per-frame material clones.
export function createStreamCaptureResources(width, height) {
  const target = () => new T.WebGLRenderTarget(width * 2, height * 2, { depthBuffer: true, stencilBuffer: false });
  const rgb = target(), depth = target(); rgb.texture.colorSpace = T.SRGBColorSpace;
  const depthMaterial = new T.ShaderMaterial({ side: T.DoubleSide, toneMapped: false,
    vertexShader: 'varying float cameraDepth; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);cameraDepth=-p.z;gl_Position=projectionMatrix*p;}',
    fragmentShader: 'precision highp float; varying float cameraDepth; void main(){float n=floor(cameraDepth/2.8*10000.0+0.5);float r=floor(n/65536.0);float g=floor(mod(n,65536.0)/256.0);float b=mod(n,256.0);gl_FragColor=vec4(r,g,b,255.0)/255.0;}' });
  const resolver = new GPUStreamResolver(width, height), materials = new Map();
  let preparedScene = null, meshes = [], hidden = [];
  return { rgb, depth, depthMaterial, resolver,
    prepare(scene, arms) {
      if (scene !== preparedScene) {
        materials.forEach(m => m.dispose()); materials.clear(); meshes = []; hidden = [];
        scene.traverse(node => {
          if (node.isLine || node.isPoints || node.isSprite || node.userData.demoDecoration || arms.some(a => node === a.ring)) hidden.push(node);
          if (node.isMesh && (Array.isArray(node.material) ? node.material : [node.material]).some(m => m?.visible)) meshes.push(node);
        });
        preparedScene = scene;
      }
      const captureMaterial = original => {
        if (!materials.has(original)) {
          const copy = original.clone(); copy.transparent = false; copy.opacity = 1;
          copy.depthWrite = true; copy.depthTest = true; copy.polygonOffset = false;
          copy.alphaTest = 0; copy.side = T.DoubleSide; materials.set(original, copy);
        }
        const copy = materials.get(original);
        if (original.color) copy.color.copy(original.color);
        if (original.emissive) copy.emissive.copy(original.emissive);
        return copy;
      };
      // Original materials and visibility can change, even with a stable scene.
      return { hidden: hidden.map(node => [node, node.visible]),
        meshes: meshes.map(node => [node, node.material, Array.isArray(node.material)
          ? node.material.map(captureMaterial) : captureMaterial(node.material)]) };
    },
    dispose() { rgb.dispose(); depth.dispose(); depthMaterial.dispose(); resolver.dispose(); materials.forEach(m => m.dispose()); materials.clear(); }
  };
}

export async function captureStreamScene({ renderer, scene, arms, width = 640, height = 384,
  resources, saveDepth = true, wristArm = 0, views, getCaptureCamera }) {
  if (!resources || views.length !== 1) throw Error('Stream capture requires resources and one camera');
  const name = views[0], snapshot = name === 'viewport' ? makeViewportCaptureCamera(getCaptureCamera?.(), width, height) : null;
  const camera = snapshot?.camera || makeCaptureCamera(name, width, height, arms, wristArm);
  const rect = snapshot?.rect || { x: 0, y: 0, width, height };
  scene.updateMatrixWorld(true);
  const metadata = { cameras: { [name]: cameraMetadata(camera, width, height, rect) } };
  const { meshes, hidden } = resources.prepare(scene, arms);
  const state = { target: renderer.getRenderTarget(), tone: renderer.toneMapping, color: renderer.outputColorSpace,
    background: scene.background, fog: scene.fog, shadow: renderer.shadowMap.enabled,
    clear: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha() };
  const render = target => {
    target.viewport.set(rect.x * 2, rect.y * 2, rect.width * 2, rect.height * 2);
    target.scissor.copy(target.viewport); target.scissorTest = false;
    renderer.setRenderTarget(target); renderer.setClearColor(0, 1); renderer.clear();
    target.scissorTest = true; renderer.setRenderTarget(target); renderer.render(scene, camera); target.scissorTest = false;
  };
  let pending;
  try {
    hidden.forEach(([node]) => { node.visible = false; });
    meshes.forEach(([node, , material]) => { node.material = material; });
    renderer.outputColorSpace = T.SRGBColorSpace; render(resources.rgb);
    if (saveDepth) {
      meshes.forEach(([node]) => { node.material = resources.depthMaterial; });
      renderer.shadowMap.enabled = false; renderer.toneMapping = T.NoToneMapping;
      renderer.outputColorSpace = T.LinearSRGBColorSpace; scene.background = null; scene.fog = null;
      render(resources.depth);
    }
    pending = resources.resolver.queue(renderer, resources.rgb, resources.depth, saveDepth);
  } finally {
    // Restore synchronously, before the animation loop can run while PBOs finish.
    meshes.forEach(([node, material]) => { node.material = material; });
    hidden.forEach(([node, visible]) => { node.visible = visible; });
    scene.background = state.background; scene.fog = state.fog;
    renderer.toneMapping = state.tone; renderer.outputColorSpace = state.color; renderer.shadowMap.enabled = state.shadow;
    renderer.setClearColor(state.clear, state.alpha); renderer.setRenderTarget(state.target);
  }
  const frame = await pending;
  return { frames: [{ name, ...frame }], metadata };
}
