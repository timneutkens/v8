// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

(function() {

const kRecursionDepth = 64;
const kOriginalStackTraceLimit = Error.stackTraceLimit;
let sink;

function CaptureUnreadError(remaining) {
  if (remaining === 0) {
    // Keep the most recent Error alive, but leave its stack unread while the
    // benchmark is running. This isolates the eager stack-capture cost from
    // stack serialization.
    sink = new Error();
    return;
  }
  CaptureUnreadError(remaining - 1);
}

function Run() {
  CaptureUnreadError(kRecursionDepth);
}

function Setup10Frames() {
  Error.stackTraceLimit = 10;
}

function Setup50Frames() {
  Error.stackTraceLimit = 50;
}

function Verify10Frames() {
  assertEquals(11, String(sink.stack).split('\n').length);
  Error.stackTraceLimit = kOriginalStackTraceLimit;
  sink = undefined;
}

function Verify50Frames() {
  assertEquals(51, String(sink.stack).split('\n').length);
  Error.stackTraceLimit = kOriginalStackTraceLimit;
  sink = undefined;
}

createSuiteWithWarmup('Unread-Deep-Capture-Limit10', 1000, Run,
                      Setup10Frames, Verify10Frames);
createSuiteWithWarmup('Unread-Deep-Capture-Limit50', 1000, Run,
                      Setup50Frames, Verify50Frames);

})();
