# NAS Subtitle Companion (validation)

This validation service is deliberately scoped to a single media mount. It scans every 10 minutes, translates English SRT files to bilingual `*.zh-CN.srt`, and can extract English text subtitle tracks from video files with FFmpeg. Image subtitle codecs such as PGS/SUP are skipped. Existing Chinese output is never overwritten.

For the Synology test deployment, copy this directory into a Container Manager project and use `compose.yaml`. The compose file mounts only:

`/volume1/homes/dxy1234/Videos/_FilmSubtitles_NAS_Test`

The service does not delete or modify original media/subtitles. Its only persistent write is a new `*.zh-CN.srt` beside the source.

The container is not privileged and sees only the test bind mount. It runs as the container's default user so Synology bind-mount ACLs can create the new subtitle; the narrow mount is the security boundary for this validation build.
