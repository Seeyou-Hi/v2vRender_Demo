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
from config import ROOT,load_config

ID=re.compile(r'^[0-9a-f]{32}$')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config',required=True)
    p.add_argument('--host',default='127.0.0.1')
    p.add_argument('--port',type=int,default=8001)
    p.add_argument('--gpus',type=int,choices=[2,4],default=4)
    p.add_argument('--storage',type=Path,default=ROOT/'outputs/api')
    p.add_argument('--max-upload-mb',type=int,default=512)
    args=p.parse_args();config=Path(args.config).resolve();load_config(config)
    storage=args.storage.resolve();storage.mkdir(parents=True,exist_ok=True)
    uploads=storage/'uploads';uploads.mkdir(exist_ok=True)
    jobs={};lock=threading.Lock();executor=ThreadPoolExecutor(max_workers=1)
    def update(job,**values):
        with lock:jobs[job].update(values)
        (storage/job/'job.json').write_text(json.dumps(jobs[job],indent=2))
    def run(job,request):
        directory=storage/job
        try:
            update(job,status='running')
            prompt=directory/'prompt.txt';prompt.write_text(request.get('prompt') or (ROOT/'configs/robot_realism.txt').read_text())
            cmd=[sys.executable,'-m','torch.distributed.run','--standalone',f'--nproc_per_node={args.gpus}',str(ROOT/'scripts/render.py'),
                 '--config',str(config),'--control',str(uploads/request['control']),
                 '--control-kind',request.get('control_kind','depth'),'--variant',request.get('variant','bf16'),
                 '--prompt-file',str(prompt),'--output',str(directory/'render'),'--write-chunks']
            if request.get('reference'):cmd+=['--reference',str(uploads/request['reference'])]
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
                limit=args.max_upload_mb*1024*1024 if self.path.startswith('/uploads/') else 1024*1024
                if length<=0 or length>limit:return self.reply(413,{'error':'Missing/invalid Content-Length or upload too large'})
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
                if self.path!='/jobs':return self.reply(404,{'error':'Not found'})
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict):raise ValueError('Job request must be a JSON object')
                if request.get('variant','bf16') not in ('bf16','bf16_blocks'):raise ValueError('Invalid variant')
                if request.get('control_kind','depth') not in ('depth','canny'):raise ValueError('Invalid control_kind')
                if not isinstance(request.get('prompt',''),str):raise ValueError('prompt must be text')
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
            if self.path=='/health':return self.reply(200,{'backend':'krea','variants':['bf16','bf16_blocks'],'gpus':args.gpus})
            parts=self.path.strip('/').split('/')
            if len(parts)<2 or parts[0]!='jobs' or not ID.fullmatch(parts[1]):return self.reply(404,{'error':'Not found'})
            job=parts[1];directory=storage/job
            with lock:state=dict(jobs[job]) if job in jobs else None
            if state is None:return self.reply(404,{'error':'Unknown job in this server session'})
            if len(parts)==2:
                status=directory/'render/status.json'
                if status.exists():state['progress']=json.loads(status.read_text())
                state['chunks']=[p.name for p in sorted((directory/'render/chunks').glob('*.mp4'))]
                return self.reply(200,state)
            file=None
            if len(parts)==3 and parts[2]=='output.mp4' and state['status']=='completed':file=directory/'render/output.mp4'
            if len(parts)==4 and parts[2]=='chunks' and re.fullmatch(r'\d{6}\.mp4',parts[3]):file=directory/'render/chunks'/parts[3]
            if file is None or not file.is_file():return self.reply(404,{'error':'Output not ready'})
            self.send_response(200);self.send_header('Content-Type','video/mp4');self.send_header('Content-Length',str(file.stat().st_size));self.end_headers()
            with file.open('rb') as f:
                while block:=f.read(1024*1024):self.wfile.write(block)
    print(f'Krea adapter listening on {args.host}:{args.port}',flush=True)
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    try:server.serve_forever()
    finally:server.server_close();executor.shutdown(wait=True)

if __name__=='__main__':main()
