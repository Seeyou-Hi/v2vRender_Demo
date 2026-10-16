export class StreamSender {
  constructor(backend, onError, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    this.backend = backend; this.onError = onError; this.sleep = sleep;
    this.queue = []; this.sequence = 0; this.running = false; this.error = null;
  }
  get full() { return this.queue.length >= 2; }
  enqueue(frames, onAccepted = () => {}) {
    if (this.error) throw this.error;
    if (this.full) throw Error('流式输入队列已满');
    this.queue.push({ sequence: this.sequence++, body: new Blob(frames, { type: 'application/octet-stream' }), onAccepted });
    if (!this.running) { this.running = true; this.promise = this.drain(); }
  }
  async drain() {
    try {
      while (this.queue.length) {
        const item = this.queue[0]; let failures = 0;
        while (true) {
          try { await this.backend.pushStream(item.sequence, item.body); break; }
          catch (error) {
            if (error.status !== 429 && (++failures > 2 || error.status)) throw error;
            await this.sleep(1000);
          }
        }
        item.onAccepted();
        this.queue.shift();
      }
    } catch (error) { this.error = error; this.onError(error); }
    finally { this.running = false; }
  }
  async idle() { await this.promise; if (this.error) throw this.error; }
}
