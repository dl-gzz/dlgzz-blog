#!/usr/bin/env python3
"""Deploy this public repository from GitHub's official API and codeload endpoints."""
import base64
import hashlib
import gzip
from concurrent.futures import ThreadPoolExecutor
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request

ROOT = Path(os.environ.get('DEPLOY_ROOT', '/opt/dlgzz'))
HEALTH = 'http://127.0.0.1:3000/api/health/build'
REPO = 'dl-gzz/dlgzz-blog'

def fetch_json(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'dlgzz-deploy', 'Accept': 'application/vnd.github+json', 'Accept-Encoding': 'gzip'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                if r.headers.get('Content-Encoding') == 'gzip': data = gzip.decompress(data)
                return json.loads(data)
        except Exception:
            if attempt == 2: raise
            time.sleep(2 * (attempt + 1))

def health():
    try:
        return fetch_json(HEALTH)
    except Exception:
        return {}

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def extract(archive, target, sha):
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        if sum(m.size for m in members) > 1024**3:
            raise ValueError('Source archive too large')
        prefix = 'dlgzz-blog-' + sha
        for m in members:
            p = Path(m.name)
            if p.is_absolute() or '..' in p.parts or p.parts[0] != prefix or not (m.isfile() or m.isdir()):
                raise ValueError('Unexpected archive path or file type')
        tar.extractall(target, filter='data')
        return target / prefix

def incremental_source(target, sha):
    """Rebuild from a committed local base, verifying changed Git blobs."""
    repo = ROOT / 'app'
    cached = None
    receipt = ROOT / 'last-deploy.json'
    if receipt.exists():
        candidate = json.loads(receipt.read_text()).get('commit', '')
        if re.fullmatch(r'[0-9a-f]{40}', candidate) and (ROOT/'releases'/candidate).is_dir():
            cached = ROOT/'releases'/candidate
    base = cached.name if cached else subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    compare = fetch_json(f'https://api.github.com/repos/{REPO}/compare/{base}...{sha}')
    files = compare.get('files', [])
    if compare.get('status') not in ('ahead', 'identical') or len(files) >= 300:
        raise ValueError('Incremental comparison is not complete; use archive')
    tree = fetch_json(f'https://api.github.com/repos/{REPO}/git/trees/{sha}?recursive=1')
    if tree.get('truncated'):
        raise ValueError('Truncated Git tree')
    expected = {x['path']: x for x in tree['tree'] if x['type'] == 'blob'}
    if any(x.get('mode') not in ('100644','100755') for x in expected.values()):
        raise ValueError('Unsupported source file mode')
    if cached:
        shutil.copytree(cached, target)
    else:
        archive = target.parent / 'base.tar'
        run(['git', '-C', str(repo), 'archive', '--format=tar', '-o', str(archive), base])
        target.mkdir()
        with tarfile.open(archive) as tar:
            tar.extractall(target, filter='data')
    def safe(name):
        p = Path(name)
        if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] == '.git':
            raise ValueError('Unsafe changed file path')
        return target / p
    for item in files:
        if item['status'] == 'removed':
            safe(item['filename']).unlink(missing_ok=True)
        elif item['status'] == 'renamed':
            safe(item['previous_filename']).unlink(missing_ok=True)
    def update(item):
        if item['status'] == 'removed': return
        name = item['filename']; entry = expected[name]
        blob = fetch_json(f"https://api.github.com/repos/{REPO}/git/blobs/{entry['sha']}")
        data = base64.b64decode(blob['content'])
        actual = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if actual != entry['sha']: raise ValueError('Git blob mismatch')
        dest = safe(name); dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data); dest.chmod(0o755 if entry['mode']=='100755' else 0o644)
    print(f'Downloading {len(files)} changed files from official GitHub API', flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(update, files))
    actual_files = {str(p.relative_to(target)):p for p in target.rglob('*') if p.is_file()}
    if set(actual_files) != set(expected): raise ValueError('Source tree paths mismatch')
    for name,p in actual_files.items():
        data=p.read_bytes()
        if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=expected[name]['sha']:
            raise ValueError('Complete source tree hash mismatch: '+name)
    return target

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / 'deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another deployment is running', flush=True)
            return
        sha = fetch_json(f'https://api.github.com/repos/{REPO}/commits/main')['sha']
        if not re.fullmatch(r'[0-9a-f]{40}', sha):
            raise ValueError('Invalid GitHub revision')
        current = health()
        if current.get('success') and current.get('commit') == sha:
            print(f'Already healthy at {sha}', flush=True)
            return
        if shutil.disk_usage(ROOT).free < 3 * 1024**3:
            raise RuntimeError('Less than 3 GiB free; preserving current website')
        releases = ROOT / 'releases'
        releases.mkdir(exist_ok=True)
        release = releases / sha
        if not release.exists():
            with tempfile.TemporaryDirectory(prefix='.download-', dir=releases) as tmp:
                tmp = Path(tmp)
                source = incremental_source(tmp / 'source', sha)
                source.rename(release)
        env = dict(os.environ, GIT_COMMIT_SHA=sha, GIT_BRANCH='main')
        compose = ['sudo', 'env', f'GIT_COMMIT_SHA={sha}', 'GIT_BRANCH=main', 'docker', 'compose', '--project-name', 'deploy', '--env-file', str(ROOT/'shared/app.env'), '--env-file', str(ROOT/'shared/app.env.local'), '-f', str(release/'deploy/docker-compose.prod.yml')]
        previous = subprocess.run(['sudo', 'docker', 'inspect', '--format', '{{.Image}}', 'deploy-app-1'], capture_output=True, text=True).stdout.strip()
        if re.fullmatch(r'sha256:[0-9a-f]{64}', previous):
            run(['sudo', 'docker', 'tag', previous, 'deploy-app:rollback'])
        print(f'Building GitHub main {sha}', flush=True)
        run(compose + ['build', 'app'], env=env, timeout=1500)
        try:
            run(compose + ['up', '-d', '--no-build', 'app'], env=env, timeout=120)
            for _ in range(36):
                state = health()
                if state.get('success') and state.get('commit') == sha:
                    receipt = {'commit': sha, 'previousCommit': current.get('commit'), 'source': f'https://codeload.github.com/{REPO}/tar.gz/{sha}', 'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                    tmp = ROOT/'last-deploy.json.tmp'
                    tmp.write_text(json.dumps(receipt, indent=2)+'\n')
                    tmp.replace(ROOT/'last-deploy.json')
                    print(f'Deployment healthy at {sha}', flush=True)
                    # Still under deploy.lock: only unused build cache is eligible.
                    # Preserve running containers, tagged rollback image and volumes.
                    try:
                        run(['sudo', 'docker', 'builder', 'prune', '--force', '--keep-storage', '6GB'], timeout=300)
                    except Exception as exc:
                        print(f'Cache maintenance failed; healthy deployment retained: {type(exc).__name__}', flush=True)
                    return
                time.sleep(5)
            raise RuntimeError('New website failed its revision health check')
        except Exception:
            if re.fullmatch(r'sha256:[0-9a-f]{64}', previous):
                print('Restoring previous application image', flush=True)
                run(['sudo', 'docker', 'tag', previous, 'deploy-app:latest'])
                run(compose + ['up', '-d', '--no-build', 'app'], env=env, timeout=120)
            raise

if __name__ == '__main__':
    main()
