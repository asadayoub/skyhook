/**
 * Skyhook Modular Multi-Page Application Bootloader
 * Initializes Bridge, Store, Shared Components, and registers all 8 Feature Views into Router.
 */

import { Bridge } from './core/Bridge.js';
import { Store } from './core/Store.js';
import { Router } from './core/Router.js';

import { Header } from './components/Header.js';
import { Navigation } from './components/Navigation.js';
import { TelemetryGrid } from './components/TelemetryGrid.js';
import { CodeModal } from './components/CodeModal.js';
import { Toast } from './components/Toast.js';

import { KanbanView } from './views/KanbanView.js';
import { TopologyView } from './views/TopologyView.js';
import { DriftView } from './views/DriftView.js';
import { DecisionsView } from './views/DecisionsView.js';
import { MermaidView } from './views/MermaidView.js';
import { DarkMatterView } from './views/DarkMatterView.js';
import { HarnessView } from './views/HarnessView.js';
import { SettingsView } from './views/SettingsView.js';

async function bootstrap() {
  // 1. Initialize Core Store & Universal Platform Bridge
  const store = new Store();
  const bridge = Bridge.create();
  bridge.init();

  // Pipe Bridge connection & latency into Store
  bridge.on('CONNECTION_CHANGED', ({ connected }) => {
    store.setState({ connected });
  });

  bridge.on('LATENCY_UPDATED', ({ latencyMs }) => {
    store.setState({ latencyMs });
  });

  // 2. Initialize Shared Shell Components
  const headerContainer = document.getElementById('headerContainer');
  const telemetryContainer = document.getElementById('telemetryContainer');
  const fileModalEl = document.getElementById('fileModal');
  const mainContentEl = document.getElementById('mainContent');

  const codeModal = new CodeModal({ element: fileModalEl, bridge, store });
  codeModal.mount();

  const telemetryGrid = new TelemetryGrid({ container: telemetryContainer, store });
  telemetryGrid.mount();

  // 3. Initialize Router & Register all 8 Views
  const router = new Router({
    container: mainContentEl,
    bridge,
    store,
    defaultRoute: '/kanban'
  });

  router.register('/kanban', KanbanView);
  router.register('/topology', TopologyView);
  router.register('/drift', DriftView);
  router.register('/decisions', DecisionsView);
  router.register('/mermaid', MermaidView);
  router.register('/dark-matter', DarkMatterView);
  router.register('/harness', HarnessView);
  router.register('/settings', SettingsView);

  // 4. Mount Header then Navigation
  const header = new Header({
    element: headerContainer,
    store,
    bridge,
    onProjectChange: async (projectId) => {
      await loadProject(projectId, bridge, store, router);
    }
  });
  header.mount();

  const navContainer = document.getElementById('navContainer');
  const nav = new Navigation({ container: navContainer, router });
  nav.mount();

  // 5. Initial Data Load
  try {
    const { projects } = await bridge.get('/api/projects');
    store.setState({ projects });

    const activeProject = projects[0];
    if (activeProject) {
      await loadProject(activeProject.id, bridge, store, router);
    }
  } catch (err) {
    console.error('[Skyhook] Failed initial project discovery:', err);
  }

  // 6. Listen for Server Broadcast Push Events
  const pushEvents = [
    'BACKLOG_UPDATED',
    'DECISIONS_UPDATED',
    'REQUIREMENTS_UPDATED',
    'TECH_STACK_UPDATED',
    'STORY_TRANSITIONED',
    'LEASE_RELEASED',
    'DRIFT_ADOPTED',
    'PLAN_RECOMPILED',
    'ADR_TRANSITIONED',
    'ADR_SUPERSEDED',
    'ADR_INTERCEPTED',
    'POLICIES_COMPILED',
    'HARNESS_INJECTED',
    'HARNESS_REMOVED'
  ];

  pushEvents.forEach(eventType => {
    bridge.on(eventType, async () => {
      const currentProjId = store.getState().currentProjectId;
      if (currentProjId) {
        await loadProject(currentProjId, bridge, store, router, true);
      }
    });
  });

  // 7. Start Router Navigation
  router.init();
}

async function loadProject(projectId, bridge, store, router, silent = false) {
  try {
    store.setState({ currentProjectId: projectId });
    const projectData = await bridge.get('/api/project', { id: projectId });
    store.setState({ projectData });

    // If current view has reactive update hook, call it
    const activeView = router.getCurrentView();
    if (activeView && typeof activeView.update === 'function') {
      activeView.update(projectData);
    }
  } catch (err) {
    console.error(`[Skyhook] Error loading project '${projectId}':`, err);
    if (!silent) {
      Toast.show(`Failed to load project: ${err.message}`, 'error');
    }
  }
}

// Boot application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
