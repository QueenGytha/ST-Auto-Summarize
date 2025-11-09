/**
 * @file constants.js
 * Centralized constants to eliminate magic numbers across the codebase.
 * Values are grouped by semantic category for maintainability.
 */

// ============================================================================
// Time-Related Constants (in milliseconds)
// ============================================================================

/** Standard animation/transition delay */
export const ANIMATION_DELAY_MS = 200;

/** Standard UI update delay */
export const UI_UPDATE_DELAY_MS = 500;

/** Connection profile switch delay */
export const PROFILE_SWITCH_DELAY_MS = 100;

/** One second delay */
export const ONE_SECOND_MS = 1000;

/** Connection toast display duration */
export const CONNECTION_TOAST_DURATION_MS = 2000;

/** Operation fetch timeout */
export const OPERATION_FETCH_TIMEOUT_MS = 5000;

/** One minute timeout */
export const ONE_MINUTE_MS = 60000;

/** Queue operation timeout (5 minutes) */
export const QUEUE_OPERATION_TIMEOUT_MS = 300000;

// ============================================================================
// Percentage Constants
// ============================================================================

/** Threshold percentage for validation */
export const VALIDATION_THRESHOLD_PERCENTAGE = 80;

/** Maximum displayable percentage (for UI capping) */
export const MAX_DISPLAY_PERCENTAGE = 99;

/** Full completion percentage */
export const FULL_COMPLETION_PERCENTAGE = 100;

// ============================================================================
// UI Dimension Constants (in pixels)
// ============================================================================

/** Queue indicator button width */
export const QUEUE_BUTTON_WIDTH_PX = 175;

/** Queue indicator container width */
export const QUEUE_CONTAINER_WIDTH_PX = 800;

/** Queue indicator height */
export const QUEUE_INDICATOR_HEIGHT_PX = 60;

/** Progress bar animation offset */
export const PROGRESS_BAR_OFFSET_PX = 150;

/** Progress bar minor offset */
export const PROGRESS_BAR_MINOR_OFFSET_PX = 50;

/** Progress circle stroke offset */
export const PROGRESS_CIRCLE_STROKE_OFFSET_PX = 20;

// ============================================================================
// ID Generation Constants
// ============================================================================

/** Base for generating alphanumeric IDs (base-36: 0-9, a-z) */
export const ID_GENERATION_BASE = 36;

/** Length of generated ID substring for operations */
export const OPERATION_ID_LENGTH = 11;

/** Length of generated ID substring for entries */
export const ENTRY_ID_LENGTH = 9;

// ============================================================================
// Limits and Thresholds
// ============================================================================

/** Minimum number of sections for entity processing */
export const MIN_ENTITY_SECTIONS = 4;

/** Maximum retry attempts */
export const MAX_RETRY_ATTEMPTS = 5;

/** Default polling interval count */
export const DEFAULT_POLLING_INTERVAL = 10;

/** Hex color component base */
export const HEX_COLOR_BASE = 16;

/** Maximum line length for text wrapping */
export const MAX_LINE_LENGTH = 30;

/** Scene break character threshold (minimum) */
export const SCENE_BREAK_MIN_CHARS = 47;

/** Scene break character threshold (standard) */
export const SCENE_BREAK_CHARS = 50;

/** Navigation time limit in seconds (4 hours) */
export const NAVIGATION_TIME_LIMIT_SECONDS = 240;

/** Navigation date threshold in months */
export const NAVIGATION_DATE_THRESHOLD_MONTHS = 12;

/** Toast warning duration in words per minute */
export const TOAST_WARNING_DURATION_WPM = 300;

/** Toast short duration in words per minute */
export const TOAST_SHORT_DURATION_WPM = 1200;

/** Maximum queue position for prioritization */
export const MAX_QUEUE_PRIORITY = 9999;

// ============================================================================
// Array/String Manipulation Constants
// ============================================================================

/** Slice offset for removing trailing characters */
export const SLICE_TRIM_LAST_TWO = -2;

/** Queue position offset for high priority */
export const HIGH_PRIORITY_OFFSET = -10;

/** Queue position for medium priority */
export const MEDIUM_PRIORITY_POSITION = 5;

/** Queue position for standard operations */
export const STANDARD_QUEUE_POSITION = 15;

// ============================================================================
// Feature-Specific Constants
// ============================================================================

/** Maximum recap generation attempts */
export const MAX_RECAP_ATTEMPTS = 5;

/** Lorebook entry name maximum characters */
export const LOREBOOK_ENTRY_NAME_MAX_LENGTH = 20;

/** Merge similarity threshold for lorebook entries */
export const LOREBOOK_MERGE_THRESHOLD = 300;

/** Lorebook description character limit */
export const LOREBOOK_DESCRIPTION_MAX_LENGTH = 200;

// ============================================================================
// Debug Output Constants
// ============================================================================

/** Short debug output length (characters) */
export const DEBUG_OUTPUT_SHORT_LENGTH = 100;

/** Medium debug output length (characters) */
export const DEBUG_OUTPUT_MEDIUM_LENGTH = 200;

/** Separator line length for report formatting */
export const SEPARATOR_LINE_LENGTH = 80;

/** Long debug output length (characters) */
export const DEBUG_OUTPUT_LONG_LENGTH = 300;

/** JSON indentation spaces */
export const JSON_INDENT_SPACES = 4;

// ============================================================================
// Lorebook Ordering Constants
// ============================================================================

/** Initial lorebook entry order value for alphabetical sorting */
export const INITIAL_LOREBOOK_ORDER = 1000;

// ============================================================================
// Code Quality Constants (ESLint Configuration)
// ============================================================================

/** Maximum nesting depth of code blocks */
export const MAX_NESTING_DEPTH = 5;

/** Maximum nesting depth of callbacks */
export const MAX_NESTED_CALLBACKS = 4;

/** Maximum number of function parameters */
export const MAX_FUNCTION_PARAMS = 5;
