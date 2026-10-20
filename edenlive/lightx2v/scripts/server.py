"""Two-rank EdenLive with native RTP video; bounded capture and sender queues."""
import os
os.environ.update(DTYPE='BF16',SENSITIVE_LAYER_DTYPE='BF16',TOKENIZERS_PARALLELISM='false',PROFILING_DEBUG_LEVEL='0',EDEN_DUAL_PROJECTION='1',EDEN_DUAL_GRAPH='1',NCCL_GRAPH_MIXING_SUPPORT='0')
import asyncio,threading,time,json,collections,concurrent.futures,queue
from pathlib import Path
from fractions import Fraction
import numpy as np
import torch
import torch.distributed as dist
from aiohttp import web
from aiortc import RTCPeerConnection,RTCConfiguration,RTCIceServer,RTCBundlePolicy,RTCRtpSender,VideoStreamTrack
from av import VideoFrame
from engine import Engine
from arm_source import ArmGame,controls
from arm_semantics import ArmSemantics
B=Path(__file__).resolve().parents[1];R=B.parents[1]
STOP=threading.Event();ACTIVE=threading.Event();RESTART=threading.Event();STATE={};METRICS={'status':'loading'};SETTINGS={'dynamic':True,'mode':'rgb'};SOURCE=None;APP_LOOP=None;TRACKS=set();PEERS=set();BASE_PROMPT=(B/'configs/prompt.txt').read_text().strip()
LOGS=queue.Queue(maxsize=256)
def log_record(kind,row):
 try:LOGS.put_nowait((kind,row))
 except queue.Full:METRICS['log_dropped']=METRICS.get('log_dropped',0)+1
def disk_writer():
 # NFS close/flush latency must never block GPU scheduling or the media loop.
 files={name:(B/'logs'/f'{name}.jsonl').open('a',buffering=65536) for name in ('chunks','browser')}
 last=time.monotonic()
 while True:
  try:
   kind,row=LOGS.get(timeout=.1);files[kind].write(json.dumps(row)+'\n')
  except queue.Empty:pass
  if time.monotonic()-last>=1:
   for f in files.values():f.flush()
   (B/'logs/realtime-performance.json').write_text(json.dumps(dict(METRICS),ensure_ascii=False,indent=2))
   last=time.monotonic()
class Track(VideoStreamTrack):
 def __init__(self):
  super().__init__();self.items=collections.deque();self.wake=asyncio.Event();self.next_at=0.;self.sent=0;self.dropped=0;self.epoch=time.monotonic();self.last_pts=-1
 def publish(self,frames,metadata,period):
  # A new completed chunk supersedes unsent old frames, never builds a backlog.
  self.dropped+=len(self.items);self.items.clear()
  now=time.monotonic()
  for i,rgb in enumerate(frames):
   perframe=dict(metadata,output_offset=i)
   samples=perframe.pop('input_samples',[])
   if samples:
    source=samples[min(i,len(samples)-1)];perframe.update(capture_monotonic=source['capture_monotonic'],input_sequence=source.get('input_sequence'),source_frame=source['frame'])
   self.items.append((rgb,perframe,now+i*period))
  self.wake.set()
 async def recv(self):
  while True:
   while not self.items:self.wake.clear();await self.wake.wait()
   rgb,meta,due=self.items[0];delay=due-time.monotonic()
   if delay>0:await asyncio.sleep(min(delay,.05));continue
   self.items.popleft();now=time.monotonic()
   f=VideoFrame.from_ndarray(rgb,format='rgb24');f.pts=max(self.last_pts+1,round((now-self.epoch)*90000));f.time_base=Fraction(1,90000);self.last_pts=f.pts;self.sent+=1
   METRICS.update(sender_queue=len(self.items),sender_dropped=self.dropped,sender_sent=self.sent,capture_to_send_ms=1000*(now-meta['capture_monotonic']))
   # Same RTP timestamp identifies the decoded browser frame through rVFC.
   payload=dict(meta,type='frame',send_monotonic=now)
   self.last_payload=payload
   return f
async def offer(request):
 value=await request.json();credential=(B/'runtime/turn-credential').read_text().strip()
 pc=RTCPeerConnection(RTCConfiguration(iceServers=[RTCIceServer(os.environ.get('EDEN_SERVER_TURN_URL','turn:127.0.0.1:24508?transport=tcp'),username='edenlive',credential=credential)],bundlePolicy=RTCBundlePolicy.MAX_COMPAT));PEERS.add(pc)
 @pc.on('datachannel')
 def channel(ch):
  pc.telemetry=ch
  @ch.on('message')
  def message(msg):
   try:
    v=json.loads(msg)
    if v.get('type')=='ping':ch.send(json.dumps({'type':'pong','client':v['client'],'server':time.monotonic()}))
    elif v.get('type')=='display':
     METRICS['browser']=v
     log_record('browser',v)
   except (ValueError,KeyError):pass
 @pc.on('connectionstatechange')
 async def changed():
  METRICS['connection']=pc.connectionState
  if pc.connectionState in ('failed','closed'):
   for sender in pc.getSenders():
    if sender.track:TRACKS.discard(sender.track)
   PEERS.discard(pc);await pc.close()
 await pc.setRemoteDescription(__import__('aiortc').RTCSessionDescription(sdp=value['sdp'],type=value['type']))
 track=Track();TRACKS.add(track);sender=pc.addTrack(track)
 # Observe the actual RTP timestamp AFTER aiortc's randomized timestamp origin.
 # Metadata travels on the same peer's data channel; there is no extra video path.
 transport=sender.transport;original_send=transport._send_rtp;last_stamp=[None]
 async def send_rtp(packet):
  if len(packet)>=12 and packet[0]>>6==2 and not 192<=packet[1]<=223:
   stamp=int.from_bytes(packet[4:8],'big')
   if stamp!=last_stamp[0] and hasattr(track,'last_payload'):
    last_stamp[0]=stamp;c=getattr(pc,'telemetry',None)
    if c and c.readyState=='open' and c.bufferedAmount<16384:
     c.send(json.dumps(dict(track.last_payload,rtpTimestamp=stamp,send_monotonic=time.monotonic())))
  await original_send(packet)
 transport._send_rtp=send_rtp
 codecs=[c for c in RTCRtpSender.getCapabilities('video').codecs if c.mimeType=='video/H264']
 for tr in pc.getTransceivers():
  if tr.sender==sender:tr.setCodecPreferences(codecs)
 await pc.setLocalDescription(await pc.createAnswer())
 return web.json_response({'sdp':pc.localDescription.sdp,'type':pc.localDescription.type})
async def ice(request):
 return web.json_response({'iceServers':[{'urls':os.environ.get('EDEN_BROWSER_TURN_URL','turn:127.0.0.1:24508?transport=tcp'),'username':'edenlive','credential':(B/'runtime/turn-credential').read_text().strip()}],'iceTransportPolicy':'relay'})
async def control(request):
 ws=web.WebSocketResponse(max_msg_size=16384,heartbeat=20,compress=False);await ws.prepare(request)
 async def states():
  last=-1
  while not ws.closed:
   if STATE and STATE['frame']!=last:await ws.send_json(STATE);last=STATE['frame']
   await asyncio.sleep(.025)
 task=asyncio.create_task(states())
 try:
  async for msg in ws:
   if msg.type==web.WSMsgType.TEXT:
    try:v=controls(json.loads(msg.data))
    except (ValueError,TypeError):continue
    if SOURCE:SOURCE.send(v)
 finally:
  task.cancel()
  if SOURCE:SOURCE.send({'sequence':0,'keys':[],'actions':[],'events':[]})
 return ws
async def command(request):
 v=await request.json()
 if v.get('action')=='stop':ACTIVE.clear();METRICS['status']='stopping'
 elif v.get('action')=='start':
  SETTINGS.update(dynamic=bool(v.get('dynamic',True)),mode=v.get('mode','rgb'));RESTART.set();ACTIVE.set()
 else:raise web.HTTPBadRequest()
 return web.json_response({'accepted':True})
async def metrics(request):return web.json_response(dict(METRICS))
async def static(request):
 tail=request.match_info.get('tail','') or 'index.html';root=B/'simulator' if tail.startswith('sim/') else B/'web';rel=tail[4:] if tail.startswith('sim/') else tail
 p=(root/rel).resolve()
 if not p.is_relative_to(root.resolve())or not p.is_file():raise web.HTTPNotFound()
 if tail=='sim/index.html':
  html=p.read_text().replace('</body>','<script>const l=document.createElement("link");l.rel="stylesheet";l.href="remote-ui.css";document.head.append(l);import("./remote-ui.js");</script></body>')
  return web.Response(text=html,content_type='text/html')
 return web.FileResponse(p,headers={'Cache-Control':'no-store'})
def serve():
 global APP_LOOP
 APP_LOOP=asyncio.new_event_loop();asyncio.set_event_loop(APP_LOOP)
 app=web.Application();app.router.add_post('/offer',offer);app.router.add_get('/ice',ice);app.router.add_get('/ext/arm/control',control);app.router.add_post('/command',command);app.router.add_get('/metrics',metrics);app.router.add_get('/{tail:.*}',static)
 web.run_app(app,host='127.0.0.1',port=int(os.environ.get('EDEN_LIGHT_PORT','18510')),loop=APP_LOOP,handle_signals=False,access_log=None)
def capture(source,count):
 global STATE
 images=[];states=[]
 for _ in range(count):
  packet=source.next(STOP)
  if packet is None:raise RuntimeError('Capture stopped')
  rgba,ss=packet;images.append(rgba[0,:,:,:3].copy());states.append(ss[0]);STATE=ss[0]
 # Wan temporal compression samples global frames 0,4,8 then 12,16,20...
 positions=[0,4,8] if count==9 else [3,7,11]
 return np.stack([images[i] for i in positions]),states,images
@torch.inference_mode()
def main():
 global SOURCE,STATE
 engine=Engine();rank=dist.get_rank();r=engine.r
 if rank==0:
  threading.Thread(target=disk_writer,daemon=True).start()
  threading.Thread(target=serve,daemon=True).start();METRICS.update(status='ready',gpu=torch.cuda.get_device_name(),cards=2)
 pool=concurrent.futures.ThreadPoolExecutor(max_workers=1)
 completed=collections.deque(maxlen=32)
 output_pool=concurrent.futures.ThreadPoolExecutor(max_workers=1)
 completed=collections.deque(maxlen=32)
 output_pending=None
 pending=None;semantic=ArmSemantics();cadence=.62
 copy_stream=torch.cuda.Stream() if rank==0 else None
 while not STOP.is_set():
  payload=[None]
  if rank==0:
   if RESTART.is_set() and SOURCE:
    if pending:pending.result();pending=None
    SOURCE.close();SOURCE=None
   if not ACTIVE.is_set():
    METRICS['status']='stopped';time.sleep(.05);payload[0]={'op':'idle'}
   else:
    fresh=RESTART.is_set()or SOURCE is None
    if fresh:
     RESTART.clear();semantic=ArmSemantics()
     SOURCE=ArmGame(B,fps=24,log_path=B/'logs/capture.log',asset_root=B/'simulator',options={'proxy':'semantic' if SETTINGS['mode']=='semantic' else 'rgb'})
     proxy,states,images=capture(SOURCE,9)
    else:proxy,states,images=pending.result();pending=None
    events=semantic.summarize(states);prompt=BASE_PROMPT
    if SETTINGS['dynamic']:prompt+=' '+' '.join(e['prompt'] for e in events)
    if fresh:
     if SETTINGS['mode']=='rgb':cover=images[0]
     else:
      from PIL import Image
      cover=np.asarray(Image.open(B/'configs/first-frame-photoreal-generated-v1.png').convert('RGB'))
    else:cover=None
    payload[0]={'op':'chunk','fresh':fresh,'prompt':prompt,'states':states,'cover':cover,'proxy':proxy,'events':events}
    # Exactly one successor capture overlaps inference. Never a queued old chunk.
    def next_capture(source=SOURCE,delay=max(0.,cadence-.5-.10)):
     if delay:time.sleep(delay)
     return capture(source,12)
    pending=pool.submit(next_capture)
  # Broadcast small control metadata separately from pixels. Sending numpy
  # RGB through broadcast_object_list incurs pickle + GPU->CPU roundtrips.
  p=payload[0] if rank==0 else None
  wire=[{k:p[k] for k in ('op','fresh','prompt') if k in p} if rank==0 else None]
  dist.broadcast_object_list(wire,src=0)
  if rank!=0:p=wire[0]
  if p['op']=='idle':continue
  if rank==0:proxy=torch.from_numpy(p['proxy']).permute(3,0,1,2).contiguous().to('cuda')
  else:proxy=torch.empty((3,3,704,1280),device='cuda',dtype=torch.uint8)
  dist.broadcast(proxy,src=0)
  if p['fresh']:
   if rank==0:
    cover=(torch.from_numpy(p['cover'].copy()).permute(2,0,1).float()/127.5-1).contiguous().to('cuda')
    # Reference images may have arbitrary resolution. Both NCCL ranks and
    # Wan VAE must receive the configured 704x1280 tensor, including photo mode.
    original_size=list(cover.shape[-2:])
    if original_size!=[704,1280]:
     cover=torch.nn.functional.interpolate(cover[None],size=(704,1280),mode='bilinear',align_corners=False)[0].contiguous()
    METRICS['cover_size']={'original_hw':original_size,'model_hw':list(cover.shape[-2:])}
   else:cover=torch.empty((3,704,1280),device='cuda',dtype=torch.float32)
   dist.broadcast(cover,src=0)
   engine.reset(cover,p['prompt'])
  pixels,tm=engine.chunk(proxy,p['prompt'])
  if rank==0:
   done=time.monotonic();frame_count=int(pixels.shape[2])
   if tm['index']==6:completed.clear()
   completed.append((done,frame_count))
   decoded_fps=sum(n for _,n in list(completed)[1:])/(completed[-1][0]-completed[0][0]) if len(completed)>1 else frame_count/tm['model_s']
   # Avoid pacing against noisy cold compilation times; adapt only resident steps.
   if tm['index']>=6:cadence=.8*cadence+.2*min(1.2,max(.48,tm['model_s']))
   ss=p['states'];meta={'chunk':tm['index'],'source_first':ss[0]['frame'],'source_last':ss[-1]['frame'],'input_sequence':ss[-1].get('input_sequence'),'capture_monotonic':ss[-1]['capture_monotonic'],'capture_first_monotonic':ss[0]['capture_monotonic'],'model_done_monotonic':done,'input_samples':[{'frame':x['frame'],'capture_monotonic':x['capture_monotonic'],'input_sequence':x.get('input_sequence')} for x in ss]}
   METRICS.update(tm,status='generating',model_fps=frame_count/tm['model_s'],decoded_fps=decoded_fps,prompt=p['prompt'],events=p['events'],renderer=SOURCE.hello,source_last=ss[-1]['frame'],capture_last_to_model_ms=(done-ss[-1]['capture_monotonic'])*1000)
   log_record('chunks',dict(tm,**meta))
   # Conversion/D2H and media handoff overlap the next input broadcast rather
   # than delaying both GPU ranks. Bound outstanding work to one output batch.
   if output_pending:output_pending.result()
   def output(pixels=pixels,meta=meta,period=cadence/frame_count):
    with torch.inference_mode():
     torch.cuda.set_device(0)
     with torch.cuda.stream(copy_stream):
      frames=pixels[0].permute(1,2,3,0).float().add(1).mul(127.5).clamp(0,255).round().byte().cpu().numpy()
    def publish():
     for track in tuple(TRACKS):track.publish(frames,meta,period)
    APP_LOOP.call_soon_threadsafe(publish)
   output_pending=output_pool.submit(output)
   if tm['index']<7:output_pending.result()
if __name__=='__main__':main()
