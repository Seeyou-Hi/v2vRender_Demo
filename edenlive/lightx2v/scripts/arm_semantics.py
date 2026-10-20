"""Ground action text in authoritative simulator samples, never UI intentions."""
import math


def object_name(obj):
    label = obj.get('label', '').lower()
    if '瓶' in label or 'bottle' in label:
        return 'the red bottle'
    if '罐' in label or 'can' in label:
        return 'the can'
    return 'object ' + str(obj.get('index', '?'))


def arm_name(index):
    # Original app.js names index 0 right, index 1 left.
    return 'right' if index == 0 else 'left'


class ArmSemantics:
    def __init__(self):
        self.previous = None
        self.event_id = 0
        self.stable = {}

    def summarize(self, samples):
        """One current-state line + ordered, frame-grounded transitions per chunk."""
        if not samples:
            return []
        events = []
        def emit(kind, text, frame):
            self.event_id += 1
            events.append(dict(id=self.event_id, type=kind, prompt=text, frame=frame))
        first = self.previous or samples[0]
        for state in samples:
            old = self.previous
            if old:
                for i, obj in enumerate(state['objects']):
                    prior = old['objects'][i]
                    a, b = prior['held_by'], obj['held_by']
                    if a != b:
                        if a >= 0:
                            emit('release', f'The {arm_name(a)} gripper releases {object_name(obj)}; only the object detaches; the complete two-finger gripper stays mounted on the wrist.', state['frame'])
                        if b >= 0:
                            emit('grasp', f'The {arm_name(b)} gripper grasps {object_name(obj)} between its two fingers; the object now follows that gripper.', state['frame'])
                    speed = math.dist(obj['position'], prior['position'])
                    self.stable[i] = self.stable.get(i, 0) + 1 if b < 0 and speed < .002 else 0
            self.previous = state
        end = samples[-1]
        # Reassert topology BEFORE variable action text. No visibility is inferred:
        # occlusion may hide parts but never changes the physical graph.
        emit('structure', 'Each wrist retains its single complete two-finger gripper. Occlusion hides the same attached parts; they reappear intact when uncovered.', end['frame'])
        for i, arm in enumerate(end.get('arms', [])):
            name = arm_name(i)
            # Actual linkage gap, not closed command: contact may stop closure.
            gap = arm.get('opening')
            holders = [o for o in end['objects'] if o['held_by'] == i]
            if holders:
                pose = 'fingers contact ' + object_name(holders[0])
            elif gap is not None:
                pose = 'fingers apart' if gap > .08 else 'fingers close together'
            else:
                pose = 'finger spacing follows the proxy'
            before = first.get('arms', [])
            motion = ''
            if i < len(before) and 'tcp' in arm and 'tcp' in before[i]:
                dy = arm['tcp'][1] - before[i]['tcp'][1]
                if abs(dy) > .025:
                    motion = ', moving ' + ('upward' if dy > 0 else 'downward') + ' with the proxy'
            emit('arm_pose', f'{name.capitalize()} wrist: {pose}{motion}; match proxy height and wrist orientation, with the same complete gripper.', end['frame'])
        relations = []
        for i, obj in enumerate(end['objects']):
            name, holder = object_name(obj), obj['held_by']
            if holder >= 0:
                relations.append(f'{name} is held by the {arm_name(holder)} fingers and follows them')
            else:
                relations.append(f'{name} is unheld')
            start_obj = first['objects'][i]
            delta = [b-a for a,b in zip(start_obj['position'], obj['position'])]
            # Scene units, not claimed SI meters. Suppress subpixel/noisy movements.
            if abs(delta[1]) > .025:
                direction = 'upward' if delta[1] > 0 else 'downward'
                action = f'{name} moves {direction}'
                if holder >= 0:
                    action += f' together with the {arm_name(holder)} gripper'
                emit('move', action + '.', end['frame'])
            if math.hypot(delta[0], delta[2]) > .035:
                action = f'{name} moves laterally with the proxy'
                if holder >= 0:
                    action += f', carried by the {arm_name(holder)} gripper'
                emit('move', action + '.', end['frame'])
            support = obj.get('support_height')
            if holder < 0 and support is not None and abs(obj['position'][1]-support) < .045 and self.stable.get(i,0) >= 6:
                relations.append(f'{name} rests on the tabletop at the proxy position')
        # Preserve every transition, then declare the final state to disambiguate.
        emit('grasp_state', 'End state: ' + '; '.join(relations) + '.', end['frame'])
        return events
