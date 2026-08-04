# NAS Subtitle Companion

This service scans every 10 minutes, auto-detects non-Chinese SRT languages, translates them to bilingual `*.zh-CN.srt`, and can extract non-Chinese text subtitle tracks from video files with FFmpeg. Image subtitle codecs such as PGS/SUP are skipped. Existing Chinese subtitles and generated output are never overwritten. Translation requests are batched and rate-limited.

For the Synology deployment, copy this directory into a Container Manager project and use `compose.yaml`. The compose file mounts:

`/volume1/homes/dxy1234/Videos`

The project also mounts `/volume1/docker/gss-nas-test/index.mjs` read-only at `/app/index.mjs`, preventing DSM image caching from retaining stale code.

The service does not delete or modify original media/subtitles. Its only media-library write is a new `*.zh-CN.srt` beside the source. State is stored in `/volume1/docker/gss-nas-test/config/state.json`. `MAX_NEW_OUTPUTS_PER_SCAN=10` limits each scan while `MAX_NEW_OUTPUTS=0` allows the queue to continue across scans and restarts.

## Local progress dashboard

Container port `8787` serves a read-only dashboard and JSON endpoint:

- `http://NAS-LAN-IP:8787/`
- `http://NAS-LAN-IP:8787/api/status`

The dashboard refreshes every three seconds and shows discovered external-text progress, cumulative output, current file, batch progress, failures, the next scan time, and the ten most recent outputs. It never exposes subtitle text, relay credentials, or media contents. Embedded subtitle tracks are discovered incrementally, so the percentage is explicitly scoped to currently discovered text-subtitle work.

Publishing port `8787` makes it reachable on NAS network interfaces. Do not forward it to the public internet without adding authentication through a trusted reverse proxy.

The container is not privileged. It runs as the container's default user so Synology bind-mount ACLs can create the new subtitle.
