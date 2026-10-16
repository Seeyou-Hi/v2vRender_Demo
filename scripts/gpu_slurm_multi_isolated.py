"""C3 allocated 2-GPU launcher. Preserves Slurm mask, driver identity, device and network isolation."""
import os,sys,json,re,subprocess,fcntl
from pathlib import Path
from contextlib import ExitStack
ROOT=Path(__file__).resolve().parents[1]
def validate_worker():
 import torch
 assert os.environ.get('SLURM_JOB_ID') and os.environ.get('FLOW_SLURM_MULTI_ISOLATED')=='1'
 assert os.environ['CUDA_VISIBLE_DEVICES']==os.environ['FLOW_SLURM_CVD'],'Slurm mask changed'
 records=json.loads(os.environ['FLOW_ALLOCATED_GPUS_JSON']);assert len(records)==2
 nodes=sorted('/dev/nvidia'+str(r['minor']) for r in records)
 visible=sorted(str(p) for p in Path('/dev').glob('nvidia*') if re.fullmatch(r'nvidia\d+',p.name))
 assert visible==nodes,('Unallocated GPU device nodes',visible,nodes)
 assert os.readlink('/proc/self/ns/net')!=os.environ['FLOW_PARENT_NET_NS']
 assert not Path('/proc/net/route').read_text().splitlines()[1:]
 interfaces={r.split(':')[0].strip() for r in Path('/proc/net/dev').read_text().splitlines()[2:]}
 assert interfaces<={'lo'},interfaces
 assert torch.cuda.device_count()==2
 devices=[]
 for i in range(2):
  props=torch.cuda.get_device_properties(i);uuid='GPU-'+str(props.uuid)
  match=[r for r in records if r['uuid']==uuid];assert len(match)==1
  devices.append(dict(match[0],cuda_index=i,gpu_name=props.name,total_memory=props.total_memory))
 assert {x['uuid'] for x in devices}=={x['uuid'] for x in records}
 return dict(job_id=os.environ['SLURM_JOB_ID'],cuda_visible_devices=os.environ['CUDA_VISIBLE_DEVICES'],devices=devices,device_nodes=nodes,offline_network=True,network_namespace=os.readlink('/proc/self/ns/net'),torch=torch.__version__,cuda_runtime=torch.version.cuda)
def probe(path):
 import torch
 report=validate_worker()
 for i in range(2):
  x=torch.ones(32,device='cuda:'+str(i));assert float((x@x).item())==32;torch.cuda.synchronize(i)
 report.update(status='passed',cuda_operations_passed=True,peer_access=[[bool(torch.cuda.can_device_access_peer(i,j)) if i!=j else True for j in range(2)] for i in range(2)])
 Path(path).write_text(json.dumps(report,indent=2));print('TWO_GPU_ISOLATION_PASSED',json.dumps(report),flush=True)
def main():
 if sys.argv[1]=='--probe':return probe(sys.argv[2])
 args=sys.argv[1:];assert args and args.pop(0)=='--offline'
 assert os.environ.get('SLURM_JOB_ID') and os.environ.get('SLURMD_NODENAME')=='c3'
 assert os.environ.get('SLURM_GPUS_ON_NODE')=='2'
 cvd=os.environ.get('CUDA_VISIBLE_DEVICES','');assert len(cvd.split(','))==2
 rows=subprocess.check_output(['nvidia-smi','--query-gpu=uuid,pci.bus_id','--format=csv,noheader'],text=True).strip().splitlines();assert len(rows)==2
 records=[]
 for row in rows:
  uuid,bus=[v.strip() for v in row.split(',')];bus=bus.lower()[-12:]
  info=(Path('/proc/driver/nvidia/gpus')/bus/'information').read_text()
  fields={k:v.strip() for k,v in (line.split(':',1) for line in info.splitlines() if ':' in line)}
  assert fields['GPU UUID']==uuid
  records.append(dict(uuid=uuid,pci_bus=bus,minor=int(fields['Device Minor'])))
 allocation=os.environ.get('SLURM_STEP_GPUS') or os.environ.get('SLURM_JOB_GPUS');assert allocation
 minors=[]
 for part in allocation.split(','):
  assert re.fullmatch(r'\d+(?:-\d+)?',part),allocation
  bounds=[int(x) for x in part.split('-')];minors.extend(range(bounds[0],bounds[-1]+1))
 assert set(minors)=={r['minor'] for r in records},('Slurm/driver mismatch',allocation,records)
 data=ROOT/'data'
 report=ROOT/'runs'/('c3_two_gpu_job_'+os.environ['SLURM_JOB_ID'])/'isolation.json';report.parent.mkdir(parents=True,exist_ok=True)
 for rel in ['cache/tmp','cache/cuda','cache/triton','cache/h3_ref2va_20261013']:(data/rel).mkdir(parents=True,exist_ok=True)
 env={k:v for k,v in os.environ.items() if k.lower() not in ['http_proxy','https_proxy','all_proxy','ftp_proxy'] and k not in ['PYTHONPATH','PYTHONHOME','LD_LIBRARY_PATH','CONDA_PREFIX']}
 env.update(FLOW_SLURM_MULTI_ISOLATED='1',FLOW_SLURM_CVD=cvd,FLOW_ALLOCATED_GPUS_JSON=json.dumps(records),FLOW_PARENT_NET_NS=os.readlink('/proc/self/ns/net'),FLOW_ISOLATION_REPORT=str(report),TMPDIR=str(data/'cache/tmp'),XDG_CACHE_HOME=str(data/'cache'),CUDA_CACHE_PATH=str(data/'cache/cuda'),TRITON_CACHE_DIR=str(data/'cache/triton'),PYTHONDONTWRITEBYTECODE='1',PYTHONNOUSERSITE='1',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',NCCL_SOCKET_IFNAME='lo',GLOO_SOCKET_IFNAME='lo',NCCL_IB_DISABLE='1')
 bw=['bwrap','--ro-bind','/','/','--bind',str(ROOT),str(ROOT),'--bind',str(data),str(data),'--ro-bind',str(ROOT/'models'),str(ROOT/'models'),'--bind',str(data/'cache/tmp'),'/tmp','--dev','/dev','--proc','/proc','--unshare-net','--die-with-parent']
 for node in ['nvidia'+str(r['minor']) for r in records]+['nvidiactl','nvidia-uvm','nvidia-uvm-tools']:
  path=Path('/dev')/node;assert path.exists();bw+=['--dev-bind',str(path),str(path)]
 py=Path(sys.executable)
 with ExitStack() as stack:
  for r in sorted(records,key=lambda x:x['uuid']):
   lock=stack.enter_context((data/'cache'/('gpu_'+r['uuid']+'.lock')).open('a'));fcntl.flock(lock,fcntl.LOCK_EX)
  subprocess.run(bw+['--',str(py),str(Path(__file__).resolve()),'--probe',str(report)],env=env,check=True)
  if args==['--check-only']:return
  assert args
  raise SystemExit(subprocess.call(bw+['--']+args,env=env))
if __name__=='__main__':main()
