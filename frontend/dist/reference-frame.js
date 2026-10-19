import { captureStreamScene, createStreamCaptureResources } from './stream-scene-capture.js';
import { rgbPNG } from './data-capture.js';

export function validateReferenceImage(width, height) {
  if (!width || !height || Math.abs(width / height / (640 / 384) - 1) > .005) {
    throw Error('参考图请保持 ext1 首帧的 5:3 比例，例如 1280×768 或 640×384；不要裁剪或拉伸');
  }
}

export function installReferenceFrame(context) {
  const $ = id => document.getElementById(id);
  const prepare = $('reference-prepare'), input = $('reference-file');
  const enabled = $('backend-reference-enabled'), status = $('reference-status');
  const link = $('reference-source-download'), preview = $('reference-preview');
  let sourceURL = null, previewURL = null;
  const available = () => context.canStart() && !context.backend.isBusy();
  prepare.onclick = async () => {
    if (!available()) { status.textContent = '请先结束当前采集、录制或渲染'; return; }
    let restore = () => {}, resources;
    try {
      context.prepareReferenceStart(); restore = context.beginSnapshot();
      status.textContent = '正在导出 ext1 初始场景…';
      resources = createStreamCaptureResources(1280, 768);
      const result = await captureStreamScene({ ...context, views: ['ext1'], width: 1280, height: 768, resources, saveDepth: false });
      const png = await rgbPNG(result.frames[0].rgb, 1280, 768);
      if (sourceURL) URL.revokeObjectURL(sourceURL);
      sourceURL = URL.createObjectURL(new Blob([png], {type:'image/png'}));
      link.href = sourceURL; link.download = 'ext1-initial-1280x768.png'; link.hidden = false;
      link.click();
      status.textContent = '已导出 ext1 首帧。请保持相机、机械臂和物体布局，仅修改材质与光照，生成后选择参考图。';
    } catch (error) { status.textContent = `导出失败：${error.message}`; }
    finally { resources?.dispose(); restore(); }
  };
  async function selectReference(file) {
    if (!available()) { input.value = ''; status.textContent = '请结束当前任务后再更换参考图'; return; }
    context.backend.setReference(null); enabled.checked = false;
    preview.hidden = true;
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
    if (!file) { status.textContent = '未选择参考图'; return false; }
    const start = $('stream-start'), savedDisabled = start.disabled;
    start.disabled = true; input.disabled = true; enabled.disabled = true;
    try {
      if (!['image/png','image/jpeg'].includes(file.type)) throw Error('请选择 PNG 或 JPEG 图片');
      if (file.size > 20 * 1024 * 1024) throw Error('参考图不能超过 20 MB');
      const image = await createImageBitmap(file);
      try { validateReferenceImage(image.width, image.height); }
      finally { image.close(); }
      context.backend.setReference(file); enabled.checked = true;
      previewURL = URL.createObjectURL(file); preview.src = previewURL; preview.hidden = false;
      status.textContent = `参考图：${file.name}。启用时，开始流式渲染会重置到 ext1 初始场景；请保持导出时的物品和夹爪配置。`;
      return true;
    } catch (error) { input.value = ''; status.textContent = error.message; return false; }
    finally { start.disabled = savedDisabled; input.disabled = false; enabled.disabled = false; }
  }
  input.onchange = () => selectReference(input.files?.[0]);
  const preset = $('reference-stream-start');
  if (preset) preset.onclick = async () => {
    if (!available()) { status.textContent = '请先结束当前采集或渲染'; return; }
    const start = $('stream-start'), disabled = start.disabled;
    preset.disabled = true; start.disabled = true; input.disabled = true;
    try {
      if (!context.backend.settings?.().referenceFile) {
        status.textContent = '正在读取服务器上的写实参考图…';
        const response = await fetch(new URL('./references/ext1-reference-photoreal.png', import.meta.url));
        if (!response.ok) throw Error(`参考图读取失败：${response.status}`);
        const file = new File([await response.blob()], 'ext1-reference-photoreal.png', {type:'image/png'});
        if (!await selectReference(file)) return;
      }
      enabled.checked = true;
      // Let the stream controller snapshot enabled controls before it locks them.
      preset.disabled = false; start.disabled = disabled; input.disabled = false;
      await start.onclick();
    } catch (error) { status.textContent = error.message; }
    finally {
      if (!context.backend.isBusy()) { preset.disabled = false; start.disabled = disabled; input.disabled = false; }
    }
  };
}
