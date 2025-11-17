# Debug Subsystem Logging - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Subsystem Definitions](#subsystem-definitions)
3. [Core Components](#core-components)
4. [Core Logging Functions](#core-logging-functions)
5. [Key Mechanisms](#key-mechanisms)
6. [Integration Points](#integration-points)
7. [Testing and Validation](#testing-and-validation)

## Overview

The Debug Subsystem Logging feature provides categorized logging functionality organized by subsystem. This allows developers to quickly filter and search logs by functionality area in the browser console.

### What This Feature Does

- **Categorized Output**: Each log message includes a subsystem prefix like \, \, - **Console Integration**: All logs output to browser console with consistent \ prefix
- **Flexible Logging**: Supports \, \, \ functions
- **Subsystem Filtering**: Browser console can filter by subsystem tag for focused debugging

### Why Subsystem-Based Logging

The extension consists of many interconnected components that need independent debugging:
- Queue operations (async, multi-stage)
- Memory injection (complex token calculations)  
- Lorebook management (entry creation, merging, updates)
- Scene break detection (AI-based with validation)
- UI updates (message visuals, settings panels)
- Event handling (hooks into SillyTavern events)

### Core Architecture

All logging flows through functions in \:
1. \ - Standard logging
2. \ - Debug-level logging with [DEBUG] tag
3. \ - Error logging with toast notification

Each function:
- Prepends global \ prefix for easy identification
- Includes subsystem prefix for categorization  
- Routes to browser \ for actual output
- Handles error-specific behavior (toast notifications)

## Subsystem Definitions

Located in \ lines 34-46:

### Coverage Summary

- **CORE**: JSON repair, extraction, core utilities
- **MEMORY**: Message recap inclusion, token calculations
- **SCENE**: Scene break detection and markers
- **RUNNING**: Running scene recap versioning
- **QUEUE**: Operation queue async processing
- **LOREBOOK**: Lorebook entries, world info tracking
- **UI**: Button control, message visuals
- **EVENT**: SillyTavern event hooks
- **VALIDATION**: Recap validation
- **PROFILE**: Profile and preset management
- **COMBINED**: Combined recap processing

## Core Components

### log() Function

**Location:** \ lines 48-53

**Usage:**
**Output:** 
### debug() Function

**Location:** \ lines 55-60

**Usage:**
**Output:** 
### error() Function

**Location:** \ lines 62-74

**Usage:**
**Output:** 
- Console: - Toast: User-facing notification popup

## Key Mechanisms

### Log Message Formatting

Format: 
Examples:
- - - 
### Console Filtering

Use DevTools console filter box:
- \ - Show only Queue logs
- \ - Show only debug logs  
- \ - Hide all debug logs
- \ - Queue debug logs only

### Log Level Hierarchy

- \ - Standard information (always visible)
- \ - Verbose details (can filter out)
- \ - Critical failures (always + toast)

## Integration Points

### Usage Across Codebase

Total: 350+ debug() calls across 21+ files

Key files:
- \ - 62 QUEUE logs
- \ - 35+ logs
- \ - 35 UI/LOREBOOK logs
- \ - 15 SCENE logs
- \ - 35 SCENE logs
- \ - 28 RUNNING logs

### Toast Integration

The \ function automatically creates toast notifications via:
Only shown for error() calls, not for log() or debug().

## Testing and Validation

### Test 1: Basic Logging
Expected:
### Test 2: Error with Toast
Expected:
- Console log with [ERROR] prefix
- Toast notification popup

### Test 3: Console Filtering
1. Open DevTools console
2. Type \ in filter box
3. Only Queue logs should appear

4. Type \ in filter box  
5. Debug logs should disappear

### Test 4: Subsystem Constants
---

**Status:** Implementation complete
**Last Updated:** 2025-11-15
**Feature #:** 174
