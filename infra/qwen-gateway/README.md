# Qwen Image 2.1 gateway

This small authenticated service exposes only the installed Qwen Image 2.1
text-to-image workflow. Raw ComfyUI remains bound to loopback and is never
published to the LAN.

The application calls `POST /v1/images/generations` with a Bearer token and
receives an OpenAI-style `b64_json` image result. Supported fields are
`prompt`, `negative_prompt`, `seed`, `steps`, `width`, and `height`.

The deployed unit reads `/etc/waoowaoo/qwen-gateway.env`; do not commit that
file or its token.
