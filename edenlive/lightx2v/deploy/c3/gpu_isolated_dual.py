import os,sys,json,re,subprocess
from pathlib import Path
R=Path('/home/test01/siyuheng/edenlive').resolve()
assert os.environ.get('SLURM_JOB_ID') and os.environ.get('SLURMD_NODENAME')=='c3'
assert os.environ.get('SLURM_GPUS_ON_NODE')=='2'
cvd=os.environ['CUDA_VISIBLE_DEVICES'];assert len(cvd.split(','))==2
rows=subprocess.check_output(['nvidia-smi','--query-gpu=uuid,pci.bus_id','--format=csv,noheader'],text=True).strip().splitlines();assert len(rows)==2
minors=[];uuids=[]
for row in rows:
 uuid,bus=[x.strip() for x in row.split(',')]
 info=(Path('/proc/driver/nvidia/gpus')/bus.lower()[-12:]/'information').read_text()
 fields={k:v.strip() for k,v in (line.split(':',1) for line in info.splitlines() if ':' in line)}
 assert fields['GPU UUID']==uuid
 minors.append(int(fields['Device Minor']));uuids.append(uuid)
allocation=os.environ.get('SLURM_STEP_GPUS') or os.environ.get('SLURM_JOB_GPUS')
assert set(map(int,allocation.split(',')))==set(minors),(allocation,minors)
print(json.dumps({'job':os.environ['SLURM_JOB_ID'],'cvd':cvd,'allocation':allocation,'minors':minors,'uuids':uuids}),flush=True)
uuid=','.join(uuids);minor=','.join(map(str,minors))
for rel in ['downloads/tmp','downloads/cuda-cache','downloads/triton-cache','results/gpu_tests']:(R/rel).mkdir(parents=True,exist_ok=True)
env={k:v for k,v in os.environ.items() if k not in ['PYTHONPATH','PYTHONHOME','LD_LIBRARY_PATH','CONDA_PREFIX'] and k.lower() not in ['http_proxy','https_proxy','all_proxy']}
env.update(EDEN_CVD=cvd,EDEN_GPU_UUID=uuid,EDEN_GPU_MINOR=str(minor),EDEN_PARENT_NET=os.readlink('/proc/self/ns/net'),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',PYTHONNOUSERSITE='1',PYTHONDONTWRITEBYTECODE='1',TMPDIR=str(R/'downloads/tmp'),XDG_CACHE_HOME=str(R/'downloads/cache'),CUDA_CACHE_PATH=str(R/'downloads/cuda-cache'),TRITON_CACHE_DIR=str(R/'downloads/triton-cache'))
bw=['bwrap','--ro-bind','/','/','--bind',str(R),str(R),'--ro-bind',str(R/'models'),str(R/'models'),'--bind',str(R/'downloads/tmp'),'/tmp','--dev','/dev','--proc','/proc','--unshare-net','--die-with-parent']
for name in ['nvidia'+str(m) for m in minors]+['nvidiactl','nvidia-uvm','nvidia-uvm-tools']:
 p=Path('/dev')/name;assert p.exists();bw+=['--dev-bind',str(p),str(p)]
args=sys.argv[1:];assert args and args.pop(0)=='--'
raise SystemExit(subprocess.call(bw+['--']+args,env=env))
