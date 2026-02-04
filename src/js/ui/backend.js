import { CONFIG, API } from '../config.js';

export const backend = {
    startBackendMonitor() {
        // Keep it snappy: users start/stop the local server while the UI is open.
        const intervalMs = CONFIG.backendPollIntervalMs || 1000;

        if (this._backendMonitorTimer) return;

        const tick = async () => {
            if (this._backendPingInFlight) return;
            if (document?.visibilityState && document.visibilityState !== 'visible') return;
            this._backendPingInFlight = true;
            try {
                const ok = await this.checkBackendConnection({ timeoutMs: 1500 });
                if (ok) {
                    await this.refreshRunnerJobs();
                }
            } finally {
                this._backendPingInFlight = false;
            }
        };

        // Fire immediately, then keep polling.
        tick();
        this._backendMonitorTimer = setInterval(tick, intervalMs);

        // Refresh quickly when the user comes back to the tab / regains connectivity.
        this._backendMonitorOnFocus = () => tick();
        window.addEventListener('focus', this._backendMonitorOnFocus);
        document.addEventListener('visibilitychange', this._backendMonitorOnFocus);
        window.addEventListener('online', this._backendMonitorOnFocus);
        window.addEventListener('offline', this._backendMonitorOnFocus);
        window.addEventListener('beforeunload', () => this.stopBackendMonitor());
    },

    stopBackendMonitor() {
        if (this._backendMonitorTimer) {
            clearInterval(this._backendMonitorTimer);
            this._backendMonitorTimer = null;
        }
        if (this._backendMonitorOnFocus) {
            window.removeEventListener('focus', this._backendMonitorOnFocus);
            document.removeEventListener('visibilitychange', this._backendMonitorOnFocus);
            window.removeEventListener('online', this._backendMonitorOnFocus);
            window.removeEventListener('offline', this._backendMonitorOnFocus);
            this._backendMonitorOnFocus = null;
        }
    },

    setBackendConnected(connected) {
        const prev = !!this.state.backendConnected;
        this.state.backendConnected = !!connected;

        const dot = document.querySelector('.status-dot');
        const text = document.querySelector('.status-text');
        if (dot) dot.classList.toggle('connected', this.state.backendConnected);
        if (text) text.textContent = this.state.backendConnected ? 'Backend verbunden' : 'Backend nicht erreichbar';
        this.updateActionButtons?.();

        // If the backend comes back while the page is open, reload core data once.
        if (!prev && this.state.backendConnected && !this.state.benchmarkRunning) {
            // Fire-and-forget; load methods already handle their own errors.
            Promise.resolve().then(async () => {
                try { await this.loadProviders(); } catch { /* noop */ }
                try { await this.loadTests(); } catch { /* noop */ }

                const activeView = document.querySelector('.view.active')?.id;
                try {
                    if (activeView === 'runs-view') await this.loadRuns();
                    if (activeView === 'metrics-view') await this.loadStats();
                } catch {
                    // noop
                }
            });
        }
    },

    /**
     * Backend Connection Check
     */
    async checkBackendConnection({ timeoutMs = 1500 } = {}) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.setBackendConnected(false);
            return false;
        }

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(`${CONFIG.apiUrl}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            if (!res.ok) throw new Error('health_failed');
            this.setBackendConnected(true);
            return true;
        } catch {
            this.setBackendConnected(false);
            return false;
        } finally {
            clearTimeout(t);
        }
    },

    async refreshRunnerJobs() {
        try {
            const data = await API.getActiveRunnerJobs();
            const jobs = data?.jobs || [];
            this.state.activeRunnerJobs = jobs;

            // After refresh: if backend is busy, keep user on Runner and show a hint.
            if (jobs.length > 0 && !this.state.benchmarkRunning && !this.state.runnerInFlight) {
                this.switchView?.('runner');
                this.setRunnerStatus?.('running', 'Backend Run aktiv');
                const out = document.getElementById('runner-output');
                if (out) {
                    out.textContent =
                        'Ein Run laeuft noch im Backend (z.B. Batch-All).\\n' +
                        'Nach einem Refresh kann der Live-Output nicht weiter angezeigt werden.\\n' +
                        'Du kannst ihn mit \"Notaus (Kill)\" abbrechen.';
                }
            }
        } catch {
            // ignore
        }
    }
};
