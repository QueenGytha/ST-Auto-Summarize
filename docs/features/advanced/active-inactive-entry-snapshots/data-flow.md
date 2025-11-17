# Active/Inactive Entry Snapshots - Data Flow

## IMPORTANT: Duplicate Feature Notice

**This is Feature #159**, which is a **duplicate** of **Feature #181** (Active and Inactive Entry Snapshots).

- **Feature #159:** `active-inactive-entry-snapshots` (this document)
- **Feature #181:** `active-and-inactive-entry-snapshots` (fully documented)

Both features refer to the **same implementation** in `index.js:257-616` that captures lorebook entry snapshots per message.

**For complete data flow documentation, refer to Feature #181:**
- [Feature #181 Data Flow](../active-and-inactive-entry-snapshots/data-flow.md)
- [Feature #181 Implementation](../active-and-inactive-entry-snapshots/implementation.md)

This document provides the same information as Feature #181 for reference purposes.

---

## Overview

This feature (Feature #159) is identical to Feature #181. Both provide complete historical tracking of lorebook entries for every message generation. See [Feature #181 Data Flow](../active-and-inactive-entry-snapshots/data-flow.md) for complete flow diagrams and examples.

## Data Flow Summary

All data flows for this feature are documented in Feature #181:

1. **Normal Message Generation Flow** - See Feature #181
2. **Swipe Generation Flow** - See Feature #181
3. **Continue Generation Flow** - See Feature #181
4. **Sticky Entry Lifecycle Flow** - See Feature #181
5. **Constant Entry Lifecycle Flow** - See Feature #181
6. **Multi-Lorebook Snapshot Flow** - See Feature #181
7. **Snapshot Retrieval Flow** - See Feature #181
8. **Chat Switch Flow** - See Feature #181
9. **Memory Cleanup Flow** - See Feature #181
10. **Complete Request Examples** - See Feature #181

---

**Status:** Documentation Complete - Refer to Feature #181 for all data flow details
