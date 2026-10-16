"""Preloaded four-GPU worker; jobs arrive over the shared filesystem from the HTTP service."""
import argparse,json,os,sys,time,traceback
from pathlib import Path
import numpy as np
import torch
import torch.distributed as dist
import render

def atomic(path,value):
 t=path.with_suffix('.tmp');t.write_text(json.dumps(value,indent=2));t.replace(path)
def main():
 p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--queue',required=True);a=p.parse_args()
 q=Path(a.queue);rank=int(os.environ['RANK']);torch.cuda.set_device(int(os.environ['LOCAL_RANK']));dist.init_process_group('nccl');context={}
 assert dist.get_world_size()==4
 if rank==0:
  q.mkdir(parents=True,exist_ok=True)
  for name in ['tasks','results']:(q/name).mkdir(exist_ok=True)
  atomic(q/'status.json',dict(status='loading',gpus=4,job_id=os.environ.get('SLURM_JOB_ID')))
  np.save(q/'warmup.npy',np.zeros((9,384,640,3),np.uint8))
 dist.barrier()
 try:
  sys.argv=['render.py','--config',a.config,'--control',str(q/'warmup.npy'),'--variant','bf16_blocks','--output',str(q/'warmup_render')]
  render.main(context)
  if rank==0:atomic(q/'status.json',dict(status='ready',gpus=4,job_id=os.environ.get('SLURM_JOB_ID'),loaded_once=True))
  last_heartbeat=time.monotonic()
  while True:
   message=[None]
   if rank==0:
    if (q/'stop').exists():message[0]={'stop':True}
    else:
     tasks=sorted((q/'tasks').glob('*.json'))
     if tasks:
      task=tasks[0];message[0]=dict(id=task.stem,**json.loads(task.read_text()))
     else:message[0]={'idle':True}
   dist.broadcast_object_list(message,src=0);task=message[0]
   if task.get('stop'):
    if rank==0:atomic(q/'status.json',dict(status='stopped',gpus=4,job_id=os.environ.get('SLURM_JOB_ID')))
    break
   # All ranks must participate while idle. Previously ranks 1-3 waited in
   # NCCL while rank 0 waited for a request, causing a timeout after 10 min.
   if task.get('idle'):
    if rank==0 and time.monotonic()-last_heartbeat>=5:
     atomic(q/'status.json',dict(status='ready',gpus=4,job_id=os.environ.get('SLURM_JOB_ID'),loaded_once=True,heartbeat_unix=time.time()))
     last_heartbeat=time.monotonic()
    time.sleep(1);continue
   if rank==0:atomic(q/'status.json',dict(status='busy',gpus=4,job_id=os.environ.get('SLURM_JOB_ID'),session=task['id'],loaded_once=True))
   error=None
   try:
    sys.argv=['render.py']+task['argv'];render.main(context)
   except Exception:error=traceback.format_exc()
   errors=[None]*4;dist.all_gather_object(errors,error)
   if rank==0:
    atomic(q/'results'/f"{task['id']}.json",dict(status='failed' if any(errors) else 'completed',returncode=1 if any(errors) else 0,error=next((e for e in errors if e),None),resident_reused=True))
    (q/'tasks'/f"{task['id']}.json").unlink()
    atomic(q/'status.json',dict(status='ready',gpus=4,job_id=os.environ.get('SLURM_JOB_ID'),loaded_once=True))
   dist.barrier()
 except BaseException:
  if rank==0:atomic(q/'status.json',dict(status='failed',error=traceback.format_exc()))
  raise
 finally:
  dist.destroy_process_group()
if __name__=='__main__':main()
