import copy
from arm_semantics import ArmSemantics

def sample(f, held=-1, y=.2):
    return {'frame':f,'objects':[{'label':'水瓶 1','held_by':held,'position':[0,y,0],'support_height':.2}]}

s=ArmSemantics()
assert not any(e['type']=='grasp' for e in s.summarize([sample(0)]))
events=s.summarize([sample(1,1),sample(2,1,.4)])
assert sum(e['type']=='grasp' for e in events)==1
assert any('left gripper' in e['prompt'] for e in events)
assert any(e['type']=='move' and 'upward' in e['prompt'] for e in events)
events=s.summarize([sample(3,-1,.4),sample(4,-1,.3)])
assert any(e['type']=='release' for e in events)
assert not any('rests on' in e['prompt'] for e in events)
events=s.summarize([sample(f) for f in range(5,15)])
assert any('rests on the tabletop' in e['prompt'] for e in events)
assert not any(e['type'] in ('grasp','release') for e in events)
s=ArmSemantics();s.summarize([sample(0)])
events=s.summarize([sample(1,0),sample(2,-1)])
assert [e['type'] for e in events if e['type'] in ('grasp','release')]==['grasp','release']
assert len({e['id'] for e in events})==len(events)
print('semantics: grasp/release ordering, arm naming, held motion, stable contact passed')

def posed(f, gap, y, closed=False):
    r=sample(f);r['arms']=[dict(opening=gap,closed=closed,tcp=[0,y,0]),dict(opening=.23,closed=False,tcp=[-1,.8,0])];return r
s=ArmSemantics();s.summarize([posed(0,.23,.8)])
e=s.summarize([posed(1,.02,.5,True)])
assert any(x['type']=='arm_pose' and 'Right wrist: fingers close together, moving downward' in x['prompt'] for x in e)
assert any(x['type']=='structure' and 'Occlusion hides the same attached parts' in x['prompt'] for x in e)
e=s.summarize([posed(2,.23,.9,True)])
assert any('Right wrist: fingers apart, moving upward' in x['prompt'] for x in e), 'Use actual gap, not commanded closed flag'
s=ArmSemantics();r=posed(0,.02,.8);r['objects'][0]['held_by']=0;s.summarize([r]);e=s.summarize([posed(1,.23,.8)])
assert any(x['type']=='release' and 'only the object detaches' in x['prompt'] and 'gripper stays mounted' in x['prompt'] for x in e)
assert not any('moving upward' in x['prompt'] or 'moving downward' in x['prompt'] for x in e)
print('structure: gap-grounded opening, wrist height direction, occlusion persistence and object-only release passed')
