"""On the Linux login host, mark a stopped GPU launcher unavailable to HTTP.

Monitor the launcher PID and its start time, so PID reuse cannot keep a stale
worker marked ready. Run alongside (not inside) a time-limited GPU allocation.
"""
import argparse
import json
import time
from pathlib import Path


def identity(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return None if fields[0] == 'Z' else fields[19]
    except FileNotFoundError:
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', required=True, type=int)
    parser.add_argument('--queue', required=True, type=Path)
    args = parser.parse_args()
    started = identity(args.pid)
    while started is not None and identity(args.pid) == started:
        time.sleep(2)
    path = args.queue / 'status.json'
    state = json.loads(path.read_text()) if path.exists() else {}
    state.update(status='failed', error='GPU launcher exited; allocation ended or worker stopped. Restart the resident service.')
    temporary = path.with_suffix('.watch.tmp')
    temporary.write_text(json.dumps(state, indent=2))
    temporary.replace(path)


if __name__ == '__main__':
    main()
