// Auto-generated externals stub for tests

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
