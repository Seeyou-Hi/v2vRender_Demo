"""Validate the C3 allocation already established by the platform isolation launcher.

No dependency on another checkout. This module does not allocate GPUs or replace
C3's Slurm/bubblewrap launcher. Ordinary non-C3 machines do not call this guard.
"""
import json
import os
from pathlib import Path
import re


def validate_worker():
    import torch
    assert os.environ.get('SLURM_JOB_ID'), 'Slurm allocation required'
    multi = os.environ.get('FLOW_SLURM_MULTI_ISOLATED') == '1'
    assert multi or os.environ.get('FLOW_SLURM_ISOLATED') == '1', 'Isolation launcher required'
    assert os.environ['CUDA_VISIBLE_DEVICES'] == os.environ['FLOW_SLURM_CVD'], 'Allocation mask changed'
    if multi:
        records = json.loads(os.environ['FLOW_ALLOCATED_GPUS_JSON'])
        assert len(records) in (2, 4)
    else:
        records = [dict(uuid=os.environ['FLOW_GPU_UUID'], minor=int(os.environ['FLOW_GPU_MINOR']))]
    expected = sorted('/dev/nvidia' + str(r['minor']) for r in records)
    visible = sorted(str(p) for p in Path('/dev').glob('nvidia*') if re.fullmatch(r'nvidia\d+', p.name))
    assert visible == expected, ('Unexpected GPU devices', visible, expected)
    assert os.readlink('/proc/self/ns/net') != os.environ['FLOW_PARENT_NET_NS']
    assert not Path('/proc/net/route').read_text().splitlines()[1:]
    interfaces = {row.split(':')[0].strip() for row in Path('/proc/net/dev').read_text().splitlines()[2:]}
    assert interfaces <= {'lo'}
    assert torch.cuda.device_count() == len(records)
    uuids = {'GPU-' + str(torch.cuda.get_device_properties(i).uuid) for i in range(len(records))}
    assert uuids == {r['uuid'] for r in records}, 'CUDA UUID differs from Slurm allocation'
