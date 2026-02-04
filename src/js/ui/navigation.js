export const navigation = {
    /**
     * Navigation zwischen Views
     */
    bindNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchView(view);
            });
        });
    },

    switchView(viewName) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });

        // View-spezifische Aktionen
        if (viewName === 'runs') this.loadRuns();
        if (viewName === 'metrics') this.loadStats();
    }
};

