import { API } from '../config.js';

export const stats = {
    /**
     * Stats laden
     */
    async loadStats() {
        try {
            const stats = await API.getStats();

            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-passed').textContent = stats.passed;
            document.getElementById('stat-failed').textContent = stats.failed;

            const rate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
            document.getElementById('stat-success-rate').textContent = `${rate}%`;

            // By Provider
            this.renderStatsTable('stats-by-provider', stats.byProvider, true);

            // By Model
            this.renderStatsTable('stats-by-model', stats.byModel, true);

            // By Test
            this.renderStatsTable('stats-by-test', stats.byTest, false);

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },

    renderStatsTable(tableId, data, showLatency) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        if (!data || Object.keys(data).length === 0) {
            tbody.innerHTML = `<tr><td colspan="${showLatency ? 8 : 5}">Keine Daten</td></tr>`;
            return;
        }

        tbody.innerHTML = Object.entries(data).map(([key, val]) => {
            const latency = val.latency || {};
            const median = latency.median || val.medianLatency || '-';
            const stdDev = latency.stdDev || val.stdDevLatency || '-';
            const avg = latency.mean || val.avgLatency || '-';

            return `
                <tr>
                    <td>${this.escapeHtml(val.name || key)}</td>
                    <td>${val.total}</td>
                    <td>${val.passed}</td>
                    <td>${val.failed}</td>
                    <td>${val.successRate}%</td>
                    ${showLatency ? `
                        <td>${avg !== '-' ? Math.round(avg) + 'ms' : '-'}</td>
                        <td>${median !== '-' ? Math.round(median) + 'ms' : '-'}</td>
                        <td>${stdDev !== '-' ? Math.round(stdDev) + 'ms' : '-'}</td>
                    ` : ''}
                </tr>
            `;
        }).join('');
    }
};

