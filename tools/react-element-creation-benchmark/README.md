# React development element creation benchmark

This dependency-free benchmark models the development-only owner stack capture
performed by React's `jsx`, `jsxDEV`, and `createElement` implementations.

For each element, React creates an `Error('react-stack-top-frame')` and stores it
on the element as `_debugStack`. The error is not thrown. React formats it later
when it needs an owner stack for a warning, an error, DevTools, or server debug
information.

The benchmark measures batches of 5K, 10K, 20K, 40K, and 80K elements in three
modes:

- `baseline`: creates and retains the element without an `Error`.
- `react-cap-10`: uses React's current behavior, temporarily setting
  `Error.stackTraceLimit` to 10 for the capture and restoring it afterward.
- `ambient`: models the older behavior, inheriting the ambient stack limit,
  which defaults to 50 in this benchmark.

The elements and their errors remain reachable for the complete timed section.
Only the last error's `.stack` is read after timing, to verify that 10 or 50
frames were captured. A recursive depth of 64 ensures enough JavaScript frames
are available without adding recursion to each element creation.

## Run with the current Node.js binary

```console
node benchmark.js
```

## Compare two Node.js binaries

```console
node benchmark.js \
  --node unpatched=/absolute/path/to/unpatched/node \
  --node patched=/absolute/path/to/patched/node
```

The runner uses three fresh-process samples per combination and reports the
median. Change that with `--samples`:

```console
node benchmark.js --samples 5
```

The ambient limit can also be changed:

```console
node benchmark.js --ambient-limit 100
```

No package installation or React build is required. The benchmark intentionally
copies only the relevant element allocation and stack-capture pattern, making
the V8 `Error()` construction cost easier to isolate.
