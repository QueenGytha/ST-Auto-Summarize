// tests.js - Test cases for ST-Auto-Lorebooks entry management

import {
    addLorebookEntry,
    modifyLorebookEntry,
    deleteLorebookEntry,
    getLorebookEntries,
    getAttachedLorebook,
    log,
    error,
    toast
} from './index.js';

/**
 * Test adding a new lorebook entry
 * @param {string} lorebookName - Name of the lorebook to test with
 */
export async function testAddEntry(lorebookName) {
    try {
        log("=== TEST: Add Lorebook Entry ===");

        const testEntry = {
            keys: ['test_key', 'example'],
            secondaryKeys: ['secondary_test'],
            content: 'This is a test entry created by the test suite.',
            comment: 'Test Entry',
            constant: false,
            order: 100
        };

        log("Test data:", testEntry);

        const result = await addLorebookEntry(lorebookName, testEntry);

        if (result) {
            log(`✓ TEST PASSED: Entry created with UID ${result.uid}`);
            log("Entry details:", {
                uid: result.uid,
                keys: result.key,
                content: result.content,
                comment: result.comment
            });
            return result;
        } else {
            error("✗ TEST FAILED: Failed to create entry");
            return null;
        }

    } catch (err) {
        error("✗ TEST FAILED with exception:", err);
        return null;
    }
}

/**
 * Test modifying an existing lorebook entry
 * @param {string} lorebookName - Name of the lorebook
 * @param {number} uid - UID of entry to modify
 */
export async function testModifyEntry(lorebookName, uid) {
    try {
        log("=== TEST: Modify Lorebook Entry ===");
        log(`Modifying entry UID ${uid} in lorebook: ${lorebookName}`);

        const updates = {
            content: 'This entry has been MODIFIED by the test suite.',
            comment: 'Modified Test Entry',
            keys: ['modified_key', 'updated'],
            constant: true
        };

        log("Update data:", updates);

        const result = await modifyLorebookEntry(lorebookName, uid, updates);

        if (result) {
            log(`✓ TEST PASSED: Entry UID ${uid} modified successfully`);
            return true;
        } else {
            error("✗ TEST FAILED: Failed to modify entry");
            return false;
        }

    } catch (err) {
        error("✗ TEST FAILED with exception:", err);
        return false;
    }
}

/**
 * Test deleting a lorebook entry
 * @param {string} lorebookName - Name of the lorebook
 * @param {number} uid - UID of entry to delete
 */
export async function testDeleteEntry(lorebookName, uid) {
    try {
        log("=== TEST: Delete Lorebook Entry ===");
        log(`Deleting entry UID ${uid} from lorebook: ${lorebookName}`);

        const result = await deleteLorebookEntry(lorebookName, uid, true);

        if (result) {
            log(`✓ TEST PASSED: Entry UID ${uid} deleted successfully`);
            return true;
        } else {
            error("✗ TEST FAILED: Failed to delete entry");
            return false;
        }

    } catch (err) {
        error("✗ TEST FAILED with exception:", err);
        return false;
    }
}

/**
 * Test getting all entries from a lorebook
 * @param {string} lorebookName - Name of the lorebook
 */
export async function testGetEntries(lorebookName) {
    try {
        log("=== TEST: Get Lorebook Entries ===");
        log(`Getting all entries from lorebook: ${lorebookName}`);

        const entries = await getLorebookEntries(lorebookName);

        if (entries !== null) {
            log(`✓ TEST PASSED: Retrieved ${entries.length} entries`);

            if (entries.length > 0) {
                log("Sample entry:", {
                    uid: entries[0].uid,
                    comment: entries[0].comment,
                    keys: entries[0].key,
                    content: entries[0].content?.substring(0, 50) + '...'
                });
            }

            return entries;
        } else {
            error("✗ TEST FAILED: Failed to get entries");
            return null;
        }

    } catch (err) {
        error("✗ TEST FAILED with exception:", err);
        return null;
    }
}

/**
 * Run all tests in sequence
 * This creates an entry, modifies it, lists entries, then deletes the test entry
 * @param {string} lorebookName - Name of the lorebook to test with (defaults to current chat's lorebook)
 */
export async function runAllTests(lorebookName = null) {
    try {
        log("======================================");
        log("=== RUNNING ALL LOREBOOK ENTRY TESTS ===");
        log("======================================");

        // If no lorebook name provided, use the attached one
        if (!lorebookName) {
            lorebookName = getAttachedLorebook();
            if (!lorebookName) {
                error("No lorebook specified and no lorebook attached to current chat");
                toast("Cannot run tests: No lorebook available", "error");
                return false;
            }
            log(`Using attached lorebook: ${lorebookName}`);
        }

        // Test 1: Get initial entries count
        log("\n--- Test 1: Get Initial Entries ---");
        const initialEntries = await testGetEntries(lorebookName);
        if (initialEntries === null) {
            error("Failed to get initial entries, aborting tests");
            return false;
        }
        const initialCount = initialEntries.length;

        // Test 2: Add a new entry
        log("\n--- Test 2: Add New Entry ---");
        const newEntry = await testAddEntry(lorebookName);
        if (!newEntry) {
            error("Failed to add entry, aborting tests");
            return false;
        }
        const testUid = newEntry.uid;

        // Test 3: Get entries again to verify addition
        log("\n--- Test 3: Verify Entry Addition ---");
        const entriesAfterAdd = await testGetEntries(lorebookName);
        if (entriesAfterAdd === null || entriesAfterAdd.length !== initialCount + 1) {
            error(`Expected ${initialCount + 1} entries, got ${entriesAfterAdd?.length || 0}`);
            error("Entry count verification failed");
        } else {
            log(`✓ Entry count verification passed: ${entriesAfterAdd.length} entries`);
        }

        // Test 4: Modify the entry
        log("\n--- Test 4: Modify Entry ---");
        const modifyResult = await testModifyEntry(lorebookName, testUid);
        if (!modifyResult) {
            error("Failed to modify entry");
        }

        // Test 5: Get entries to verify modification
        log("\n--- Test 5: Verify Entry Modification ---");
        const entriesAfterModify = await testGetEntries(lorebookName);
        if (entriesAfterModify) {
            const modifiedEntry = entriesAfterModify.find(e => e.uid === testUid);
            if (modifiedEntry) {
                log("Modified entry found:", {
                    uid: modifiedEntry.uid,
                    comment: modifiedEntry.comment,
                    keys: modifiedEntry.key,
                    constant: modifiedEntry.constant
                });
                if (modifiedEntry.comment === 'Modified Test Entry' && modifiedEntry.constant === true) {
                    log("✓ Modification verification passed");
                } else {
                    error("✗ Modification verification failed: values don't match");
                }
            } else {
                error("✗ Modified entry not found");
            }
        }

        // Test 6: Delete the entry
        log("\n--- Test 6: Delete Entry ---");
        const deleteResult = await testDeleteEntry(lorebookName, testUid);
        if (!deleteResult) {
            error("Failed to delete entry");
        }

        // Test 7: Get entries to verify deletion
        log("\n--- Test 7: Verify Entry Deletion ---");
        const finalEntries = await testGetEntries(lorebookName);
        if (finalEntries === null || finalEntries.length !== initialCount) {
            error(`Expected ${initialCount} entries after deletion, got ${finalEntries?.length || 0}`);
            error("Entry deletion verification failed");
        } else {
            log(`✓ Entry deletion verification passed: ${finalEntries.length} entries`);
        }

        // Summary
        log("\n======================================");
        log("=== TEST SUITE COMPLETE ===");
        log("======================================");
        log(`Initial entries: ${initialCount}`);
        log(`Final entries: ${finalEntries?.length || 0}`);

        if (finalEntries?.length === initialCount) {
            log("✓ ALL TESTS PASSED: Lorebook restored to initial state");
            toast("All lorebook entry tests passed!", "success");
            return true;
        } else {
            error("⚠ TESTS COMPLETED WITH WARNINGS: Entry count mismatch");
            toast("Tests completed with warnings", "warning");
            return false;
        }

    } catch (err) {
        error("✗ TEST SUITE FAILED with exception:", err);
        toast("Test suite failed", "error");
        return false;
    }
}

/**
 * Quick test - just adds and removes one entry
 * @param {string} lorebookName - Name of the lorebook to test with
 */
export async function quickTest(lorebookName = null) {
    try {
        log("=== QUICK TEST ===");

        if (!lorebookName) {
            lorebookName = getAttachedLorebook();
            if (!lorebookName) {
                error("No lorebook available for testing");
                return false;
            }
        }

        log(`Testing with lorebook: ${lorebookName}`);

        // Add entry
        const entry = await addLorebookEntry(lorebookName, {
            keys: ['quick_test'],
            content: 'Quick test entry',
            comment: 'Quick Test'
        });

        if (!entry) {
            error("Quick test failed: could not create entry");
            return false;
        }

        log(`Created entry UID ${entry.uid}`);

        // Delete entry
        const deleted = await deleteLorebookEntry(lorebookName, entry.uid, true);

        if (!deleted) {
            error("Quick test failed: could not delete entry");
            return false;
        }

        log("✓ QUICK TEST PASSED");
        toast("Quick test passed!", "success");
        return true;

    } catch (err) {
        error("Quick test failed with exception:", err);
        return false;
    }
}

// Export all test functions
export default {
    testAddEntry,
    testModifyEntry,
    testDeleteEntry,
    testGetEntries,
    runAllTests,
    quickTest
};
