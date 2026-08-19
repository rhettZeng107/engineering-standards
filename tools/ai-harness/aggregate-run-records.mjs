#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'bin',
  'build',
  'dist',
  'node_modules',
  'obj',
]);

const OBSERVATION_BOUNDARIES = new Set([
  'pre_commit',
  'ci',
  'deployment',
  'production',
]);

function emptyMetrics() {
  return {
    records: 0,
    primaryReview: {
      pass: 0,
      fail: 0,
      notApplicable: 0,
      unknown: 0,
    },
    rework: {
      reviewCycles: 0,
      verificationCycles: 0,
      e2eProductCycles: 0,
      rebaselineCount: 0,
    },
    e2e: {
      status: {
        pass: 0,
        fail: 0,
        blocked: 0,
        notRequired: 0,
        notRun: 0,
        unknown: 0,
      },
      attempts: 0,
      productFailureCount: 0,
      environmentFailureCount: 0,
    },
    highEscape: {
      observed: 0,
      notObserved: 0,
      notEvaluable: 0,
      unknown: 0,
      count: 0,
      byBoundary: {
        preCommit: 0,
        ci: 0,
        deployment: 0,
        production: 0,
        unknown: 0,
      },
    },
  };
}

function nonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function incrementPrimaryReview(target, value) {
  if (value === true || value === 'true') target.pass += 1;
  else if (value === false || value === 'false') target.fail += 1;
  else if (value === 'not_applicable') target.notApplicable += 1;
  else target.unknown += 1;
}

function incrementStatus(target, value) {
  const key = {
    pass: 'pass',
    fail: 'fail',
    blocked: 'blocked',
    not_required: 'notRequired',
    not_run: 'notRun',
  }[value] ?? 'unknown';
  target[key] += 1;
}

function incrementHighEscape(target, value) {
  const key = {
    observed: 'observed',
    not_observed: 'notObserved',
    not_evaluable: 'notEvaluable',
  }[value] ?? 'unknown';
  target[key] += 1;
}

function incrementBoundary(target, value) {
  const key = {
    pre_commit: 'preCommit',
    ci: 'ci',
    deployment: 'deployment',
    production: 'production',
  }[value] ?? 'unknown';
  target[key] += 1;
}

function addRecord(target, qualityMetrics) {
  target.records += 1;
  const quality = qualityMetrics ?? {};
  incrementPrimaryReview(target.primaryReview, quality.primaryReview?.firstPass);

  const rework = quality.rework ?? {};
  target.rework.reviewCycles += nonNegativeNumber(rework.reviewCycles);
  target.rework.verificationCycles += nonNegativeNumber(rework.verificationCycles);
  target.rework.e2eProductCycles += nonNegativeNumber(rework.e2eProductCycles);
  target.rework.rebaselineCount += nonNegativeNumber(rework.rebaselineCount);

  const e2e = quality.e2e ?? {};
  incrementStatus(target.e2e.status, e2e.status);
  target.e2e.attempts += nonNegativeNumber(e2e.attempts);
  target.e2e.productFailureCount += nonNegativeNumber(e2e.productFailureCount);
  target.e2e.environmentFailureCount += nonNegativeNumber(e2e.environmentFailureCount);

  const highEscape = quality.highEscape ?? {};
  incrementHighEscape(target.highEscape, highEscape.status);
  target.highEscape.count += nonNegativeNumber(highEscape.count);
  incrementBoundary(target.highEscape.byBoundary, highEscape.observedThrough);
}

function timezoneOffsetMinutes(timezone) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezone ?? '');
  if (!match) throw new Error(`Invalid --timezone: ${timezone ?? ''}`);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    throw new Error(`Invalid --timezone: ${timezone}`);
  }
  const offset = (hours * 60) + minutes;
  return match[1] === '-' ? -offset : offset;
}

function parseWindowBoundary(value, endOfDay, timezone) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(calendarCheck.getTime())
    || calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() + 1 !== month
    || calendarCheck.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  const localTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return localTimestamp - (timezoneOffsetMinutes(timezone) * 60_000);
}

function isInsideWindow(endedAt, from, to, timezone) {
  if (!from && !to) return true;
  const timestamp = strictIsoTimestamp(endedAt);
  if (!Number.isFinite(timestamp)) return false;
  const fromTimestamp = parseWindowBoundary(from, false, timezone);
  const toTimestamp = parseWindowBoundary(to, true, timezone);
  return (fromTimestamp === undefined || timestamp >= fromTimestamp)
    && (toTimestamp === undefined || timestamp <= toTimestamp);
}

function strictIsoTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value ?? '');
  if (!match) return Number.NaN;

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const milliseconds = (match[7] ?? '').padEnd(3, '0').slice(0, 3);
  const localCalendar = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${milliseconds}Z`,
  );
  if (
    !Number.isFinite(localCalendar.getTime())
    || localCalendar.getUTCFullYear() !== year
    || localCalendar.getUTCMonth() + 1 !== month
    || localCalendar.getUTCDate() !== day
    || localCalendar.getUTCHours() !== hour
    || localCalendar.getUTCMinutes() !== minute
    || localCalendar.getUTCSeconds() !== second
  ) {
    return Number.NaN;
  }

  if (match[8] !== 'Z') {
    try {
      timezoneOffsetMinutes(match[8]);
    } catch {
      return Number.NaN;
    }
  }
  return Date.parse(value);
}

function duplicateKey(sourcePath, data) {
  const id = data.task?.id;
  const endedAt = data.task?.endedAt;
  return id && endedAt ? `${id}\0${endedAt}` : sourcePath;
}

function isDbAuthRecord(data) {
  return (data.task?.riskFlags ?? []).some((flag) => /^(?:auth.*|db(?:[-_].*)?|database(?:[-_].*)?)$/i.test(flag));
}

function isE2eHeavyRecord(qualityMetrics) {
  return ['pass', 'fail', 'blocked'].includes(qualityMetrics?.e2e?.status);
}

export function aggregateRecords(records, { from, to, timezone } = {}) {
  const result = {
    window: { from: from ?? null, to: to ?? null, timezone: timezone ?? null },
    records: {
      discovered: records.length,
      included: 0,
      outsideWindow: 0,
      duplicates: 0,
      missingQualityMetrics: 0,
      missingOrInvalidEndedAt: 0,
    },
    dataQuality: {
      missingQualityMetrics: [],
      missingOrInvalidEndedAt: [],
      invalidHighEscapeBoundary: [],
    },
    byTrack: {},
    riskSlices: {
      dbAuth: emptyMetrics(),
      e2eHeavy: emptyMetrics(),
    },
  };
  const seen = new Set();

  for (const record of records) {
    const sourcePath = record.sourcePath ?? '<unknown>';
    const data = record.data ?? {};
    const endedAt = data.task?.endedAt;

    if ((from || to) && !Number.isFinite(strictIsoTimestamp(endedAt))) {
      result.records.missingOrInvalidEndedAt += 1;
      result.dataQuality.missingOrInvalidEndedAt.push(sourcePath);
      continue;
    }
    if (!isInsideWindow(endedAt, from, to, timezone)) {
      result.records.outsideWindow += 1;
      continue;
    }

    const key = duplicateKey(sourcePath, data);
    if (seen.has(key)) {
      result.records.duplicates += 1;
      continue;
    }
    seen.add(key);

    const quality = data.qualityMetrics;
    if (!quality) {
      result.records.missingQualityMetrics += 1;
      result.dataQuality.missingQualityMetrics.push(sourcePath);
    }

    const escapeStatus = quality?.highEscape?.status;
    const boundary = quality?.highEscape?.observedThrough;
    if (['observed', 'not_observed'].includes(escapeStatus) && !OBSERVATION_BOUNDARIES.has(boundary)) {
      result.dataQuality.invalidHighEscapeBoundary.push(sourcePath);
    }

    const track = ['simple', 'standard', 'migration'].includes(data.task?.track)
      ? data.task.track
      : 'unknown';
    result.byTrack[track] ??= emptyMetrics();
    addRecord(result.byTrack[track], quality);
    if (isDbAuthRecord(data)) addRecord(result.riskSlices.dbAuth, quality);
    if (isE2eHeavyRecord(quality)) addRecord(result.riskSlices.e2eHeavy, quality);
    result.records.included += 1;
  }

  return result;
}

function isRunRecordName(name) {
  const normalizedName = name.toLowerCase();
  return normalizedName.endsWith('.json')
    && normalizedName.includes('run-record')
    && !normalizedName.includes('.template.');
}

async function walk(inputPath, output) {
  const inputStat = await stat(inputPath);
  if (inputStat.isFile()) {
    if (isRunRecordName(path.basename(inputPath))) output.push(path.resolve(inputPath));
    return;
  }
  if (!inputStat.isDirectory()) return;

  const entries = await readdir(inputPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isDirectory() || (entry.isFile() && isRunRecordName(entry.name))) {
      await walk(path.join(inputPath, entry.name), output);
    }
  }
}

export async function collectRunRecordFiles(paths) {
  const files = [];
  for (const inputPath of paths) await walk(path.resolve(inputPath), files);
  return [...new Set(files)].sort();
}

export async function loadRunRecords(files) {
  const records = [];
  const invalidJson = [];
  for (const file of files) {
    try {
      records.push({ sourcePath: file, data: JSON.parse(await readFile(file, 'utf8')) });
    } catch (error) {
      invalidJson.push({ sourcePath: file, error: error.message });
    }
  }
  return { records, invalidJson };
}

function monthWindow(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) throw new Error(`Invalid --month: ${month ?? ''}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error(`Invalid --month: ${month}`);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${match[1]}-${match[2]}-01`,
    to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function parseCliArgs(args) {
  const result = {
    from: undefined,
    to: undefined,
    timezone: undefined,
    paths: [],
    pretty: true,
  };
  const optionValue = (option, index) => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${option}`);
    }
    return value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--month') {
      const window = monthWindow(optionValue(arg, index));
      index += 1;
      result.from = window.from;
      result.to = window.to;
    } else if (arg === '--from') {
      result.from = optionValue(arg, index);
      index += 1;
    } else if (arg === '--to') {
      result.to = optionValue(arg, index);
      index += 1;
    } else if (arg === '--timezone') {
      result.timezone = optionValue(arg, index);
      index += 1;
    } else if (arg === '--compact') {
      result.pretty = false;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      result.paths.push(arg);
    }
  }
  if ((result.from || result.to) && !result.timezone) {
    throw new Error('--timezone is required with --month, --from, or --to');
  }
  if (result.timezone) timezoneOffsetMinutes(result.timezone);
  const fromTimestamp = parseWindowBoundary(result.from, false, result.timezone);
  const toTimestamp = parseWindowBoundary(result.to, true, result.timezone);
  if (fromTimestamp !== undefined && toTimestamp !== undefined && fromTimestamp > toTimestamp) {
    throw new Error('--from must not be after --to');
  }
  return result;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const inputPaths = options.paths.length > 0 ? options.paths : [process.cwd()];
  const files = await collectRunRecordFiles(inputPaths);
  const loaded = await loadRunRecords(files);
  const summary = aggregateRecords(loaded.records, options);
  summary.dataQuality.invalidJson = loaded.invalidJson;
  process.stdout.write(`${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`aggregate-run-records: ${error.message}\n`);
    process.exitCode = 1;
  });
}
