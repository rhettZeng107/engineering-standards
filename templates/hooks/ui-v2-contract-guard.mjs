#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const DEFAULT_CONFIG = Object.freeze({
  forbidRawProTable: false,
  listTableComponents: [],
  inlineFilterComponents: ['ListPageFilters'],
  filterOverlayComponents: [],
  repeatedBlockTokens: ['Card', 'SectionCard', 'v2-detail-row', 'form-list-row'],
})

const args = process.argv.slice(2)

if (args.includes('--self-test')) {
  runSelfTest()
  process.exit(0)
}

const repoRoot = git(['rev-parse', '--show-toplevel']).trim()
const config = loadConfig()
const staged = args.includes('--staged')
const files = staged ? stagedFiles() : explicitFiles(args)
const failures = []

for (const file of files) {
  if (!['.js', '.jsx', '.ts', '.tsx'].includes(extname(file))) continue
  const content = staged ? stagedContent(file) : readFileSync(resolve(repoRoot, file), 'utf8')
  failures.push(...checkUiV2Contract(file, content, config))
}

if (failures.length) {
  console.error('UI V2 contract guard failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`UI V2 contract guard passed (${files.filter(isSourceFile).length} source file(s) checked).`)

function git(gitArgs) {
  return execFileSync('git', gitArgs, { cwd: process.cwd(), encoding: 'utf8' })
}

function gitAtRoot(gitArgs) {
  return execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' })
}

function stagedFiles() {
  return gitAtRoot(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
}

function stagedContent(file) {
  return gitAtRoot(['show', `:${file}`])
}

function explicitFiles(values) {
  const marker = values.indexOf('--files')
  if (marker < 0 || marker === values.length - 1) usage()
  return values.slice(marker + 1).filter((value) => !value.startsWith('--'))
}

function loadConfig() {
  const marker = args.indexOf('--config')
  const configuredPath = marker >= 0 ? args[marker + 1] : 'ui-v2-guard.config.json'
  if (marker >= 0 && !configuredPath) usage()
  const path = resolve(repoRoot, configuredPath)
  if (!existsSync(path)) {
    if (marker >= 0) throw new Error(`UI V2 guard config not found: ${path}`)
    return DEFAULT_CONFIG
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    listTableComponents: parsed.listTableComponents ?? DEFAULT_CONFIG.listTableComponents,
    inlineFilterComponents: parsed.inlineFilterComponents ?? DEFAULT_CONFIG.inlineFilterComponents,
    filterOverlayComponents: parsed.filterOverlayComponents ?? DEFAULT_CONFIG.filterOverlayComponents,
    repeatedBlockTokens: parsed.repeatedBlockTokens ?? DEFAULT_CONFIG.repeatedBlockTokens,
  }
}

function checkUiV2Contract(file, content, rules = DEFAULT_CONFIG) {
  const issues = []
  const allowRaw = hasReasonDirective(content, 'ui-v2-allow-raw-pro-table')
  const allowInlineFilter = hasReasonDirective(content, 'ui-v2-allow-inline-filter')
  const allowRepeatedBlocks = hasReasonDirective(content, 'ui-v2-allow-repeated-blocks')

  if (/toolBarRender\s*=\s*\{?false\}?/.test(content)) {
    issues.push(`${file}: toolBarRender={false} removes required list tools; keep the toolbar active.`)
  }

  if (!allowInlineFilter && /filterMode\s*=\s*["']panel["']/.test(content)) {
    issues.push(`${file}: filterMode="panel" is an inline-flow filter; use a toolbar-triggered overlay or filterMode="none".`)
  }

  if (!allowInlineFilter) {
    for (const component of rules.inlineFilterComponents) {
      if (new RegExp(`<${escapeRegExp(component)}(?:\\s|>)`).test(content)) {
        issues.push(`${file}: <${component}> is configured as an inline filter container; move filters into the toolbar overlay.`)
      }
    }
  }

  if (rules.forbidRawProTable && /<ProTable(?:\s|>)/.test(content) && !allowRaw) {
    issues.push(`${file}: raw ProTable is disabled by project config; use the shared V2 list wrapper or add ui-v2-allow-raw-pro-table: reason.`)
  }

  for (const component of rules.listTableComponents) {
    const tags = content.match(new RegExp(`<${escapeRegExp(component)}\\b[\\s\\S]{0,4000}?>`, 'g')) ?? []
    tags.forEach((tag, index) => {
      const label = `${file}#${component}-${index + 1}`
      const overlay = /filterMode\s*=\s*["']overlay["']/.test(tag)
      const none = /filterMode\s*=\s*["']none["']/.test(tag)
      if (!overlay && !none) {
        issues.push(`${label}: declare filterMode="overlay" or filterMode="none" explicitly.`)
      }
      if (overlay && !/search\s*=\s*\{false\}/.test(tag)) {
        issues.push(`${label}: an external filter overlay requires search={false} so no inline search form is rendered.`)
      }
    })
  }

  const usesOverlayMode = /filterMode\s*=\s*["']overlay["']/.test(content)
  if (usesOverlayMode && rules.filterOverlayComponents.length > 0) {
    const hasConfiguredOverlay = rules.filterOverlayComponents.some((component) =>
      new RegExp(`<${escapeRegExp(component)}(?:\\s|>)`).test(content),
    )
    if (!hasConfiguredOverlay) {
      issues.push(`${file}: filterMode="overlay" requires one configured shared overlay component: ${rules.filterOverlayComponents.join(', ')}.`)
    }
  }

  if (!allowRepeatedBlocks) {
    const formLists = content.match(/<Form\.List\b[\s\S]{0,8000}?<\/Form\.List>/g) ?? []
    formLists.forEach((segment, index) => {
      const mapsRows = /\.map\s*\(/.test(segment)
      const usesTable = /<(?:EditableRecordTable|InlineDetailTable|EditableProTable|Table)(?:\s|>)/.test(segment)
      const repeatsBlock = rules.repeatedBlockTokens.some((token) => segment.includes(token))
      if (mapsRows && repeatsBlock && !usesTable) {
        issues.push(`${file}#Form.List-${index + 1}: repeated editable records are rendered as cards/blocks; use one shared-header editable table or add ui-v2-allow-repeated-blocks: reason for a proven heterogeneous collection.`)
      }
    })
  }

  return issues
}

function hasReasonDirective(content, directive) {
  return new RegExp(`${escapeRegExp(directive)}:\\s*\\S+`).test(content)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isSourceFile(file) {
  return ['.js', '.jsx', '.ts', '.tsx'].includes(extname(file))
}

function usage() {
  console.error('Usage: node ui-v2-contract-guard.mjs --staged [--config path] | --files <file...> [--config path] | --self-test')
  process.exit(2)
}

function runSelfTest() {
  const rules = {
    ...DEFAULT_CONFIG,
    forbidRawProTable: true,
    listTableComponents: ['V2ListTable'],
    inlineFilterComponents: ['ListPageFilters'],
    filterOverlayComponents: ['ListFilterOverlay'],
  }
  const good = `
    return <><ListFilterOverlay><Form /></ListFilterOverlay>
      <V2ListTable filterMode="overlay" search={false} /></>
  `
  const goodEditable = `return <EditableRecordTable rowKey="id" columns={columns} value={rows} />`
  const badPanel = `return <V2ListTable filterMode="panel" search={false} />`
  const badInline = `return <ListPageFilters><Form /></ListPageFilters>`
  const badRepeated = `return <Form.List name="rows">{(fields) => fields.map((field) => <div className="form-list-row"><Input /></div>)}</Form.List>`
  const badRaw = `return <ProTable columns={columns} />`
  if (checkUiV2Contract('good.tsx', good, rules).length !== 0) throw new Error('valid overlay fixture was rejected')
  if (checkUiV2Contract('good-editable.tsx', goodEditable, rules).length !== 0) throw new Error('valid editable-table fixture was rejected')
  if (checkUiV2Contract('bad-panel.tsx', badPanel, rules).length < 1) throw new Error('inline panel fixture was not rejected')
  if (checkUiV2Contract('bad-inline.tsx', badInline, rules).length !== 1) throw new Error('inline filter component fixture was not rejected')
  if (checkUiV2Contract('bad-repeated.tsx', badRepeated, rules).length !== 1) throw new Error('repeated block fixture was not rejected')
  if (checkUiV2Contract('bad-raw.tsx', badRaw, rules).length !== 1) throw new Error('raw ProTable fixture was not rejected')
  console.log('UI V2 contract guard self-test passed (overlay and editable-table positive/negative fixtures).')
}
