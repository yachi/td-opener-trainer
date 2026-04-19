import fc from 'fast-check';

const isCI = !!process.env.CI;

fc.configureGlobal({
  numRuns: isCI ? 2_000 : 50,
  interruptAfterTimeLimit: isCI ? 60_000 : 5_000,
});
