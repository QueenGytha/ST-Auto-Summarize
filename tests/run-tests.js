// Minimal test runner for ST-Auto-Summarize (no external deps)
// - Builds a virtualized project with SillyTavern imports stubbed
// - Discovers and runs tests from tests/unit and tests/integration

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, join, dirname, sep, relative } from 'path';
import { pathToFileURL } from 'url';

const ROOT = resolve('.');
const TESTS_DIR = resolve('tests');
const VIRTUAL_DIR = resolve('tests/virtual');
const STUBS_DIR = resolve('tests/virtual/stubs');
const INTEGRATION_DIR = resolve('tests/integration');
const UNIT_DIR = resolve('tests/unit');

function log(...args) { console.log('[tests]', ...args); }

function expect(val) {
  return {
    toBe: (x) => { if (val !== x) throw new Error(`Expected ${val} toBe ${x}`); },
    toEqual: (x) => { const a = JSON.stringify(val); const b = JSON.stringify(x); if (a !== b) throw new Error(`Expected ${a} toEqual ${b}`); },
    toBeDefined: () => { if (val === undefined) throw new Error('Expected value to be defined'); },
    toBeTruthy: () => { if (!val) throw new Error('Expected value to be truthy'); },
    toBeType: (t) => { if (typeof val !== t) throw new Error(`Expected typeof ${typeof val} to be ${t}`); }
  };
}

function ensureDirs() {
  if (!existsSync(TESTS_DIR)) mkdirSync(TESTS_DIR);
  if (existsSync(VIRTUAL_DIR)) rmSync(VIRTUAL_DIR, { recursive: true, force: true });
  mkdirSync(VIRTUAL_DIR, { recursive: true });
  mkdirSync(STUBS_DIR, { recursive: true });
}

const EXTERNAL_IMPORT_PATTERNS = [
  '../../../../extensions.js',
  '../../../../script.js',
  '../../../extensions.js',
  '../../../group-chats.js',
  '../../../power-user.js',
  '../../../RossAscends-mods.js',
  '../../../constants.js',
  '../../../macros.js',
  '../../../preset-manager.js',
  '../../../instruct-mode.js',
  '../../../slash-commands/SlashCommandCommonEnumsProvider.js',
  '../../../utils.js',
  '../../../world-info.js',
  '../../../../scripts/extensions/regex/index.js',
  '../../../../scripts/extensions/regex/engine.js'
];

function transformImports(src) {
  let out = src;
  for (const pat of EXTERNAL_IMPORT_PATTERNS) {
    const re = new RegExp(`from\\s+['\"]${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`, 'g');
    out = out.replace(re, `from './stubs/externals.js'`);
  }
  return out;
}

function listJsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'tests' || e.name === 'docs' || e.name === 'flow-typed' || e.name === '.git' || e.name.endsWith('.bak') || e.name === '.playwright-mcp' || e.name === 'specs') continue;
    const full = resolve(dir, e.name);
    if (e.isDirectory()) files.push(...listJsFiles(full));
    else if (e.isFile() && e.name.endsWith('.js')) files.push(full);
  }
  return files;
}

function buildVirtualProject() {
  ensureDirs();

  const externals = `// Auto-generated externals stub for tests

// Ensure browser-like window exists
if (typeof globalThis.window === 'undefined') { globalThis.window = {}; }
if (typeof globalThis.window.renderSceneNavigatorBar !== 'function') { globalThis.window.renderSceneNavigatorBar = () => {}; }
if (typeof globalThis.window.updateVersionSelector !== 'function') { globalThis.window.updateVersionSelector = () => {}; }

// jQuery stub
if (typeof globalThis.$ !== 'function') {
  const jq = (selector) => {
    // very lightweight chainable stub
    const api = {
      length: 0,
      // traversal / selection
      find: () => ({ length: 0 }),
      closest: () => ({ attr: () => '0' }),
      parent: () => ({ is: () => true }),
      // content manipulation
      prepend: () => api,
      append: () => api,
      after: () => api,
      empty: () => api,
      html: () => api,
      text: () => api,
      // attr/prop/state
      attr: () => '',
      prop: () => api,
      val: () => api,
      css: () => api,
      addClass: () => api,
      removeClass: () => api,
      hide: () => api,
      show: () => api,
      detach: () => api,
      // events/animation
      on: () => api,
      off: () => api,
      animate: () => api,
      // positioning/scroll
      offset: () => ({ top: 0 }),
      scrollTop: (v) => (v === undefined ? 0 : api),
    };
    return api;
  };
  globalThis.$ = jq;
  globalThis.jQuery = jq;
}

// Globals and simple constants used by the extension
export const chat_metadata = {};
export const CONNECT_API_MAP = {};
export const main_api = '';
export const extension_prompt_roles = {};
export const extension_prompt_types = {};
export const system_message_types = {};
export const animation_duration = 0;
export const debounce_timeout = { relaxed: 300 };
export const extension_settings = { autoLorebooks: { enabledByDefault: true, summary_processing: {}, nameTemplate: 'z-AutoLB - {{char}} - {{chat}}' } };

// toastr stub
if (typeof globalThis.toastr === 'undefined') {
  globalThis.toastr = new Proxy({}, { get: () => () => {} });
}

// Provide common settings defaults used by get_settings consumers
// The extension stores settings under the module key; ensure it exists with a few overrides for tests
if (!extension_settings.auto_summarize_memory) {
  extension_settings.auto_summarize_memory = {};
}
extension_settings.auto_summarize_memory.operation_queue_use_lorebook = false;
extension_settings.auto_summarize_memory.operation_queue_enabled = true;
extension_settings.auto_summarize_memory.debug_mode = true;
extension_settings.auto_summarize_memory.auto_scene_break_generate_summary = true;
// Avoid UI blocking calls in tests
extension_settings.auto_summarize_memory.block_chat = false;

// world-info store
const __world = { world_names: [], worlds: {} };
export const world_names = __world.world_names;
export async function createNewWorldInfo(name){ if (!__world.worlds[name]) { __world.worlds[name] = { entries: {} }; if (!__world.world_names.includes(name)) __world.world_names.push(name); return true; } return false; }
export async function deleteWorldInfo(name){ if (__world.worlds[name]) { delete __world.worlds[name]; const i = __world.world_names.indexOf(name); if (i>=0) __world.world_names.splice(i,1); return true; } return false; }
export async function loadWorldInfo(name){ return __world.worlds[name] || null; }
export async function saveWorldInfo(name, data){ __world.worlds[name] = data; return true; }
export function createWorldInfoEntry(name, data){
  const uid = Date.now() + Math.floor(Math.random()*1000);
  const entry = {
    uid,
    key: [],
    keysecondary: [],
    content: '',
    comment: '',
    probability: 100,
    useProbability: true,
    disable: false,
    constant: false,
    preventRecursion: false,
    tags: [],
    order: 100,
    position: 0,
    depth: 4,
  };
  if (!data.entries) data.entries = {};
  data.entries[uid] = entry;
  return entry;
}
export async function deleteWorldInfoEntry(data, uid){ if (data?.entries && data.entries[uid]) { delete data.entries[uid]; return true; } return false; }
export const METADATA_KEY = 'auto_summarize_lorebook';

export function saveMetadata(){}
export function getCurrentChatId(){ return 'chat-1'; }
export let characters = [{ name: 'Alice' }];
export let this_chid = 0;
export let name2 = 'Alice';
export let selected_group = null;
export let groups = [];
export let is_group_generating = false;
export let openGroupId = null;
export function getPresetManager(){ return {}; }
export function formatInstructModeChat(_n, t){ return t; }
export function loadMovingUIState(){}
export function renderStoryString(){ return ''; }
export function dragElement(){}
export class MacrosParser {}
export const power_user = { instruct: { output_sequence: '' } };

// Utility
export function getStringHash(s=''){ return s.length; }
export function debounce(fn){ return (...a)=>fn(...a); }
export function copyText(){}
export function trimToEndSentence(s=''){ return s; }
export function download(){}
export function parseJsonFile(){ return {}; }
export async function waitUntilCondition(){ return true; }
export function scrollChatToBottom(){}
export function setSendButtonState(){}
export function saveSettingsDebounced(){}
export function saveMetadataDebounced(){}
export function getMaxContextSize(){ return 4096; }
export async function streamingProcessor(){}
export const amount_gen = 0;
const DEFAULT_GENERATE_RAW = async () => 'OK';
let generateRawImpl = DEFAULT_GENERATE_RAW;
export async function generateRaw(arg){
  generateRaw.__calls.push(arg);
  return generateRawImpl(arg);
}
Object.defineProperty(generateRaw, '__calls', { value: [], writable: false });
export function setGenerateRawImplementation(fn){
  generateRawImpl = typeof fn === 'function' ? fn : DEFAULT_GENERATE_RAW;
}

// Minimal settings helpers expected by extension code
export function get_settings(key){
  // Provide a very simple settings getter that reads from extension_settings.autoLorebooks
  // Unit tests only rely on a few keys; default to undefined
  const root = extension_settings.autoLorebooks || {};
  return root[key];
}
export function set_settings(_key, _value){}
export function refresh_settings(){}

// Context and command parser stubs
const SlashCommandParser = { __list: [], addCommandObject(obj){ this.__list.push(obj); } };
const SlashCommand = { fromProps: (p)=>p };
const SlashCommandArgument = { fromProps: (p)=>p };
const ARGUMENT_TYPE = { NUMBER: 'number', STRING: 'string' };
const __ctx = {
  chat: [],
  saveChat(){},
  getTokenCount: (t)=> (typeof t === 'string' ? t.length : 0),
  executeSlashCommandsWithOptions: async ()=> ({ pipe: '' }),
  substituteParamsExtended: (s)=> s,
  stopGeneration(){},
  // No-op UI blockers used by detection code
  deactivateSendButtons(){},
  activateSendButtons(){},
  generateQuietPrompt: async ()=> 'OK',
  generateRaw: async (...args)=> generateRaw(...args),
  SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE,
  name1: 'User', name2: 'Assistant',
  parseReasoningFromString: ()=> ({ content: '', reasoning: '' })
};
export function getContext(){ return __ctx; }
export function getApiUrl(){ return ''; }

// Regex/Slash placeholders
export const commonEnumProviders = {};
export function getRegexScripts(){ return []; }
export function runRegexScript(){ return null; }
`;
  writeFileSync(join(STUBS_DIR, 'externals.js'), externals, 'utf8');

  const srcFiles = listJsFiles(ROOT)
    .filter(p => !p.includes(`${sep}tests${sep}`) && !p.includes(`${sep}node_modules${sep}`));

  for (const src of srcFiles) {
    const rel = relative(ROOT, src);
    const out = join(VIRTUAL_DIR, rel);
    const data = readFileSync(src, 'utf8');
    const transformed = transformImports(data);
    const outDir = dirname(out);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(out, transformed, 'utf8');
  }
}

const tests = [];
function test(name, fn, timeoutMs = 15000) { tests.push({ name, fn, timeoutMs }); }
async function loadTestModules() {
  const toLoad = [];
  const collect = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      if (!e.endsWith('.test.js')) continue;
      toLoad.push(join(dir, e));
    }
  };
  collect(UNIT_DIR);
  collect(INTEGRATION_DIR);
  for (const p of toLoad) {
    const mod = await import(pathToFileURL(resolve(p)).href);
    if (typeof mod.default === 'function') {
      await mod.default({ test, expect });
    }
  }
}

function defineBuiltInTests() {
  test('smoke: import key modules without throwing', async () => {
    const modules = [
      'operationQueue.js',
      'queueIntegration.js',
      'lorebookEntryMerger.js',
      'summaryToLorebookProcessor.js',
      'runningSceneSummary.js',
    ];
    for (const m of modules) {
      const imp = await import(pathToFileURL(resolve(VIRTUAL_DIR, m)).href);
      expect(imp).toBeDefined();
    }
  });

  test('queue: queued operations work before init', async () => {
    const oq = await import(pathToFileURL(resolve(VIRTUAL_DIR, 'operationQueue.js')).href);
    const qi = await import(pathToFileURL(resolve(VIRTUAL_DIR, 'queueIntegration.js')).href);
    const handler = async () => 'ok';
    oq.registerOperationHandler(oq.OperationType.GENERATE_RUNNING_SUMMARY, handler);
    const opId = await qi.queueGenerateRunningSummary();
    expect(typeof opId).toBe('string');
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const stats = oq.getQueueStats();
      if (stats.pending === 0 && stats.in_progress === 0) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const stats = oq.getQueueStats();
    expect(stats.pending).toBe(0);
  }, 10000);

  test('api: generateRaw called with object signature in executeMerge', async () => {
    const mod = await import(pathToFileURL(resolve(VIRTUAL_DIR, 'lorebookEntryMerger.js')).href);
    const ext = await import(pathToFileURL(resolve(VIRTUAL_DIR, 'stubs/externals.js')).href);
    mod.initLorebookEntryMerger(
      { log(){}, debug(){}, error(){} },
      { modifyLorebookEntry: async () => true, getLorebookEntries: async () => [] },
      { getSetting: () => '' },
      { enqueueOperation: async () => null, OperationType: {} }
    );
    await mod.executeMerge('test-lb', { uid: 1, comment: 'E', content: 'existing' }, { content: 'new' });
    const calls = ext.generateRaw.__calls;
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length > 0).toBe(true);
    const arg = calls[calls.length - 1];
    expect(typeof arg).toBe('object');
    expect(!!arg && typeof arg.prompt === 'string').toBe(true);
    expect(arg.api).toBe(undefined);
    expect(arg.instructOverride).toBe(false);
  });
}

async function main() {
  buildVirtualProject();
  defineBuiltInTests();
  await loadTestModules();

  let pass = 0, fail = 0;
  for (const t of tests) {
    const start = Date.now();
    let timer;
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        timer = setTimeout(() => { if (!settled) reject(new Error(`Timeout after ${t.timeoutMs}ms`)); }, t.timeoutMs);
        Promise.resolve(t.fn()).then((v) => { settled = true; resolve(v); }, (e) => { settled = true; reject(e); });
      });
      clearTimeout(timer);
      pass++;
      log(`PASS - ${t.name} (${Date.now() - start}ms)`);
    } catch (e) {
      clearTimeout(timer);
      fail++;
      console.error(`[tests] FAIL - ${t.name}:`, e.message);
    }
  }

  const dur = Date.now() - (globalThis.__tests_started_at || Date.now());
  console.log(`\nTest Summary: ${pass} passed, ${fail} failed (${dur}ms)`);
  if (fail > 0) process.exit(1);
}

globalThis.__tests_started_at = Date.now();
main().catch((e) => { console.error('[tests] Uncaught error:', e); process.exit(1); });


