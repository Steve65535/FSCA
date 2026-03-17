/**
 * Generate a visual graph of the cluster topology
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { exec } = require('child_process');
const credentials = require('../../../wallet/credentials');

// Load chain helpers
const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer'); // Not strictly needed for read-only but consistent

const getProvider = chainProvider.getProvider;

/**
 * Helper: Sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load project.json
 */
function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Please run "fsca init" first.');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const rpcUrl = credentials.resolveRpcUrl(config, rootDir);

    if (!rpcUrl) {
        throw new Error('Network RPC URL not configured (set FSCA_RPC_URL or network.rpc in project.json)');
    }

    if (!config.fsca || !config.fsca.clusterAddress) {
        throw new Error('ClusterManager address not found in project.json. Please run "fsca cluster init" first.');
    }

    config.network = config.network || {};
    config.network.rpc = rpcUrl;
    return config;
}

/**
 * Load ABI helpers
 */
function loadABI(rootDir, artifactPath) {
    const fullPath = path.join(rootDir, artifactPath);
    if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf-8')).abi;
    }
    return null;
}

function loadClusterManagerABI(rootDir) {
    const p1 = 'artifacts/contracts/structure/clustermanager.sol/ClusterManager.json';
    const p2 = 'artifacts/contracts/undeployed/structure/clustermanager.sol/ClusterManager.json';
    const abi = loadABI(rootDir, p1) || loadABI(rootDir, p2);
    if (!abi) throw new Error("ClusterManager ABI not found. Please compile.");
    return abi;
}

function loadNormalTemplateABI(rootDir) {
    // NormalTemplate usually in fsca-core/lib/normaltemplate.sol
    // Artifact path depends on where it was compiled.
    // Try a few common paths
    const paths = [
        'artifacts/contracts/lib/normaltemplate.sol/normalTemplate.json',
        'artifacts/contracts/undeployed/lib/normaltemplate.sol/normalTemplate.json',
        'artifacts/@fsca-core/lib/normaltemplate.sol/normalTemplate.json' // if using package
    ];

    for (const p of paths) {
        const abi = loadABI(rootDir, p);
        if (abi) return abi;
    }

    // fallback: if user compiled their own contracts which inherit NormalTemplate, we can use that ABI too
    // But better to use the base one if possible.
    // If not found, throw error
    throw new Error("NormalTemplate ABI not found. Please compile.");
}

/**
 * Get all mounted contracts from ClusterManager
 */
async function getMountedContracts(clusterContract) {
    const length = await getArrayLength(clusterContract, 'contractRegistrations');
    const contracts = [];
    console.log(`Found ${length} mounted contract(s). Retrieving details...`);

    for (let i = 0; i < length; i++) {
        try {
            const reg = await clusterContract.contractRegistrations(i);
            // reg is [id, name, addr]
            contracts.push({
                id: Number(reg[0]),
                name: reg[1],
                address: reg[2]
            });
            if (i < length - 1) await sleep(20); // Throttle
        } catch (e) {
            console.warn(`Failed to fetch reg ${i}: ${e.message}`);
        }
    }
    return contracts;
}

// Bisection for array length (reused from list.js logic)
async function getArrayLength(contract, arrayName) {
    let low = 0;
    let high = 10000;
    let length = 0;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        try {
            await contract[arrayName](mid);
            length = mid + 1;
            low = mid + 1;
        } catch (e) {
            high = mid - 1;
        }
    }
    return length;
}

/**
 * Generate HTML with Mermaid
 */
function generateHtml(mermaidContent, nodes) {
    // Build address table
    let addressTable = '<table><thead><tr><th>ID</th><th>Name</th><th>Address</th></tr></thead><tbody>';
    nodes.forEach(n => {
        addressTable += `<tr><td>${n.id}</td><td>${n.name}</td><td><code>${n.address}</code></td></tr>`;
    });
    addressTable += '</tbody></table>';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FSCA Cluster Topology</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
        h1 { color: #333; }
        h2 { color: #555; margin-top: 30px; font-size: 1.2em; }
        .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
        #explanation { margin-top: 20px; font-size: 0.9em; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; font-weight: 600; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        .note { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin-top: 15px; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>FSCA Cluster Topology</h1>

    <div class="container">
        <h2>Dependency Graph</h2>
        <pre class="mermaid">
${mermaidContent}
        </pre>
        <div id="explanation">
            <p><strong>Node:</strong> A Smart Contract Pod (Service).</p>
            <p><strong>Solid Line (-->):</strong> Active Link (Source calls Target to modify state).</p>
            <p><strong>Dotted Line (-.->):</strong> Passive Link (Source reads/verifies Target).</p>
        </div>
    </div>

    <div class="container">
        <h2>Contract Registry</h2>
        ${addressTable}
        <div class="note">
            <strong>Hot Upgrade Verification:</strong> When comparing graphs before/after upgrade, check that the same ID points to a different address while maintaining the same topology.
        </div>
    </div>

    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: true, theme: 'default' });
    </script>
</body>
</html>
`;
}

/**
 * Main
 */
module.exports = async function graph({ rootDir, args = {} }) {
    try {
        const config = loadProjectConfig(rootDir);
        const provider = getProvider(config.network.rpc);
        const clusterAbi = loadClusterManagerABI(rootDir);
        const templateAbi = loadNormalTemplateABI(rootDir);

        const clusterAddress = config.fsca.clusterAddress;
        const clusterContract = new ethers.Contract(clusterAddress, clusterAbi, provider);

        console.log("Analyzing Cluster Topology...");
        console.log(`Cluster Manager: ${clusterAddress}`);

        // 1. Get Nodes
        const nodes = await getMountedContracts(clusterContract);
        if (nodes.length === 0) {
            console.log("No mounted contracts found. Cannot generate graph.");
            return;
        }

        // Map for quick lookup
        const nodeMap = new Map(); // id -> {name, address}
        const addrToId = new Map();
        nodes.forEach(n => {
            nodeMap.set(n.id, n);
            addrToId.set(n.address.toLowerCase(), n.id);
        });

        // 2. Get Edges (Scan each node)
        console.log(`Scanning ${nodes.length} nodes for connections...`);
        const edges = []; // {from: id, to: id, type: 'active'|'passive'}

        for (const node of nodes) {
            console.log(`  Scanning Node ${node.id} (${node.name})...`);
            const contract = new ethers.Contract(node.address, templateAbi, provider);

            try {
                // Get Active Modules
                const activeModules = await contract.getAllActiveModules();
                // activeModules is array of structs or array of arrays depending on ethers version/parsing
                // solidity: struct Module { uint32 contractId; address moduleAddress; }

                for (const m of activeModules) {
                    // m might be array [id, addr] or object
                    const targetId = Number(m.contractId || m[0]);
                    const targetAddr = (m.moduleAddress || m[1]).toLowerCase();

                    // Check if target is in our cluster (it should be)
                    // If targetId is in nodeMap, we use that. 
                    if (nodeMap.has(targetId)) {
                        edges.push({ from: node.id, to: targetId, type: 'active' });
                    } else {
                        // External or unknown link
                        console.warn(`    Found link to unknown ID ${targetId} at ${targetAddr}`);
                    }
                }

                // Get Passive Modules
                const passiveModules = await contract.getAllPassiveModules();
                for (const m of passiveModules) {
                    const targetId = Number(m.contractId || m[0]);
                    if (nodeMap.has(targetId)) {
                        edges.push({ from: node.id, to: targetId, type: 'passive' });
                    }
                }

            } catch (e) {
                console.warn(`    Error scanning node ${node.id}: ${e.message}`);
                // Continue to next node
            }
        }

        // 3. Generate Mermaid
        console.log("Generating visualization...");
        let mermaidCode = "graph TD\n";

        // Add Nodes
        // Format: ID[Name<br/>(ContractId)<br/>Address]
        nodes.forEach(n => {
            const shortAddr = `${n.address.substring(0, 6)}...${n.address.substring(38)}`;
            mermaidCode += `    N${n.id}["${n.name}<br/>(ID: ${n.id})<br/>${shortAddr}"]\n`;
        });

        // Add Edges
        edges.forEach(e => {
            if (e.type === 'active') {
                mermaidCode += `    N${e.from} --> N${e.to}\n`;
            } else {
                mermaidCode += `    N${e.from} -.-> N${e.to}\n`;
            }
        });

        // Add ClusterManager
        mermaidCode += `    Manager[("ClusterManager<br/>${clusterAddress.substring(0, 6)}...")]\n`;
        mermaidCode += `    style Manager fill:#f9f,stroke:#333,stroke-width:2px\n`;

        // Link all nodes to manager (optional, might clutter graph)
        // Let's not link all to manager visually to keep it clean, but acknowledge existence.

        // 4. Output
        const outputPath = path.join(rootDir, 'cluster-topology.html');
        fs.writeFileSync(outputPath, generateHtml(mermaidCode, nodes));

        console.log("");
        console.log("✓ Topology graph generated successfully!");
        console.log(`  File: ${outputPath}`);
        console.log("");

        // Open file automatically only if user is on desktop (implied by "Desktop" in paths)
        try {
            // Use 'open' command based on platform if 'open' pkg not avail (we didn't install it)
            // Just suggest user to open it.
            // On mac 'open' is native command
            if (process.platform === 'darwin') {
                exec(`open "${outputPath}"`);
            }
        } catch (e) { }

    } catch (error) {
        console.error("Failed to generate graph:", error.message);
        if (process.env.DEBUG) console.error(error);
    }
};
