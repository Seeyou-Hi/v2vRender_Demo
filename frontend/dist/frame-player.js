import { streamComparison } from './stream-comparison.js';
// Bounded, ordered frame playback. Never skip frames or accelerate to catch up.
export class FramePlayer {
  constructor(canvas, api, session, request, onError) {
    Object.assign(this, { canvas, api, session, request, onError });
    this.queue = []; this.after = -1; this.played = 0; this.fps = 5;
    this.stopped = false; this.lastDraw = -Infinity; this.abort = new AbortController();
    canvas.dataset.playedFrames = '0'; canvas.width = 640; canvas.height = 384; canvas.hidden = false;
    this.context = canvas.getContext('2d'); this.context.clearRect(0, 0, 640, 384);
    this.tick = this.tick.bind(this); this.raf = requestAnimationFrame(this.tick); this.pull();
  }
  async pull() {
    if (this.stopped) return;
    try {
      if (this.queue.length < 24) {
        const state = await this.request(`/streams/${this.session}/frames?after=${this.after}&limit=${Math.min(12, 24-this.queue.length)}`);
        if (this.stopped) return;
        this.fps = state.fps;
        // Fetch up to six frames together, then publish in source order.
        // Promise.allSettled closes every completed bitmap if any fetch fails.
        for (let offset = 0; offset < state.frames.length; offset += 6) {
          const batch = state.frames.slice(offset, offset + 6);
          batch.forEach((frame, i) => {
            if (frame.index !== this.after + i + 1) throw Error('后端返回的帧序号不连续');
            if (!frame.url.startsWith(`/streams/${this.session}/frames/`)) throw Error('无效帧地址');
          });
          const results = await Promise.allSettled(batch.map(async frame => {
            const response = await fetch(this.api + frame.url, { signal: this.abort.signal });
            if (!response.ok) throw Error(`图片下载失败：${response.status}`);
            return { bitmap: await createImageBitmap(await response.blob()), index: frame.index };
          }));
          const failure = results.find(r => r.status === 'rejected');
          if (this.stopped || failure) {
            for (const r of results) if (r.status === 'fulfilled') r.value.bitmap.close();
            if (failure) throw failure.reason;
            return;
          }
          for (const r of results) { this.queue.push(r.value); this.after = r.value.index; }
        }
        if (state.status === 'failed') throw Error('后端渲染失败');
        this.finished = state.status === 'completed' && this.after + 1 >= state.available_frames;
      }
    } catch (error) { if (!this.stopped) { this.onError(error); this.stop(); } return; }
    if (!this.stopped && !this.finished) this.timer = setTimeout(() => this.pull(), 100);
  }
  tick(now) {
    if (this.stopped) return;
    if (!document.hidden && this.queue.length && now - this.lastDraw >= 1000 / this.fps) {
      const frame = this.queue.shift(); this.context.drawImage(frame.bitmap, 0, 0, 640, 384);
      streamComparison.draw(frame.index);
      frame.bitmap.close(); this.played = frame.index + 1; this.lastDraw = now;
      this.canvas.dataset.playedFrames = String(this.played);
    }
    if (this.finished && !this.queue.length) { this.stopped = true; return; }
    this.raf = requestAnimationFrame(this.tick);
  }
  stop() { streamComparison.clear(); this.stopped = true; clearTimeout(this.timer); cancelAnimationFrame(this.raf); this.abort.abort(); for (const f of this.queue) f.bitmap.close(); this.queue = []; }
}
