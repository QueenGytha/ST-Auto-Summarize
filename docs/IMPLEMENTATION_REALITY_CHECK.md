# Implementation Reality Check

⚠️ **CRITICAL: Complete this validation BEFORE building test infrastructure** ⚠️

This document provides a systematic validation process to determine if the proposed testing methodology is viable.

**The Goal**: Determine whether real SillyTavern code can be imported in Node.js, or if runtime proxy approach is needed.

**The Rule**: Zero tolerance for AI-written mocks. Either import real ST code, or call real running ST. No fantasy behavior.

---

## Quick Validation

### Step 1: Test Basic Import

```bash
cd /mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New

# Test if script.js can be imported
node --input-type=module -e "import('./public/script.js').then(() => console.log('✅ SUCCESS')).catch(e => console.error('❌ FAILED:', e.message))"
```

**Possible outcomes:**

1. **✅ SUCCESS** - script.js imported without errors → Proceed to Step 2
2. **❌ FAILED: window is not defined** - Missing browser globals → Normal, proceed to Step 2 with polyfills
3. **❌ FAILED: Cannot access 'X' before initialization** - Circular dependencies → Serious issue, likely need runtime proxy
4. **❌ FAILED: Unexpected token** - ES6 module syntax issues → Check Node.js version (need 16+)

### Step 2: Test with Polyfills

```bash
# Create quick polyfill test
cat > test-import.mjs << 'EOF'
import { JSDOM } from 'jsdom';

// Minimal polyfills
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;

// Try import with polyfills
try {
  const st = await import('./public/script.js');
  console.log('✅ SUCCESS with polyfills');
  console.log('Available exports:', Object.keys(st).length);
} catch (error) {
  console.error('❌ FAILED with polyfills:', error.message);
}
EOF

npm install jsdom
node test-import.mjs
```

**Interpret results:**
- **✅ SUCCESS with polyfills** → Import-based testing is viable
- **❌ FAILED with circular dependency error** → Likely need runtime proxy
- **❌ FAILED with missing API error** → Need more polyfills

---

## Detailed Analysis

### Step 3: Test All Required Imports

```bash
cd /mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/extensions/third-party/ST-Auto-Summarize

# Find all ST imports your extension uses
grep -h "from ['\"]\.\./" *.js | sort -u
```

Create test for all imports:

```javascript
// test-all-imports.mjs
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;

const imports = [
  './public/script.js',
  './public/scripts/world-info.js',
  './public/scripts/extensions.js',
  // ... add all imports your extension uses
];

let successes = 0;
let failures = 0;

for (const modulePath of imports) {
  try {
    await import(modulePath);
    console.log(`✅ ${modulePath}`);
    successes++;
  } catch (error) {
    console.error(`❌ ${modulePath}: ${error.message}`);
    failures++;
  }
}

const successRate = (successes / (successes + failures)) * 100;
console.log(`\n📊 Success Rate: ${successRate.toFixed(1)}%`);

if (successRate >= 80) {
  console.log('✅ Import-based testing is VIABLE');
} else {
  console.log('❌ Use runtime proxy approach instead');
}
```

---

## Decision Matrix

| Success Rate | Circular Deps? | Recommendation |
|-------------|---------------|----------------|
| 90-100% | No | ✅ **Proceed with import-based testing** |
| 80-90% | No | ✅ Proceed with caution, add comprehensive polyfills |
| 80-90% | Yes | ⚠️ Hybrid: imports for some, proxy for circular deps |
| 70-80% | Any | ⚠️ Marginal - try polyfills for 1-2 days max |
| < 70% | Any | ❌ **Use runtime proxy approach** |

---

## Option A: Import-Based Testing

**If validation shows 80%+ success:**

Follow TESTING_ARCHITECTURE.md implementation guide with these modifications:

```javascript
// tests/setup/sillytavern-loader.js
// NO fallback stubs - fail loudly if imports don't work

const successRate = calculateSuccessRate();

if (successRate >= 80) {
  // Export real ST code
  export * from '../../../script.js';
} else {
  throw new Error(
    `Import success rate ${successRate}% too low. ` +
    'Switch to runtime proxy approach (Option B).'
  );
}
```

---

## Option B: Runtime Proxy

**If validation shows < 80% success OR circular dependencies:**

Don't use imports at all. Call real running SillyTavern:

```javascript
// tests/setup/sillytavern-proxy.js
const ST_URL = process.env.ST_URL || 'http://localhost:8000';

export async function generateRaw(options) {
  const res = await fetch(`${ST_URL}/extension-api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });

  if (!res.ok) {
    throw new Error(`Real ST rejected: ${await res.text()}`);
  }

  return await res.json();
}

export async function getChat() {
  return await fetch(`${ST_URL}/extension-api/chat`).then(r => r.json());
}

export async function getChatMetadata() {
  return await fetch(`${ST_URL}/extension-api/metadata`).then(r => r.json());
}
```

**Setup:**
1. Add test endpoints to SillyTavern (`/extension-api/*`)
2. Create scripts to start/stop ST server for tests
3. All test API calls go to real running ST
4. Zero mocks, all behavior from real ST

---

## Common Pitfalls

### ❌ Pitfall 1: Accepting Low Success Rate

**Wrong:** "50% of imports work, good enough, we'll mock the rest"

**Right:** "50% success → Use runtime proxy for everything. Zero mocks."

### ❌ Pitfall 2: Writing "Smart" Fallbacks

**Wrong:**
```javascript
export async function generateRaw(options) {
  return { content: "Mock response" }; // AI-written behavior
}
```

**Right:**
```javascript
// Either import works or throw
throw new Error('Import failed - use runtime proxy');
```

### ❌ Pitfall 3: Mixing Approaches

**Wrong:** Import some modules, mock others

**Right:** Pick ONE approach (imports OR proxy) and commit

---

## Validation Checklist

Before proceeding:

**For Import-Based:**
- [ ] 80%+ import success rate measured
- [ ] No unresolvable circular dependencies
- [ ] All polyfills identified
- [ ] NO fallback stubs in design

**For Runtime Proxy:**
- [ ] ST test endpoints designed
- [ ] Server start/stop scripts working
- [ ] Proxy architecture documented
- [ ] Zero AI-written behavior

**For Both:**
- [ ] Zero-mock policy enforced
- [ ] Clear rollback plan
- [ ] Results documented

---

## Summary

**Start here, not with infrastructure:**

1. Run validation (1-2 hours)
2. Measure success rate
3. Make Go/No-Go decision
4. Document results
5. Proceed with chosen approach

**If in doubt → Runtime proxy is safer**
- Simpler to understand
- Harder to accidentally write mocks
- More resilient to ST changes

**Never compromise on zero-mock policy.**
