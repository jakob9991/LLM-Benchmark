import { createInitialState } from './state.js';
import { helpers } from './helpers.js';
import { navigation } from './navigation.js';
import { modePanel } from './modePanel.js';
import { models } from './models.js';
import { tests } from './tests.js';
import { actions } from './actions.js';
import { runner } from './runner.js';
import { runs } from './runs.js';
import { stats } from './stats.js';
import { modal } from './modal.js';
import { backend } from './backend.js';

export const UI = {
    state: createInitialState(),

    /**
     * Initialisiert die UI
     */
    async init() {
        this.bindNavigation();
        this.bindRunOptions();
        this.bindModeTabs();
        this.bindBatchSelection();
        this.bindActions();
        this.bindModal();
        this.bindFilters();
        this.bindDefaultModelControls();
        this.applyDefaultParams();

        // Lade initiale Daten
        await this.loadProviders();
        await this.loadTests();
        this.checkBackendConnection();
        this.startBackendMonitor();
    }
};

Object.assign(
    UI,
    helpers,
    navigation,
    modePanel,
    models,
    tests,
    actions,
    runner,
    runs,
    stats,
    modal,
    backend
);

// Optional: expose for debugging in devtools
window.UI = UI;
