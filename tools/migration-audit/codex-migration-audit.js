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
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TOOL_DIR = __dirname;
const STANDARDS_ROOT = path.resolve(TOOL_DIR, '..', '..');
const TEMPLATE_DIR = path.join(STANDARDS_ROOT, 'templates', 'migration-batch');
const DEFAULT_CONFIG = 'migration.yaml';
const DEFAULT_STATE = '.codex-migration-audit-state.json';
const CANONICAL_SWEEP_DIMENSIONS = Object.freeze([
  'enumeration',
  'frontend-backend-ownership',
  'shell-layout',
  'menu-page-backend',
  'source-degradation',
  'current-new-only',
]);

function usage(exitCode = 2) {
  const text = `
Usage:
  codex-migration-audit init --target <batch-dir> [--batch-id <id>] [--title <title>] [--force]
  codex-migration-audit contract --config <migration.yaml>
  codex-migration-audit completeness --config <migration.yaml>
  codex-migration-audit gate   --config <migration.yaml>
  codex-migration-audit fields --config <migration.yaml>
  codex-migration-audit vote   --config <migration.yaml>
  codex-migration-audit lock   --config <migration.yaml>
  codex-migration-audit check-lock --config <migration.yaml>
  codex-migration-audit progress --config <migration.yaml>
  codex-migration-audit local  --config <migration.yaml>
  codex-migration-audit report --config <migration.yaml>
  codex-migration-audit verify --config <migration.yaml>
  codex-migration-audit all    --config <migration.yaml>

Commands:
  init    Copy templates/migration-batch into a project spec directory.
  contract Validate source inventory, normalized contracts, matrix coverage, and references.
  completeness Validate required sweep dimensions, resolved gaps, and a final dry critic round.
  gate    Run migration-gate.sh using migration.yaml.
  fields  Run field-diff.sh for entries in field-diffs.json.
  vote    Merge votes.json using fail-safe disputed/confirmed rules.
  lock    Run contract + completeness + fields + vote, then write an immutable baseline lock on success.
  check-lock Verify that the baseline lock still matches all contract input files.
  progress Validate that every locked matrix row has verified implementation evidence.
  local   Run local verification commands from local-verify.commands.
  report  Write audit-report.json and audit-report.md from captured state.
  verify  Hard local gate: contract, completeness, baseline lock, gate, fields, vote, progress, local, report.
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
  cfg.sourceInventoryFile = cfg.sourceInventoryFile || 'source-inventory.json';
  cfg.migrationMatrixFile = cfg.migrationMatrixFile || 'migration-matrix.json';
  cfg.migrationProgressFile = cfg.migrationProgressFile || 'migration-progress.json';
  cfg.contractIndexFile = cfg.contractIndexFile || 'contract-index.json';
  cfg.baselineLockFile = cfg.baselineLockFile || 'baseline-lock.json';
  cfg.completenessFile = cfg.completenessFile || 'completeness-sweep.json';
  cfg.baselineSpecFile = cfg.baselineSpecFile || 'spec.md';
  cfg.additionalContractInputFilesCsv = cfg.additionalContractInputFilesCsv || '';
  cfg.requiredSweepDimensionsCsv = cfg.requiredSweepDimensionsCsv || CANONICAL_SWEEP_DIMENSIONS.join(',');
  return cfg;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
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
      contract: null,
      completeness: null,
      baselineLock: null,
      gate: null,
      fields: null,
      vote: null,
      progress: null,
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

function readJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${file}: ${error.message}`);
  }
}

function isPlaceholder(value) {
  if (typeof value !== 'string') return false;
  return /<[^>]+>|placeholder|module-name/i.test(value);
}

function validText(value) {
  return typeof value === 'string' && value.trim() !== '' && !isPlaceholder(value);
}

function validId(value) {
  return validText(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function validCommit(value) {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
}

function hasEvidence(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(validText);
  return validText(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addUniqueId(idOwners, issues, id, owner) {
  if (!validId(id)) {
    issues.push(`${owner}: invalid or placeholder id`);
    return;
  }
  if (idOwners.has(id)) issues.push(`${owner}: duplicate id ${id} (already used by ${idOwners.get(id)})`);
  else idOwners.set(id, owner);
}

const CONTRACT_COLLECTIONS = {
  pages: ['sourceArtifactId', 'pageClass', 'targetPage'],
  uiFunctions: ['pageId', 'kind', 'key', 'source'],
  apiContracts: ['sourceArtifactId', 'route', 'httpMethods'],
  fields: ['ownerId', 'name', 'sourceField', 'targetField'],
  serviceLinks: ['fromId', 'toArtifactId', 'role'],
  menuRoutes: ['pageId', 'sourceEntry', 'targetRoute'],
  shellFeatures: ['sourceArtifactId', 'feature', 'disposition', 'targetOwner'],
  integrations: ['sourceArtifactId', 'contractName', 'entrypoint', 'disposition'],
};

const ARTIFACT_DIMENSION_BY_TYPE = {
  'mvc-controller': 'apiContracts',
  'mvc-action': 'apiContracts',
  'webapi-controller': 'apiContracts',
  'webapi-action': 'apiContracts',
  service: 'serviceLinks',
  rule: 'serviceLinks',
  'data-process': 'serviceLinks',
  job: 'serviceLinks',
  repository: 'serviceLinks',
  'database-table': 'serviceLinks',
  'database-view': 'serviceLinks',
  'stored-procedure': 'serviceLinks',
  dto: 'fields',
  entity: 'fields',
  request: 'fields',
  response: 'fields',
  field: 'fields',
  view: 'pages',
  page: 'pages',
  route: 'menuRoutes',
  menu: 'menuRoutes',
  permission: 'menuRoutes',
  layout: 'shellFeatures',
  'external-integration': 'integrations',
};

const GENERIC_ARTIFACT_TYPES = new Set(['script', 'config', 'other']);

const ARTIFACT_TYPES_BY_DIMENSION = {
  pages: new Set(['view', 'page']),
  apiContracts: new Set(['mvc-controller', 'mvc-action', 'webapi-controller', 'webapi-action']),
  fields: new Set(['dto', 'entity', 'request', 'response', 'field']),
  serviceLinks: new Set(['service', 'rule', 'data-process', 'job', 'repository', 'database-table', 'database-view', 'stored-procedure']),
  menuRoutes: new Set(['route', 'menu', 'permission']),
  shellFeatures: new Set(['layout']),
  integrations: new Set(['external-integration']),
};

const CLASSIFICATIONS = new Set([
  'migrate-equivalent',
  'conflict-old-wins',
  'merge-union',
  'keep-new-enhancement',
  'fix-source-defect',
  'exclude-proven-dead',
]);

const VOTE_RISK_FLAGS = new Set([
  'source-ref-selection',
  'exclusion',
  'merge-rename',
  'degraded-source',
  'non-crud',
  'semantic-conflict',
  'customer-integration',
  'module-completeness',
]);

const RISK_CLASSIFICATIONS = new Set([
  'conflict-old-wins',
  'merge-union',
  'keep-new-enhancement',
  'fix-source-defect',
  'exclude-proven-dead',
]);

// These decisions are high-impact by nature even when a row's manually
// assigned severity is lower. Other judgment classifications require a vote
// only when the row is also CRITICAL/HIGH or carries an explicit risk flag.
const ALWAYS_VOTE_CLASSIFICATIONS = new Set([
  'conflict-old-wins',
  'exclude-proven-dead',
]);

const CONTRACT_REFERENCE_FIELDS = {
  pages: { sourceArtifactId: 'pageArtifact' },
  uiFunctions: { pageId: 'pages' },
  apiContracts: { sourceArtifactId: 'apiArtifact' },
  fields: { ownerId: 'business' },
  serviceLinks: { fromId: 'serviceSource', toArtifactId: 'serviceTarget' },
  menuRoutes: { pageId: 'pages' },
  shellFeatures: { sourceArtifactId: 'shellArtifact' },
  integrations: { sourceArtifactId: 'integrationArtifact' },
};

const ARTIFACT_TYPES = new Set([
  'mvc-controller',
  'mvc-action',
  'webapi-controller',
  'webapi-action',
  'service',
  'rule',
  'data-process',
  'dto',
  'entity',
  'request',
  'response',
  'field',
  'view',
  'page',
  'script',
  'route',
  'menu',
  'permission',
  'layout',
  'job',
  'repository',
  'database-table',
  'database-view',
  'stored-procedure',
  'config',
  'external-integration',
  'other',
]);

function loadContractBundle(cfg) {
  const configDir = cfg.__configDir;
  const sourceFile = resolveMaybe(configDir, cfg.sourceInventoryFile);
  const matrixFile = resolveMaybe(configDir, cfg.migrationMatrixFile);
  const indexFile = resolveMaybe(configDir, cfg.contractIndexFile);
  const source = readJson(sourceFile, 'sourceInventoryFile');
  const matrix = readJson(matrixFile, 'migrationMatrixFile');
  const index = readJson(indexFile, 'contractIndexFile');
  if (!index.files || typeof index.files !== 'object') {
    throw new Error(`contractIndexFile must contain a files object: ${indexFile}`);
  }

  const collections = {};
  const collectionPayloads = {};
  const collectionFiles = {};
  for (const name of Object.keys(CONTRACT_COLLECTIONS)) {
    const configured = index.files[name];
    if (!validText(configured)) throw new Error(`contractIndexFile.files.${name} is required`);
    const file = resolveMaybe(configDir, configured);
    const payload = readJson(file, `contract collection ${name}`);
    if (!Array.isArray(payload.records)) throw new Error(`${name} must contain a records array: ${file}`);
    collections[name] = payload.records;
    collectionPayloads[name] = payload;
    collectionFiles[name] = file;
  }

  return {
    source,
    matrix,
    index,
    collections,
    collectionPayloads,
    files: { sourceFile, matrixFile, indexFile, ...collectionFiles },
  };
}

function rowRequiresVote(row, artifactsById) {
  const hasExplicitRisk = asArray(row?.riskFlags).some((flag) => VOTE_RISK_FLAGS.has(flag));
  const hasArtifactJudgment = asArray(row?.legacyArtifactIds).some((artifactId) => {
    const artifact = artifactsById.get(artifactId);
    return artifact?.status !== 'complete' ||
      artifact?.type === 'external-integration' ||
      (['view', 'page'].includes(artifact?.type) && artifact?.pageClass !== 'crud');
  });
  const requiresJudgment = RISK_CLASSIFICATIONS.has(row?.classification) || hasExplicitRisk || hasArtifactJudgment;
  const highImpact = ['CRITICAL', 'HIGH'].includes(row?.severity) ||
    ALWAYS_VOTE_CLASSIFICATIONS.has(row?.classification) ||
    hasExplicitRisk;
  return requiresJudgment && highImpact;
}

function validateContractBundle(cfg) {
  const bundle = loadContractBundle(cfg);
  const issues = [];
  const idOwners = new Map();
  const artifactIds = new Set();
  const rowIds = new Set();
  const recordIds = new Set();
  const artifacts = asArray(bundle.source.artifacts);
  const rows = asArray(bundle.matrix.rows);
  const artifactsById = new Map(artifacts.map((artifact) => [artifact?.id, artifact]));

  if (!validId(cfg.batchId)) issues.push('migration.yaml: batchId is required');
  for (const [label, payload] of [
    ['source-inventory.json', bundle.source],
    ['migration-matrix.json', bundle.matrix],
    ['contract-index.json', bundle.index],
    ...Object.entries(bundle.collectionPayloads).map(([name, payload]) => [`${name} collection`, payload]),
  ]) {
    if (payload.schemaVersion !== '0.2') issues.push(`${label}: schemaVersion must be 0.2`);
    if (payload.batchId !== cfg.batchId) issues.push(`${label}: batchId must equal migration.yaml batchId ${cfg.batchId || ''}`);
  }
  if (!validText(bundle.source.legacySource?.repo)) issues.push('source-inventory.json: legacySource.repo is required');
  if (!validText(bundle.source.legacySource?.branchOrRef)) issues.push('source-inventory.json: legacySource.branchOrRef is required');
  if (!validCommit(bundle.source.legacySource?.commit)) issues.push('source-inventory.json: legacySource.commit must be a full Git commit hash');
  if (!hasEvidence(bundle.source.legacySource?.evidence)) issues.push('source-inventory.json: legacySource.evidence is required');

  if (artifacts.length === 0) issues.push('source inventory has no artifacts');
  if (rows.length === 0) issues.push('migration matrix has no rows');

  const allowedArtifactStatus = new Set(['complete', 'half-finished', 'broken']);
  const allowedSide = new Set(['legacy', 'current-new-only']);
  const allowedPageClass = new Set(['crud', 'dashboard', 'report', 'statistics', 'topology', 'map', 'workbench', 'other']);
  for (const [index, artifact] of artifacts.entries()) {
    const owner = `source.artifacts[${index}]`;
    addUniqueId(idOwners, issues, artifact?.id, owner);
    if (validId(artifact?.id)) artifactIds.add(artifact.id);
    if (!validText(artifact?.module)) issues.push(`${owner}: module is required`);
    if (!ARTIFACT_TYPES.has(artifact?.type)) issues.push(`${owner}: invalid artifact type`);
    const expectedDimension = ARTIFACT_DIMENSION_BY_TYPE[artifact?.type];
    if (expectedDimension && artifact?.contractDimension !== expectedDimension) {
      issues.push(`${owner}: contractDimension must be ${expectedDimension} for ${artifact?.type}`);
    }
    if (GENERIC_ARTIFACT_TYPES.has(artifact?.type)) {
      const validDimension = Object.keys(CONTRACT_COLLECTIONS).includes(artifact?.contractDimension);
      if (!validDimension && artifact?.contractDimension !== 'reviewed-exemption') {
        issues.push(`${owner}: generic artifact requires a contract dimension or reviewed-exemption`);
      }
      if (artifact?.contractDimension === 'reviewed-exemption' && !hasEvidence(artifact?.dimensionExemptionEvidence)) {
        issues.push(`${owner}: reviewed-exemption requires dimensionExemptionEvidence`);
      }
    }
    if (!validText(artifact?.path)) issues.push(`${owner}: path is required`);
    if (['view', 'page'].includes(artifact?.type) && !allowedPageClass.has(artifact?.pageClass)) {
      issues.push(`${owner}: pageClass is required for view/page artifacts`);
    }
    if (!allowedArtifactStatus.has(artifact?.status)) issues.push(`${owner}: status must be complete, half-finished, or broken`);
    if (!allowedSide.has(artifact?.side || 'legacy')) issues.push(`${owner}: side must be legacy or current-new-only`);
    if (!hasEvidence(artifact?.evidence)) issues.push(`${owner}: evidence is required`);
  }

  const coveredArtifacts = new Set();
  const artifactOwners = new Map();
  const matrixContractIds = new Set();
  const contractOwners = new Map();
  for (const [index, row] of rows.entries()) {
    const owner = `matrix.rows[${index}]`;
    addUniqueId(idOwners, issues, row?.id, owner);
    if (validId(row?.id)) rowIds.add(row.id);
    if (!validText(row?.module)) issues.push(`${owner}: module is required`);
    if (!validText(row?.legacyBehavior)) issues.push(`${owner}: legacyBehavior is required`);
    if (!CLASSIFICATIONS.has(row?.classification)) issues.push(`${owner}: invalid classification`);
    if (!validText(row?.targetFrontend)) issues.push(`${owner}: targetFrontend is required; use N/A with evidence when not applicable`);
    if (!validText(row?.targetBackend)) issues.push(`${owner}: targetBackend is required; use N/A with evidence when not applicable`);
    if (!validText(row?.menuPermission)) issues.push(`${owner}: menuPermission is required; use N/A with evidence when not applicable`);
    if (!['CRITICAL', 'HIGH', 'MED', 'LOW'].includes(row?.severity)) issues.push(`${owner}: invalid severity`);
    if (!Array.isArray(row?.riskFlags) || !row.riskFlags.every((flag) => VOTE_RISK_FLAGS.has(flag))) {
      issues.push(`${owner}: riskFlags must be an array of canonical values`);
    } else if (new Set(row.riskFlags).size !== row.riskFlags.length) {
      issues.push(`${owner}: riskFlags must not contain duplicates`);
    }
    if (!Array.isArray(row?.voteClaimIds) || !row.voteClaimIds.every(validId)) {
      issues.push(`${owner}: voteClaimIds must be an array of valid IDs`);
    } else if (new Set(row.voteClaimIds).size !== row.voteClaimIds.length) {
      issues.push(`${owner}: voteClaimIds must not contain duplicates`);
    }
    if (rowRequiresVote(row, artifactsById) && asArray(row?.voteClaimIds).length === 0) {
      issues.push(`${owner}: high-judgment row requires at least one voteClaimId`);
    }
    if (!['ready', 'locked'].includes(row?.contractStatus)) issues.push(`${owner}: contractStatus must be ready or locked`);
    if (!validText(row?.decision)) issues.push(`${owner}: decision is required`);
    if (!hasEvidence(row?.evidence)) issues.push(`${owner}: evidence is required`);
    if (asArray(row?.openGaps).length > 0) issues.push(`${owner}: openGaps must be empty before baseline lock`);
    if (asArray(row?.legacyArtifactIds).length === 0) issues.push(`${owner}: legacyArtifactIds must not be empty`);
    for (const artifactId of asArray(row?.legacyArtifactIds)) {
      if (!artifactIds.has(artifactId)) issues.push(`${owner}: unknown legacyArtifactId ${artifactId}`);
      else {
        coveredArtifacts.add(artifactId);
        if (artifactOwners.has(artifactId)) issues.push(`${owner}: artifact ${artifactId} is already owned by ${artifactOwners.get(artifactId)}`);
        else artifactOwners.set(artifactId, row?.id);
      }
    }
    if (asArray(row?.contractIds).length === 0) issues.push(`${owner}: contractIds must not be empty`);
    for (const contractId of asArray(row?.contractIds)) {
      matrixContractIds.add(contractId);
      if (contractOwners.has(contractId)) issues.push(`${owner}: contract ${contractId} is already owned by ${contractOwners.get(contractId)}`);
      else contractOwners.set(contractId, row?.id);
    }
  }

  for (const artifactId of artifactIds) {
    if (!coveredArtifacts.has(artifactId)) issues.push(`source artifact ${artifactId} is not covered by any migration row`);
  }

  const pendingReferences = [];
  const recordIdsByCollection = Object.fromEntries(Object.keys(CONTRACT_COLLECTIONS).map((name) => [name, new Set()]));
  const artifactReferencesByDimension = Object.fromEntries(Object.keys(CONTRACT_COLLECTIONS).map((name) => [name, new Set()]));
  for (const [name, requiredFields] of Object.entries(CONTRACT_COLLECTIONS)) {
    for (const [index, record] of bundle.collections[name].entries()) {
      const owner = `${name}.records[${index}]`;
      addUniqueId(idOwners, issues, record?.id, owner);
      if (validId(record?.id)) {
        recordIds.add(record.id);
        recordIdsByCollection[name].add(record.id);
      }
      if (!validText(record?.module)) issues.push(`${owner}: module is required`);
      if (!rowIds.has(record?.migrationRowId)) issues.push(`${owner}: unknown migrationRowId ${record?.migrationRowId || ''}`);
      if (record?.contractStatus !== 'ready' && record?.contractStatus !== 'locked') {
        issues.push(`${owner}: contractStatus must be ready or locked`);
      }
      if (!hasEvidence(record?.evidence)) issues.push(`${owner}: evidence is required`);
      if (!Array.isArray(record?.sourceArtifactIds) || record.sourceArtifactIds.length === 0) {
        issues.push(`${owner}: sourceArtifactIds must not be empty`);
      }
      for (const artifactId of asArray(record?.sourceArtifactIds)) {
        if (!artifactIds.has(artifactId)) issues.push(`${owner}: unknown sourceArtifactId ${artifactId}`);
        else if (artifactOwners.get(artifactId) !== record?.migrationRowId) {
          issues.push(`${owner}: sourceArtifactId ${artifactId} is not owned by ${record?.migrationRowId || ''}`);
        } else {
          artifactReferencesByDimension[name].add(artifactId);
        }
      }
      for (const field of requiredFields) {
        const value = record?.[field];
        const ok = Array.isArray(value) ? value.length > 0 && value.every(validText) : validText(value);
        if (!ok) issues.push(`${owner}: ${field} is required`);
      }
      if (name === 'pages' && !allowedPageClass.has(record?.pageClass)) issues.push(`${owner}: invalid pageClass`);
      if (name === 'apiContracts') {
        const unconstrainedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        const allowedMethods = new Set(unconstrainedMethods);
        if (!Array.isArray(record?.httpMethods) || record.httpMethods.length === 0) {
          issues.push(`${owner}: httpMethods must be a non-empty array`);
        }
        for (const method of asArray(record?.httpMethods)) {
          if (!allowedMethods.has(method)) issues.push(`${owner}: invalid HTTP method ${method}`);
        }
        const requireHttpConstraint = parseBoolean(cfg.requireApiHttpConstraint, false);
        const hasHttpConstraint = record?.httpConstraint !== undefined && record?.httpConstraint !== null && record?.httpConstraint !== '';
        if (requireHttpConstraint && !hasHttpConstraint) {
          issues.push(`${owner}: httpConstraint is required when requireApiHttpConstraint is enabled`);
        }
        if (hasHttpConstraint) {
          if (!['constrained', 'unconstrained'].includes(record.httpConstraint)) {
            issues.push(`${owner}: httpConstraint must be constrained or unconstrained`);
          } else if (record.httpConstraint === 'constrained' && asArray(record.httpMethods).length !== 1) {
            issues.push(`${owner}: constrained httpConstraint requires exactly one HTTP method`);
          } else if (record.httpConstraint === 'unconstrained') {
            const methods = asArray(record.httpMethods);
            const hasExactUnconstrainedSet = methods.length === unconstrainedMethods.length &&
              new Set(methods).size === unconstrainedMethods.length &&
              unconstrainedMethods.every((method) => methods.includes(method));
            if (!hasExactUnconstrainedSet) {
              issues.push(`${owner}: unconstrained httpConstraint requires the complete HTTP method set`);
            }
          }
        }
      }
      if (name === 'serviceLinks' && record?.fromId === record?.toArtifactId) {
        issues.push(`${owner}: fromId and toArtifactId must not be the same node`);
      }
      if (record?.sourceArtifactId && !asArray(record?.sourceArtifactIds).includes(record.sourceArtifactId)) {
        issues.push(`${owner}: primary sourceArtifactId must also appear in sourceArtifactIds`);
      }
      const matrixOwner = contractOwners.get(record?.id);
      if (matrixOwner && record?.migrationRowId !== matrixOwner) {
        issues.push(`${owner}: migrationRowId ${record?.migrationRowId || ''} does not match matrix owner ${matrixOwner}`);
      }
      for (const [field, referenceType] of Object.entries(CONTRACT_REFERENCE_FIELDS[name])) {
        pendingReferences.push({ owner, field, ref: record?.[field], referenceType });
      }
      for (const ref of asArray(record?.refs)) pendingReferences.push({ owner, field: 'refs', ref, referenceType: 'business' });
    }
  }

  const businessIds = new Set([...artifactIds, ...recordIds]);
  const artifactIdsByType = (types) => new Set(artifacts.filter((artifact) => types.has(artifact?.type)).map((artifact) => artifact.id));
  const pageArtifactIds = artifactIdsByType(ARTIFACT_TYPES_BY_DIMENSION.pages);
  const apiArtifactIds = artifactIdsByType(ARTIFACT_TYPES_BY_DIMENSION.apiContracts);
  const serviceTargetIds = artifactIdsByType(new Set([...ARTIFACT_TYPES_BY_DIMENSION.serviceLinks, 'external-integration']));
  const serviceSourceIds = new Set([
    ...recordIdsByCollection.pages,
    ...recordIdsByCollection.uiFunctions,
    ...recordIdsByCollection.apiContracts,
    ...serviceTargetIds,
  ]);
  const shellArtifactIds = artifactIdsByType(ARTIFACT_TYPES_BY_DIMENSION.shellFeatures);
  const integrationArtifactIds = artifactIdsByType(ARTIFACT_TYPES_BY_DIMENSION.integrations);
  for (const { owner, field, ref, referenceType } of pendingReferences) {
    const allowed = referenceType === 'artifact'
      ? artifactIds
      : referenceType === 'business'
        ? businessIds
        : referenceType === 'pageArtifact'
          ? pageArtifactIds
          : referenceType === 'apiArtifact'
            ? apiArtifactIds
            : referenceType === 'serviceSource'
              ? serviceSourceIds
              : referenceType === 'serviceTarget'
                ? serviceTargetIds
                : referenceType === 'shellArtifact'
                  ? shellArtifactIds
                  : referenceType === 'integrationArtifact'
                    ? integrationArtifactIds
                    : recordIdsByCollection[referenceType] || businessIds;
    if (!allowed.has(ref)) issues.push(`${owner}: unknown ${field} reference ${ref || ''}`);
  }

  for (const name of ['pages', 'apiContracts', 'shellFeatures', 'integrations']) {
    for (const [index, record] of bundle.collections[name].entries()) {
      const artifactOwner = artifactOwners.get(record?.sourceArtifactId);
      if (artifactOwner && artifactOwner !== record?.migrationRowId) {
        issues.push(`${name}.records[${index}]: sourceArtifactId ${record.sourceArtifactId} belongs to ${artifactOwner}, not ${record.migrationRowId || ''}`);
      }
    }
  }

  for (const [index, row] of rows.entries()) {
    const owner = `matrix.rows[${index}]`;
    const dimensionCoverage = row?.dimensionCoverage;
    if (!dimensionCoverage || typeof dimensionCoverage !== 'object' || Array.isArray(dimensionCoverage)) {
      issues.push(`${owner}: dimensionCoverage is required`);
      continue;
    }
    const coveredContractIds = new Set();
    for (const name of Object.keys(CONTRACT_COLLECTIONS)) {
      const coverage = dimensionCoverage[name];
      if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
        issues.push(`${owner}: dimensionCoverage.${name} is required`);
        continue;
      }
      if (coverage.status === 'covered') {
        if (!Array.isArray(coverage.contractIds) || coverage.contractIds.length === 0) {
          issues.push(`${owner}: dimensionCoverage.${name}.contractIds must not be empty when covered`);
          continue;
        }
        for (const contractId of coverage.contractIds) {
          if (!recordIdsByCollection[name].has(contractId)) {
            issues.push(`${owner}: dimensionCoverage.${name} references unknown ${name} contract ${contractId}`);
          }
          if (contractOwners.get(contractId) !== row?.id) {
            issues.push(`${owner}: dimensionCoverage.${name} contract ${contractId} is not owned by this row`);
          }
          coveredContractIds.add(contractId);
        }
      } else if (coverage.status === 'not-applicable') {
        if (asArray(coverage.contractIds).length > 0) issues.push(`${owner}: dimensionCoverage.${name} must not list contracts when not-applicable`);
        if (!hasEvidence(coverage.evidence)) issues.push(`${owner}: dimensionCoverage.${name} requires N/A evidence`);
      } else {
        issues.push(`${owner}: dimensionCoverage.${name}.status must be covered or not-applicable`);
      }
    }
    const rowContractIds = new Set(asArray(row?.contractIds));
    for (const contractId of rowContractIds) {
      if (!coveredContractIds.has(contractId)) issues.push(`${owner}: contract ${contractId} is missing from dimensionCoverage`);
    }
    for (const contractId of coveredContractIds) {
      if (!rowContractIds.has(contractId)) issues.push(`${owner}: dimensionCoverage contract ${contractId} is missing from contractIds`);
    }
  }

  for (const [index, artifact] of artifacts.entries()) {
    const dimension = artifact?.contractDimension;
    if (dimension === 'reviewed-exemption') {
      const ownerRowId = artifactOwners.get(artifact?.id);
      const ownerRow = rows.find((row) => row?.id === ownerRowId);
      if (!asArray(ownerRow?.riskFlags).includes('exclusion')) {
        issues.push(`source.artifacts[${index}]: reviewed-exemption requires exclusion riskFlag on ${ownerRowId || 'owning row'}`);
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(artifactReferencesByDimension, dimension) &&
        !artifactReferencesByDimension[dimension].has(artifact?.id)) {
      issues.push(`source.artifacts[${index}]: artifact ${artifact?.id || ''} is not referenced by its ${dimension} contract`);
    }
  }
  for (const contractId of matrixContractIds) {
    if (!recordIds.has(contractId)) issues.push(`migration matrix references unknown contractId ${contractId}`);
  }
  for (const recordId of recordIds) {
    if (!matrixContractIds.has(recordId)) issues.push(`contract record ${recordId} is not referenced by any migration row`);
  }

  return {
    bundle,
    issues,
    counts: {
      sourceArtifacts: artifacts.length,
      migrationRows: rows.length,
      contractRecords: recordIds.size,
      collections: Object.fromEntries(Object.entries(bundle.collections).map(([name, records]) => [name, records.length])),
    },
  };
}

function commandContract(cfg) {
  const result = validateContractBundle(cfg);
  const exitCode = result.issues.length > 0 ? 1 : 0;
  const record = { exitCode, counts: result.counts, issues: result.issues };
  writeState(cfg, { contract: record });
  if (result.issues.length) result.issues.forEach((issue) => console.error(`CONTRACT: ${issue}`));
  else console.log(`Contract integrity passed: ${result.counts.sourceArtifacts} artifacts, ${result.counts.migrationRows} rows, ${result.counts.contractRecords} contract records`);
  return exitCode;
}

function commandCompleteness(cfg) {
  const file = resolveMaybe(cfg.__configDir, cfg.completenessFile);
  const payload = readJson(file, 'completenessFile');
  const matrix = readJson(resolveMaybe(cfg.__configDir, cfg.migrationMatrixFile), 'migrationMatrixFile');
  const issues = [];
  const requiredDimensions = [...new Set([
    ...CANONICAL_SWEEP_DIMENSIONS,
    ...splitCsv(cfg.requiredSweepDimensionsCsv),
  ])];
  const matrixIds = new Set(asArray(matrix.rows).map((row) => row?.id).filter(validId));
  const dimensionIds = new Set();
  const referencedGapIds = new Set();
  const gapsById = new Map();

  if (payload.schemaVersion !== '0.3') issues.push('completeness-sweep.json: schemaVersion must be 0.3');
  if (payload.batchId !== cfg.batchId) issues.push(`completeness-sweep.json: batchId must equal ${cfg.batchId || ''}`);
  if (!Array.isArray(payload.dimensions)) issues.push('completeness-sweep.json: dimensions must be an array');
  if (!Array.isArray(payload.gaps)) issues.push('completeness-sweep.json: gaps must be an array');
  if (!Array.isArray(payload.criticRounds)) issues.push('completeness-sweep.json: criticRounds must be an array');

  for (const [index, gap] of asArray(payload.gaps).entries()) {
    const owner = `completeness.gaps[${index}]`;
    if (!validId(gap?.id)) issues.push(`${owner}: invalid id`);
    else if (gapsById.has(gap.id)) issues.push(`${owner}: duplicate id ${gap.id}`);
    else gapsById.set(gap.id, gap);
    if (!validId(gap?.dimension)) issues.push(`${owner}: dimension is required`);
    if (!matrixIds.has(gap?.migrationRowId)) issues.push(`${owner}: unknown migrationRowId ${gap?.migrationRowId || ''}`);
    if (gap?.status !== 'resolved') issues.push(`${owner}: status must be resolved before baseline lock`);
    if (!hasEvidence(gap?.evidence)) issues.push(`${owner}: resolution evidence is required`);
  }

  for (const [index, dimension] of asArray(payload.dimensions).entries()) {
    const owner = `completeness.dimensions[${index}]`;
    if (!validId(dimension?.id)) issues.push(`${owner}: invalid id`);
    else if (dimensionIds.has(dimension.id)) issues.push(`${owner}: duplicate id ${dimension.id}`);
    else dimensionIds.add(dimension.id);
    if (dimension?.status !== 'complete') issues.push(`${owner}: status must be complete`);
    if (!hasEvidence(dimension?.evidence)) issues.push(`${owner}: evidence is required`);
    if (!Array.isArray(dimension?.gapIds)) issues.push(`${owner}: gapIds must be an array`);
    for (const gapId of asArray(dimension?.gapIds)) {
      const gap = gapsById.get(gapId);
      if (!gap) issues.push(`${owner}: unknown gapId ${gapId}`);
      else if (gap.dimension !== dimension?.id) issues.push(`${owner}: gap ${gapId} belongs to ${gap.dimension}`);
      referencedGapIds.add(gapId);
    }
  }

  for (const dimension of requiredDimensions) {
    if (!dimensionIds.has(dimension)) issues.push(`completeness: required dimension ${dimension} was not swept`);
  }
  for (const gapId of gapsById.keys()) {
    if (!referencedGapIds.has(gapId)) issues.push(`completeness: gap ${gapId} is not referenced by its dimension`);
  }

  const rounds = asArray(payload.criticRounds);
  let previousRound = 0;
  for (const [index, round] of rounds.entries()) {
    const owner = `completeness.criticRounds[${index}]`;
    if (!Number.isInteger(round?.round) || round.round < 1) issues.push(`${owner}: round must be a positive integer`);
    else if (round.round <= previousRound) issues.push(`${owner}: rounds must be strictly increasing`);
    else previousRound = round.round;
    if (!hasEvidence(round?.evidence)) issues.push(`${owner}: evidence is required`);
    for (const field of ['newGapIds', 'missedDimensions', 'midStateModules', 'unverifiedClaims']) {
      if (!Array.isArray(round?.[field])) issues.push(`${owner}: ${field} must be an array`);
    }
    const newGapIds = new Set(asArray(round?.newGapIds));
    for (const gapId of newGapIds) {
      if (!gapsById.has(gapId)) issues.push(`${owner}: unknown newGapId ${gapId}`);
    }
    for (const field of ['missedDimensions', 'midStateModules', 'unverifiedClaims']) {
      for (const gapId of asArray(round?.[field])) {
        if (!gapsById.has(gapId)) issues.push(`${owner}: ${field} must contain known gap IDs; unknown ${gapId}`);
        else if (!newGapIds.has(gapId)) issues.push(`${owner}: ${field} gap ${gapId} must also appear in newGapIds for the same round`);
      }
    }
  }
  if (rounds.length < 1) {
    issues.push('completeness: at least one critic round is required');
  } else {
    const finalRound = rounds[rounds.length - 1];
    for (const field of ['newGapIds', 'missedDimensions', 'midStateModules', 'unverifiedClaims']) {
      if (asArray(finalRound?.[field]).length > 0) issues.push(`completeness: final critic round has non-empty ${field}`);
    }
  }

  const record = {
    exitCode: issues.length ? 1 : 0,
    file,
    dimensionCount: dimensionIds.size,
    gapCount: gapsById.size,
    criticRoundCount: rounds.length,
    issues,
  };
  writeState(cfg, { completeness: record });
  if (issues.length) issues.forEach((issue) => console.error(`COMPLETENESS: ${issue}`));
  else console.log(`Completeness passed: ${dimensionIds.size} dimensions, ${gapsById.size} resolved gaps, ${rounds.length} critic rounds`);
  return record.exitCode;
}

function contractInputFiles(cfg) {
  const bundle = loadContractBundle(cfg);
  const baselineSpec = resolveMaybe(cfg.__configDir, cfg.baselineSpecFile);
  const completenessFile = resolveMaybe(cfg.__configDir, cfg.completenessFile);
  if (!fs.existsSync(baselineSpec)) throw new Error(`baselineSpecFile not found: ${baselineSpec}`);
  if (!fs.existsSync(completenessFile)) throw new Error(`completenessFile not found: ${completenessFile}`);
  const files = [cfg.__configPath, baselineSpec, completenessFile, ...Object.values(bundle.files)];
  for (const configured of splitCsv(cfg.additionalContractInputFilesCsv)) {
    const file = resolveMaybe(cfg.__configDir, configured);
    if (!fs.existsSync(file)) throw new Error(`additionalContractInputFilesCsv file not found: ${file}`);
    if (!fs.statSync(file).isFile()) throw new Error(`additionalContractInputFilesCsv input must be a file: ${file}`);
    files.push(file);
  }
  const fieldDiffsFile = resolveMaybe(cfg.__configDir, cfg.fieldDiffsFile || 'field-diffs.json');
  const optional = [
    fieldDiffsFile,
    resolveMaybe(cfg.__configDir, cfg.votesFile || 'votes.json'),
    cfg.migrationCoverageFile ? resolveMaybe(cfg.__configDir, cfg.migrationCoverageFile) : '',
    cfg.fieldCoverageFile ? resolveMaybe(cfg.__configDir, cfg.fieldCoverageFile) : '',
  ];
  for (const file of optional) if (file && fs.existsSync(file)) files.push(file);
  if (fs.existsSync(fieldDiffsFile)) {
    const fieldDiffs = readJson(fieldDiffsFile, 'fieldDiffsFile');
    if (!Array.isArray(fieldDiffs)) throw new Error('field-diffs.json must be an array');
    for (const entry of fieldDiffs) {
      if (!entry?.coverageFile) continue;
      const coverageFile = resolveMaybe(cfg.__configDir, entry.coverageFile);
      if (fs.existsSync(coverageFile)) files.push(coverageFile);
    }
  }
  return [...new Set(files)].sort();
}

function fileDigest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeBaselineLock(cfg) {
  const lockFile = resolveMaybe(cfg.__configDir, cfg.baselineLockFile);
  const files = contractInputFiles(cfg).map((file) => ({
    path: path.relative(cfg.__configDir, file) || path.basename(file),
    sha256: fileDigest(file),
  }));
  const lock = {
    schemaVersion: '0.2',
    batchId: cfg.batchId || '',
    lockedAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  writeState(cfg, { baselineLock: { exitCode: 0, lockFile, fileCount: files.length } });
  console.log(`Wrote baseline lock: ${lockFile}`);
  return 0;
}

function commandCheckLock(cfg) {
  const lockFile = resolveMaybe(cfg.__configDir, cfg.baselineLockFile);
  const issues = [];
  if (!fs.existsSync(lockFile)) issues.push(`baseline lock not found: ${lockFile}`);
  let lock = null;
  if (issues.length === 0) {
    lock = readJson(lockFile, 'baselineLockFile');
    if (lock.schemaVersion !== '0.2') issues.push('baseline lock schemaVersion must be 0.2');
    if (lock.batchId !== cfg.batchId) issues.push(`baseline lock batchId must equal ${cfg.batchId || ''}`);
    if (!Array.isArray(lock.files) || lock.files.length === 0) issues.push('baseline lock has no files');
    const expectedPaths = contractInputFiles(cfg).map((file) => path.relative(cfg.__configDir, file) || path.basename(file)).sort();
    const lockedPaths = asArray(lock.files).map((entry) => entry.path).sort();
    if (JSON.stringify(expectedPaths) !== JSON.stringify(lockedPaths)) {
      issues.push('baseline lock input file set changed');
    }
    for (const entry of asArray(lock.files)) {
      const file = resolveMaybe(cfg.__configDir, entry.path || '');
      if (!file || !fs.existsSync(file)) issues.push(`locked file missing: ${entry.path || ''}`);
      else if (fileDigest(file) !== entry.sha256) issues.push(`locked file changed: ${entry.path}`);
    }
  }
  const record = { exitCode: issues.length ? 1 : 0, lockFile, issues };
  writeState(cfg, { baselineLock: record });
  if (issues.length) issues.forEach((issue) => console.error(`BASELINE LOCK: ${issue}`));
  else console.log(`Baseline lock passed: ${lock.files.length} files`);
  return record.exitCode;
}

function commandProgress(cfg) {
  const matrix = readJson(resolveMaybe(cfg.__configDir, cfg.migrationMatrixFile), 'migrationMatrixFile');
  const progressFile = resolveMaybe(cfg.__configDir, cfg.migrationProgressFile);
  const progress = readJson(progressFile, 'migrationProgressFile');
  const issues = [];
  if (progress.batchId !== cfg.batchId) issues.push(`migration-progress.json: batchId must equal migration.yaml batchId ${cfg.batchId || ''}`);
  const matrixIds = new Set(asArray(matrix.rows).map((row) => row.id));
  const seen = new Set();
  for (const [index, row] of asArray(progress.rows).entries()) {
    const owner = `migrationProgress.rows[${index}]`;
    if (!matrixIds.has(row?.migrationRowId)) issues.push(`${owner}: unknown migrationRowId ${row?.migrationRowId || ''}`);
    if (seen.has(row?.migrationRowId)) issues.push(`${owner}: duplicate migrationRowId ${row?.migrationRowId || ''}`);
    seen.add(row?.migrationRowId);
    if (row?.status !== 'verified') issues.push(`${owner}: status must be verified before final verify`);
    if (!hasEvidence(row?.evidence)) issues.push(`${owner}: evidence is required`);
    if (asArray(row?.openGaps).length > 0) issues.push(`${owner}: openGaps must be empty`);
  }
  for (const id of matrixIds) if (!seen.has(id)) issues.push(`migration row ${id} has no progress record`);
  const record = { exitCode: issues.length ? 1 : 0, rowCount: seen.size, issues };
  writeState(cfg, { progress: record });
  if (issues.length) issues.forEach((issue) => console.error(`PROGRESS: ${issue}`));
  else console.log(`Migration progress passed: ${seen.size} verified rows`);
  return record.exitCode;
}

function invalidateBaselineLock(cfg, reason) {
  const lockFile = resolveMaybe(cfg.__configDir, cfg.baselineLockFile);
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  writeState(cfg, { baselineLock: { exitCode: 1, lockFile, issues: [reason] } });
}

function commandLock(cfg) {
  try {
    const contract = commandContract(cfg);
    const completeness = commandCompleteness(cfg);
    const fields = commandFields(cfg);
    const vote = commandVote(cfg);
    if (contract || completeness || fields || vote) {
      invalidateBaselineLock(cfg, 'contract, completeness, fields, or vote gate failed; stale lock removed');
      commandReport(cfg, 'baseline');
      return 1;
    }
    writeBaselineLock(cfg);
    return commandReport(cfg, 'baseline') ? 1 : 0;
  } catch (error) {
    invalidateBaselineLock(cfg, `baseline lock aborted: ${error.message}; stale lock removed`);
    throw error;
  }
}

function decideVotes(votes) {
  const valid = (votes || []).filter((vote) => vote && !vote.error && !vote._error);
  const refuteCount = valid.filter((vote) => vote.refuted === true).length;
  // Two different evidence lenses are the minimum. Confirmation is fail-safe:
  // any valid refutation keeps the claim disputed; a third majority vote does
  // not override counter-evidence.
  const disputed = valid.length < 2 || refuteCount > 0;
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

function validateVoteClaim(claim, owner, matrixIds) {
  const issues = [];
  const allowedLenses = new Set([
    'source-completeness',
    'origin-history',
    'runtime-behavior',
    'target-contract',
    'module-completeness',
    'customer-integration',
  ]);
  if (!validId(claim?.id)) issues.push(`${owner}: invalid claim id`);
  if (!validText(claim?.subject)) issues.push(`${owner}: subject is required`);
  if (!hasEvidence(claim?.claimEvidence)) issues.push(`${owner}: claimEvidence is required`);
  if (!Array.isArray(claim?.migrationRowIds) || claim.migrationRowIds.length === 0) {
    issues.push(`${owner}: migrationRowIds must not be empty`);
  }
  for (const rowId of asArray(claim?.migrationRowIds)) {
    if (!matrixIds.has(rowId)) issues.push(`${owner}: unknown migrationRowId ${rowId}`);
  }
  if (!Array.isArray(claim?.votes) || claim.votes.length < 2) issues.push(`${owner}: at least two votes are required`);

  const lenses = new Set();
  const validVotes = [];
  for (const [index, vote] of asArray(claim?.votes).entries()) {
    const voteOwner = `${owner}.votes[${index}]`;
    let valid = true;
    if (!allowedLenses.has(vote?.lens)) {
      issues.push(`${voteOwner}: invalid lens`);
      valid = false;
    } else if (lenses.has(vote.lens)) {
      issues.push(`${voteOwner}: duplicate lens ${vote.lens}`);
      valid = false;
    } else {
      lenses.add(vote.lens);
    }
    if (typeof vote?.refuted !== 'boolean') {
      issues.push(`${voteOwner}: refuted must be boolean`);
      valid = false;
    }
    if (!['high', 'med', 'low'].includes(vote?.confidence)) {
      issues.push(`${voteOwner}: invalid confidence`);
      valid = false;
    }
    if (vote?.refuted === true && !hasEvidence(vote?.counterEvidence)) {
      issues.push(`${voteOwner}: refuted vote requires counterEvidence`);
      valid = false;
    }
    if (vote?.refuted === false && !hasEvidence(vote?.note)) {
      issues.push(`${voteOwner}: confirming vote requires an evidence note`);
      valid = false;
    }
    if (valid) validVotes.push(vote);
  }
  return { issues, validVotes };
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
    if (parseBoolean(cfg.requireFieldDiffs, false)) {
      fail = 1;
      console.error('No active field diff entries. requireFieldDiffs=true blocks baseline lock.');
    } else {
      console.log('No active field diff entries. Fill field-diffs.json to enable field gate.');
    }
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
  const matrix = readJson(resolveMaybe(cfg.__configDir, cfg.migrationMatrixFile), 'migrationMatrixFile');
  const source = readJson(resolveMaybe(cfg.__configDir, cfg.sourceInventoryFile), 'sourceInventoryFile');
  const rows = asArray(matrix.rows);
  const matrixIds = new Set(rows.map((row) => row?.id).filter(validId));
  const artifactsById = new Map(asArray(source.artifacts).map((artifact) => [artifact?.id, artifact]));
  const rawClaims = normalizeVoteInput(input);
  const issues = [];
  const claimIds = new Set();
  const claimById = new Map();

  const artifacts = rawClaims.map((claim, index) => {
    const owner = `votes.artifacts[${index}]`;
    if (claimIds.has(claim?.id)) issues.push(`${owner}: duplicate claim id ${claim?.id || ''}`);
    else if (validId(claim?.id)) claimIds.add(claim.id);
    const validation = validateVoteClaim(claim, owner, matrixIds);
    issues.push(...validation.issues);
    const decision = decideVotes(validation.validVotes);
    if (validation.issues.length > 0) decision.status = 'disputed';
    const result = {
      id: claim?.id || '',
      subject: claim?.subject || '',
      migrationRowIds: asArray(claim?.migrationRowIds),
      issues: validation.issues,
      ...decision,
    };
    if (validId(claim?.id)) claimById.set(claim.id, result);
    return result;
  });

  for (const [index, row] of rows.entries()) {
    const owner = `matrix.rows[${index}]`;
    if (rowRequiresVote(row, artifactsById) && asArray(row?.voteClaimIds).length === 0) {
      issues.push(`${owner}: high-judgment row has no voteClaimIds`);
    }
    for (const claimId of asArray(row?.voteClaimIds)) {
      const claim = claimById.get(claimId);
      if (!claim) issues.push(`${owner}: unknown voteClaimId ${claimId}`);
      else if (!claim.migrationRowIds.includes(row?.id)) issues.push(`${owner}: vote claim ${claimId} is not bound to this row`);
      else if (claim.status !== 'confirmed') issues.push(`${owner}: vote claim ${claimId} is disputed`);
    }
  }
  for (const claim of artifacts) {
    for (const rowId of claim.migrationRowIds) {
      const row = rows.find((item) => item?.id === rowId);
      if (row && !asArray(row.voteClaimIds).includes(claim.id)) {
        issues.push(`vote claim ${claim.id} names ${rowId}, but the row does not reference the claim`);
      }
    }
  }

  const output = { schemaVersion: '0.2', artifacts, issues };
  const outFile = resolveMaybe(cfg.__configDir, cfg.voteResultJson || 'audit-votes.json');
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  const disputed = artifacts.filter((artifact) => artifact.status === 'disputed').length;
  const exitCode = disputed || issues.length ? 1 : 0;
  writeState(cfg, { vote: { exitCode, outputFile: outFile, artifacts, issues } });
  return exitCode;
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

function summarizeBlocking(state, phase = 'implementation') {
  const blocks = [];
  if (!state.contract) blocks.push('contract not_run');
  else if (state.contract.exitCode !== 0) blocks.push(`contract exit=${state.contract.exitCode}`);
  if (!state.completeness) blocks.push('completeness not_run');
  else if (state.completeness.exitCode !== 0) blocks.push(`completeness exit=${state.completeness.exitCode}`);
  if (phase === 'baseline') {
    if (!state.fields) blocks.push('fields not_run');
    else if (state.fields.exitCode !== 0) blocks.push(`fields exit=${state.fields.exitCode}`);
    if (!state.vote) blocks.push('vote not_run');
    else if (state.vote.exitCode !== 0) blocks.push(`vote disputed=${state.vote.exitCode}`);
    if (!state.baselineLock) blocks.push('baseline lock not_run');
    else if (state.baselineLock.exitCode !== 0) blocks.push(`baseline lock exit=${state.baselineLock.exitCode}`);
    return blocks;
  }
  if (!state.baselineLock) blocks.push('baseline lock not_run');
  else if (state.baselineLock.exitCode !== 0) blocks.push(`baseline lock exit=${state.baselineLock.exitCode}`);
  if (!state.gate) blocks.push('gate not_run');
  else if (state.gate.exitCode !== 0) blocks.push(`gate exit=${state.gate.exitCode}`);
  if (!state.fields) blocks.push('fields not_run');
  else if (state.fields.exitCode !== 0) blocks.push(`fields exit=${state.fields.exitCode}`);
  if (!state.vote) blocks.push('vote not_run');
  else if (state.vote.exitCode !== 0) blocks.push(`vote disputed=${state.vote.exitCode}`);
  if (!state.progress) blocks.push('progress not_run');
  else if (state.progress.exitCode !== 0) blocks.push(`progress exit=${state.progress.exitCode}`);
  if (!state.local) blocks.push('local verification not_run');
  else if (state.local.exitCode !== 0) blocks.push(`local verification exit=${state.local.exitCode}`);
  return blocks;
}

function commandReport(cfg, phase = cfg.auditPhase || 'implementation') {
  const state = readState(cfg);
  const blocks = summarizeBlocking(state, phase);
  const reportJson = {
    schemaVersion: '0.1',
    batchId: cfg.batchId || state.batchId || '',
    generatedAt: new Date().toISOString(),
    phase,
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
    `- Phase: ${phase}`,
    '',
    '## Gate Summary',
    '',
    `- contract-integrity: ${state.contract ? `exit=${state.contract.exitCode}` : 'not_run'}`,
    `- completeness-sweep: ${state.completeness ? `exit=${state.completeness.exitCode}` : 'not_run'}`,
    `- baseline-lock: ${state.baselineLock ? `exit=${state.baselineLock.exitCode}` : 'not_run'}`,
    `- migration-gate: ${state.gate ? `exit=${state.gate.exitCode}` : 'not_run'}`,
    `- field-diff: ${state.fields ? `exit=${state.fields.exitCode}` : 'not_run'}`,
    `- adversarial-vote: ${state.vote ? `disputed=${state.vote.exitCode}` : 'not_run'}`,
    `- migration-progress: ${state.progress ? `exit=${state.progress.exitCode}` : 'not_run'}`,
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
    if (command === 'contract') exitCode = commandContract(cfg);
    else if (command === 'completeness') exitCode = commandCompleteness(cfg);
    else if (command === 'gate') exitCode = commandGate(cfg);
    else if (command === 'fields') exitCode = commandFields(cfg);
    else if (command === 'vote') exitCode = commandVote(cfg);
    else if (command === 'lock') exitCode = commandLock(cfg);
    else if (command === 'check-lock') exitCode = commandCheckLock(cfg);
    else if (command === 'progress') exitCode = commandProgress(cfg);
    else if (command === 'local') exitCode = commandLocal(cfg);
    else if (command === 'report') exitCode = commandReport(cfg);
    else if (command === 'verify' || command === 'all') {
      const c = commandContract(cfg);
      const s = commandCompleteness(cfg);
      const b = commandCheckLock(cfg);
      const g = commandGate(cfg);
      const f = commandFields(cfg);
      const v = commandVote(cfg);
      const p = commandProgress(cfg);
      const l = commandLocal(cfg);
      const r = commandReport(cfg, 'implementation');
      exitCode = c || s || b || g || f || v || p || l || r ? 1 : 0;
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
