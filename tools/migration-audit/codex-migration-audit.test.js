#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tool = path.join(__dirname, 'codex-migration-audit.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-migration-audit-'));
const batch = path.join(root, 'batch');
const config = path.join(batch, 'migration.yaml');

function run(command, expectedStatus) {
  const args = command === 'init'
    ? [tool, 'init', '--target', batch, '--batch-id', 'test-batch', '--title', 'Test Batch']
    : [tool, command, '--config', config];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.strictEqual(
    result.status,
    expectedStatus,
    `${command} expected ${expectedStatus}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function writeJson(name, payload) {
  fs.writeFileSync(path.join(batch, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function dimensionCoverage(covered = {}) {
  return Object.fromEntries([
    'pages',
    'uiFunctions',
    'apiContracts',
    'fields',
    'serviceLinks',
    'menuRoutes',
    'shellFeatures',
    'integrations',
  ].map((name) => [
    name,
    covered[name]
      ? { status: 'covered', contractIds: covered[name], evidence: '' }
      : { status: 'not-applicable', contractIds: [], evidence: `${name} not used by this fixture` },
  ]));
}

function validFixture() {
  fs.rmSync(path.join(batch, 'module.field-coverage'), { force: true });
  writeJson('field-diffs.json', [{
    id: 'module-name-placeholder',
    oldFilesCsv: '',
    newFilesCsv: '',
    coverageFile: '.field-coverage',
    stripPrefixesCsv: 'Bas_,Fk_',
  }]);
  writeJson('source-inventory.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    legacySource: {
      repo: '/legacy',
      branchOrRef: 'master',
      commit: '0123456789abcdef0123456789abcdef01234567',
      evidence: 'git rev-parse master',
    },
    artifacts: [{
      id: 'artifact.inventory-page',
      module: 'Inventory',
      side: 'legacy',
      type: 'page',
      path: 'Views/Inventory/Index.cshtml',
      pageClass: 'crud',
      contractDimension: 'pages',
      dimensionExemptionEvidence: '',
      status: 'complete',
      evidence: 'Views/Inventory/Index.cshtml:1',
      notes: '',
    }],
  });
  writeJson('migration-matrix.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    rows: [{
      id: 'row.inventory-page',
      legacyArtifactIds: ['artifact.inventory-page'],
      module: 'Inventory',
      legacyBehavior: 'list inventory',
      classification: 'migrate-equivalent',
      targetFrontend: 'src/pages/inventory/index.tsx',
      targetBackend: 'existing',
      menuPermission: 'inventory:list',
      contractIds: ['page.inventory'],
      dimensionCoverage: dimensionCoverage({ pages: ['page.inventory'] }),
      contractStatus: 'ready',
      riskFlags: [],
      voteClaimIds: ['claim.inventory-module'],
      severity: 'HIGH',
      evidence: ['Views/Inventory/Index.cshtml:1'],
      openGaps: [],
      decision: 'migrate 1:1',
    }],
  });
  writeJson('pages.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    records: [{
      id: 'page.inventory',
      module: 'Inventory',
      migrationRowId: 'row.inventory-page',
      contractStatus: 'ready',
      evidence: ['Views/Inventory/Index.cshtml:1'],
      sourceArtifactIds: ['artifact.inventory-page'],
      sourceArtifactId: 'artifact.inventory-page',
      pageClass: 'crud',
      targetPage: 'src/pages/inventory/index.tsx',
      refs: [],
    }],
  });
  for (const name of [
    'ui-functions.json',
    'api-contracts.json',
    'fields.json',
    'service-links.json',
    'menu-routes.json',
    'shell-features.json',
    'integrations.json',
  ]) {
    writeJson(name, { schemaVersion: '0.2', batchId: 'test-batch', records: [] });
  }
  writeJson('completeness-sweep.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    dimensions: [
      'enumeration',
      'frontend-backend-ownership',
      'shell-layout',
      'menu-page-backend',
      'source-degradation',
      'current-new-only',
    ].map((id) => ({
      id,
      status: 'complete',
      evidence: [`${id} sweep evidence`],
      gapIds: [],
    })),
    gaps: [],
    criticRounds: [1, 2].map((round) => ({
      round,
      newGapIds: [],
      missedDimensions: [],
      midStateModules: [],
      unverifiedClaims: [],
      evidence: [`critic round ${round} evidence`],
    })),
  });
  fs.writeFileSync(
    config,
    fs.readFileSync(config, 'utf8').replace('requireFieldDiffs: "true"', 'requireFieldDiffs: "false"'),
  );
  writeJson('votes.json', {
    artifacts: [{
      id: 'claim.inventory-module',
      subject: 'Inventory page contract',
      claimEvidence: ['Views/Inventory/Index.cshtml:1'],
      migrationRowIds: ['row.inventory-page'],
      votes: [
        { lens: 'source-completeness', refuted: false, confidence: 'high', note: 'source traced at Views/Inventory/Index.cshtml:1' },
        { lens: 'target-contract', refuted: false, confidence: 'high', note: 'target contract traced in pages.json' },
      ],
    }],
  });
}

try {
  run('init', 0);
  run('contract', 1);

  validFixture();
  run('contract', 0);
  run('completeness', 0);

  const completenessFile = path.join(batch, 'completeness-sweep.json');
  const validCompleteness = fs.readFileSync(completenessFile, 'utf8');
  const missingDimension = JSON.parse(validCompleteness);
  missingDimension.dimensions.pop();
  writeJson('completeness-sweep.json', missingDimension);
  run('completeness', 1);
  fs.writeFileSync(completenessFile, validCompleteness);

  const oneCriticRound = JSON.parse(validCompleteness);
  oneCriticRound.criticRounds.pop();
  writeJson('completeness-sweep.json', oneCriticRound);
  run('completeness', 1);
  fs.writeFileSync(completenessFile, validCompleteness);

  const validConfig = fs.readFileSync(config, 'utf8');
  fs.writeFileSync(
    config,
    validConfig.replace(
      'requiredSweepDimensionsCsv: "enumeration,frontend-backend-ownership,shell-layout,menu-page-backend,source-degradation,current-new-only"',
      'requiredSweepDimensionsCsv: "enumeration"',
    ),
  );
  writeJson('completeness-sweep.json', missingDimension);
  run('completeness', 1);
  fs.writeFileSync(config, validConfig);
  fs.writeFileSync(completenessFile, validCompleteness);

  const droppedCriticFinding = JSON.parse(validCompleteness);
  droppedCriticFinding.criticRounds = [
    {
      round: 1,
      newGapIds: [],
      missedDimensions: ['database'],
      midStateModules: [],
      unverifiedClaims: [],
      evidence: ['critic found a missing database dimension'],
    },
    ...droppedCriticFinding.criticRounds.map((round, index) => ({ ...round, round: index + 2 })),
  ];
  writeJson('completeness-sweep.json', droppedCriticFinding);
  run('completeness', 1);

  const linkedCriticFinding = JSON.parse(JSON.stringify(droppedCriticFinding));
  linkedCriticFinding.gaps.push({
    id: 'gap.database-enumeration',
    dimension: 'enumeration',
    migrationRowId: 'row.inventory-page',
    status: 'resolved',
    evidence: ['database inventory added to source and matrix'],
  });
  linkedCriticFinding.dimensions.find((item) => item.id === 'enumeration').gapIds.push('gap.database-enumeration');
  linkedCriticFinding.criticRounds[0].newGapIds = ['gap.database-enumeration'];
  linkedCriticFinding.criticRounds[0].missedDimensions = ['gap.database-enumeration'];
  writeJson('completeness-sweep.json', linkedCriticFinding);
  run('completeness', 0);
  fs.writeFileSync(completenessFile, validCompleteness);

  const votesFile = path.join(batch, 'votes.json');
  const validVotes = fs.readFileSync(votesFile, 'utf8');
  writeJson('votes.json', { artifacts: [] });
  run('vote', 1);
  fs.writeFileSync(votesFile, validVotes);

  const zeroRiskMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  zeroRiskMatrix.rows[0].severity = 'LOW';
  zeroRiskMatrix.rows[0].voteClaimIds = [];
  writeJson('migration-matrix.json', zeroRiskMatrix);
  writeJson('votes.json', { artifacts: [] });
  run('contract', 0);
  run('vote', 0);

  zeroRiskMatrix.rows[0].severity = 'CRITICAL';
  writeJson('migration-matrix.json', zeroRiskMatrix);
  run('contract', 1);
  run('vote', 1);
  validFixture();

  const riskMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  riskMatrix.rows[0].classification = 'exclude-proven-dead';
  riskMatrix.rows[0].voteClaimIds = [];
  writeJson('migration-matrix.json', riskMatrix);
  run('contract', 1);
  run('vote', 1);
  validFixture();

  run('lock', 0);
  assert.ok(fs.existsSync(path.join(batch, 'baseline-lock.json')), 'baseline lock should be written');

  const specFile = path.join(batch, 'spec.md');
  const validSpec = fs.readFileSync(specFile, 'utf8');
  fs.writeFileSync(specFile, `${validSpec}\nchanged migration scope\n`);
  run('check-lock', 1);
  fs.writeFileSync(specFile, validSpec);
  run('lock', 0);

  const completenessBeforeDrift = fs.readFileSync(completenessFile, 'utf8');
  fs.writeFileSync(completenessFile, completenessBeforeDrift.replace('critic round 2 evidence', 'critic round 2 updated evidence'));
  run('check-lock', 1);
  fs.writeFileSync(completenessFile, completenessBeforeDrift);
  run('lock', 0);

  const incompleteSweep = JSON.parse(completenessBeforeDrift);
  incompleteSweep.dimensions.pop();
  writeJson('completeness-sweep.json', incompleteSweep);
  run('lock', 1);
  assert.ok(!fs.existsSync(path.join(batch, 'baseline-lock.json')), 'incomplete sweep must remove stale baseline lock');
  fs.writeFileSync(completenessFile, completenessBeforeDrift);
  run('lock', 0);

  writeJson('field-diffs.json', [{
    id: 'module-name-placeholder',
    oldFilesCsv: '',
    newFilesCsv: '',
    coverageFile: 'module.field-coverage',
    stripPrefixesCsv: 'Bas_,Fk_',
  }]);
  fs.writeFileSync(path.join(batch, 'module.field-coverage'), 'known-field -> renamed-field\n');
  run('lock', 0);
  fs.appendFileSync(path.join(batch, 'module.field-coverage'), 'another-field -> target-field\n');
  run('check-lock', 1);
  validFixture();
  run('lock', 0);

  const pageFile = path.join(batch, 'pages.json');
  const validPage = fs.readFileSync(pageFile, 'utf8');
  fs.writeFileSync(pageFile, validPage.replace('src/pages/inventory/index.tsx', 'src/pages/inventory/list.tsx'));
  run('check-lock', 1);
  fs.writeFileSync(pageFile, validPage);
  run('lock', 0);

  fs.writeFileSync(votesFile, '{ malformed');
  run('lock', 1);
  assert.ok(!fs.existsSync(path.join(batch, 'baseline-lock.json')), 'lock exception must remove stale baseline lock');
  fs.writeFileSync(votesFile, validVotes);
  run('lock', 0);

  fs.writeFileSync(pageFile, validPage.replace('artifact.inventory-page', 'artifact.missing'));
  run('lock', 1);
  assert.ok(!fs.existsSync(path.join(batch, 'baseline-lock.json')), 'failed lock must remove stale baseline lock');
  fs.writeFileSync(pageFile, validPage);

  const incompleteMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  delete incompleteMatrix.rows[0].dimensionCoverage.apiContracts;
  writeJson('migration-matrix.json', incompleteMatrix);
  run('contract', 1);
  validFixture();

  const dbSource = JSON.parse(fs.readFileSync(path.join(batch, 'source-inventory.json'), 'utf8'));
  const dbMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  dbSource.artifacts.push({
    id: 'artifact.inventory-table',
    module: 'Inventory',
    side: 'legacy',
    type: 'database-table',
    path: 'dbo.Inventory',
    pageClass: 'other',
    contractDimension: 'serviceLinks',
    dimensionExemptionEvidence: '',
    status: 'complete',
    evidence: 'InventoryRepository.cs:20',
  });
  dbMatrix.rows[0].legacyArtifactIds.push('artifact.inventory-table');
  dbMatrix.rows[0].contractIds.push('service.inventory-table');
  dbMatrix.rows[0].dimensionCoverage.serviceLinks = {
    status: 'covered',
    contractIds: ['service.inventory-table'],
    evidence: '',
  };
  writeJson('source-inventory.json', dbSource);
  writeJson('migration-matrix.json', dbMatrix);
  writeJson('service-links.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    records: [{
      id: 'service.inventory-table',
      module: 'Inventory',
      migrationRowId: 'row.inventory-page',
      contractStatus: 'ready',
      evidence: ['InventoryRepository.cs:20'],
      sourceArtifactIds: ['artifact.inventory-table'],
      fromId: 'page.inventory',
      toArtifactId: 'artifact.inventory-table',
      role: 'reads',
      refs: [],
    }],
  });
  run('contract', 0);
  validFixture();

  const unmappedSource = JSON.parse(fs.readFileSync(path.join(batch, 'source-inventory.json'), 'utf8'));
  const unmappedMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  unmappedSource.artifacts.push({
    id: 'artifact.inventory-api',
    module: 'Inventory',
    side: 'legacy',
    type: 'webapi-action',
    path: 'Controllers/InventoryController.cs:List',
    pageClass: 'other',
    contractDimension: 'apiContracts',
    dimensionExemptionEvidence: '',
    status: 'complete',
    evidence: 'Controllers/InventoryController.cs:10',
  });
  unmappedMatrix.rows[0].legacyArtifactIds.push('artifact.inventory-api');
  writeJson('source-inventory.json', unmappedSource);
  writeJson('migration-matrix.json', unmappedMatrix);
  run('contract', 1);
  validFixture();

  const fakeServiceMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  fakeServiceMatrix.rows[0].contractIds.push('service.inventory-fake');
  fakeServiceMatrix.rows[0].dimensionCoverage.serviceLinks = {
    status: 'covered',
    contractIds: ['service.inventory-fake'],
    evidence: '',
  };
  writeJson('migration-matrix.json', fakeServiceMatrix);
  writeJson('service-links.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    records: [{
      id: 'service.inventory-fake',
      module: 'Inventory',
      migrationRowId: 'row.inventory-page',
      contractStatus: 'ready',
      evidence: ['fake service link'],
      sourceArtifactIds: ['artifact.inventory-page'],
      fromId: 'page.inventory',
      toArtifactId: 'artifact.inventory-page',
      role: 'query',
      refs: [],
    }],
  });
  run('contract', 1);
  validFixture();

  const selfSource = JSON.parse(fs.readFileSync(path.join(batch, 'source-inventory.json'), 'utf8'));
  const selfMatrix = JSON.parse(fs.readFileSync(path.join(batch, 'migration-matrix.json'), 'utf8'));
  selfSource.artifacts.push({
    id: 'artifact.inventory-service',
    module: 'Inventory',
    side: 'legacy',
    type: 'service',
    path: 'Services/InventoryService.cs',
    pageClass: 'other',
    contractDimension: 'serviceLinks',
    dimensionExemptionEvidence: '',
    status: 'complete',
    evidence: 'Services/InventoryService.cs:1',
  });
  selfMatrix.rows[0].legacyArtifactIds.push('artifact.inventory-service');
  selfMatrix.rows[0].contractIds.push('service.inventory-self');
  selfMatrix.rows[0].dimensionCoverage.serviceLinks = {
    status: 'covered',
    contractIds: ['service.inventory-self'],
    evidence: '',
  };
  writeJson('source-inventory.json', selfSource);
  writeJson('migration-matrix.json', selfMatrix);
  writeJson('service-links.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    records: [{
      id: 'service.inventory-self',
      module: 'Inventory',
      migrationRowId: 'row.inventory-page',
      contractStatus: 'ready',
      evidence: ['self-referential fake link'],
      sourceArtifactIds: ['artifact.inventory-service'],
      fromId: 'artifact.inventory-service',
      toArtifactId: 'artifact.inventory-service',
      role: 'self',
      refs: [],
    }],
  });
  run('contract', 1);
  validFixture();

  const sourceFile = path.join(batch, 'source-inventory.json');
  const matrixFile = path.join(batch, 'migration-matrix.json');
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(matrixFile, 'utf8'));
  const pages = JSON.parse(validPage);
  source.artifacts.push({
    id: 'artifact.other-page',
    module: 'Other',
    side: 'legacy',
    type: 'page',
    path: 'Views/Other/Index.cshtml',
    pageClass: 'crud',
    contractDimension: 'pages',
    dimensionExemptionEvidence: '',
    status: 'complete',
    evidence: 'Views/Other/Index.cshtml:1',
  });
  matrix.rows.push({
    id: 'row.other-page',
    legacyArtifactIds: ['artifact.other-page'],
    module: 'Other',
    legacyBehavior: 'list other data',
    classification: 'migrate-equivalent',
    targetFrontend: 'src/pages/other/index.tsx',
    targetBackend: 'existing',
    menuPermission: 'other:list',
    contractIds: ['page.other'],
    dimensionCoverage: dimensionCoverage({ pages: ['page.other'] }),
    contractStatus: 'ready',
    riskFlags: [],
    voteClaimIds: [],
    severity: 'LOW',
    evidence: ['Views/Other/Index.cshtml:1'],
    openGaps: [],
    decision: 'migrate 1:1',
  });
  pages.records.push({
    id: 'page.other',
    module: 'Other',
    migrationRowId: 'row.other-page',
    contractStatus: 'ready',
    evidence: ['Views/Other/Index.cshtml:1'],
    sourceArtifactIds: ['artifact.other-page'],
    sourceArtifactId: 'artifact.other-page',
    pageClass: 'crud',
    targetPage: 'src/pages/other/index.tsx',
    refs: [],
  });
  pages.records[0].sourceArtifactId = 'artifact.other-page';
  writeJson('source-inventory.json', source);
  writeJson('migration-matrix.json', matrix);
  writeJson('pages.json', pages);
  run('contract', 1);
  validFixture();

  run('progress', 1);
  writeJson('migration-progress.json', {
    schemaVersion: '0.2',
    batchId: 'test-batch',
    rows: [{
      migrationRowId: 'row.inventory-page',
      status: 'verified',
      evidence: ['dotnet build WMSNETCORE.sln: exit 0'],
      openGaps: [],
    }],
  });
  run('progress', 0);

  console.log('codex-migration-audit tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
