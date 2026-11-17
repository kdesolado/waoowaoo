# Qwen Image + FFmpeg production mode

This fork does not expose AI video generation. `create_video` is intentionally
absent from the operation registry. The only production image model added by
the fork is `qwen::qwen-image-2.1`, which calls the authenticated gateway in
`infra/qwen-gateway`.

The gateway keeps ComfyUI on loopback, accepts an image prompt plus seed and
dimensions, submits the installed Qwen Image 2.1 workflow, and returns a PNG
as base64. Its token belongs in provider configuration or deployment secrets,
never source control.

`src/lib/video-compose/slideshow-ffmpeg.ts` is the renderer primitive for the
next operation: every approved still becomes a deterministic 30fps H.264 clip
with a small zoom or pan. The final compositor joins those clips, then muxes
the approved narration and subtitle track. No part of that path invokes a
video model.
