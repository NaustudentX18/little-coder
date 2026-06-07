# llama.cpp server settings audit

Audited on the local llama.cpp host using the model:

- `Qwen3.6-35B-A3B-APEX-MTP-I-Nano.gguf`

Test probe:

- prompt: `List eight simple nouns separated by spaces.`
- `max_tokens=16`
- `temperature=0`
- `top_p=1`
- one cold request + one warm request per variant

All variants used:

- `--sleep-idle-seconds 60`
- `--parallel 1`
- `--n-gpu-layers 30`
- `--flash-attn on`
- `--spec-type draft-mtp`

## Results

| Rank | ctx-size | spec-draft-n-max | Cold TPS | Warm TPS | Avg TPS | Notes |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 65536 | 2 | 29.395 | 37.038 | 33.217 | Best overall throughput in this sweep. |
| 2 | 32768 | 3 | 23.523 | 37.542 | 30.533 | Best warm-state TPS, slightly lower cold start. |
| 3 | 32768 | 2 | 26.945 | 33.168 | 30.057 | Lower throughput than the 65536/2 baseline. |
| 4 | 32768 | 4 | 18.483 | 36.863 | 27.673 | Extra speculative breadth did not improve the steady-state enough to justify the colder start. |

## Idle memory result

With `--sleep-idle-seconds 60` enabled, the live `llama-server.exe` working set dropped from roughly **13.1 GB** while active to roughly **1.06 GB** after **70 seconds idle** with no intervening requests.

That confirms the server is now much less memory-hungry when idle.

## Recommendation

Use:

- `--ctx-size 65536`
- `--spec-draft-n-max 2`
- `--sleep-idle-seconds 60`

This combination kept the best overall active throughput in the sweep while also releasing most of the working set when idle.
