// Keep the exact captured RGBA buffers until the matching output frame is played.
// A bounded window also backpressures capture if output stops arriving.
export class StreamComparison {
  constructor() { this.frames = new Map(); this.limit = 48; this.played = -1; }
  reset(kind, releaseAfterUpload = false) {
    this.frames.clear(); this.played = -1; this.latest = -1; this.kind = kind;
    this.releaseAfterUpload = releaseAfterUpload;
    this.source = document.getElementById('stream-source');
    this.control = document.getElementById('stream-control');
    this.label = document.getElementById('stream-comparison-status');
    this.disabled = !this.source || !this.control || !this.label;
    if (this.disabled) return;
    const sourceTitle = document.getElementById('stream-source-title'), outputTitle = document.getElementById('stream-output-title');
    if (sourceTitle) sourceTitle.textContent = releaseAfterUpload ? '最新采集的原始画面' : '同帧原始画面';
    if (outputTitle) outputTitle.textContent = releaseAfterUpload ? 'Krea 渲染结果（延迟播放）' : '同帧 Krea 渲染结果';
    document.getElementById('stream-control-title').textContent = kind === 'depth' ? '模型输入深度（原始灰度）' : '送入后端的 RGB（后端转 Canny）';
    for (const canvas of [this.source, this.control]) { canvas.width=640; canvas.height=384; canvas.getContext('2d').clearRect(0,0,640,384); }
    this.label.textContent = releaseAfterUpload ? '实时输入预览：上传成功即释放缓存；生成结果独立延迟播放，不作同帧对照' : '等待采集；输出到达后，三栏显示相同序号的帧';
  }
  get full() { return !this.disabled && this.frames.size >= this.limit; }
  add(index, rgb, control, camera) {
    if (this.disabled) return;
    if (this.full) throw Error('对照帧缓存已满');
    this.frames.set(index, { rgb: new Uint8ClampedArray(rgb), control: new Uint8ClampedArray(control), camera });
    this.latest = index;
    if (this.releaseAfterUpload || this.played < 0) this.draw(index, false);
  }
  releaseUploaded(index) {
    if (this.releaseAfterUpload) for (const key of this.frames.keys()) if (key <= index) this.frames.delete(key);
  }
  draw(index, matched=true) {
    if (this.disabled) return;
    if (this.releaseAfterUpload && matched) {
      this.played = index;
      this.label.textContent = `实时输入第 ${this.latest+1} 帧 · 生成结果第 ${index+1} 帧（上传后已释放输入缓存，非同帧对照）`;
      return;
    }
    const frame=this.frames.get(index);
    if (!frame) throw Error(`缺少输入对照帧 ${index}`);
    this.lastCamera=frame.camera;
    this.source.getContext('2d').putImageData(new ImageData(frame.rgb,640,384),0,0);
    this.control.getContext('2d').putImageData(new ImageData(frame.control,640,384),0,0);
    this.source.dataset.frameIndex=String(index); this.control.dataset.frameIndex=String(index);
    this.label.textContent=this.releaseAfterUpload ? `实时输入第 ${index+1} 帧 · ${this.played < 0 ? '等待生成结果' : `生成结果第 ${this.played+1} 帧`}（非同帧对照）` : matched ? `同帧对照：第 ${index+1} 帧 · ${(index/5).toFixed(1)} 秒（下方三维场景为当前实时状态，可能领先输出）` : `已采集第 ${index+1} 帧，等待渲染结果；此时左两栏为最新输入`;
    if (matched) { this.played=index; for (const key of this.frames.keys()) if (key<=index) this.frames.delete(key); }
  }
  clear() { this.frames.clear(); }
}
export const streamComparison = new StreamComparison();
