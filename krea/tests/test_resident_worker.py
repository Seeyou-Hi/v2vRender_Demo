"""Exercise resident dispatch for both supported world sizes without a GPU."""
import json
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
import numpy
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]

class ResidentTests(unittest.TestCase):
    def test_two_and_four_gpu_dispatch(self):
        for world in (2,4):
            for failure in (False,True):
                with self.subTest(world=world,failure=failure),tempfile.TemporaryDirectory()as temp:
                    q=Path(temp);(q/'tasks').mkdir();(q/'tasks/session.json').write_text(json.dumps({'argv':['--fixture']}))
                    dist=types.ModuleType('torch.distributed')
                    dist.init_process_group=lambda *a,**kw:None
                    dist.destroy_process_group=lambda:None
                    dist.get_world_size=lambda:world
                    dist.barrier=lambda:None
                    dist.broadcast_object_list=lambda *a,**kw:None
                    def gather(values,error):
                        self.assertEqual(len(values),world);values[:]=[error]*world
                    dist.all_gather_object=gather
                    torch=types.ModuleType('torch');torch.cuda=types.SimpleNamespace(set_device=lambda n:self.assertEqual(n,0));torch.distributed=dist
                    render=types.ModuleType('render');calls=[]
                    def main(context):
                        calls.append(list(sys.argv))
                        if len(calls)==1:context['loaded']=True
                        else:
                            self.assertTrue(context['loaded']);(q/'stop').touch()
                            if failure:raise RuntimeError('fixture failure')
                    render.main=main
                    with patch.dict(sys.modules,{'torch':torch,'torch.distributed':dist,'render':render}),patch.dict('os.environ',{'RANK':'0','LOCAL_RANK':'0','SLURM_JOB_ID':'fixture'}),patch.object(sys,'argv',['resident_worker.py','--config','fixture.json','--queue',str(q)]):
                        runpy.run_path(str(ROOT/'scripts/resident_worker.py'),run_name='__main__')
                    state=json.loads((q/'status.json').read_text());self.assertEqual(state['gpus'],world);self.assertEqual(state['status'],'stopped')
                    result=json.loads((q/'results/session.json').read_text());self.assertEqual(result['status'],'failed' if failure else 'completed');self.assertTrue(result['resident_reused'])
                    self.assertEqual(calls[1],['render.py','--fixture']);self.assertFalse((q/'tasks/session.json').exists())
