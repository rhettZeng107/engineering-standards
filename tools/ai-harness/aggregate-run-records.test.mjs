import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  aggregateRecords,
  collectRunRecordFiles,
  parseCliArgs,
} from './aggregate-run-records.mjs';

function record({
  id,
  track = 'standard',
  riskFlags = [],
  endedAt = '2026-08-15T00:00:00Z',
  qualityMetrics,
}) {
  return {
    sourcePath: `/records/${id}.json`,
    data: {
      schemaVersion: '0.4',
      task: { id, track, riskFlags, endedAt },
      qualityMetrics,
    },
  };
}

const passingQuality = {
  primaryReview: { firstPass: true },
  rework: {
    reviewCycles: 0,
    verificationCycles: 1,
    e2eProductCycles: 0,
    rebaselineCount: 0,
  },
  e2e: {
    status: 'pass',
    attempts: 2,
    productFailureCount: 0,
    environmentFailureCount: 1,
  },
  highEscape: {
    status: 'not_observed',
    count: 0,
    observedThrough: 'ci',
  },
};

test('aggregates comparable quality metrics without coercing unknown records', () => {
  const result = aggregateRecords([
    record({ id: 'standard-pass', qualityMetrics: passingQuality }),
    {
      ...record({ id: 'standard-pass', qualityMetrics: passingQuality }),
      sourcePath: '/records/standard-pass-replayed.json',
    },
    record({
      id: 'migration-rework',
      track: 'migration',
      riskFlags: ['auth-menu'],
      qualityMetrics: {
        primaryReview: { firstPass: false },
        rework: {
          reviewCycles: 1,
          verificationCycles: 0,
          e2eProductCycles: 1,
          rebaselineCount: 1,
        },
        e2e: {
          status: 'fail',
          attempts: 1,
          productFailureCount: 1,
          environmentFailureCount: 0,
        },
        highEscape: {
          status: 'observed',
          count: 1,
          observedThrough: 'deployment',
          escapedGate: 'primary_review',
        },
      },
    }),
    record({ id: 'db-risk', track: 'simple', riskFlags: ['db-contract'], qualityMetrics: passingQuality }),
    record({ id: 'authorization-risk', track: 'simple', riskFlags: ['authorization'], qualityMetrics: passingQuality }),
    record({ id: 'authentication-risk', track: 'simple', riskFlags: ['authentication'], qualityMetrics: passingQuality }),
    record({ id: 'authenticated-export-risk', track: 'simple', riskFlags: ['authenticated-file-export'], qualityMetrics: passingQuality }),
    record({
      id: 'not-applicable',
      qualityMetrics: {
        primaryReview: { firstPass: 'not_applicable' },
        rework: {},
        e2e: { status: 'not_required' },
        highEscape: { status: 'not_evaluable', observedThrough: 'unknown' },
      },
    }),
    record({ id: 'legacy-record', qualityMetrics: undefined }),
  ]);

  assert.equal(result.records.discovered, 9);
  assert.equal(result.records.included, 8);
  assert.equal(result.records.duplicates, 1);
  assert.equal(result.records.missingQualityMetrics, 1);
  assert.deepEqual(result.byTrack.standard.primaryReview, {
    pass: 1,
    fail: 0,
    notApplicable: 1,
    unknown: 1,
  });
  assert.equal(result.byTrack.standard.rework.verificationCycles, 1);
  assert.equal(result.byTrack.standard.e2e.environmentFailureCount, 1);
  assert.equal(result.byTrack.standard.e2e.status.notRequired, 1);
  assert.equal(result.byTrack.standard.highEscape.notEvaluable, 1);
  assert.equal(result.byTrack.migration.primaryReview.fail, 1);
  assert.equal(result.byTrack.migration.rework.reviewCycles, 1);
  assert.equal(result.byTrack.migration.highEscape.observed, 1);
  assert.equal(result.riskSlices.dbAuth.records, 5);
  assert.equal(result.riskSlices.e2eHeavy.records, 6);
});

test('excludes out-of-window records and reports invalid observation boundaries', () => {
  const invalidBoundary = structuredClone(passingQuality);
  invalidBoundary.highEscape.observedThrough = 'unknown';

  const result = aggregateRecords(
    [
      record({ id: 'inside', endedAt: '2026-08-15T00:00:00+08:00', qualityMetrics: invalidBoundary }),
      record({ id: 'month-start', endedAt: '2026-08-01T00:00:00+08:00', qualityMetrics: passingQuality }),
      record({ id: 'utc-cross-offset', endedAt: '2026-07-31T23:59:59Z', qualityMetrics: passingQuality }),
      record({ id: 'before', endedAt: '2026-07-31T15:59:59.999Z', qualityMetrics: passingQuality }),
      record({ id: 'month-end', endedAt: '2026-08-31T23:59:59.999+08:00', qualityMetrics: passingQuality }),
      record({ id: 'after', endedAt: '2026-09-01T00:00:00+08:00', qualityMetrics: passingQuality }),
      record({ id: 'missing-date', endedAt: '', qualityMetrics: passingQuality }),
      record({ id: 'invalid-date', endedAt: '2026-02-31T00:00:00+08:00', qualityMetrics: passingQuality }),
    ],
    { from: '2026-08-01', to: '2026-08-31', timezone: '+08:00' },
  );

  assert.equal(result.records.discovered, 8);
  assert.equal(result.records.included, 4);
  assert.equal(result.records.outsideWindow, 2);
  assert.equal(result.records.missingOrInvalidEndedAt, 2);
  assert.deepEqual(result.dataQuality.missingOrInvalidEndedAt, [
    '/records/missing-date.json',
    '/records/invalid-date.json',
  ]);
  assert.deepEqual(result.dataQuality.invalidHighEscapeBoundary, ['/records/inside.json']);
});

test('collects only run-record JSON files and ignores generated dependency directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'run-record-aggregate-'));
  await mkdir(path.join(root, 'nested'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(path.join(root, 'run-record.alpha.json'), '{}');
  await writeFile(path.join(root, 'nested', 'batch-run-record.json'), '{}');
  await writeFile(path.join(root, 'nested', 'other.json'), '{}');
  await writeFile(path.join(root, 'run-record.template.json'), '{}');
  await writeFile(path.join(root, 'node_modules', 'pkg', 'run-record.hidden.json'), '{}');

  try {
    const files = await collectRunRecordFiles([root]);

    assert.deepEqual(files.map((file) => path.relative(root, file)), [
      'nested/batch-run-record.json',
      'run-record.alpha.json',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parses explicit month and input paths', () => {
  assert.deepEqual(
    parseCliArgs(['--month', '2026-08', '--timezone', '+08:00', '/a', '/b']),
    {
      from: '2026-08-01',
      to: '2026-08-31',
      timezone: '+08:00',
      paths: ['/a', '/b'],
      pretty: true,
    },
  );
  assert.throws(() => parseCliArgs(['--month', '2026-13']), /Invalid --month/);
  assert.throws(() => parseCliArgs(['--month', '2026-08']), /--timezone is required/);
  assert.throws(() => parseCliArgs(['--from']), /Missing value for --from/);
  assert.throws(() => parseCliArgs(['--to']), /Missing value for --to/);
  assert.throws(() => parseCliArgs(['--from', '2026-08-01']), /--timezone is required/);
  assert.throws(() => parseCliArgs(['--to', '2026-08-31']), /--timezone is required/);
  assert.throws(() => parseCliArgs(['--to', '2026-02-31', '--timezone', '+08:00']), /Invalid date/);
  assert.throws(
    () => parseCliArgs(['--from', '2026-08-02', '--to', '2026-08-01', '--timezone', '+08:00']),
    /--from must not be after --to/,
  );
  assert.throws(() => parseCliArgs(['--timezone', '+15:00']), /Invalid --timezone/);
});
