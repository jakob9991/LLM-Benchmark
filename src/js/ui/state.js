export function createInitialState() {
    return {
        backendConnected: false,
        activeRunnerJobs: [],
        postWarmupAction: null,
        selectedTest: null,
        selectedModel: null, // {provider, model}
        tests: [],
        models: {},
        currentRun: null,
        benchmarkRunning: false,
        openrouterDefaultLocked: true,
        manualRetry: null,
        manualRetryHistory: null,
        runnerAbortController: null,
        runnerCancelRequested: false,
        runnerInFlight: false,
        isLimitTestMode: false,
        warmupModelId: null
    };
}
