/**
 * fsca cluster history --id <contractId>
 *
 * Prints the full version chain for a contractId, sorted by generation.
 */

const fs = require('fs');
const path = require('path');
const { normalizeRecord } = require('../version');

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) throw new Error('project.json not found. Run "fsca init" first.');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

module.exports = async function history({ rootDir, args = {} }) {
    try {
        const { id } = args;
        if (!id) throw new Error('--id required: contract ID');

        const contractId = Number(id);
        const config = loadProjectConfig(rootDir);
        const allDeployed = config.fsca.alldeployedcontracts || [];

        const records = allDeployed
            .filter(r => r.contractId != null && Number(r.contractId) === contractId)
            .map(r => normalizeRecord(r, 'alldeployedcontracts'))
            .sort((a, b) => {
                // Sort by generation (nulls first), then by deploySeq, then by timeStamp
                if (a.generation == null && b.generation == null) return (a.deploySeq || 0) - (b.deploySeq || 0);
                if (a.generation == null) return -1;
                if (b.generation == null) return 1;
                return a.generation - b.generation;
            });

        if (records.length === 0) {
            console.log(`No history found for contractId=${contractId}.`);
            return;
        }

        const name = records[records.length - 1].name || `contractId=${contractId}`;
        console.log(`\nHistory for contractId=${contractId} (${name})`);
        console.log('─'.repeat(72));

        for (const r of records) {
            const gen = r.generation != null ? `gen ${String(r.generation).padStart(3)}` : 'gen  - ';
            const status = r.status.padEnd(12);
            const date = r.timeStamp ? new Date(r.timeStamp * 1000).toISOString().slice(0, 10) : '          ';
            const current = r.status === 'mounted' ? ' ← current' : '';
            console.log(`  ${gen}  ${r.address}  ${status}  ${date}${current}`);
        }
        console.log('');

    } catch (error) {
        console.error('History failed:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
};
