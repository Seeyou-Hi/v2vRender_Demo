"""Small upload/job/download adapter. One GPU job at a time; no framework dependency."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import uuid
import time
from urllib.parse import urlsplit,parse_qs
from config import ROOT,load_config
from prompt_policy import POLICY,compose_prompt
from stream_input import StreamInbox,InboxError,FRAME_BYTES

ID=re.compile(r'^[0-9a-f]{32}$')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config',required=True)
    p.add_argument('--host',default='127.0.0.1')
    p.add_argument('--port',type=int,default=8001)
    p.add_argument('--gpus',type=int,choices=[1,2,4],default=1)
    p.add_argument('--storage',type=Path,default=ROOT/'outputs/api')
    p.add_argument('--resident-dir',type=Path,help='Shared task directory of preloaded four-GPU worker')
    p.add_argument('--max-upload-mb',type=int,default=512)
    args=p.parse_args();config=Path(args.config).resolve();load_config(config)
    storage=args.storage.resolve();storage.mkdir(parents=True,exist_ok=True)
    uploads=storage/'uploads';uploads.mkdir(exist_ok=True)
    if args.resident_dir:args.resident_dir=args.resident_dir.resolve()
    jobs={};streams={};lock=threading.Lock();executor=ThreadPoolExecutor(max_workers=1)
    def update(job,**values):
        with lock:
            jobs[job].update(values)
            temporary=storage/job/'job.tmp'
            temporary.write_text(json.dumps(jobs[job],indent=2))
            temporary.replace(storage/job/'job.json')
    def run(job,request):
        directory=storage/job
        try:
            if (directory/'incoming/cancel').exists():
                update(job,status='failed',error='Stream cancelled before launch');return
            update(job,status='running')
            policy=compose_prompt(request.get('prompt',''))
            (directory/'prompt_policy.json').write_text(json.dumps(policy,indent=2))
            prompt=directory/'prompt.txt';prompt.write_text(policy['effective_prompt'])
            stream=jobs[job].get('mode')=='stream'
            cmd=[sys.executable,'-m','torch.distributed.run','--standalone',f'--nproc_per_node={args.gpus}',str(ROOT/'scripts/render.py'),
                 '--config',str(config),
                 '--control-kind',request.get('control_kind','depth'),'--variant',request.get('variant','bf16'),
                 '--prompt-file',str(prompt),'--output',str(directory/'render'),'--write-chunks']
            cmd+=['--stream-dir',str(directory/'incoming')] if stream else ['--control',str(uploads/request['control'])]
            if stream:
                cmd+=['--input-fps',str(request.get('input_fps',16)),'--output-mode',request.get('output_mode','video'),'--frame-format',request.get('frame_format','png'),'--save-mp4' if request.get('save_mp4',request.get('output_mode','video')=='video') else '--no-save-mp4']
            if request.get('reference') and not stream:cmd+=['--reference',str(uploads/request['reference'])]
            if args.resident_dir:
                task=args.resident_dir/'tasks'/f'{job}.json';task.parent.mkdir(exist_ok=True)
                temporary=task.with_suffix('.tmp');temporary.write_text(json.dumps(dict(argv=cmd[cmd.index(str(ROOT/'scripts/render.py'))+1:])));temporary.replace(task)
                result_path=args.resident_dir/'results'/f'{job}.json'
                while not result_path.exists():
                    state_path=args.resident_dir/'status.json'
                    if state_path.exists() and json.loads(state_path.read_text()).get('status')=='failed':raise RuntimeError('Resident worker failed; inspect resident worker.log')
                    time.sleep(.1)
                result=json.loads(result_path.read_text());update(job,**result)
            else:
                with (directory/'worker.log').open('w') as log:
                    result=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
                update(job,status='completed' if result.returncode==0 else 'failed',returncode=result.returncode)
        except Exception as exc:update(job,status='failed',error=str(exc))
    class Handler(BaseHTTPRequestHandler):
        def reply(self,status,obj):
            body=json.dumps(obj).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_POST(self):
            try:
                length=int(self.headers.get('Content-Length','0'))
                frame_route=re.fullmatch(r'/streams/([0-9a-f]{32})/frames/(\d{6})',self.path)
                limit=12*FRAME_BYTES if frame_route else args.max_upload_mb*1024*1024 if self.path.startswith('/uploads/') else 1024*1024
                if length<=0 or length>limit:return self.reply(413,{'error':'Missing/invalid Content-Length or upload too large'})
                stream_route=re.fullmatch(r'/streams/([0-9a-f]{32})/(finish|cancel)',self.path)
                if frame_route or stream_route:
                    match=frame_route or stream_route;job=match[1]
                    if job not in streams:return self.reply(404,{'error':'Unknown stream'})
                    body=self.rfile.read(length)
                    if len(body)!=length:raise ValueError('Truncated input')
                    with lock:state=dict(jobs[job])
                    if state['status'] in ('failed','completed'):
                        return self.reply(409,{'error':'Session no longer accepts input'})
                    try:
                        if frame_route:result=streams[job].accept(int(match[2]),body)
                        elif match[2]=='finish':result=streams[job].finish()
                        else:streams[job].cancel();result={'cancelled':True}
                    except InboxError as exc:return self.reply(exc.status,{'error':str(exc)})
                    update(job,**result)
                    return self.reply(200,result)
                if self.path.startswith('/uploads/'):
                    suffix=self.path[len('/uploads/'):]
                    if suffix not in ('mp4','npy','png','jpg','jpeg'):return self.reply(400,{'error':'Supported upload types: mp4,npy,png,jpg,jpeg'})
                    name=uuid.uuid4().hex+'.'+suffix;dest=uploads/name
                    with dest.open('xb') as f:
                        remaining=length
                        while remaining:
                            chunk=self.rfile.read(min(1024*1024,remaining))
                            if not chunk:raise ValueError('Truncated upload')
                            f.write(chunk);remaining-=len(chunk)
                    return self.reply(201,{'upload':name})
                if self.path not in ('/jobs','/streams'):return self.reply(404,{'error':'Not found'})
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict):raise ValueError('Job request must be a JSON object')
                if args.resident_dir:
                    state_path=args.resident_dir/'status.json'
                    ready=json.loads(state_path.read_text()) if state_path.exists() else {}
                    if ready.get('status') not in ('ready','busy'):return self.reply(503,{'error':'模型正在预加载，请稍后重试'})
                    if request.get('variant','bf16_blocks')!='bf16_blocks':raise ValueError('Resident worker uses bf16_blocks')
                    request['variant']='bf16_blocks'
                if request.get('variant','bf16') not in ('bf16','bf16_blocks'):raise ValueError('Invalid variant')
                if request.get('control_kind','depth') not in ('depth','canny'):raise ValueError('Invalid control_kind')
                if not isinstance(request.get('prompt',''),str):raise ValueError('prompt must be text')
                if self.path=='/streams':
                    input_format=request.get('input_format','rgb24')
                    if input_format not in ('rgb24','gray8'):raise ValueError('Invalid input_format')
                    if input_format=='gray8' and request.get('control_kind','depth')!='depth':raise ValueError('gray8 requires depth control')
                    fps=request.get('input_fps',16)
                    if type(fps) not in (int,float) or fps not in (5,16):raise ValueError('input_fps must be 5 or 16')
                    fps=int(fps)
                    mode=request.get('output_mode','video');fmt=request.get('frame_format','png')
                    mp4=request.get('save_mp4',mode=='video')
                    if mode not in ('video','frames') or fmt not in ('png','jpeg'):raise ValueError('Invalid output_mode or frame_format')
                    if type(mp4) is not bool:raise ValueError('save_mp4 must be boolean')
                    if mode=='video' and not mp4:raise ValueError('video mode requires save_mp4=true')
                    job=uuid.uuid4().hex;(storage/job).mkdir()
                    streams[job]=StreamInbox(storage/job/'incoming',input_format=input_format)
                    with lock:jobs[job]=dict(id=job,status='queued',backend='krea',mode='stream',input_format=input_format,input_fps=fps,fps=fps,output_mode=mode,frame_format=fmt,save_mp4=mp4,variant=request.get('variant','bf16'),received_frames=0)
                    update(job);executor.submit(run,job,dict(request,stream=True))
                    return self.reply(202,{'id':job,'status_url':f'/streams/{job}','first_frames':9,'chunk_frames':12,'fps':fps,'input_fps':fps,'max_frames':4800,'input_format':input_format,'queue_capacity':4,'output_mode':mode,'frame_format':fmt,'save_mp4':mp4,'frames_url':f'/streams/{job}/frames'})
                for key in ('control','reference'):
                    value=request.get(key)
                    if key=='reference' and not value:continue
                    if not isinstance(value,str) or not re.fullmatch(r'[0-9a-f]{32}\.(mp4|npy|png|jpg|jpeg)',value) or not (uploads/value).is_file():raise ValueError(f'Invalid {key} upload')
                if not request['control'].endswith(('.mp4','.npy')):raise ValueError('control must be mp4 or prepared npy')
                if request.get('reference') and not request['reference'].endswith(('.png','.jpg','.jpeg')):raise ValueError('reference must be image')
                job=uuid.uuid4().hex;(storage/job).mkdir()
                with lock:jobs[job]=dict(id=job,status='queued',backend='krea',variant=request.get('variant','bf16'))
                update(job);executor.submit(run,job,request)
                self.reply(202,{'id':job,'status_url':f'/jobs/{job}','output_url':f'/jobs/{job}/output.mp4'})
            except (ValueError,TypeError) as exc:self.reply(400,{'error':str(exc)})
        def do_GET(self):
            if self.path=='/prompt-policy':return self.reply(200,POLICY)
            if self.path=='/health':
                health={'backend':'krea','variants':['bf16','bf16_blocks'],'gpus':args.gpus,'stream_input':True,'frame_output':True,'first_frames':9,'chunk_frames':12,'fps':16,'supported_input_fps':[5,16],'supported_input_formats':['rgb24','gray8']}
                if args.resident_dir:
                    path=args.resident_dir/'status.json'
                    health['resident']=json.loads(path.read_text()) if path.exists() else {'status':'starting'}
                    health['variants']=['bf16_blocks']
                return self.reply(200,health)
            parsed=urlsplit(self.path)
            parts=parsed.path.strip('/').split('/')
            if len(parts)<2 or parts[0] not in ('jobs','streams') or not ID.fullmatch(parts[1]):return self.reply(404,{'error':'Not found'})
            job=parts[1];directory=storage/job
            with lock:state=dict(jobs[job]) if job in jobs else None
            if state is None:return self.reply(404,{'error':'Unknown job in this server session'})
            if len(parts)==3 and parts[0]=='streams' and parts[2]=='frames':
                try:
                    query=parse_qs(parsed.query)
                    after=int(query.get('after',['-1'])[0]);limit=int(query.get('limit',['128'])[0])
                    if after < -1 or not 1 <= limit <= 512:raise ValueError()
                except ValueError:return self.reply(400,{'error':'after >= -1; limit 1..512'})
                files=sorted(p for p in (directory/'render/frames').glob('*') if re.fullmatch(r'\d{6}\.(png|jpg)',p.name))
                selected=[p for p in files if int(p.stem)>after][:limit]
                frames=[dict(index=int(p.stem),timestamp_seconds=int(p.stem)/state.get('fps',16),url=f'/streams/{job}/frames/{p.name}') for p in selected]
                return self.reply(200,dict(frames=frames,next_after=frames[-1]['index'] if frames else after,available_frames=len(files),fps=state.get('fps',16),status=state['status']))
            if len(parts)==2:
                status=directory/'render/status.json'
                if status.exists():state['progress']=json.loads(status.read_text())
                state['chunks']=[p.name for p in sorted((directory/'render/chunks').glob('*.mp4')) if re.fullmatch(r'\d{6}\.mp4',p.name)]
                if state.get('output_mode')=='frames':state['frames_url']=f'/streams/{job}/frames'
                return self.reply(200,state)
            file=None;content_type='video/mp4'
            if len(parts)==3 and parts[2]=='output.mp4' and state['status']=='completed':file=directory/'render/output.mp4'
            if len(parts)==4 and parts[2]=='chunks' and re.fullmatch(r'\d{6}\.mp4',parts[3]):file=directory/'render/chunks'/parts[3]
            if len(parts)==4 and parts[0]=='streams' and parts[2]=='frames' and re.fullmatch(r'\d{6}\.(png|jpg)',parts[3]):
                file=directory/'render/frames'/parts[3]
                content_type='image/png' if file.suffix=='.png' else 'image/jpeg'
            if file is None or not file.is_file():return self.reply(404,{'error':'Output not ready'})
            self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(file.stat().st_size));self.end_headers()
            with file.open('rb') as f:
                while block:=f.read(1024*1024):self.wfile.write(block)
    print(f'Krea adapter listening on {args.host}:{args.port}',flush=True)
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    try:server.serve_forever()
    finally:server.server_close();executor.shutdown(wait=True)

if __name__=='__main__':main()
