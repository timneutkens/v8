'use strict';

const {spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const path = require('node:path');

const COUNTS = [5_000, 10_000, 20_000, 40_000, 80_000];
const APIS = ['jsx', 'jsxDEV', 'createElement'];
const MODES = ['baseline', 'react-cap-10', 'ambient'];
const OWNER_STACK_TRACE_LIMIT = 10;
const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element');
const owner = {name: 'BenchmarkOwner'};

function captureDebugStack(mode) {
  if (mode === 'baseline') {
    return null;
  }

  if (mode === 'react-cap-10') {
    // This is the pattern used by React's development element factories.
    const previousStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = OWNER_STACK_TRACE_LIMIT;
    const debugStack = Error('react-stack-top-frame');
    Error.stackTraceLimit = previousStackTraceLimit;
    return debugStack;
  }

  // Models the older behavior, where React inherited the ambient limit.
  return Error('react-stack-top-frame');
}

function ReactElement(type, key, props, debugStack) {
  const element = {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    props,
    _owner: owner,
  };

  Object.defineProperty(element, '_debugStack', {
    configurable: false,
    enumerable: false,
    writable: true,
    value: debugStack,
  });

  return element;
}

function jsx(type, config, maybeKey, mode) {
  return ReactElement(type, maybeKey == null ? null : '' + maybeKey, config, captureDebugStack(mode));
}

function jsxDEV(type, config, maybeKey, isStaticChildren, mode) {
  return ReactElement(type, maybeKey == null ? null : '' + maybeKey, config, captureDebugStack(mode));
}

function createElement(type, config, mode) {
  const props = {};
  if (config !== null) {
    for (const propName in config) {
      if (propName !== 'key' && Object.prototype.hasOwnProperty.call(config, propName)) {
        props[propName] = config[propName];
      }
    }
  }
  const key = config !== null && config.key != null ? '' + config.key : null;
  return ReactElement(type, key, props, captureDebugStack(mode));
}

function getFactory(api, mode) {
  switch (api) {
    case 'jsx':
      return i => jsx('div', {value: i}, null, mode);
    case 'jsxDEV':
      return i => jsxDEV('div', {value: i}, null, false, mode);
    case 'createElement':
      return i => createElement('div', {value: i}, mode);
    default:
      throw new Error(`Unknown API: ${api}`);
  }
}

// A deep owner call stack ensures both limits have enough frames to capture.
// The recursion wraps the whole batch, so it is not repeated for every element.
function createAtDepth(depth, factory, count) {
  if (depth !== 0) {
    return createAtDepth(depth - 1, factory, count);
  }

  const elements = new Array(count);
  for (let i = 0; i < count; i++) {
    elements[i] = factory(i);
  }
  return elements;
}

function runWorker(api, count, mode, ambientLimit) {
  Error.stackTraceLimit = ambientLimit;
  const factory = getFactory(api, mode);

  // Warm up the factories and stack-capture path before timing.
  createAtDepth(64, factory, 2_000);
  if (global.gc) {
    global.gc();
  }

  const start = performance.now();
  const elements = createAtDepth(64, factory, count);
  const duration = performance.now() - start;

  const lastStack = elements[elements.length - 1]._debugStack;
  const capturedLines = lastStack === null ? 0 : lastStack.stack.split('\n').length;

  process.stdout.write(
    JSON.stringify({
      node: process.version,
      v8: process.versions.v8,
      api,
      count,
      mode,
      ambientLimit,
      duration,
      capturedLines,
      restoredLimit: Error.stackTraceLimit,
    }),
  );
}

function parseRunnerArguments(argv) {
  const nodes = [];
  let samples = 3;
  let ambientLimit = 50;

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--node') {
      const value = argv[++i];
      if (!value || !value.includes('=')) {
        throw new Error('--node must use the form label=/absolute/path/to/node');
      }
      const separator = value.indexOf('=');
      nodes.push({label: value.slice(0, separator), binary: value.slice(separator + 1)});
    } else if (argument === '--samples') {
      samples = Number(argv[++i]);
    } else if (argument === '--ambient-limit') {
      ambientLimit = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error('--samples must be a positive integer');
  }
  if (!Number.isInteger(ambientLimit) || ambientLimit < OWNER_STACK_TRACE_LIMIT) {
    throw new Error(`--ambient-limit must be an integer >= ${OWNER_STACK_TRACE_LIMIT}`);
  }

  if (nodes.length === 0) {
    nodes.push({label: 'current', binary: process.execPath});
  }

  return {nodes, samples, ambientLimit};
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function runSample(binary, api, count, mode, ambientLimit) {
  const result = spawnSync(
    binary,
    [
      '--expose-gc',
      __filename,
      '--worker',
      api,
      String(count),
      mode,
      String(ambientLimit),
    ],
    {
      encoding: 'utf8',
      env: {...process.env, NODE_OPTIONS: ''},
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Benchmark worker failed for ${binary}:\n${result.stderr || result.stdout}`,
    );
  }

  return JSON.parse(result.stdout);
}

function formatMilliseconds(value) {
  return value.toFixed(1);
}

function printResults(results, nodes, ambientLimit) {
  console.log('# React development element creation benchmark');
  console.log();
  console.log(`Ambient Error.stackTraceLimit: ${ambientLimit}`);
  console.log('React owner stack cap: 10');
  console.log();

  for (const node of nodes) {
    const nodeResults = results.filter(result => result.label === node.label);
    const first = nodeResults[0];
    console.log(`## ${node.label}: ${first.node}, V8 ${first.v8}`);
    console.log();

    for (const api of APIS) {
      console.log(`### ${api}`);
      console.log();
      console.log('| Elements | No stack | React cap 10 | Ambient limit | Ambient / cap 10 |');
      console.log('|---:|---:|---:|---:|---:|');

      for (const count of COUNTS) {
        const lookup = mode =>
          nodeResults.find(
            result => result.api === api && result.count === count && result.mode === mode,
          ).median;
        const baseline = lookup('baseline');
        const capped = lookup('react-cap-10');
        const ambient = lookup('ambient');
        console.log(
          `| ${count.toLocaleString('en-US')} | ${formatMilliseconds(baseline)} ms | ` +
            `${formatMilliseconds(capped)} ms | ${formatMilliseconds(ambient)} ms | ` +
            `${(ambient / capped).toFixed(2)}x |`,
        );
      }
      console.log();
    }
  }

  if (nodes.length === 2) {
    const [before, after] = nodes;
    console.log(`## ${before.label} vs ${after.label}`);
    console.log();
    console.log('| API | Elements | Cap 10 speedup | Ambient speedup |');
    console.log('|---|---:|---:|---:|');

    for (const api of APIS) {
      for (const count of COUNTS) {
        const lookup = (label, mode) =>
          results.find(
            result =>
              result.label === label &&
              result.api === api &&
              result.count === count &&
              result.mode === mode,
          ).median;
        const cappedSpeedup =
          lookup(before.label, 'react-cap-10') / lookup(after.label, 'react-cap-10');
        const ambientSpeedup =
          lookup(before.label, 'ambient') / lookup(after.label, 'ambient');
        console.log(
          `| ${api} | ${count.toLocaleString('en-US')} | ` +
            `${cappedSpeedup.toFixed(2)}x | ${ambientSpeedup.toFixed(2)}x |`,
        );
      }
    }
    console.log();
  }
}

function runBenchmark(argv) {
  const {nodes, samples, ambientLimit} = parseRunnerArguments(argv);
  const results = [];

  for (const node of nodes) {
    for (const api of APIS) {
      for (const count of COUNTS) {
        for (const mode of MODES) {
          const measurements = [];
          let metadata;
          for (let sample = 0; sample < samples; sample++) {
            metadata = runSample(node.binary, api, count, mode, ambientLimit);
            measurements.push(metadata.duration);
          }

          const expectedLines =
            mode === 'baseline'
              ? 0
              : mode === 'react-cap-10'
                ? OWNER_STACK_TRACE_LIMIT + 1
                : ambientLimit + 1;
          if (metadata.capturedLines !== expectedLines) {
            throw new Error(
              `${api}/${mode} captured ${metadata.capturedLines} lines; expected ${expectedLines}`,
            );
          }
          if (metadata.restoredLimit !== ambientLimit) {
            throw new Error(
              `${api}/${mode} left Error.stackTraceLimit at ${metadata.restoredLimit}`,
            );
          }

          results.push({
            ...metadata,
            label: node.label,
            samples: measurements,
            median: median(measurements),
          });
        }
      }
    }
  }

  printResults(results, nodes, ambientLimit);
}

if (process.argv[2] === '--worker') {
  runWorker(process.argv[3], Number(process.argv[4]), process.argv[5], Number(process.argv[6]));
} else {
  runBenchmark(process.argv.slice(2));
}
