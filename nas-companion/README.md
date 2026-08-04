# NAS Subtitle Companion (pilot)

This pilot service scans every 10 minutes, translates English SRT files to bilingual `*.zh-CN.srt`, and can extract English text subtitle tracks from video files with FFmpeg. Image subtitle codecs such as PGS/SUP are skipped. Existing Chinese output is never overwritten. Translation requests are batched and rate-limited.

For the Synology pilot deployment, copy this directory into a Container Manager project and use `compose.yaml`. The compose file mounts:

`/volume1/homes/dxy1234/Videos`

The service does not delete or modify original media/subtitles. Its only media-library write is a new `*.zh-CN.srt` beside the source. Pilot state is stored in `/volume1/docker/gss-nas-test/config/state.json`, and `MAX_NEW_OUTPUTS=10` prevents the first run from creating more than ten subtitles across restarts.

The container is not privileged. It runs as the container's default user so Synology bind-mount ACLs can create the new subtitle.
