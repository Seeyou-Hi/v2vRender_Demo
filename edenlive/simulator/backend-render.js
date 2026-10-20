import { streamComparison } from './stream-comparison.js';
import { FramePlayer } from './frame-player.js';
export function resolveRenderApi(moduleURL) {
  return new URL('./api/render', moduleURL).pathname;
}

export const renderAPI = resolveRenderApi(import.meta.url);
const API = renderAPI;

export async function renderRequest(path, options = {}) {
  const endpoint = API + path;
  const response = await fetch(endpoint, { ...options, signal: AbortSignal.timeout(120000) });
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid JSON object');
  } catch {
    const type = response.headers.get('content-type') || '未知类型';
    const html = type.includes('text/html') || body.trimStart().startsWith('<');
    const message = html
      ? `渲染接口 ${endpoint} 返回 HTML 页面（HTTP ${response.status}），请检查网页端口转发路径或代理登录状态`
      : `渲染接口 ${endpoint} 返回非 JSON 响应（HTTP ${response.status}，${type}），请检查接口转发配置`;
    throw Object.assign(Error(message), { status: response.status });
  }
  if (!response.ok) { const error = Error(data.error || `渲染请求失败（${response.status}）`); error.status = response.status; throw error; }
  return data;
}

export function installBackendRendering() {
  const $ = id => document.getElementById(id);
  const enabled = $('backend-enabled'), kind = $('backend-kind'), variant = $('backend-variant');
  const prompt = $('backend-prompt'), status = $('backend-status'), retry = $('backend-retry');
  const player = $('backend-video'), chunks = $('backend-chunk'), download = $('backend-download');
  let inputGzip = false, referenceFile = null;
  const encodedBodies = new WeakMap();
  let collection = 'jobs', generation = 0, framePlayback = null, frameMode = false;
  const canvas = $('backend-canvas');
  let busy = false, last = null, job = null, listed = new Set(), playingChunk = false;
  let nextChunk = 0, completed = false, consecutiveErrors = 0;
  const message = text => { status.textContent = text; };
  const settings = () => ({ enabled: enabled.checked, kind: kind.value, variant: variant.value, prompt: prompt.value.trim(), releaseAfterUpload: !!$('stream-release-upload')?.checked, useReference: !!$('backend-reference-enabled')?.checked, referenceFile });
  const stateNames = { queued: '排队中', running: '处理中', loading: '加载模型', warming_up: '模型热身', waiting_input: '等待输入帧', encoding_output: '封装完整视频', rendering: '生成视频', completed: '生成完成', failed: '生成失败' };
  function playChunk(index, autoplay = false) {
    const option = chunks.options[index];
    if (!option) return;
    nextChunk = index + 1; chunks.value = option.value; playingChunk = true;
    player.hidden = false; player.src = `${API}/${collection}/${job}/chunks/${option.value}`;
    if (autoplay) player.play().catch(() => {});
  }
  chunks.onchange = () => playChunk(chunks.selectedIndex, true);
  player.onended = () => {
    if (!playingChunk) return;
    if (nextChunk < chunks.options.length) playChunk(nextChunk, true);
    else if (!completed) message('当前分块已播放完，等待下一块…');
  };
  $('backend-full').onclick = () => {
    playingChunk = false; player.src = `${API}/${collection}/${job}/output.mp4`; player.hidden = false;
    player.play().catch(() => {});
  };
  enabled.onchange = () => {
    if (enabled.checked) {
      $('record-view').value = 'viewport'; $('record-depth').checked = true;
      $('record-mask').checked = false; $('capture-size').value = '640x384'; $('sequence-fps').value = '5';
      message('已开启：录制完成后自动提交当前视角；可在上方调整录制设置');
    } else message('未开启自动渲染');
  };
  $('backend-check').onclick = async () => {
    try {
      const health = await renderRequest('/health');
      message(`已连接 ${health.backend} · ${health.gpus} 张卡 · ${health.resident ? (health.resident.status === 'ready' ? '模型常驻就绪' : health.resident.status) : '接口在线'}`);
    } catch (error) { message(error.message); }
  };
  async function poll(expected = generation) {
    if (expected !== generation || !busy) return;
    let terminal = false;
    try {
      const state = await renderRequest(`/${collection}/${job}`);
      if (expected !== generation) return;
      consecutiveErrors = 0;
      for (const name of [...(state.chunks || [])].sort()) {
        if (!/^\d{6}\.mp4$/.test(name) || listed.has(name)) continue;
        listed.add(name);
        const option = document.createElement('option'); option.value = name;
        option.textContent = `分块 ${chunks.options.length + 1}`; chunks.append(option);
      }
      chunks.hidden = chunks.options.length === 0;
      if (chunks.options.length && !player.getAttribute('src')) playChunk(0);
      else if (playingChunk && player.ended && nextChunk < chunks.options.length) playChunk(nextChunk, true);
      const progress = state.progress || {};
      message(`${stateNames[progress.status] || stateNames[state.status] || state.status}${progress.total_frames ? ` · ${progress.delivered_frames || 0}/${progress.total_frames} 帧` : ''} · ${frameMode ? `已生成 ${progress.delivered_frames || 0} 帧，已播放 ${framePlayback?.played || 0} 帧` : `已返回 ${chunks.options.length} 块`}`);
      if (['cancelled', 'canceled'].includes(state.status)) { busy = false; message('流式会话已取消'); return; }
      if (state.status === 'failed') {
        terminal = true;
        throw Error(state.error || progress.error || `后端任务失败（退出码 ${state.returncode ?? '未知'}），请检查 worker.log`);
      }
      if (state.status === 'completed' && frameMode) {
        completed = true; busy = false; message(`生成完成：${state.progress?.delivered_frames || state.received_frames} 帧，按5 FPS顺序播放`); return;
      }
      if (state.status === 'completed') {
        completed = true; busy = false; download.hidden = false; $('backend-full').hidden = false;
        download.href = `${API}/${collection}/${job}/output.mp4`; download.download = `krea-${job}.mp4`;
        message('写实视频已完成，可播放完整视频或下载');
        return;
      }
    } catch (error) {
      consecutiveErrors++;
      message(error.message);
      if (terminal || consecutiveErrors >= 3) {
        busy = false; retry.hidden = collection !== 'jobs'; return;
      }
    }
    setTimeout(() => poll(expected), frameMode ? 500 : 2000);
  }
  async function submit(files, options) {
    if (busy) { message('已有渲染任务，本次录制视频已保留在本地，请稍后重试提交'); return; }
    framePlayback?.stop(); framePlayback = null; frameMode = false; canvas.hidden = true;
    generation++; collection = 'jobs'; last = { files, options }; busy = true; job = null; listed = new Set();
    completed = false; consecutiveErrors = 0; nextChunk = 0; playingChunk = false;
    retry.hidden = true; download.hidden = true; $('backend-full').hidden = true;
    player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
    chunks.replaceChildren(); chunks.hidden = true;
    try {
      const views = [...new Set(files.map(file => file.key.split('/')[0]))];
      if (views.length !== 1) throw Error('后端一次接收一个视角，请选择单视角录制');
      const channel = options.kind === 'depth' ? 'depth' : 'rgb';
      const file = files.find(file => file.key === `${views[0]}/${channel}`);
      if (!file) throw Error('本次录制缺少深度视频，请勾选深度录制或选择 RGB 转 Canny');
      if (file.blob.size > 512 * 1024 * 1024) throw Error('视频超过后端默认 512 MB 限制，请缩短录制');
      message('正在检查后端连接…'); await renderRequest('/health');
      message('正在上传控制视频…');
      const upload = await renderRequest('/uploads/mp4', { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: file.blob });
      message('正在创建渲染任务…');
      const result = await renderRequest('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ control: upload.upload, control_kind: options.kind, variant: options.variant, prompt: options.prompt }) });
      if (!/^[0-9a-f]{32}$/.test(result.id)) throw Error('后端返回无效任务 ID');
      job = result.id; poll();
    } catch (error) { busy = false; retry.hidden = false; message(error.message); }
  }
  async function uploadReference(options) {
    if (!options.useReference) return undefined;
    if (!options.referenceFile) throw Error('请先选择与 ext1 首帧对齐的 PNG/JPEG 参考图');
    const file = options.referenceFile;
    if (file.size > 20 * 1024 * 1024) throw Error('参考图不能超过 20 MB');
    const type = file.type;
    if (!['image/png','image/jpeg'].includes(type)) throw Error('参考图只支持 PNG/JPEG');
    message('正在上传首帧参考图…');
    const result = await renderRequest(`/uploads/${type === 'image/png' ? 'png' : 'jpg'}`, {
      method: 'POST', headers: {'Content-Type': type}, body: file
    });
    if (!/^[0-9a-f]{32}\.(png|jpg|jpeg)$/.test(result.upload)) throw Error('无效参考图上传结果');
    return result.upload;
  }
  async function openStream(options) {
    if (busy) throw Error('已有后端任务，请等待完成');
    framePlayback?.stop(); framePlayback = null; frameMode = false; canvas.hidden = true;
    generation++; busy = true; collection = 'streams'; completed = false; listed = new Set();
    consecutiveErrors = 0; nextChunk = 0; playingChunk = false; job = null;
    retry.hidden = true; download.hidden = true; $('backend-full').hidden = true;
    player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
    chunks.replaceChildren(); chunks.hidden = true;
    try {
      const health = await renderRequest('/health');
      if (!health.stream_input) throw Error('后端尚未启用流式输入，请更新并重启服务');
      if (health.resident && !['ready','busy'].includes(health.resident.status)) throw Error(health.resident.status === 'failed' ? '常驻模型未运行，请先启动后端 GPU 作业' : '后端模型正在预加载，请稍后开始');
      if (options.useReference && !health.stream_reference) throw Error('后端尚未支持流式参考图，请更新 HTTP 接口');
      const reference = await uploadReference(options);
      frameMode = !!health.frame_output;
      if (frameMode) streamComparison.reset(options.kind, !!options.releaseAfterUpload);
      const inputFps = options.inputFps ?? 5;
      if (!(health.supported_input_fps || [health.fps]).includes(inputFps)) throw Error('后端尚未支持 5 FPS 输入，请更新并重启后端');
      inputGzip = typeof CompressionStream !== 'undefined' && health.supported_input_encodings?.includes('gzip');
      const inputFormat = options.kind === 'depth' && health.supported_input_formats?.includes('gray8') ? 'gray8' : 'rgb24';
      const result = await renderRequest('/streams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ control_kind: options.kind, variant: options.variant, prompt: options.prompt || '', ...(reference ? {reference} : {}), input_fps: inputFps, input_format: inputFormat, ...(frameMode ? { output_mode: 'frames', frame_format: 'jpeg', save_mp4: false } : {}) }) });
      if (!/^[0-9a-f]{32}$/.test(result.id)) throw Error('无效会话 ID');
      job = result.id;
      if (frameMode) framePlayback = new FramePlayer(canvas, API, job, renderRequest, error => { message(error.message); });
      poll(); return result;
    } catch (error) { busy = false; message(error.message); throw error; }
  }
  const pushStream = async (sequence, body) => {
    const originalBytes = body.size, started = performance.now();
    let encoding = '';
    if (inputGzip) {
      if (!encodedBodies.has(body)) encodedBodies.set(body, new Response(body.stream().pipeThrough(new CompressionStream('gzip'))).blob());
      const compressed = await encodedBodies.get(body);
      if (compressed.size < body.size) { body = compressed; encoding = 'gzip'; }
    }
    const result = await renderRequest(`/streams/${job}/frames/${String(sequence).padStart(6, '0')}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(encoding ? {'Content-Encoding': encoding} : {}) }, body });
    console.info('Krea upload', { sequence, rawBytes: originalBytes, wireBytes: body.size, seconds: (performance.now()-started)/1000, server: result.last_upload });
    return result;
  };
  const finishStream = () => renderRequest(`/streams/${job}/finish`, { method: 'POST', body: '{}' });
  const cancelStream = async () => { const id = job; framePlayback?.stop(); generation++; busy = false; return renderRequest(`/streams/${id}/cancel`, { method: 'POST', body: '{}' }); };
  globalThis.addEventListener?.('pagehide', () => {
    if (collection === 'streams' && busy && job) navigator.sendBeacon(`${API}/streams/${job}/cancel`, new Blob(['{}'], {type:'application/json'}));
  });
  retry.onclick = () => { if (last) submit(last.files, last.options); };
  return { settings, setReference: file => { referenceFile = file; }, submit, openStream, pushStream, finishStream, cancelStream, isBusy: () => busy };
}
