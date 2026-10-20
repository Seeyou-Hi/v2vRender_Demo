"""Replace only the native game's frame source; preserve official model/output.
Server-local headless Three.js owns simulation/assets. Browser clients send only
controls through the official session WS; no client RGB upload/old demo queue.
One block of lookahead, first frame then four, matching official RacingGame.
"""
import asyncio,json,os,queue,subprocess,threading,time
from pathlib import Path
import numpy as np
from aiohttp import web
BASE=Path(__file__).resolve().parents[1]
class ArmGame:
 def __init__(self,root,*,fps,log_path,asset_root,options=None,prepare=None):
  self.options=options or {};self.fps=fps;self.prepare=prepare;self.closed=threading.Event();self.ready=threading.Event()
  self.credit=threading.Semaphore(0);self.queue=queue.Queue(maxsize=1);self.error=self.ended=None
  self.lock=threading.Lock();self.control={'sequence':0,'keys':[],};self.actions=[];self.events=[];self.control_at=time.monotonic()
  self.received=0;self.process=None;self.ws=None;self.frame_future=None;self.frame_meta=None
  self.log=open(log_path,'ab');self.loop=asyncio.new_event_loop()
  self.thread=threading.Thread(target=self._thread,daemon=True,name='arm-native-source');self.thread.start()
  if not self.ready.wait(35):self.close();raise TimeoutError('Arm browser did not initialize; inspect game log')
  if self.error:self.close();raise RuntimeError(str(self.error))
 def _thread(self):
  asyncio.set_event_loop(self.loop)
  try:self.loop.run_until_complete(self._run())
  except BaseException as exc:
   if not self.closed.is_set():self.error=exc;self.log.write((repr(exc)+'\n').encode());self.log.flush()
  finally:self.ready.set();self.loop.close()
 async def _capture(self,request):
  if self.ws is not None:raise web.HTTPConflict()
  ws=web.WebSocketResponse(max_msg_size=1280*704*4+131072,compress=False);await ws.prepare(request);self.ws=ws
  async for msg in ws:
   if msg.type==web.WSMsgType.TEXT:
    meta=json.loads(msg.data)
    if meta.get('type')=='hello':
     self.hello=dict(meta,game_options={'kind':'mechanical_arm'},first_chunk=9,chunk=12,fps=self.fps)
     (BASE/'logs/capture-renderer.json').write_text(json.dumps(self.hello,indent=2))
     if not meta['hardware']:self.error=RuntimeError('Hardware WebGL required: '+meta['renderer'])
     self.ready.set()
    elif meta.get('type')=='error':
     if self.frame_future and not self.frame_future.done():self.frame_future.set_exception(RuntimeError(str(meta)))
    else:self.frame_meta=meta
   elif msg.type==web.WSMsgType.BINARY:
    if len(msg.data)!=1280*704*4 or not self.frame_future or self.frame_future.done():raise ValueError('Unexpected raw frame')
    self.frame_future.set_result((msg.data,self.frame_meta));self.frame_meta=None
  if not self.closed.is_set():self.error=RuntimeError('Arm capture browser disconnected')
  return ws
 async def _run(self):
  app=web.Application(client_max_size=1280*704*4+16384)
  app.router.add_get('/capture',self._capture);app.router.add_static('/sim/',str(BASE/'simulator'))
  runner=web.AppRunner(app,access_log=None);await runner.setup();site=web.TCPSite(runner,'127.0.0.1',0);await site.start()
  port=site._server.sockets[0].getsockname()[1]
  chrome=Path(os.environ.get('EDEN_CHROME') or __import__('shutil').which('google-chrome') or __import__('shutil').which('chromium') or '')
  if not chrome.is_file():raise RuntimeError('Set EDEN_CHROME to a Chrome/Chromium executable; see README.md')
  vendor=BASE/'runtime/egl-nvidia.json';vendor.write_text(json.dumps({'file_format_version':'1.0.0','ICD':{'library_path':'libEGL_nvidia.so.0'}}));os.environ['__EGL_VENDOR_LIBRARY_FILENAMES']=str(vendor)
  # ANGLE EGL talks only to the Slurm-assigned NVIDIA device. Software is rejected.
  args=[str(chrome),'--headless','--remote-debugging-port=0','--disable-crash-reporter','--crash-dumps-dir='+str(BASE/'runtime/crash'),'--no-sandbox','--disable-dev-shm-usage','--no-proxy-server','--no-first-run','--disable-background-networking','--disable-extensions','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl-egl','--enable-webgl','--window-size=1000,700','--user-data-dir='+str(BASE/'runtime'/('chrome-'+str(os.getpid()))),f'http://127.0.0.1:{port}/sim/index.html?proxy='+self.options.get('proxy','rgb')]
  config=BASE/'runtime/chrome-config';config.mkdir(exist_ok=True);(BASE/'runtime/crash').mkdir(exist_ok=True)
  child_env=os.environ.copy();child_env['XDG_CONFIG_HOME']=str(config)
  self.process=subprocess.Popen(args,stdout=self.log,stderr=self.log,env=child_env)
  try:
   while not self.ready.is_set()and not self.closed.is_set():
    if self.process.poll()is not None:raise RuntimeError('Chrome exited '+str(self.process.returncode))
    await asyncio.sleep(.05)
   if self.error or self.closed.is_set():return
   next_at=time.monotonic()
   while not self.closed.is_set():
    await asyncio.to_thread(self.credit.acquire)
    if self.closed.is_set():break
    count=1;images=[];display=[];states=[];rgba=[]
    if self.prepare:self.prepare.begin()
    for _ in range(count):
     await asyncio.sleep(max(0,next_at-time.monotonic()));captured=time.monotonic();next_at=max(next_at+1/self.fps,captured)
     with self.lock:
      controls=dict(self.control,actions=self.actions[:],events=self.events[:]);self.actions.clear();self.events.clear()
      if time.monotonic()-self.control_at>.75:controls['keys']=[]
     self.frame_future=self.loop.create_future()
     await self.ws.send_json({'type':'frame','frame':self.received,'fps':self.fps,'controls':controls})
     pixels,state=await asyncio.wait_for(self.frame_future,10)
     if state['frame']!=self.received:raise ValueError('Frame/state alignment mismatch')
     state['capture_monotonic']=captured
     state['source_roundtrip_ms']=(time.monotonic()-captured)*1000
     image=np.frombuffer(pixels[:1280*704*4],np.uint8).reshape(704,1280,4)
     if self.prepare:images.append(self.prepare.frame(image))
     else:rgba.append(image)
     states.append(state);self.received+=1
    reference=self.prepare.finish(images)if self.prepare else np.stack(rgba)
    self.queue.put_nowait((reference,states))
  finally:
   if self.ws:await self.ws.close()
   await runner.cleanup()
   if self.process and self.process.poll()is None:
    self.process.terminate()
    try:await asyncio.to_thread(self.process.wait,5)
    except subprocess.TimeoutExpired:self.process.kill();await asyncio.to_thread(self.process.wait)
 def send(self,value):
  with self.lock:self.control_at=time.monotonic();self.control={k:v for k,v in value.items()if k not in ('actions','events')};self.actions.extend(value.get('actions',[]));self.actions=self.actions[-16:];self.events.extend(value.get('events',[]));self.events=self.events[-32:]
 def next(self,cancel):
  self.credit.release()
  while not cancel.is_set()and not self.closed.is_set():
   if self.error:raise RuntimeError('Arm source: '+str(self.error))from self.error
   try:value=self.queue.get(timeout=.1);return value
   except queue.Empty:pass
  return None
 def close(self):
  if self.closed.is_set():return
  self.closed.set();self.credit.release()
  if self.loop.is_running()and self.frame_future and not self.frame_future.done():self.loop.call_soon_threadsafe(self.frame_future.cancel)
  self.thread.join(timeout=12)
  if self.process and self.process.poll()is None:self.process.kill()
  if not self.thread.is_alive():self.log.close()

def controls(message):
 allowed={'sequence','keys','arm','actions','events'}
 if not isinstance(message,dict)or set(message)-allowed:raise ValueError('Invalid arm controls')
 seq=message.get('sequence');keys=message.get('keys',[]);arm=message.get('arm');actions=message.get('actions',[]);events=message.get('events',[])
 if type(seq)is not int or not 0<=seq<2**53 or arm is not None and(type(arm)is not int or arm not in (0,1)):raise ValueError('Invalid sequence/arm')
 if not isinstance(keys,list)or len(keys)>24 or any(k not in ['w','a','s','d','q','e','f','i','j','k','l','u','o','h','r','1','2','3','tab','arrowup','arrowdown','arrowleft','arrowright','z','x','shift']for k in keys):raise ValueError('Invalid key')
 if not isinstance(actions,list)or len(actions)>16 or any(a not in ['grip','reset','downward','demo','manual']for a in actions):raise ValueError('Invalid action')
 ids={'help','close-help','reset','position-control','downward','grip','solver-kind','gripper-kind','item-kind','item-style','physics-enabled','hold-orientation','speed','trail-toggle','grid-toggle','demo-mode','demo-play','demo-replay','demo-exit','demo-loop','wrist-arm'}
 if not isinstance(events,list)or len(events)>32:raise ValueError('Invalid event batch')
 for e in events:
  if not isinstance(e,dict)or set(e)-{'type','id','arm','view','joint','value','checked','x','y','buttons','delta'}:raise ValueError('Invalid UI event')
  if e.get('type')not in ['click','input','change','pointerdown','pointermove','pointerup','pointercancel','wheel']:raise ValueError('Invalid event type')
  if e['type'].startswith('pointer')or e['type']=='wheel':
   if any(type(e.get(k))not in (int,float)or not 0<=e[k]<=1 for k in ['x','y'])or abs(e.get('delta',0))>2000:raise ValueError('Invalid pointer')
  elif not(e.get('id')in ids or type(e.get('arm'))is int and e['arm']in(0,1)or e.get('view')in['perspective','wrist','front','ext1','top']or type(e.get('joint'))is int and 0<=e['joint']<6):raise ValueError('Unknown UI control')
  if 'value'in e and(not isinstance(e['value'],(str,int,float))or len(str(e['value']))>64):raise ValueError('Invalid UI value')
  if 'checked'in e and type(e['checked'])is not bool:raise ValueError('Invalid checkbox')
 return dict(sequence=seq,keys=keys,**({'arm':arm}if arm is not None else {}),actions=actions,events=events)
