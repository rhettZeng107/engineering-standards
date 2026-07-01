#!/usr/bin/env node
/*
 * Codex migration audit wrapper.
 *
 * V0: initialize a standard migration batch and run deterministic gates.
 * V1: merge adversarial vote outputs and generate a single audit report.
 *
 * No third-party dependencies. The config intentionally uses a flat YAML subset:
 * key: value
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOL_DIR = __dirname;
const STANDARDS_ROOT = path.resolve(TOOL_DIR, '..', '..');
const TEMPLATE_DIR = path.join(STANDARDS_ROOT, 'templates', 'migration-batch');
const DEFAULT_CONFIG = 'migration.yaml';
const DEFAULT_STATE = '.codex-migration-audit-state.json';

function usage(exitCode = 2) {
  const text = `
Usage:
  codex-migration-audit init --target <batch-dir> [--batch-id <id>] [--title <title>] [--force]
  codex-migration-audit gate   --config <migration.yaml>
  codex-migration-audit fields --config <migration.yaml>
  codex-migration-audit vote   --config <migration.yaml>
  codex-migration-audit local  --config <migration.yaml>
  codex-migration-audit report --config <migration.yaml>
  codex-migration-audit verify --config <migration.yaml>
  codex-migration-audit all    --config <migration.yaml>

Commands:
  init    Copy templates/migration-batch into a project spec directory.
  gate    Run migration-gate.sh using migration.yaml.
  fields  Run field-diff.sh for entries in field-diffs.json.
  vote    Merge votes.json using fail-safe disputed/confirmed rules.
  local   Run local verification commands from local-verify.commands.
  report  Write audit-report.json and audit-report.md from captured state.
  verify  Hard local gate: gate, fields, vote, local, then report.
  all     Alias for verify.
`;
  console.error(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'force') {
      args.force = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== '\\') {
      quote = quote === ch ? null : quote || ch;
    }
    if (ch === '#' && !quote && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function unquote(value) {
  const trimmed = stripInlineComment(String(value || '').trim());
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readFlatYaml(file) {
  const cfg = {};
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    cfg[match[1]] = unquote(match[2]);
  }
  return cfg;
}

function readConfig(configPath) {
  const abs = path.resolve(configPath || DEFAULT_CONFIG);
  if (!fs.existsSync(abs)) {
    throw new Error(`Config not found: ${abs}`);
  }
  const cfg = readFlatYaml(abs);
  cfg.__configPath = abs;
  cfg.__configDir = path.dirname(abs);
  cfg.__workspaceRoot = resolveMaybe(cfg.__configDir, cfg.workspaceRoot || '.');
  cfg.auditStateFile = cfg.auditStateFile || DEFAULT_STATE;
  cfg.voteResultJson = cfg.voteResultJson || 'audit-votes.json';
  return cfg;
}

function resolveMaybe(base, value) {
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveCsv(root, csv) {
  return splitCsv(csv)
    .map((item) => (path.isAbsolute(item) ? item : path.resolve(root, item)))
    .join(',');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyTemplate(src, dst, replacements, force) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dst);
    for (const entry of fs.readdirSync(src)) {
      copyTemplate(path.join(src, entry), path.join(dst, entry), replacements, force);
    }
    return;
  }
  if (fs.existsSync(dst) && !force) {
    throw new Error(`Refusing to overwrite existing file: ${dst}. Use --force if intended.`);
  }
  let content = fs.readFileSync(src, 'utf8');
  for (const [from, to] of Object.entries(replacements)) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(dst, content);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    shell: false,
  });
  const record = {
    command: [command, ...args].join(' '),
    exitCode: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
  if (!options.quiet) {
    if (record.stdout) process.stdout.write(record.stdout);
    if (record.stderr) process.stderr.write(record.stderr);
  }
  return record;
}

function statePath(cfg) {
  return resolveMaybe(cfg.__configDir, cfg.auditStateFile || DEFAULT_STATE);
}

function readState(cfg) {
  const file = statePath(cfg);
  if (!fs.existsSync(file)) {
    return {
      schemaVersion: '0.1',
      batchId: cfg.batchId || '',
      updatedAt: '',
      gate: null,
      fields: null,
      vote: null,
      local: null,
    };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeState(cfg, patch) {
  const state = { ...readState(cfg), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statePath(cfg), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

function decideVotes(votes) {
  const valid = (votes || []).filter((vote) => vote && !vote.error && !vote._error);
  const refuteCount = valid.filter((vote) => vote.refuted === true).length;
  const disputed = valid.length < 2 ? true : refuteCount * 2 >= valid.length;
  return {
    voterCount: valid.length,
    refuteCount,
    status: disputed ? 'disputed' : 'confirmed',
    counterEvidence: valid
      .filter((vote) => vote.refuted === true)
      .map((vote) => `[${vote.lens || 'unknown'}] ${vote.counterEvidence || vote.note || ''}`),
  };
}

function normalizeVoteInput(input) {
  if (Array.isArray(input)) return [{ id: 'artifact-1', votes: input }];
  if (Array.isArray(input.artifacts)) return input.artifacts;
  if (Array.isArray(input.votes)) return [{ id: input.id || 'artifact-1', subject: input.subject || '', votes: input.votes }];
  throw new Error('votes input must be an array, {votes:[...]}, or {artifacts:[{id,votes}]}');
}

function commandInit(args) {
  const target = args.target || args.dir;
  if (!target) usage();
  const absTarget = path.resolve(target);
  const batchId = args['batch-id'] || path.basename(absTarget);
  const title = args.title || batchId;
  copyTemplate(
    TEMPLATE_DIR,
    absTarget,
    {
      '<yyyy-mm-dd-topic>': batchId,
      '<Migration Batch Title>': title,
      '<ISO-8601>': new Date().toISOString(),
    },
    Boolean(args.force),
  );
  console.log(`Initialized migration batch: ${absTarget}`);
}

function commandGate(cfg) {
  const frontendSrcDir = resolveMaybe(cfg.__workspaceRoot, cfg.frontendSrcDir || '');
  if (!frontendSrcDir) throw new Error('frontendSrcDir is required in migration.yaml');
  const coverageFile = cfg.migrationCoverageFile
    ? resolveMaybe(cfg.__configDir, cfg.migrationCoverageFile)
    : '';
  const record = runCommand(path.join(TOOL_DIR, 'migration-gate.sh'), [
    frontendSrcDir,
    cfg.oldBackendMarkersCsv || '',
    cfg.apiAddrGlobCsv || '',
    resolveCsv(cfg.__workspaceRoot, cfg.legacyRootsCsv || ''),
    coverageFile,
  ]);
  writeState(cfg, { gate: record });
  return record.exitCode;
}

function commandFields(cfg) {
  const fieldDiffsFile = resolveMaybe(cfg.__configDir, cfg.fieldDiffsFile || 'field-diffs.json');
  if (!fs.existsSync(fieldDiffsFile)) {
    throw new Error(`fieldDiffsFile not found: ${fieldDiffsFile}`);
  }
  const entries = JSON.parse(fs.readFileSync(fieldDiffsFile, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('field-diffs.json must be an array');

  const results = [];
  let fail = 0;
  for (const entry of entries) {
    if (!entry || !entry.id || String(entry.id).includes('module-name')) continue;
    const record = runCommand(path.join(TOOL_DIR, 'field-diff.sh'), [
      resolveCsv(cfg.__workspaceRoot, entry.oldFilesCsv || ''),
      resolveCsv(cfg.__workspaceRoot, entry.newFilesCsv || ''),
      entry.coverageFile ? resolveMaybe(cfg.__configDir, entry.coverageFile) : '',
      entry.stripPrefixesCsv || 'Bas_,Fk_',
    ]);
    results.push({ id: entry.id, ...record });
    if (record.exitCode !== 0) fail += 1;
  }
  if (results.length === 0) {
    console.log('No active field diff entries. Fill field-diffs.json to enable field gate.');
  }
  writeState(cfg, { fields: { exitCode: fail, results } });
  return fail;
}

function commandVote(cfg) {
  const votesFile = resolveMaybe(cfg.__configDir, cfg.votesFile || 'votes.json');
  if (!fs.existsSync(votesFile)) {
    throw new Error(`votesFile not found: ${votesFile}`);
  }
  const input = JSON.parse(fs.readFileSync(votesFile, 'utf8'));
  const artifacts = normalizeVoteInput(input).map((artifact) => ({
    id: artifact.id || artifact.subject || 'artifact',
    subject: artifact.subject || '',
    ...decideVotes(artifact.votes || []),
  }));
  const output = { schemaVersion: '0.1', artifacts };
  const outFile = resolveMaybe(cfg.__configDir, cfg.voteResultJson || 'audit-votes.json');
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  const disputed = artifacts.filter((artifact) => artifact.status === 'disputed').length;
  writeState(cfg, { vote: { exitCode: disputed, outputFile: outFile, artifacts } });
  return disputed;
}

function readCommandFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`localVerifyCommandsFile not found: ${file}`);
  }
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function commandLocal(cfg) {
  const commandFile = resolveMaybe(cfg.__configDir, cfg.localVerifyCommandsFile || 'local-verify.commands');
  const commands = readCommandFile(commandFile);
  const results = [];
  if (commands.length === 0) {
    const record = {
      exitCode: 1,
      commandFile,
      results,
      error: 'local verification command list is empty',
    };
    writeState(cfg, { local: record });
    console.error(`codex-migration-audit: ${record.error}. Fill ${commandFile}`);
    return 1;
  }
  let fail = 0;
  for (const command of commands) {
    const record = runCommand('/bin/sh', ['-lc', command], { cwd: cfg.__workspaceRoot });
    results.push({ command, ...record });
    if (record.exitCode !== 0) fail += 1;
  }
  writeState(cfg, { local: { exitCode: fail, commandFile, results } });
  return fail;
}

function summarizeBlocking(state) {
  const blocks = [];
  if (!state.gate) blocks.push('gate not_run');
  else if (state.gate.exitCode !== 0) blocks.push(`gate exit=${state.gate.exitCode}`);
  if (!state.fields) blocks.push('fields not_run');
  else if (state.fields.exitCode !== 0) blocks.push(`fields exit=${state.fields.exitCode}`);
  if (!state.vote) blocks.push('vote not_run');
  else if (state.vote.exitCode !== 0) blocks.push(`vote disputed=${state.vote.exitCode}`);
  if (!state.local) blocks.push('local verification not_run');
  else if (state.local.exitCode !== 0) blocks.push(`local verification exit=${state.local.exitCode}`);
  return blocks;
}

function commandReport(cfg) {
  const state = readState(cfg);
  const blocks = summarizeBlocking(state);
  const reportJson = {
    schemaVersion: '0.1',
    batchId: cfg.batchId || state.batchId || '',
    generatedAt: new Date().toISOString(),
    status: blocks.length ? 'blocked' : 'pass',
    blockingFindings: blocks,
    state,
  };
  const jsonFile = resolveMaybe(cfg.__configDir, cfg.auditReportJson || 'audit-report.json');
  const mdFile = resolveMaybe(cfg.__configDir, cfg.auditReportMd || 'audit-report.md');
  fs.writeFileSync(jsonFile, `${JSON.stringify(reportJson, null, 2)}\n`);

  const voteRows = state.vote?.artifacts || [];
  const fieldRows = state.fields?.results || [];
  const md = [
    '# Migration Audit Report',
    '',
    `- Batch: ${reportJson.batchId || ''}`,
    `- Generated: ${reportJson.generatedAt}`,
    `- Status: ${reportJson.status}`,
    '',
    '## Gate Summary',
    '',
    `- migration-gate: ${state.gate ? `exit=${state.gate.exitCode}` : 'not_run'}`,
    `- field-diff: ${state.fields ? `exit=${state.fields.exitCode}` : 'not_run'}`,
    `- adversarial-vote: ${state.vote ? `disputed=${state.vote.exitCode}` : 'not_run'}`,
    `- local-verification: ${state.local ? `exit=${state.local.exitCode}` : 'not_run'}`,
    '',
    '## Blocking Findings',
    '',
    ...(blocks.length ? blocks.map((item) => `- ${item}`) : ['- None']),
    '',
    '## Field Diff Results',
    '',
    ...(fieldRows.length
      ? fieldRows.map((row) => `- ${row.id}: exit=${row.exitCode}`)
      : ['- None']),
    '',
    '## Vote Results',
    '',
    ...(voteRows.length
      ? voteRows.map((row) => `- ${row.id}: ${row.status} (${row.refuteCount}/${row.voterCount} refuted)`)
      : ['- None']),
    '',
    '## Local Verification',
    '',
    ...(state.local?.results?.length
      ? state.local.results.map((row) => `- exit=${row.exitCode}: \`${row.command}\``)
      : ['- None']),
    '',
    '## Evidence Files',
    '',
    `- State: ${path.relative(cfg.__configDir, statePath(cfg))}`,
    `- JSON: ${path.relative(cfg.__configDir, jsonFile)}`,
    state.vote?.outputFile ? `- Vote JSON: ${path.relative(cfg.__configDir, state.vote.outputFile)}` : '- Vote JSON: not_run',
    '',
  ].join('\n');
  fs.writeFileSync(mdFile, md);
  console.log(`Wrote ${jsonFile}`);
  console.log(`Wrote ${mdFile}`);
  return blocks.length;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const command = args._[0];
    if (!command || command === 'help' || command === '--help') usage(command ? 0 : 2);
    if (command === 'init') {
      commandInit(args);
      return;
    }

    const cfg = readConfig(args.config || args.c || DEFAULT_CONFIG);
    let exitCode = 0;
    if (command === 'gate') exitCode = commandGate(cfg);
    else if (command === 'fields') exitCode = commandFields(cfg);
    else if (command === 'vote') exitCode = commandVote(cfg);
    else if (command === 'local') exitCode = commandLocal(cfg);
    else if (command === 'report') exitCode = commandReport(cfg);
    else if (command === 'verify' || command === 'all') {
      const g = commandGate(cfg);
      const f = commandFields(cfg);
      const v = commandVote(cfg);
      const l = commandLocal(cfg);
      const r = commandReport(cfg);
      exitCode = g || f || v || l || r ? 1 : 0;
    } else {
      usage();
    }
    process.exit(exitCode);
  } catch (error) {
    console.error(`codex-migration-audit: ${error.message}`);
    process.exit(1);
  }
}

main();
