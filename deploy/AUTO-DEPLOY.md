# GitHub → production

Production checks public GitHub `dl-gzz/dlgzz-blog` main every two minutes, then builds the exact commit using GitHub API + official codeload HTTPS. This avoids the server's unreachable github.com Git endpoint. No third-party mirror, GitHub write token, webhook public port, or chat automation is needed.

Current server: Tencent Cloud Shanghai CVM, existing `dlgzz-deploy.timer` and `dlgzz-deploy.service`, ubuntu user. Runner is `/opt/dlgzz/bin/poll-github-release.py` (reviewed copy of this repository's script). Existing service and timer have `github-source.conf` drop-ins: ExecStart is Python runner; OnUnitActiveSec is two minutes. Runner changes require explicit installation; pushing articles or site code does not.

- Source snapshots: `/opt/dlgzz/releases/<commit>`; old Git checkout `/opt/dlgzz/app` is preserved and is no longer the production version authority.
- Existing configuration remains in `/opt/dlgzz/shared/`; never print or commit those environment files.
- Container project remains `deploy`, app `deploy-app-1`, port bound to localhost only.
- Build finishes before replacing app. Health must report the exact commit. Failure after replacement restores the previous local image. Failed build leaves running app untouched.
- Completion receipt: `/opt/dlgzz/last-deploy.json`. Public check: `https://www.dlgzz.com/api/health/build`.
- Blog plugin additionally verifies exact MDX contentHash, article page, and images through the mini-program API; GitHub push alone is not completion.
- Inspect: `systemctl status dlgzz-deploy.timer dlgzz-deploy.service --no-pager` and `journalctl -u dlgzz-deploy.service -n 60 --no-pager`.
- Disk below 3 GiB free refuses a new build. Source snapshots are retained for diagnosis; review retention periodically rather than deleting application data.
- A server reboot keeps the existing enabled timer. Internet availability and build duration still determine publishing latency.

Validation: `python3 scripts/test-github-release.py` covers no-op, build failure preserving live app, health failure rollback, and successful revision receipt.
