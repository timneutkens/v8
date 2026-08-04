// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --allow-natives-syntax --maglev --turbofan --no-maglev-inlining
// Flags: --no-turbo-inlining

function captureMaglevError() {
  return new Error();
}

function captureTurbofanError() {
  return new Error();
}

const maglevReceiver = {};
%PrepareFunctionForOptimization(captureMaglevError);
captureMaglevError.call(maglevReceiver);
captureMaglevError.call(maglevReceiver);
%OptimizeMaglevOnNextCall(captureMaglevError);
const maglevError = captureMaglevError.call(maglevReceiver);
assertOptimized(captureMaglevError);

const turbofanReceiver = {};
%PrepareFunctionForOptimization(captureTurbofanError);
captureTurbofanError.call(turbofanReceiver);
captureTurbofanError.call(turbofanReceiver);
%OptimizeFunctionOnNextCall(captureTurbofanError);
const turbofanError = captureTurbofanError.call(turbofanReceiver);
assertOptimized(captureTurbofanError);

// Installing prepareStackTrace after construction verifies that optimized
// stack capture retained the receiver and function, not just the location.
Error.prepareStackTrace = (error, frames) => frames;

function assertFrame(error, receiver, func, name, line) {
  const frame = error.stack[0];
  assertSame(receiver, frame.getThis());
  assertSame(func, frame.getFunction());
  assertEquals(name, frame.getFunctionName());
  assertEquals(line, frame.getLineNumber());
  assertTrue(frame.getColumnNumber() > 0);
}

assertFrame(maglevError, maglevReceiver, captureMaglevError,
            'captureMaglevError', 9);
assertFrame(turbofanError, turbofanReceiver, captureTurbofanError,
            'captureTurbofanError', 13);

// JavaScript builtin continuations are counted as JavaScript frames in deopt
// translations, but must retain the existing builtin summary path.
let continuationError;
const value = {
  valueOf() {
    continuationError = new Error();
    return 1.2;
  }
};

function captureBuiltinContinuation(value) {
  const object = {};
  Object.defineProperty(object, 'x', {set: Math.ceil});
  object.x = value;
}

Error.prepareStackTrace = undefined;
%PrepareFunctionForOptimization(captureBuiltinContinuation);
captureBuiltinContinuation(value);
captureBuiltinContinuation(value);
%OptimizeMaglevOnNextCall(captureBuiltinContinuation);
captureBuiltinContinuation(value);

Error.prepareStackTrace = (error, frames) => frames;
const continuationFrames = continuationError.stack;
assertEquals('valueOf', continuationFrames[0].getFunctionName());
assertEquals('ceil', continuationFrames[1].getFunctionName());
assertEquals('captureBuiltinContinuation',
             continuationFrames[2].getFunctionName());
