import { API } from '../config.js';

export const actions = {
    /**
     * Action Buttons
     */
    bindActions() {
        const getRunFilters = () => {
            const filters = {
                provider: document.getElementById('filter-run-provider')?.value,
                status: document.getElementById('filter-run-status')?.value,
                passed: document.getElementById('filter-run-passed')?.value,
                includeDebug: document.getElementById('filter-run-debug')?.checked ? true : undefined
            };
            Object.keys(filters).forEach(k => !filters[k] && delete filters[k]);
            return filters;
        };

        document.getElementById('start-test-btn')?.addEventListener('click', () => this.startTest());
        document.getElementById('compare-btn')?.addEventListener('click', () => this.showCompareDialog());
        document.getElementById('start-test-btn-top')?.addEventListener('click', () => this.startTest());
        document.getElementById('compare-btn-top')?.addEventListener('click', () => this.showCompareDialog());
        document.getElementById('limit-test-btn')?.addEventListener('click', () => this.startLimitTest());
        document.getElementById('warmup-local-btn')?.addEventListener('click', () => this.runWarmup({ postAction: this.inferPostWarmupAction() }));
        document.getElementById('batch-all-btn')?.addEventListener('click', () => this.runBatchAll());
        document.getElementById('run-selected-btn')?.addEventListener('click', () => this.runSelectedTests());
        document.getElementById('single-warmup-btn')?.addEventListener('click', () => this.runWarmup({ postAction: 'runSelectedTests' }));
        document.getElementById('single-run-btn')?.addEventListener('click', () => this.runSelectedTests());
        document.getElementById('batch-warmup-btn')?.addEventListener('click', () => this.runWarmup({ postAction: 'runBatchAll' }));
        document.getElementById('batch-run-btn')?.addEventListener('click', () => this.runBatchAll());
        document.getElementById('limit-warmup-btn')?.addEventListener('click', () => this.runWarmup({ postAction: 'startLimitTest' }));
        document.getElementById('limit-run-btn')?.addEventListener('click', () => this.startLimitTest());
        document.getElementById('runner-abort-btn')?.addEventListener('click', () => this.requestRunnerAbort());
        document.getElementById('runner-next-action-btn')?.addEventListener('click', () => this.runPostWarmupAction());
        document.getElementById('runner-killall-btn')?.addEventListener('click', () => this.killAllRunnerJobs());
        document.getElementById('preview-html-btn')?.addEventListener('click', () => {
            if (!this.state.currentRun?.output) {
                this.showError('Kein Output zum Anzeigen vorhanden.');
                return;
            }
            const html = this.extractHtmlFromOutput(this.state.currentRun.output);
            if (!html) {
                this.showError('Kein gueltiges HTML im Output gefunden.');
                return;
            }
            this.openHtmlPreview(html);
        });
        document.getElementById('debug-analyze-btn')?.addEventListener('click', () => {
            this.runDebugAnalysis();
        });
        document.getElementById('toggle-output-btn')?.addEventListener('click', () => {
            const output = document.getElementById('runner-output');
            if (!output) return;
            if (output.classList.contains('collapsed')) {
                output.classList.remove('collapsed');
                output.classList.add('expanded');
            } else {
                output.classList.toggle('expanded');
            }
            const btn = document.getElementById('toggle-output-btn');
            if (btn) {
                if (output.classList.contains('collapsed')) {
                    btn.textContent = 'Code anzeigen';
                } else {
                    btn.textContent = output.classList.contains('expanded') ? 'Vollansicht schliessen' : 'Vollansicht';
                }
            }
        });
        document.getElementById('retry-attempt-select')?.addEventListener('change', (e) => {
            const selected = parseInt(e.target.value, 10);
            this.updateRetryHistoryPanel(Number.isNaN(selected) ? null : selected);
        });

        // Runs View
        document.getElementById('export-json-btn')?.addEventListener('click', () => API.exportRuns('json', getRunFilters()));
        document.getElementById('export-csv-btn')?.addEventListener('click', () => API.exportRuns('csv', getRunFilters()));
        document.getElementById('clear-runs-btn')?.addEventListener('click', () => this.confirmClearRuns());
        document.getElementById('refresh-runs-btn')?.addEventListener('click', () => this.loadRuns());

        // Filter für Runs
        ['filter-run-provider', 'filter-run-status', 'filter-run-passed', 'filter-run-debug'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.loadRuns());
        });

        // Stats
        document.getElementById('refresh-stats-btn')?.addEventListener('click', () => this.loadStats());

        // Manual Evaluation - New intuitive flow
        document.getElementById('eval-pass')?.addEventListener('click', () => this.submitEvaluation(true));
        document.getElementById('eval-fail-with-feedback')?.addEventListener('click', () => this.showFeedbackSection());
        document.getElementById('eval-submit-fail')?.addEventListener('click', () => this.submitEvaluation(false));
    },

    updateActionButtons() {
        const hasTest = !!this.state.selectedTest;
        const hasModel = !!this.state.selectedModel;
        const hasLimitTest = this.state.tests.some(t => t.category === 'limit-testing');
        const isLocalSelected = this.state.selectedModel?.provider === 'ollama';
        const warmupReady = !isLocalSelected || this.state.warmupModelId === this.state.selectedModel?.model;
        const backendReady = this.state.backendConnected !== false;
        const selectedCount = document.querySelectorAll('.test-item-checkbox:checked').length;

        const startBtn = document.getElementById('start-test-btn');
        if (startBtn) startBtn.disabled = !(hasTest && hasModel && backendReady);
        const compareBtn = document.getElementById('compare-btn');
        if (compareBtn) compareBtn.disabled = !hasTest;
        const startTop = document.getElementById('start-test-btn-top');
        if (startTop) startTop.disabled = !(hasTest && hasModel && backendReady);
        const compareTop = document.getElementById('compare-btn-top');
        if (compareTop) compareTop.disabled = !hasTest;

        const warmupButtons = ['warmup-local-btn', 'single-warmup-btn', 'batch-warmup-btn', 'limit-warmup-btn'];
        warmupButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !backendReady || !isLocalSelected || this.state.benchmarkRunning;
        });
        const warmupNotes = ['single-warmup-note', 'batch-warmup-note', 'limit-warmup-note'];
        warmupNotes.forEach(id => {
            const note = document.getElementById(id);
            if (note) {
                note.style.display = isLocalSelected && !warmupReady ? 'block' : 'none';
            }
        });

        const singleRunBtn = document.getElementById('single-run-btn');
        if (singleRunBtn) {
            singleRunBtn.disabled = !backendReady || !(hasModel && selectedCount > 0 && warmupReady) || this.state.benchmarkRunning;
            const countEl = document.getElementById('single-count');
            if (countEl) countEl.textContent = selectedCount;
        }

        const batchRunBtn = document.getElementById('batch-run-btn');
        if (batchRunBtn) {
            const selectionMode = document.querySelector('input[name="batch-selection"]:checked')?.value || 'all';
            let batchEnabled = backendReady && hasModel && warmupReady && !this.state.benchmarkRunning;
            if (selectionMode === 'selected') {
                batchEnabled = batchEnabled && selectedCount > 0;
            } else {
                const selectedCategories = Array.from(document.querySelectorAll('.batch-category'))
                    .filter(input => input.checked)
                    .map(input => input.value);
                const available = this.state.tests.some(test =>
                    selectedCategories.includes(test.category) && test.category !== 'limit-testing'
                );
                batchEnabled = batchEnabled && selectedCategories.length > 0 && available;
            }
            batchRunBtn.disabled = !batchEnabled;
        }

        const limitRunBtn = document.getElementById('limit-run-btn');
        if (limitRunBtn) {
            limitRunBtn.disabled = !backendReady || !(hasModel && hasLimitTest && warmupReady) || this.state.benchmarkRunning;
        }

        const limitBtn = document.getElementById('limit-test-btn');
        if (limitBtn) limitBtn.disabled = !backendReady || !(hasModel && hasLimitTest);

        const batchAllBtn = document.getElementById('batch-all-btn');
        if (batchAllBtn) {
            batchAllBtn.disabled = !backendReady || !(hasModel && this.state.tests.length > 0 && warmupReady) || this.state.benchmarkRunning;
        }

        // Keep Runner call-to-action in sync when model/warmup state changes.
        this.updateRunnerNextActionButton?.();
    }
};
