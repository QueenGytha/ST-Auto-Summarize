# Research Documentation

This directory contains research and analysis for various technical investigations and proposed changes to the ST-Auto-Summarize extension.

## Research Topics

### [ConnectionManagerRequestService Migration](connection-manager-migration/)
**Status**: Research Complete
**Last Updated**: 2025-01-08

Investigation of migrating from slash command profile switching + `generateRaw()` to SillyTavern's `ConnectionManagerRequestService` API.

**Key Documents:**
- [Migration Analysis](connection-manager-migration/CONNECTION_MANAGER_REQUEST_SERVICE_MIGRATION_ANALYSIS.md) (3,010 lines) - Main analysis with cost-benefit and recommendations
- [Technical Issue Traces](connection-manager-migration/TECHNICAL_ISSUE_TRACES.md) (1,638 lines) - End-to-end code traces of all issues
- [Verification Report](connection-manager-migration/VERIFICATION_REPORT.md) (350+ lines) - Audit of all claims with evidence
- [Critical Findings](connection-manager-migration/CRITICAL_FINDINGS_CONNECTION_MANAGER.md) (557 lines) - Summary of blocking issues
- [README](connection-manager-migration/README.md) - Complete index and reading guide

**Summary:**
- ✅ Technically viable but architecturally complex
- ✅ Effort: 50-65 hours (corrected from initial 120 hour estimate)
- ⚠️ Requires 15-20 hour pilot phase first
- ❌ Significant refactoring of operation context pattern required
- 📊 4 critical incompatibilities identified and traced end-to-end

**Recommendation:** Pilot phase only if benefits justify investment.

---

### [Timeline-Memory Analysis](timeline-memory/)
**Status**: Analysis Complete
**Last Updated**: 2025-01-08

Analysis of the Timeline-Memory extension's architecture and techniques.

**Key Document:**
- [ANALYSIS.md](timeline-memory/ANALYSIS.md) (1,000+ lines)

**Summary:**
- Compared chapter-based (Timeline-Memory) vs. per-message (ST-Auto-Summarize) approaches
- Cataloged 4 prompt types and techniques worth considering
- Identified ConnectionManagerRequestService usage (sparked migration investigation)

---

## Research Index by Date

- **2025-01-08**: ConnectionManagerRequestService Migration (complete with verification)
- **2025-01-08**: Timeline-Memory Analysis (complete)

---

## Adding New Research

When adding new research topics:

1. Create a subdirectory: `docs/research/topic-name/`
2. Add primary documents to the subdirectory
3. Create a README.md in the subdirectory with:
   - Document index
   - Key findings summary
   - Recommendations
4. Update this top-level README with:
   - Link to new research topic
   - Status and last updated date
   - Brief summary

---

*Research documentation structure established 2025-01-08*
