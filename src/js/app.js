/**
 * Haupt-Applikation für den LLM Benchmark Tester
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('LLM Benchmark Tester wird gestartet...');

    // Initialisiere UI
    UI.init();

    console.log('LLM Benchmark Tester bereit.');
    console.log('Starte den Backend-Server mit: npm start');
});

// Globale Fehlerbehandlung
window.addEventListener('error', (event) => {
    console.error('Globaler Fehler:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unbehandelte Promise-Ablehnung:', event.reason);
});
