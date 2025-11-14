# Proposed Features

This folder contains design documentation for features that have been researched and specified but **NOT YET IMPLEMENTED**.

---

## ⚠️ Important

**Nothing in this folder is implemented code.**

These are design documents, research findings, and specifications for potential future features. All documents represent planning and analysis work only.

---

## Features

### [checkpoint-integration/](checkpoint-integration/)

**Integration with SillyTavern's checkpoint and branch features**

- **Status:** Design complete, awaiting implementation decision
- **Complexity:** Medium (7-9 hours for V2 approach)
- **Documents:** 16 files including requirements, design specs, risk analysis
- **Key Benefit:** Proper state isolation for checkpoints/branches using cloned lorebooks

### [prompt-versioning/](prompt-versioning/)

**Prompt versioning system with immutable defaults**

- **Status:** Corrected design complete, awaiting implementation decision
- **Complexity:** Medium (12-15 hours for full implementation)
- **Documents:** 4 files including corrected design, verification report, implementation guide
- **Key Benefits:** Safe settings evolution, automatic prompt updates, 75-90% storage savings

---

## Why These Aren't Implemented

These features were thoroughly researched and designed but not implemented because:

1. **Not immediately required** for core functionality
2. **Awaiting user feedback** on priority and desired behavior
3. **Alternative approaches emerged** during design (e.g., V1 → V2 for checkpoints)
4. **Implementation discovered in deleted code** (checkpoint integration had critical bugs)

---

## How to Use These Documents

If you're considering implementing one of these features:

1. **Read the README** in the feature's folder first
2. **Check implementation status** - ensure you understand what exists vs what's planned
3. **Review requirements** - V2 documents supersede V1 where applicable
4. **Identify critical issues** - look for analysis/verification reports
5. **Estimate scope** - implementation time estimates are provided
6. **Make decisions** - decision points are documented for each feature

---

## Related Documentation

- **[../reference/](../reference/)** - Technical reference material relevant to these features
- **[../development/](../development/)** - Development workflow and testing guides
- **[../research/](../research/)** - Completed research on external systems

---

*All features in this folder are proposals only. Treat as design specifications, not implementation.*
