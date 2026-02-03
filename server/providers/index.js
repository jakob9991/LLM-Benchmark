/**
 * Provider Registry - Einheitliche Provider-Schnittstelle
 */

const OllamaProvider = require('./ollama');
const OpenRouterProvider = require('./openrouter');

// Provider Instanzen
const providers = {
    ollama: new OllamaProvider(),
    openrouter: new OpenRouterProvider()
};

/**
 * Führt ein Modell aus - Einheitliche Schnittstelle
 * @param {Object} params
 * @param {string} params.provider - Provider Name (ollama, openai)
 * @param {string} params.model - Modell ID
 * @param {string} params.prompt - Der Prompt
 * @param {Object} params.options - Zusätzliche Optionen
 * @param {Function} params.onStream - Streaming Callback (optional)
 * @returns {Promise<{text: string, meta: Object}>}
 */
async function runModel({ provider, model, prompt, options = {}, onStream = null }) {
    const providerInstance = providers[provider];

    if (!providerInstance) {
        throw new Error(`Unbekannter Provider: ${provider}. Verfügbar: ${Object.keys(providers).join(', ')}`);
    }

    // Logge den finalen Prompt für Nachvollziehbarkeit
    console.log(`\n[${new Date().toISOString()}] Running model:`);
    console.log(`  Provider: ${provider}`);
    console.log(`  Model: ${model}`);
    console.log(`  Options: ${JSON.stringify(options)}`);
    console.log(`  Prompt length: ${prompt.length} chars`);

    const result = await providerInstance.run({
        model,
        prompt,
        options,
        onStream
    });

    console.log(`  Result: ${result.text.length} chars, ${result.meta.latency_ms}ms`);

    return result;
}

/**
 * Holt alle verfügbaren Provider und deren Modelle
 * @returns {Promise<Object>}
 */
async function getAvailableProviders() {
    const result = {};

    for (const [name, provider] of Object.entries(providers)) {
        const available = await provider.isAvailable();
        const models = available ? await provider.getModels() : [];

        result[name] = {
            name,
            type: provider.type,
            available,
            models
        };
    }

    return result;
}

/**
 * Prüft ob ein Provider verfügbar ist
 * @param {string} providerName
 * @returns {Promise<boolean>}
 */
async function isProviderAvailable(providerName) {
    const provider = providers[providerName];
    if (!provider) return false;
    return provider.isAvailable();
}

/**
 * Holt Modelle eines Providers
 * @param {string} providerName
 * @returns {Promise<Array>}
 */
async function getProviderModels(providerName) {
    const provider = providers[providerName];
    if (!provider) return [];
    return provider.getModels();
}

module.exports = {
    runModel,
    getAvailableProviders,
    isProviderAvailable,
    getProviderModels,
    providers
};
