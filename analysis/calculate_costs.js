/**
 * Kostenberechnung für Cloud-Modelle
 *
 * Preise (Stand Januar 2025):
 * - GPT-4o Mini: $0.15/1M input, $0.60/1M output
 * - Claude 3.5 Haiku: $0.80/1M input, $4.00/1M output
 * - Mistral 7B Instruct: $0.06/1M input, $0.06/1M output (OpenRouter)
 * - Qwen 2.5 Coder 7B: ~$0.05/1M (OpenRouter estimate)
 */

const fs = require('fs');
const path = require('path');

// Preise pro 1M Tokens
const PRICING = {
    'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
    'anthropic/claude-3.5-haiku': { input: 0.80, output: 4.00 },
    'mistralai/mistral-7b-instruct': { input: 0.06, output: 0.06 },
    'qwen/qwen2.5-coder-7b-instruct': { input: 0.05, output: 0.05 }
};

function calculateCosts(runs) {
    const byModel = {};

    runs.forEach(run => {
        if (run.isWarmup) return;
        if (run.provider !== 'openrouter') return; // Nur Cloud-Modelle

        const model = run.model;
        const tokensIn = run.metrics?.tokens_in || run.meta?.tokens_in || 0;
        const tokensOut = run.metrics?.tokens_out || run.meta?.tokens_out || 0;

        if (!byModel[model]) {
            byModel[model] = {
                model,
                totalTokensIn: 0,
                totalTokensOut: 0,
                runs: 0
            };
        }

        byModel[model].totalTokensIn += tokensIn;
        byModel[model].totalTokensOut += tokensOut;
        byModel[model].runs++;
    });

    // Kosten berechnen
    Object.values(byModel).forEach(m => {
        const pricing = PRICING[m.model] || { input: 0.10, output: 0.10 };
        m.costInput = (m.totalTokensIn / 1000000) * pricing.input;
        m.costOutput = (m.totalTokensOut / 1000000) * pricing.output;
        m.totalCost = m.costInput + m.costOutput;
        m.avgTokensPerRun = Math.round((m.totalTokensIn + m.totalTokensOut) / m.runs);
    });

    return byModel;
}

function main() {
    const files = ['STANDARD.json', 'LONG_INPUT.json'];
    let allRuns = [];

    files.forEach(file => {
        const filepath = path.join(__dirname, file);
        try {
            const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            allRuns = allRuns.concat(data);
            console.log(`Geladen: ${file} (${data.length} Runs)`);
        } catch (e) {
            console.log(`Nicht gefunden: ${file}`);
        }
    });

    const costs = calculateCosts(allRuns);

    console.log('\n' + '='.repeat(80));
    console.log('KOSTENBERECHNUNG CLOUD-MODELLE');
    console.log('='.repeat(80));

    console.log('\n| Modell | Runs | Input Tokens | Output Tokens | Kosten Input | Kosten Output | GESAMT |');
    console.log('|--------|------|--------------|---------------|--------------|---------------|--------|');

    let totalCost = 0;
    Object.values(costs).sort((a, b) => b.totalCost - a.totalCost).forEach(m => {
        const name = m.model.split('/').pop();
        console.log(
            `| ${name.padEnd(25)} | ${String(m.runs).padStart(4)} | ` +
            `${m.totalTokensIn.toLocaleString().padStart(12)} | ${m.totalTokensOut.toLocaleString().padStart(13)} | ` +
            `$${m.costInput.toFixed(4).padStart(10)} | $${m.costOutput.toFixed(4).padStart(12)} | $${m.totalCost.toFixed(4).padStart(6)} |`
        );
        totalCost += m.totalCost;
    });

    console.log('-'.repeat(80));
    console.log(`GESAMTKOSTEN ALLER CLOUD-TESTS: $${totalCost.toFixed(4)}`);

    // Hochrechnung für Lokal
    console.log('\n' + '='.repeat(80));
    console.log('LOKALE KOSTEN (Strom + Hardware)');
    console.log('='.repeat(80));

    // Annahmen für lokale Kosten
    const localRuns = allRuns.filter(r => r.provider === 'ollama' && !r.isWarmup);
    const totalLocalLatencyMs = localRuns.reduce((sum, r) => sum + (r.metrics?.t_model_ms || 0), 0);
    const totalLocalHours = totalLocalLatencyMs / 1000 / 60 / 60;

    // GTX 1660 Ti verbraucht ca. 120W unter Last
    const gpuWatts = 120;
    const cpuWatts = 65; // i7-14700K idle/moderate
    const totalWatts = gpuWatts + cpuWatts;
    const kWh = (totalWatts * totalLocalHours) / 1000;
    const strompreisPerKwh = 0.35; // €/kWh in DE
    const localCost = kWh * strompreisPerKwh;

    console.log(`\nLokale Tests: ${localRuns.length} Runs`);
    console.log(`Gesamte GPU-Zeit: ${(totalLocalHours * 60).toFixed(2)} Minuten`);
    console.log(`Geschätzter Stromverbrauch: ${kWh.toFixed(4)} kWh`);
    console.log(`Geschätzte Stromkosten: €${localCost.toFixed(4)} (bei €0.35/kWh)`);

    console.log('\n' + '='.repeat(80));
    console.log('VERGLEICH FÜR POWERPOINT');
    console.log('='.repeat(80));
    console.log(`\nCloud-Kosten gesamt:  $${totalCost.toFixed(4)} (~€${(totalCost * 0.92).toFixed(4)})`);
    console.log(`Lokal-Kosten gesamt:  €${localCost.toFixed(4)}`);
    console.log(`\nFazit: ${totalCost > localCost ? 'Cloud ist teurer' : 'Lokal ist teurer'} für diese Testmenge`);
    console.log(`\nHINWEIS: Hardware-Abschreibung nicht berücksichtigt!`);
}

main();
