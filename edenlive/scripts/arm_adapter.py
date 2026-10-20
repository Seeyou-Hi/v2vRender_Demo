"""Original MG4 arm simulator as EdenLive's frame source and HTTP extension."""
import asyncio,threading,time,mimetypes
from dataclasses import replace
from pathlib import Path
from aiohttp import web
from arm_source import ArmGame,controls
from arm_semantics import ArmSemantics
import arm_experiment as experiment
from eden.apps.game2v import game_renderer
from flashdreams.runtime_v2.serving.extensions import register_http_extension
BASE=Path(__file__).resolve().parents[1]
SOURCE=None
STATE={}
ACTIVE_RENDERER=None
class ArmRenderer:
 def __init__(self,slug,*,width,height,games_root=None):
  global SOURCE,STATE,ACTIVE_RENDERER
  STATE={}
  ACTIVE_RENDERER=self
  self.dynamic=experiment.SETTINGS['dynamic'];self.semantics=ArmSemantics()
  case=experiment.SETTINGS['test_case']
  self.recorder=experiment.Recorder(case,self.dynamic) if case!='off' else None
  if case=='off':experiment.STATUS.clear();experiment.STATUS.update(dynamic=self.dynamic,case='off')
  if (width,height)!=(1280,704):raise ValueError('Arm input requires 1280x704')
  self.source=experiment.ReplayGame() if case in ('static','dynamic','static-repeat') else ArmGame(BASE,fps=24,log_path=BASE/'logs/capture.log',asset_root=BASE/'simulator',options={'proxy':'semantic' if slug=='robotarm-photoreal' else 'rgb'});SOURCE=self.source
  if case=='capture':
   (experiment.OUT/'input/renderer.json').write_text(__import__('json').dumps(self.source.hello,indent=2));self.source.send({'sequence':1,'keys':[],'actions':['demo'],'events':[]})
  self.cancel=threading.Event();self.last_evaluate_s=self.last_decode_s=0.;self.webgl_renderer=self.source.hello['renderer']
 def render_chunk(self,chunk,*,duration_s=0.,drain_events=None):
  global STATE
  start=time.perf_counter();frames=[];samples=[];images_for_record=[];elapsed=0.
  for i,packet in enumerate(chunk.frames):
   if drain_events:drain_events()
   t=time.perf_counter();images,states=self.source.next(self.cancel);render=images[0,:,:,:3].copy();STATE=states[0];elapsed+=time.perf_counter()-t
   samples.append(states[0]);images_for_record.append(render)
   frames.append(replace(packet,ui_frame=render,ui_state={'source_frame':states[0]['frame']},condition_frame=render if packet.capture_condition else None))
   game_renderer._sleep_until_frame_deadline(started_at=start,frame_index=i,frame_count=len(chunk.frames),duration_s=duration_s)
  semantic_events=self.semantics.summarize(samples)
  if self.dynamic:frames[-1]=replace(frames[-1],ui_state=dict(frames[-1].ui_state,events=semantic_events))
  STATE=dict(samples[-1],semantic_events=semantic_events,dynamic_prompt=self.dynamic)
  if self.recorder:self.recorder.input_chunk(images_for_record,samples,semantic_events)
  self.last_evaluate_s=elapsed;return replace(chunk,frames=tuple(frames))
 def probe(self,*,drain_events=None):return {}
 def close(self):
  global SOURCE
  self.cancel.set();self.source.close();SOURCE=None
  if self.recorder:self.recorder.close()
async def handler(request,tail):
 if tail=='prompt-state':return web.json_response(dict(experiment.STATUS,settings=experiment.SETTINGS))
 if tail=='prompt-mode':
  if request.method!='POST':raise web.HTTPMethodNotAllowed(request.method,['POST'])
  value=await request.json()
  if set(value)!={'dynamic'} or type(value['dynamic'])is not bool:raise web.HTTPBadRequest(text='Expected dynamic boolean')
  experiment.SETTINGS['dynamic']=value['dynamic'];return web.json_response(experiment.SETTINGS)
 if tail=='test-run':
  if request.method!='POST':raise web.HTTPMethodNotAllowed(request.method,['POST'])
  value=await request.json();case=value.get('case')
  if set(value)!={'case'} or case not in ('off','capture','static','dynamic','static-repeat'):raise web.HTTPBadRequest(text='Unknown test case')
  if case in ('static','dynamic','static-repeat') and not (experiment.OUT/'input/DONE.json').is_file():raise web.HTTPConflict(text='Input capture incomplete')
  experiment.SETTINGS.update(test_case=case,dynamic=case not in ('static','static-repeat'));return web.json_response(experiment.SETTINGS)
 if tail=='control':
  ws=web.WebSocketResponse(max_msg_size=16384,heartbeat=20);await ws.prepare(request)
  async def states():
   last=-1
   while not ws.closed:
    if STATE and STATE['frame']!=last:
     await ws.send_json(STATE);last=STATE['frame']
    await asyncio.sleep(.04)
  task=asyncio.create_task(states())
  try:
   async for msg in ws:
    if msg.type==web.WSMsgType.TEXT:
     value=controls(__import__('json').loads(msg.data))
     if SOURCE:SOURCE.send(value)
  finally:
   task.cancel()
   if SOURCE:SOURCE.send({'sequence':0,'keys':[],'events':[],'actions':[]})
  return ws
 root=BASE/'simulator' if tail.startswith('sim/') else BASE/'web'
 rel=tail[4:] if tail.startswith('sim/') else tail or 'index.html'
 path=(root/rel).resolve()
 if not path.is_relative_to(root.resolve()) or not path.is_file():raise web.HTTPNotFound()
 if tail=='sim/index.html':
  html=path.read_text().replace('</body>', '<script>if(new URLSearchParams(location.search).has("remote")){const l=document.createElement("link");l.rel="stylesheet";l.href="remote-ui.css";document.head.append(l);import("./remote-ui.js");}</script></body>')
  return web.Response(text=html,content_type='text/html')
 return web.FileResponse(path,headers={'Cache-Control':'no-store'})
game_renderer.GameRenderer=ArmRenderer
register_http_extension('arm',handler)

# Cold compile time is not a useful simulation capture cadence. Keep warmup
# capture bounded; preserve the official measured cadence in steady state.
from eden.apps.game2v import session as game_session
_original_pace_duration=game_session._pace_duration_s
def _arm_pace_duration(state,step_index):
 value=_original_pace_duration(state,step_index)
 return min(value,2.0) if state.ar_index<max(6,state.config.warmup_blocks) else value
game_session._pace_duration_s=_arm_pace_duration

experiment.install_hooks()
