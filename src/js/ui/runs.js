import { API } from '../config.js';

export const runs = {
    /**
     * Runs laden
     */
    async loadRuns() {
        try {
            const filters = {
                provider: document.getElementById('filter-run-provider')?.value,
                status: document.getElementById('filter-run-status')?.value,
                passed: document.getElementById('filter-run-passed')?.value,
                includeDebug: document.getElementById('filter-run-debug')?.checked ? true : undefined
            };

            // Entferne leere Filter
            Object.keys(filters).forEach(k => !filters[k] && delete filters[k]);

            const data = await API.getRuns(filters);
            this.renderRuns(data.runs);
        } catch (error) {
            console.error('Error loading runs:', error);
        }
    },

    renderRuns(runs) {
        const container = document.getElementById('runs-container');

        if (!runs || runs.length === 0) {
            container.innerHTML = '<p class="no-runs">Keine Runs vorhanden.</p>';
            return;
        }

        container.innerHTML = runs.map(run => {
            const statusClass = run.passed === true ? 'success' : run.passed === false ? 'failed' : 'pending';
            const statusIcon = run.passed === true ? '&#x2705;' : run.passed === false ? '&#x274C;' : '&#x23F3;';
            const latency = run.metrics?.t_model_ms || run.metrics?.latency_ms;
            return `
                <div class="log-entry" data-run-id="${run.id}">
                    <span class="log-status ${statusClass}">${statusIcon}</span>
                    <div class="log-info">
                        <div class="log-test-name">${this.escapeHtml(run.testName || '-')}</div>
                        <div class="log-details">
                            ${run.provider}/${run.model}
                            ${latency ? `&bull; ${latency}ms` : ''}
                            ${run.attempt > 1 ? `&bull; Versuch ${run.attempt}` : ''}
                        </div>
                    </div>
                    <span class="log-timestamp">${this.formatDate(run.startedAt)}</span>
                </div>
            `;
        }).join('');

        // Bind click für Details
        container.querySelectorAll('.log-entry').forEach(entry => {
            entry.addEventListener('click', () => this.showRunDetail(entry.dataset.runId));
        });
    },

    async showRunDetail(runId) {
        try {
            const run = await API.getRun(runId);
            const showPreview = this.isHtmlDocument(run.output || '');
            this.state.modalPreviewOutput = showPreview ? run.output : null;
            this.showModal('Run Details', `
                <div class="run-detail">
                    <h4>${this.escapeHtml(run.testName || '-')}</h4>
                    <p><strong>ID:</strong> ${run.id}</p>
                    <p><strong>Provider/Model:</strong> ${run.provider}/${run.model}</p>
                    <p><strong>Status:</strong> ${run.status}</p>
                    <p><strong>Passed:</strong> ${run.passed === null ? 'Ausstehend' : run.passed ? 'Ja' : 'Nein'}</p>
                    <p><strong>Zeitstempel:</strong> ${run.startedAt}</p>
                    ${run.error ? `<p class="error"><strong>Error:</strong> ${this.escapeHtml(run.error)}</p>` : ''}
                    ${run.metrics ? `
                        <h4>Metriken</h4>
                        <pre>${JSON.stringify(run.metrics, null, 2)}</pre>
                    ` : ''}
                    <h4>Output</h4>
                    <pre class="output-preview">${this.escapeHtml(run.output || '')}</pre>
                </div>
            `);

            const previewBtn = document.getElementById('modal-preview-btn');
            if (previewBtn) {
                previewBtn.style.display = showPreview ? 'inline-flex' : 'none';
            }
            this.bindModalPreview();
        } catch (error) {
            this.showError('Run konnte nicht geladen werden: ' + error.message);
        }
    },

    async confirmClearRuns() {
        const ok = confirm('Alle Runs löschen?');
        if (!ok) return;
        try {
            await API.clearRuns();
            this.showSuccess('Runs gelöscht.');
            await this.loadRuns();
        } catch (error) {
            this.showError('Runs konnten nicht gelöscht werden: ' + error.message);
        }
    }
};
