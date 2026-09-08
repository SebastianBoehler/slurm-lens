"""Local-only protocol fixture and HTTP integration checks; never a product data source."""
import json
import os
import signal
from pathlib import Path
import subprocess
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
CONTROL = ROOT / 'local/protocol-control.json'
COUNTS = {'jobs': 0, 'nodes': 0}


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        mode = json.loads(CONTROL.read_text())
        if mode.get('fail'):
            self.send_response(503)
            self.end_headers()
            return
        epoch = int(time.time())
        meta = {'slurm': {'cluster': 'protocol-test'}}
        if self.path.endswith('/jobs/'):
            COUNTS['jobs'] += 1
            assert self.headers.get('X-SLURM-USER-TOKEN') == 'test-only-token'
            data = {'meta': meta, 'errors': [], 'jobs': [{
                'job_id': 101, 'name': 'LOCAL PROTOCOL TEST', 'account': 'test',
                'partition': 'test-gpu', 'job_state': ['RUNNING'], 'nodes': 'test-node',
                'start_time': {'set': True, 'infinite': False, 'number': epoch - 120},
                'submit_time': {'set': True, 'infinite': False, 'number': epoch - 180},
                'time_limit': {'set': True, 'infinite': False, 'number': 60},
                'tres_req_str': 'cpu=4,mem=16G,gres/gpu=1',
                'tres_alloc_str': 'cpu=4,mem=16G,gres/gpu=1',
            }]}
        elif self.path.endswith('/nodes/'):
            COUNTS['nodes'] += 1
            data = {'meta': meta, 'nodes': [{
                'name': 'test-node', 'state': ['MIXED'], 'architecture': 'x86_64',
                'cpus': 64, 'real_memory': 262144, 'gres': 'gpu:a100:4', 'gres_used': 'gpu:a100:1',
            }]}
        elif self.path.startswith('/api/v1/query?'):
            data = {'status': 'success', 'data': {'resultType': 'vector', 'result': [{
                'metric': {'instance': 'test-node:9400', 'UUID': 'TEST-GPU'},
                'value': [epoch, str(mode.get('value', 42))],
            }]}}
        else:
            self.send_response(404)
            self.end_headers()
            return
        if mode.get('empty') and 'jobs' in data:
            data['jobs'] = []
        payload = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def launch():
    CONTROL.parent.mkdir(exist_ok=True)
    CONTROL.write_text('{"value":42}')
    fixture = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    config = {
        'cluster': 'protocol-test', 'slurm_url': f'http://127.0.0.1:{fixture.server_port}',
        'slurm_user': 'test', 'slurm_token_env': 'SLURM_LENS_TEST_TOKEN',
        'poll_seconds': 10, 'history_frames': 3,
        'prometheus': {'url': f'http://127.0.0.1:{fixture.server_port}'},
    }
    config_path = ROOT / 'local/protocol-test.json'
    config_path.write_text(json.dumps(config))
    proc = subprocess.Popen([str(ROOT / 'target/release/slurm-lens'), '--live', str(config_path)],
                            env={**os.environ, 'SLURM_LENS_TEST_TOKEN': 'test-only-token'})
    return fixture, proc


def get(path='/api/status'):
    with urllib.request.urlopen('http://127.0.0.1:4317' + path, timeout=3) as r:
        return json.load(r)


def until(predicate, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = get()
            if predicate(result):
                return result
        except OSError:
            pass
        time.sleep(0.2)
    raise AssertionError('Timed out waiting for live state')


def verify():
    ready = until(lambda s: s['update']['frame'] is not None)
    assert ready['mode'] == 'live'
    frame = ready['update']['frame']
    assert frame['jobs'][0]['allocated']['gpus'] == 1
    assert frame['inventory'][0]['cpus'] == 64
    assert len(frame['metrics']) == 4
    before = COUNTS.copy()
    for _ in range(5):
        get('/api/session')
    assert COUNTS == before, 'Browsers must not trigger upstream queries'
    with urllib.request.urlopen('http://127.0.0.1:4317/api/events', timeout=3) as r:
        assert r.headers['Content-Type'].startswith('text/event-stream')
        assert b'event: update' in r.readline()
        assert b'protocol-test' in r.readline()
    CONTROL.write_text('{"fail":true}')
    failed = until(lambda s: s['update']['scheduler']['error'] is not None)
    assert failed['update']['frame']['captured_at'] == frame['captured_at']
    assert failed['update']['scheduler']['last_success'] == frame['captured_at']
    CONTROL.write_text('{"value":73,"empty":true}')
    recovered = until(lambda s: s['update']['scheduler']['error'] is None and s['update']['revision'] > failed['update']['revision'])
    assert recovered['update']['frame']['metrics'][0]['value'] == 73
    assert recovered['update']['frame']['jobs'][0]['observed_at'] == frame['captured_at']
    assert recovered['update']['frame']['jobs'][0]['state'] == 'RUNNING'
    assert recovered['update']['frame']['captured_at'] != frame['captured_at']
    for method, host, expected in [('POST','127.0.0.1:4317',405),('GET','evil.example',403)]:
        request = urllib.request.Request('http://127.0.0.1:4317/api/session', method=method, headers={'Host':host})
        try:
            urllib.request.urlopen(request)
            raise AssertionError('Expected rejection')
        except urllib.error.HTTPError as e:
            assert e.code == expected
    print('PASS: REST mapping, SSE, shared cache, outage, stale data, recovery, host and method guards')


if __name__ == '__main__':
    import sys
    fixture, process = launch()
    try:
        if '--preview' in sys.argv:
            print('LOCAL TEST FIXTURE ONLY — press Ctrl+C to stop', flush=True)
            process.wait()
        else:
            verify()
    finally:
        process.send_signal(signal.SIGINT)
        process.wait(timeout=5)
        fixture.shutdown()
