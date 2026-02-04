import { CONFIG } from '../config.js';

export const modePanel = {
    _temperatureSyncBound: false,

    bindModeTabs() {
        const tabs = document.querySelectorAll('.mode-tab');
        if (!tabs.length) return;
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                tabs.forEach(t => t.classList.toggle('active', t === tab));
                document.querySelectorAll('.mode-content').forEach(section => {
                    section.classList.toggle('active', section.id === `mode-${mode}`);
                });
                const runMode = document.getElementById('run-mode');
                if (runMode) {
                    runMode.value = mode === 'limit' ? 'retry' : mode;
                }
                this.syncLegacyTemperatureFromActive();
                this.updateActionButtons();
            });
        });
    },

    bindBatchSelection() {
        const radios = document.querySelectorAll('input[name="batch-selection"]');
        if (!radios.length) return;
        const update = () => {
            const selectedMode = document.querySelector('input[name="batch-selection"]:checked')?.value || 'all';
            const categoryOptions = document.getElementById('batch-category-options');
            const selectedTests = document.getElementById('batch-selected-tests');
            if (categoryOptions) categoryOptions.style.display = selectedMode === 'all' ? 'flex' : 'none';
            if (selectedTests) selectedTests.style.display = selectedMode === 'selected' ? 'block' : 'none';
            this.updateActionButtons();
        };
        radios.forEach(radio => radio.addEventListener('change', update));
        update();
    },

    /**
     * Run Options (legacy hidden controls)
     */
    bindRunOptions() {
        const runMode = document.getElementById('run-mode');
        if (!runMode) return;
        runMode.addEventListener('change', (e) => {
            const mode = e.target.value;
            const iterationsLabel = document.getElementById('iterations-label');
            if (iterationsLabel) iterationsLabel.style.display = mode === 'batch' ? 'block' : 'none';
            const maxAttemptsLabel = document.getElementById('max-attempts-label');
            if (maxAttemptsLabel) maxAttemptsLabel.style.display = mode === 'retry' ? 'block' : 'none';
        });
    },

    applyDefaultParams() {
        const tempInput = document.getElementById('temperature');
        if (tempInput && CONFIG.defaultParams?.temperature !== undefined) {
            tempInput.value = CONFIG.defaultParams.temperature;
        }
        const singleTemp = document.getElementById('single-temperature');
        if (singleTemp && CONFIG.defaultParams?.temperature !== undefined) {
            singleTemp.value = CONFIG.defaultParams.temperature;
        }
        const batchTemp = document.getElementById('batch-temperature');
        if (batchTemp && CONFIG.defaultParams?.temperature !== undefined) {
            batchTemp.value = CONFIG.defaultParams.temperature;
        }
        const limitTemp = document.getElementById('limit-temperature');
        if (limitTemp && CONFIG.defaultParams?.temperature !== undefined) {
            limitTemp.value = CONFIG.defaultParams.temperature;
        }

        this.bindTemperatureSync();
        this.syncLegacyTemperatureFromActive();

        const iterationsInput = document.getElementById('iterations');
        if (iterationsInput && CONFIG.benchmark?.batchIterations) {
            iterationsInput.value = CONFIG.benchmark.batchIterations;
        }

        const batchIterationsInput = document.getElementById('batch-iterations');
        if (batchIterationsInput && CONFIG.benchmark?.batchIterations) {
            batchIterationsInput.value = CONFIG.benchmark.batchIterations;
        }
    },

    getActiveTemperatureInput() {
        const runMode = document.getElementById('run-mode')?.value;
        const idByMode = {
            single: 'single-temperature',
            batch: 'batch-temperature',
            retry: 'limit-temperature'
        };
        const id = idByMode[runMode] || 'temperature';
        return document.getElementById(id) || document.getElementById('temperature');
    },

    syncLegacyTemperatureFromActive() {
        const legacy = document.getElementById('temperature');
        if (!legacy) return;
        const active = this.getActiveTemperatureInput();
        if (active && active !== legacy) legacy.value = active.value;
    },

    bindTemperatureSync() {
        if (this._temperatureSyncBound) return;
        this._temperatureSyncBound = true;

        const ids = ['single-temperature', 'batch-temperature', 'limit-temperature', 'temperature'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => this.syncLegacyTemperatureFromActive());
            el.addEventListener('change', () => this.syncLegacyTemperatureFromActive());
        });
    }
};
