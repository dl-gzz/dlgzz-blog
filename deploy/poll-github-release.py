#!/usr/bin/env python3
"""Deploy this public repository from GitHub's official API and codeload endpoints."""
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
    req = urllib.request.Request(url, headers={'User-Agent': 'dlgzz-deploy', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

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
                archive = tmp / 'source.tar.gz'
                run(['curl', '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--connect-timeout', '15', '--max-time', '300', '--retry', '2', '--max-filesize', str(512*1024**2), '-o', str(archive), f'https://codeload.github.com/{REPO}/tar.gz/{sha}'])
                source = extract(archive, tmp, sha)
                source.rename(release)
        env = dict(os.environ, GIT_COMMIT_SHA=sha, GIT_BRANCH='main')
        compose = ['sudo', 'env', f'GIT_COMMIT_SHA={sha}', 'GIT_BRANCH=main', 'docker', 'compose', '--project-name', 'deploy', '--env-file', str(ROOT/'shared/app.env'), '--env-file', str(ROOT/'shared/app.env.local'), '-f', str(release/'deploy/docker-compose.prod.yml')]
        previous = subprocess.run(['sudo', 'docker', 'inspect', '--format', '{{.Image}}', 'deploy-app-1'], capture_output=True, text=True).stdout.strip()
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
