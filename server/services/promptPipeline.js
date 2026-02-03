/**
 * Prompt Pipeline - Einheitliche Prompt-Verarbeitung für faire Vergleiche
 */

/**
 * Standard Parameter für alle Provider
 */
const DEFAULT_PARAMS = {
    temperature: 0,
    max_tokens: 2048,
    // seed: 42  // Nicht alle Provider unterstützen das
};

/**
 * Output-Format Regeln
 */
const OUTPUT_FORMAT_RULES = {
    'code-only': '\n\nWICHTIG: Antworte NUR mit dem Code, ohne Erklärungen, Markdown-Codeblöcke oder zusätzlichen Text.',
    'text': '',
    'json': '\n\nWICHTIG: Antworte NUR mit validem JSON, ohne zusätzliche Erklärungen.'
};

/**
 * Erstellt den finalen Prompt aus Test-Definition
 * @param {Object} test - Test-Definition
 * @returns {Object} - {prompt, params, logInfo}
 */
function buildPrompt(test) {
    // Ersetze {{INPUT}} Placeholder im Template
    let prompt = test.promptTemplate.replace(/\{\{INPUT\}\}/g, test.input);

    // Füge Output-Format Regel hinzu wenn definiert
    if (test.outputFormat && OUTPUT_FORMAT_RULES[test.outputFormat]) {
        prompt += OUTPUT_FORMAT_RULES[test.outputFormat];
    }

    // Parameter zusammenstellen
    const params = {
        ...DEFAULT_PARAMS,
        ...(test.params || {})
    };

    // Increase token budget for limit-testing unless explicitly overridden
    if (test.category === 'limit-testing' && (test.params?.max_tokens === undefined)) {
        params.max_tokens = null;
    }

    // Log-Info für Nachvollziehbarkeit
    const logInfo = {
        testId: test.id,
        testName: test.name,
        promptTemplate: test.promptTemplate,
        input: test.input,
        outputFormat: test.outputFormat,
        appliedParams: params,
        finalPromptLength: prompt.length,
        timestamp: new Date().toISOString()
    };

    return {
        prompt,
        params,
        logInfo
    };
}

/**
 * Extrahiert Code aus einer Antwort (entfernt Markdown-Codeblöcke)
 * @param {string} text - Die Antwort
 * @returns {string} - Bereinigter Code
 */
function extractCode(text) {
    // Entferne Markdown-Codeblöcke
    let code = text;

    // Pattern: ```language\n...\n```
    const codeBlockMatch = text.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
        code = codeBlockMatch[1];
    }

    // Falls mehrere Codeblöcke, nimm den ersten
    const multipleBlocks = text.match(/```[\w]*\n([\s\S]*?)```/g);
    if (multipleBlocks && multipleBlocks.length > 1) {
        // Kombiniere alle Codeblöcke
        code = multipleBlocks
            .map(block => {
                const match = block.match(/```[\w]*\n([\s\S]*?)```/);
                return match ? match[1] : '';
            })
            .join('\n\n');
    }

    return code.trim();
}

/**
 * Normalisiert eine Antwort basierend auf dem erwarteten Format
 * @param {string} text - Die Antwort
 * @param {string} outputFormat - Das erwartete Format
 * @returns {string} - Normalisierte Antwort
 */
function normalizeOutput(text, outputFormat) {
    if (outputFormat === 'code-only') {
        return extractCode(text);
    }
    return text.trim();
}

/**
 * Vergleicht zwei Prompts auf Äquivalenz (für Fairness-Check)
 * @param {string} prompt1
 * @param {string} prompt2
 * @returns {boolean}
 */
function promptsAreEquivalent(prompt1, prompt2) {
    // Normalisiere Whitespace
    const normalize = (p) => p.replace(/\s+/g, ' ').trim();
    return normalize(prompt1) === normalize(prompt2);
}

/**
 * Generiert einen Hash für den Prompt (für Caching/Vergleich)
 * @param {string} prompt
 * @returns {string}
 */
function hashPrompt(prompt) {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
        const char = prompt.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

module.exports = {
    DEFAULT_PARAMS,
    OUTPUT_FORMAT_RULES,
    buildPrompt,
    extractCode,
    normalizeOutput,
    promptsAreEquivalent,
    hashPrompt
};
