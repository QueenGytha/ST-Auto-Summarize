/* global localStorage, MutationObserver -- Browser APIs */
// navbarAutoHide.js - Auto-hide navbar when SillyTavern drawers are open

import { debug, SUBSYSTEM, selectorsExtension } from './index.js';

// SillyTavern drawer IDs to monitor
const DRAWER_IDS = [
  'left-nav-panel',        // AI Response Configuration
  'rm_api_block',          // API Connections
  'AdvancedFormatting',    // AI Response Formatting
  'WorldInfo',             // World Info
  'user-settings-block',   // User Settings
  'Backgrounds',           // Change Background Image
  'rm_extensions_block',   // Extensions
  'PersonaManagement',     // Persona Management
  'right-nav-panel'        // Character Management
];

let observer = null;
let stateBeforeDrawer = null; // Store navbar state before drawer opened

function isAnyDrawerOpen() {
  return DRAWER_IDS.some((id) => {
    const drawer = document.getElementById(id);
    if (!drawer) {return false;}
    return drawer.classList.contains('openDrawer') || drawer.classList.contains('pinnedOpen');
  });
}

function hideNavbar() {
  const $navbar = $(selectorsExtension.sceneNav.bar);
  const $button = $(selectorsExtension.queue.navbarToggle);

  if (!$navbar.length || !$button.length) {return;}

  // Only save state if we haven't already (first drawer opening)
  if (stateBeforeDrawer === null) {
    stateBeforeDrawer = {
      navbarVisible: $navbar.is(':visible'),
      buttonLeft: $button.css('left')
    };
    debug(SUBSYSTEM.UI, `Saved navbar state before drawer opened: ${JSON.stringify(stateBeforeDrawer)}`);
  }

  // Hide both navbar and toggle button
  $navbar.hide();
  $button.hide();
  debug(SUBSYSTEM.UI, 'Navbar and toggle hidden (drawer opened)');
}

function restoreNavbar() {
  const $navbar = $(selectorsExtension.sceneNav.bar);
  const $button = $(selectorsExtension.queue.navbarToggle);

  if (!$navbar.length || !$button.length) {return;}

  // Restore previous state
  if (stateBeforeDrawer !== null) {
    if (stateBeforeDrawer.navbarVisible) {
      $navbar.show();
      $button.show();
      $button.css('left', stateBeforeDrawer.buttonLeft);
      debug(SUBSYSTEM.UI, `Restored navbar to visible state: ${JSON.stringify(stateBeforeDrawer)}`);
    } else {
      // Was hidden before, keep it hidden but show button
      $navbar.hide();
      $button.show();
      debug(SUBSYSTEM.UI, 'Restored navbar to hidden state (was collapsed before drawer)');
    }

    // Clear saved state
    stateBeforeDrawer = null;
  } else {
    // No saved state, restore based on localStorage preference
    const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
    if (navbarVisible === 'true') {
      $navbar.show();
    } else {
      $navbar.hide();
    }
    $button.show();
    debug(SUBSYSTEM.UI, 'Restored navbar from localStorage (no saved state)');
  }
}

function checkDrawerState() {
  if (isAnyDrawerOpen()) {
    hideNavbar();
  } else {
    restoreNavbar();
  }
}

export function initNavbarAutoHide() {
  debug(SUBSYSTEM.UI, 'Initializing navbar auto-hide system');

  // Create observer for all drawer changes
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (DRAWER_IDS.includes(target.id)) {
          debug(SUBSYSTEM.UI, `Drawer state changed: ${target.id} -> ${target.className}`);
          checkDrawerState();
          break; // Only need to check once per batch
        }
      }
    }
  });

  // Observe all drawer elements
  for (const id of DRAWER_IDS) {
    const drawer = document.getElementById(id);
    if (drawer) {
      observer.observe(drawer, {
        attributes: true,
        attributeFilter: ['class']
      });
      debug(SUBSYSTEM.UI, `Observing drawer: ${id}`);
    }
  }

  // Don't run initial check - navbar is already in correct state from initialization
  // Only hide/restore on drawer state CHANGES, not initial state
  debug(SUBSYSTEM.UI, 'Navbar auto-hide initialized (waiting for drawer changes)');
}

export function destroyNavbarAutoHide() {
  if (observer) {
    observer.disconnect();
    observer = null;
    debug(SUBSYSTEM.UI, 'Navbar auto-hide observer destroyed');
  }
}
