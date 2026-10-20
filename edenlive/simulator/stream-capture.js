import { streamComparison } from './stream-comparison.js';
import { captureStreamScene as captureScene, createStreamCaptureResources as createCaptureResources } from './stream-scene-capture.js';
import { StreamSender } from './stream-sender.js';
const INPUT_FPS = 5;

export function installStreamCapture(context) {
  const $ = id => document.getElementById(id), button = $('stream-start'), status = $('stream-status');
  let session = null, starting = false;
  const message = text => { status.textContent = text; };
  function enqueue(s) {
    const lastFrame = s.count - 1;
    s.sender.enqueue(s.frames, () => { if (session === s) streamComparison.releaseUploaded(lastFrame); });
    s.frames = [];
  }
  async function start() {
    if (starting || session) return;
    if (!context.canStart() || context.backend.isBusy()) { message('请先结束录制或等待当前后端任务完成'); return; }
    let view = $('record-view').value;
    const wristArm = Number($('wrist-arm').value);
    starting = true; button.disabled = true;
    let resources = null, opened = false;
    try {
      const options = { ...context.backend.settings(), inputFps: INPUT_FPS };
      if (options.useReference) {
        if (!options.referenceFile) throw Error('请先选择参考图');
        if (!context.prepareReferenceStart) throw Error('前端未配置 ext1 参考图场景');
        context.prepareReferenceStart(); view = 'ext1';
      }
      if (!['ext1', 'ext2', 'wrist', 'viewport'].includes(view)) throw Error('流式渲染请选择单视角（ext1、ext2、腕部或当前网页视角）');
      resources = createCaptureResources(640, 384);
      const result = await context.backend.openStream(options); opened = true;
      options.inputFormat = result.input_format || 'rgb24';
      const controls = Array.from(document.querySelectorAll('#record-video,#demo-record,#capture-data,#physics-enabled,#solver-kind,#gripper-kind,#item-kind,#item-style,#demo-mode,#demo-exit,#demo-replay,#backend-enabled,#backend-kind,#backend-variant,#backend-prompt,#stream-release-upload,#record-view,#wrist-arm,#reference-stream-start,#reference-prepare,#reference-file,#backend-reference-enabled'));
      const saved = controls.map(el => [el, el.disabled]); controls.forEach(el => { el.disabled = true; });
      session = { resources, saved, options, frames: [], count: 0, first: true, last: -Infinity, capture: null, closing: false, view, wristArm, maxFrames: result.max_frames || 4800 };
      session.sender = new StreamSender(context.backend, error => { stop(error); });
      button.textContent = '停止流式输入';
      message('开始采集：5 FPS，首块 9 帧，后续每块 12 帧；生成落后时暂停仿真等待');
    } catch (error) { resources?.dispose(); if (opened) context.backend.cancelStream().catch(() => {}); message(error.message); }
    finally { starting = false; button.disabled = false; }
  }
  async function stop(failure = null) {
    const s = session;
    if (!s || s.closing) return;
    s.closing = true; button.disabled = true;
    try {
      await s.capture;
      if (failure || s.captureError || s.sender.error) throw failure || s.captureError || s.sender.error;
      message('正在送完剩余帧…');
      await s.sender.idle();
      if (s.frames.length) { enqueue(s); await s.sender.idle(); }
      if (s.count) { await context.backend.finishStream(); message(`输入结束，共 ${s.count} 帧；等待剩余生成结果`); }
      else { await context.backend.cancelStream(); message('未采集到帧，已取消会话'); }
    } catch (error) { context.backend.cancelStream().catch(() => {}); message(`流式输入停止：${error.message}`); }
    finally {
      s.resources.dispose(); s.saved.forEach(([el, disabled]) => { el.disabled = disabled; });
      session = null; button.disabled = false; button.textContent = '开始流式渲染';
    }
  }
  function tick(now) {
    const s = session;
    if (!s || s.closing || s.capture || s.sender.full || streamComparison.full || document.hidden || now - s.last < 1000 / INPUT_FPS) return;
    if (!context.backend.isBusy()) { stop(Error('后端会话已结束，请查看任务状态')); return; }
    s.last = now;
    s.capture = (async () => {
      const result = await captureScene({ ...context, views: [s.view], wristArm: s.wristArm, width: 640, height: 384, resources: s.resources, raw: true, saveDepth: s.options.kind === 'depth', saveMask: false });
      const rgba = s.options.kind === 'depth' ? result.frames[0].depthPreview : result.frames[0].rgb;
      const gray = s.options.kind === 'depth' && s.options.inputFormat === 'gray8';
      const rgb = new Uint8Array(640 * 384 * (gray ? 1 : 3));
      for (let i = 0, j = 0; i < rgba.length; i += 4) {
        rgb[j++] = rgba[i];
        if (!gray) { rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2]; }
      }
      streamComparison.add(s.count, result.frames[0].rgb, rgba, result.metadata.cameras[s.view]);
      s.frames.push(rgb); s.count++;
      if (s.frames.length === (s.first ? 9 : 12)) { enqueue(s); s.first = false; }
      message(`已采集 ${s.count} 帧 · 待发送 ${s.sender.queue.length} 块${s.sender.full ? ' · 等待后端，仿真暂停' : ''}`);
    })().catch(error => { s.captureError = error; }).finally(() => {
      s.capture = null;
      if (s.captureError) stop(s.captureError);
      else if (s.count >= s.maxFrames) stop();
    });
  }
  button.onclick = () => session ? stop() : start();
  window.addEventListener('beforeunload', event => { if (session || starting) { event.preventDefault(); event.returnValue = ''; } });
  return { tick, stop, isBackpressured: () => starting || !!session && (session.closing || session.sender.full || streamComparison.full || document.hidden || !!session.capture && performance.now() - session.last >= 1000 / INPUT_FPS) };
}
