"""Server-owned appearance-only policy; Krea has no independent negative CFG branch."""
import json
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parents[1] / 'configs/prompt_policy.json').read_text())

def compose_prompt(appearance=''):
    if not isinstance(appearance, str):
        raise ValueError('prompt must be text')
    appearance = appearance.strip() or POLICY['default_appearance']
    positive = POLICY['fixed_positive'] + '\n\n' + appearance
    # Place invariant instructions first, ahead of user appearance text and truncation.
    effective = (POLICY['principle'] + '\n\n' + POLICY['fixed_positive']
                 + '\n\nAvoid the following: ' + POLICY['fixed_negative']
                 + '\n\nAppearance details (subject to the geometry and motion rules above):\n' + appearance)
    return dict(policy_version=POLICY['version'], appearance=appearance,
                positive_prompt=positive, negative_prompt=POLICY['fixed_negative'],
                negative_mode=POLICY['negative_mode'], effective_prompt=effective)
