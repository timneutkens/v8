# Results

These results compare two Node.js v24.18.1 builds from the same V8 13.6 base:

- Unpatched: V8 `13.6.233.17-node.50`
- Patched: V8 `13.6.233.17-node.51`, with the stack-frame summarization optimization

Each value is the median of three fresh-process samples. The ambient
`Error.stackTraceLimit` was 50. The React-style capture temporarily capped the
limit at 10 and restored it after each `Error()` construction.

## Current React behavior: temporary cap at 10

### `jsx`

| Elements | Unpatched | Patched | Speedup |
|---:|---:|---:|---:|
| 5,000 | 10.9 ms | 7.1 ms | 1.54x |
| 10,000 | 21.8 ms | 13.6 ms | 1.60x |
| 20,000 | 46.8 ms | 29.8 ms | 1.57x |
| 40,000 | 88.6 ms | 56.2 ms | 1.58x |
| 80,000 | 168.2 ms | 105.1 ms | 1.60x |

### `jsxDEV`

| Elements | Unpatched | Patched | Speedup |
|---:|---:|---:|---:|
| 5,000 | 10.8 ms | 6.6 ms | 1.63x |
| 10,000 | 21.2 ms | 13.6 ms | 1.56x |
| 20,000 | 46.2 ms | 31.5 ms | 1.47x |
| 40,000 | 88.0 ms | 57.2 ms | 1.54x |
| 80,000 | 175.2 ms | 108.3 ms | 1.62x |

### `createElement`

| Elements | Unpatched | Patched | Speedup |
|---:|---:|---:|---:|
| 5,000 | 10.7 ms | 6.9 ms | 1.55x |
| 10,000 | 21.4 ms | 13.7 ms | 1.56x |
| 20,000 | 45.5 ms | 31.1 ms | 1.46x |
| 40,000 | 87.2 ms | 58.0 ms | 1.50x |
| 80,000 | 178.3 ms | 114.6 ms | 1.56x |

## Older behavior: inherit ambient limit of 50

### `jsx`

| Elements | Unpatched | Patched | Speedup |
|---:|---:|---:|---:|
| 5,000 | 23.4 ms | 19.3 ms | 1.21x |
| 10,000 | 52.2 ms | 44.0 ms | 1.19x |
| 20,000 | 100.8 ms | 83.4 ms | 1.21x |
| 40,000 | 203.3 ms | 165.3 ms | 1.23x |
| 80,000 | 406.9 ms | 354.7 ms | 1.15x |

### `jsxDEV`

| Elements | Unpatched | Patched | Speedup |
|---:|---:|---:|---:|
| 5,000 | 22.2 ms | 19.1 ms | 1.16x |
| 10,000 | 51.2 ms | 43.7 ms | 1.17x |
| 20,000 | 100.0 ms | 84.1 ms | 1.19x |
| 40,000 | 200.4 ms | 168.4 ms | 1.19x |
| 80,000 | 435.4 ms | 341.9 ms | 1.27x |

### `createElement`

| Elements | Unpatched | Patched | Speedup |
|---:|---:|---:|---:|
| 5,000 | 23.4 ms | 19.8 ms | 1.18x |
| 10,000 | 52.9 ms | 46.2 ms | 1.14x |
| 20,000 | 99.7 ms | 84.4 ms | 1.18x |
| 40,000 | 209.0 ms | 169.9 ms | 1.23x |
| 80,000 | 424.4 ms | 355.4 ms | 1.19x |

## Baseline

At 80K elements, creating and retaining the benchmark elements without an
owner stack took:

| API | Unpatched | Patched |
|---|---:|---:|
| `jsx` | 11.4 ms | 11.2 ms |
| `jsxDEV` | 11.3 ms | 11.7 ms |
| `createElement` | 14.6 ms | 13.9 ms |

The patched V8 therefore improves the development element-creation path rather
than its ordinary object-allocation baseline. The smaller speedup compared with
an isolated `Error()` microbenchmark is expected because these measurements
also include props creation, React element allocation, storing the retained
error, and any garbage-collection pressure caused by retaining a complete
element batch.
