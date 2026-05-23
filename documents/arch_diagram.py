import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(figsize=(26, 26))
ax.set_xlim(0, 26)
ax.set_ylim(0, 26)
ax.axis('off')
fig.patch.set_facecolor('white')

C_CLI      = '#2C3E50'
C_HANDLER  = '#1A5276'
C_CONTRACT = '#154360'
C_WALLET   = '#6C3483'
C_STORAGE  = '#1B4F72'
C_CHAIN    = '#1A252F'
C_GREEN    = '#1E8449'
C_ACCENT   = '#C0392B'
C_TITLE    = '#1C2833'
C_GRAY     = '#7F8C8D'

def layer(x, y, w, h, title, ec, bg='#F4F6F7'):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0.2", lw=2.5,
        edgecolor=ec, facecolor=bg, zorder=1))
    ax.text(x + 0.45, y + h - 0.42, title,
        fontsize=21, color=ec, fontweight='bold',
        style='italic', va='top', ha='left', zorder=5)

def box(x, y, w, h, title, sub=None, fc='white', ec='#5D6D7E', lw=2.0, fs=15):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0.2", lw=lw,
        edgecolor=ec, facecolor=fc, zorder=4))
    ty = y + h/2 + (0.28 if sub else 0)
    ax.text(x + w/2, ty, title,
        fontsize=fs, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=5)
    if sub:
        ax.text(x + w/2, y + h/2 - 0.32, sub,
            fontsize=14.5, color='#7F8C8D',
            va='center', ha='center', zorder=5)

def arr(x1, y1, x2, y2, color='#2C3E50', lw=2.0, label=''):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                        connectionstyle='arc3,rad=0.0'), zorder=3)
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ax.text(mx+0.15, my, label, fontsize=14, color=color, va='center')

def dash(x1, y1, x2, y2, color='#AAB7B8', lw=1.3):
    ax.plot([x1,x2],[y1,y2], '--', color=color, lw=lw, zorder=2)

# ── Title ──────────────────────────────────────────────────────
ax.text(13, 25.55, 'Arkheion CLI — System Architecture',
    fontsize=30, fontweight='bold', color=C_TITLE, va='center', ha='center')
ax.text(13, 24.95, 'On-Chain Smart Contract Cluster Management with Multi-Signature Governance',
    fontsize=17, color=C_GRAY, va='center', ha='center')

# ══════════════════════════════════════════════════════════════
# L1 — CLI   y: 22.5 – 24.5
# ══════════════════════════════════════════════════════════════
layer(0.5, 22.5, 25.0, 2.1, 'Layer 1  ·  CLI Interface', C_CLI)

box(0.9,  22.75, 7.8, 1.55,
    'Entry Point  +  Logger',
    'index.js  ·  arkheion-logger.js  ·  confirm.js',
    fc='#EBF5FB', ec=C_CLI)
box(9.1,  22.75, 7.8, 1.55,
    'Command Parser  +  Tree',
    'parser.js  ·  commands.json',
    fc='#EBF5FB', ec=C_CLI)
box(17.3, 22.75, 7.8, 1.55,
    'Handler Dispatcher',
    'executor.js',
    fc='#EBF5FB', ec=C_CLI)

arr(8.7,  23.52, 9.1,  23.52, color=C_CLI)
arr(16.9, 23.52, 17.3, 23.52, color=C_CLI)

# ══════════════════════════════════════════════════════════════
# L2 — Handlers   y: 17.5 – 22.1
# ══════════════════════════════════════════════════════════════
layer(0.5, 17.5, 25.0, 4.6, 'Layer 2  ·  Command Handlers  (libs/commands/)', C_HANDLER)

box(0.9, 20.3, 11.8, 1.55,
    'init  ·  deploy  ·  mount  ·  link  ·  upgrade  ·  rollback',
    'Project init · Contract deploy · Register · Pod wiring · Hot-swap · Version rollback',
    fc='#EBF5FB', ec=C_HANDLER)
box(13.1, 20.3, 11.8, 1.55,
    'cluster auto  ·  check  ·  history',
    'Declarative assembly · Static pre-flight · Version history',
    fc='#D4EFDF', ec=C_GREEN, lw=2.2)

box(0.9, 17.85, 11.8, 2.1,
    'analyze  ·  scanner  ·  parser  ·  graph  ·  funcgraph',
    'Scan .sol  ·  Extract @Arkheion-* annotations\nPod dep graph  ·  DFS cycle detect  ·  Topo sort',
    fc='#EAFAF1', ec=C_GREEN, lw=1.8)
box(13.1, 17.85, 11.8, 2.1,
    'reconciler  ·  utils  ·  version',
    'State diff vs project.json  ·  Shared helpers\ngeneration  ·  deploySeq  ·  status machine',
    fc='#EAFAF1', ec=C_GREEN, lw=1.8)

dash(19.0, 21.85, 19.0, 19.95)
dash(19.0, 19.95, 6.8,  19.95)
dash(6.8,  19.95, 6.8,  19.97)
dash(19.0, 19.95, 19.0, 19.97)

arr(13.0, 22.5, 13.0, 22.12, color=C_CLI, lw=2.2)

# ══════════════════════════════════════════════════════════════
# L3 — Chain + Wallet   y: 12.5 – 17.1
# ══════════════════════════════════════════════════════════════
layer(0.5, 12.5, 12.3, 4.6, 'Layer 3a  ·  Chain Interaction', C_HANDLER, bg='#EBF5FB')

box(0.9, 15.3, 11.5, 1.55,
    'provider  ·  signer  ·  deploy  ·  tx  ·  abi',
    'JsonRpcProvider  ·  NonceManager Wallet  ·  ContractFactory  ·  ABI Codec',
    fc='white', ec=C_HANDLER)
box(0.9, 12.85, 11.5, 2.1,
    'ethers.js  v6',
    'Provider  ·  Signer  ·  Contract  ·  ABI',
    fc='#D6EAF8', ec=C_HANDLER, lw=2.5, fs=17)

arr(6.5, 15.3, 6.5, 14.95, color=C_HANDLER, lw=1.3)

layer(13.2, 12.5, 12.3, 4.6, 'Layer 3b  ·  Wallet & Governance', C_WALLET, bg='#F5EEF8')

box(13.6, 15.3, 11.5, 1.55,
    'wallet/signer  ·  MultiSigWallet  ·  ProxyWallet',
    'getSigner() → NonceManager  ·  submit / confirm / execute',
    fc='white', ec=C_WALLET)
box(13.6, 12.85, 11.5, 2.1,
    'Multi-Sig Governance Flow',
    'submitTx  →  confirmTx  →  executeTx',
    fc='#E8DAEF', ec=C_WALLET, lw=2.5, fs=17)

arr(19.3, 15.3, 19.3, 14.95, color=C_WALLET, lw=1.3)

arr(6.0,  17.5, 6.0,  17.12, color=C_HANDLER, lw=2.2)
arr(19.5, 17.5, 19.5, 17.12, color=C_WALLET,  lw=2.2)

# ══════════════════════════════════════════════════════════════
# L4 — Core Contracts   y: 6.8 – 12.1
# ══════════════════════════════════════════════════════════════
layer(0.5, 6.8, 25.0, 5.3, 'Layer 4  ·  Core Solidity Contracts  (libs/Arkheion-core/)', C_CONTRACT)

cw = 5.8
for i, (t, s, fc, methods) in enumerate([
    ('ClusterManager', 'clustermanager.sol', '#D6EAF8', [
        'registerContract(id, name, addr)',
        'deleteContract(id)',
        'addActivePod Before/AfterMount()',
        'operator permission management',
        'id → name → address registry',
    ]),
    ('EvokerManager', 'evokermanager.sol', '#D6EAF8', [
        'mount()  ·  unmount()',
        'mountSingle()  ·  unmountSingle()',
        'adjacency list dep graph',
        'bidirectional edge management',
        'neighbor unlock on unmount',
    ]),
    ('NormalTemplate', 'normaltemplate.sol', '#D4EFDF', [
        'activePod  ·  passivePod',
        'whetherMounted  (lock flag)',
        'getAllActiveModules()',
        'getAllPassiveModules()',
        'module verification modifiers',
    ]),
    ('AddressPod', 'addresspod.sol', '#FDFEFE', [
        'add / remove / update',
        'get / exists / verifyModule()',
        'O(1) lookup via mapping',
        'contractId → index+1',
        '',
    ]),
]):
    bx = 0.9 + i*(cw + 0.43)
    box(bx, 10.0, cw, 1.9, t, s, fc=fc, ec=C_CONTRACT, lw=2.5, fs=14)
    for j, m in enumerate(methods):
        ax.text(bx + 0.35, 9.6 - j*0.56, m,
            fontsize=14.5, color='#5D6D7E', va='top')

arr(6.7,  10.95, 7.13, 10.95, label='delegates', color=C_CONTRACT, lw=1.5)
arr(12.9, 10.95, 13.33, 10.95, label='base class', color=C_CONTRACT, lw=1.5)
arr(19.1, 10.95, 19.53, 10.95, label='library',   color=C_CONTRACT, lw=1.5)

arr(6.0,  12.5, 6.0,  12.12, color=C_CONTRACT, lw=2.2)
arr(19.5, 12.5, 19.5, 12.12, color=C_CONTRACT, lw=2.2)

# ══════════════════════════════════════════════════════════════
# L5 — Storage   y: 3.8 – 6.4
# ══════════════════════════════════════════════════════════════
layer(0.5, 3.8, 25.0, 2.6, 'Layer 5  ·  Local Storage & Configuration', C_STORAGE)

box(0.9,  4.1, 7.8, 1.95,
    'project.json',
    'network · account · cluster state\nalldeployedcontracts · generation · podSnapshot',
    fc='#EBF5FB', ec=C_STORAGE)
box(9.1,  4.1, 7.8, 1.95,
    'contracts/  ·  artifacts/',
    'undeployed/ · deployed/ · archived/\nHardhat ABI + bytecode',
    fc='#EBF5FB', ec=C_STORAGE)
box(17.3, 4.1, 7.8, 1.95,
    'logs  ·  reports',
    'logs/<date>.log · auto-report.json\nrollback-checkpoint.json',
    fc='#EBF5FB', ec=C_STORAGE)

arr(6.0, 6.8, 6.0, 6.42, color=C_STORAGE, lw=2.2)
arr(2.5, 17.5, 2.5, 6.42, color=C_STORAGE, lw=1.5)

# ══════════════════════════════════════════════════════════════
# L6 — Blockchain   y: 0.8 – 3.4
# ══════════════════════════════════════════════════════════════
layer(0.5, 0.8, 25.0, 3.0, 'Layer 6  ·  Blockchain  (EVM-Compatible)', C_CHAIN)

box(0.9,  2.3, 7.8, 1.25,
    'ClusterManager  +  EvokerManager',
    'on-chain registry  ·  dep graph',
    fc='#D6EAF8', ec=C_CHAIN, lw=2.0)
box(9.1,  2.3, 7.8, 1.25,
    'MultiSigWallet  +  ProxyWallet',
    'on-chain governance  ·  rights mgmt',
    fc='#E8DAEF', ec=C_CHAIN, lw=2.0)
box(17.3, 2.3, 7.8, 1.25,
    'Business Contracts',
    'NormalTemplate instances',
    fc='#D4EFDF', ec=C_CHAIN, lw=2.0)

box(0.9, 1.0, 24.2, 1.0,
    'EVM-Compatible Blockchain  ·  chainId  ·  blockConfirmations  ·  JsonRpc',
    fc=C_CHAIN, ec='#0E1B24', lw=2.0, fs=14)
ax.texts[-1].set_color('white')

arr(6.0, 3.8, 6.0, 3.57, color=C_CHAIN, lw=2.2)
arr(19.5, 6.8, 19.5, 3.57, color=C_CHAIN, lw=1.5)

# ── Hot-swap note ──────────────────────────────────────────────
ax.text(18.2, 22.25,
    'Hot-Swap Upgrade:\n'
    '① Read old pods\n'
    '② Deploy new contract\n'
    '③ Copy pods (BeforeMount)\n'
    '④ Unmount old  →  Mount new',
    fontsize=12, color=C_ACCENT, va='top', ha='left',
    bbox=dict(boxstyle='round,pad=0.55', fc='#FDEDEC', ec=C_ACCENT, lw=1.5))

plt.tight_layout(pad=0.2)
plt.savefig('/Users/steve/Desktop/fsca-cli-opensource/documents/architecture.png',
    dpi=150, bbox_inches='tight', facecolor='white')
print("saved")
