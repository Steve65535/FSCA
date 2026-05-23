import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

fig = plt.figure(figsize=(18, 14))
fig.patch.set_facecolor('white')

C_ARK  = '#1A5276'
C_HARD = '#922B21'
C_DIA  = '#1E8449'
C_GRAY = '#7F8C8D'
C_TITLE = '#1C2833'

fig.text(0.5, 0.97, 'Arkheion Gas Cost Analysis',
    fontsize=18, fontweight='bold', color=C_TITLE, ha='center', va='top')
fig.text(0.5, 0.945, 'Comparison with Hardcode Pattern and Diamond Proxy (EIP-2535)  ·  realtest-20 cluster (20 contracts)',
    fontsize=10, color=C_GRAY, ha='center', va='top')

# ══════════════════════════════════════════════════════════════
# Panel 1 (left): Deploy cost
# ══════════════════════════════════════════════════════════════
ax1 = fig.add_axes([0.06, 0.55, 0.40, 0.35])

contracts = ['PairStorage\n(0 out-edges)', 'SwapEngine\n(4 edges)', 'LendingEngine\n(8 edges)', 'Full Cluster\n(20 contracts)']
ark_d  = [0.5,  0.5,  2.2,  15.0]
hard_d = [0.35, 0.42, 1.6,  11.0]
dia_d  = [0.3,  0.35, 0.5,   2.0]

x = np.arange(len(contracts))
w = 0.26

b1 = ax1.bar(x - w, ark_d,  w, label='Arkheion', color=C_ARK,  alpha=0.88, zorder=3)
b2 = ax1.bar(x,     hard_d, w, label='Hardcode', color=C_HARD, alpha=0.88, zorder=3)
b3 = ax1.bar(x + w, dia_d,  w, label='Diamond',  color=C_DIA,  alpha=0.88, zorder=3)

for bars in [b1, b2, b3]:
    for bar in bars:
        h = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2, h + 0.2,
            f'{h:.1f}M', ha='center', va='bottom', fontsize=8, color='#2C3E50')

ax1.set_xticks(x)
ax1.set_xticklabels(contracts, fontsize=9)
ax1.set_ylabel('Gas Cost (M Gas)', fontsize=10)
ax1.set_title('(a)  Deployment Gas Cost', fontsize=12, fontweight='bold', color=C_TITLE, pad=8)
ax1.set_ylim(0, 21)
ax1.yaxis.grid(True, linestyle='--', alpha=0.4, zorder=0)
ax1.set_axisbelow(True)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.legend(fontsize=9)

ax1.text(0.98, 0.97, 'Arkheion +10–40% vs Hardcode\n(bidirectional pod storage)',
    transform=ax1.transAxes, fontsize=8, color=C_ARK,
    ha='right', va='top', style='italic',
    bbox=dict(boxstyle='round,pad=0.3', fc='#EBF5FB', ec=C_ARK, lw=0.8))

# ══════════════════════════════════════════════════════════════
# Panel 2 (right): Upgrade cost
# ══════════════════════════════════════════════════════════════
ax2 = fig.add_axes([0.56, 0.55, 0.40, 0.35])

scenarios = ['SwapEngine\n(4 edges)', 'LendingEngine\n(8 edges)']
ark_u  = [1.5,  2.2]
hard_u = [8.0, 18.0]   # 5–10× Arkheion per doc
dia_u  = [0.025, 0.025]

x2 = np.arange(len(scenarios))

b4 = ax2.bar(x2 - w, ark_u,  w, label='Arkheion', color=C_ARK,  alpha=0.88, zorder=3)
b5 = ax2.bar(x2,     hard_u, w, label='Hardcode', color=C_HARD, alpha=0.88, zorder=3)
b6 = ax2.bar(x2 + w, dia_u,  w, label='Diamond',  color=C_DIA,  alpha=0.88, zorder=3)

for bars, vals in [(b4, ark_u), (b5, hard_u), (b6, dia_u)]:
    for bar, v in zip(bars, vals):
        lbl = f'{v:.3f}M' if v < 0.1 else f'{v:.1f}M'
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
            lbl, ha='center', va='bottom', fontsize=8.5, color='#2C3E50')

ax2.set_xticks(x2)
ax2.set_xticklabels(scenarios, fontsize=10)
ax2.set_ylabel('Gas Cost (M Gas)', fontsize=10)
ax2.set_title('(b)  Upgrade Gas Cost', fontsize=12, fontweight='bold', color=C_TITLE, pad=8)
ax2.set_ylim(0, 24)
ax2.yaxis.grid(True, linestyle='--', alpha=0.4, zorder=0)
ax2.set_axisbelow(True)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)
ax2.legend(fontsize=9)

ax2.text(0.98, 0.97,
    'Hardcode: redeploy all dependents\n(5–10× Arkheion, per doc §7.4.3)\nDiamond: selector update ~25K Gas',
    transform=ax2.transAxes, fontsize=8, color=C_GRAY,
    ha='right', va='top', style='italic',
    bbox=dict(boxstyle='round,pad=0.3', fc='#F8F9FA', ec=C_GRAY, lw=0.8))

# ══════════════════════════════════════════════════════════════
# Panel 3 (bottom): Summary table
# ══════════════════════════════════════════════════════════════
ax3 = fig.add_axes([0.04, 0.04, 0.92, 0.44])
ax3.axis('off')
ax3.set_title('(c)  Comprehensive Comparison  (source: §7.4.1–7.4.5)',
    fontsize=12, fontweight='bold', color=C_TITLE, pad=6, loc='left', x=0.0)

col_labels = ['Dimension', 'Arkheion', 'Hardcode Pattern', 'Diamond (EIP-2535)']
rows = [
    ['Single pod write',
     '~80,000–100,000 Gas\n(2×SSTORE new + 2×SSTORE new\n+ call overhead)',
     'N/A\n(immutable at deploy)',
     'N/A\n(shared storage, no pod)'],
    ['Deploy: single contract',
     '400K – 2.2M Gas\n(scales with edge count)',
     '300K – 1.6M Gas\n(~1/3–1/2 less storage)',
     '300K – 500K Gas\n(selector mapping only)'],
    ['Deploy: full cluster (20)',
     '12 – 18M Gas',
     '8 – 13M Gas',
     '~2M Gas'],
    ['Deploy overhead',
     '+10 – 40% vs Hardcode\n(more edges → higher end)',
     'Baseline',
     'Lowest'],
    ['Runtime call',
     '~700 Gas (direct)\n+2,100 Gas if pod verify (cold SLOAD)',
     '~700 Gas\n(immutable: PUSH32 = 3 Gas)',
     '~700 Gas + delegatecall\n(same order as Arkheion, ±5%)'],
    ['Upgrade: hot-swap',
     '1.5 – 2.2M Gas\n(unmount + deploy + mount)',
     '5–10× Arkheion\n(redeploy all dependents)',
     '~25K Gas\n(selector update only)'],
    ['Storage isolation',
     'Full per-contract isolation',
     'Full per-contract isolation',
     'Shared storage across Facets\n(slot conflict risk)'],
    ['Dependency auditability',
     'On-chain pod graph\n+ podSnapshot history',
     'None after deploy',
     'Partial (selector → facet only)'],
    ['Rollback',
     'podSnapshot + generation chain\n(arkheion cluster rollback)',
     'Full redeploy required',
     'No native rollback'],
]

col_widths = [0.18, 0.26, 0.26, 0.26]
col_x = [0.01, 0.20, 0.47, 0.74]
row_h = 0.088
start_y = 0.93

header_colors = [C_TITLE, C_ARK, C_HARD, C_DIA]
for ci, (cx, cw, cl, hc) in enumerate(zip(col_x, col_widths, col_labels, header_colors)):
    ax3.add_patch(mpatches.FancyBboxPatch((cx, start_y), cw - 0.01, 0.065,
        boxstyle="round,pad=0.005", facecolor=hc, edgecolor='white', lw=1.5,
        transform=ax3.transAxes, clip_on=False))
    ax3.text(cx + (cw-0.01)/2, start_y + 0.032, cl,
        transform=ax3.transAxes, fontsize=10, fontweight='bold',
        color='white', ha='center', va='center')

row_bgs = ['#F8F9FA', '#FFFFFF']
for ri, row in enumerate(rows):
    ry = start_y - (ri + 1) * row_h
    for ci, (cx, cw, cell) in enumerate(zip(col_x, col_widths, row)):
        fc = '#EBF5FB' if (ci == 1 and ri % 2 == 0) else '#D6EAF8' if (ci == 1) else row_bgs[ri % 2]
        ax3.add_patch(mpatches.FancyBboxPatch((cx, ry), cw - 0.01, row_h - 0.006,
            boxstyle="round,pad=0.003", facecolor=fc, edgecolor='#D5D8DC', lw=0.8,
            transform=ax3.transAxes, clip_on=False))
        ax3.text(cx + (cw-0.01)/2, ry + (row_h - 0.006)/2, cell,
            transform=ax3.transAxes, fontsize=8, color='#1C2833',
            ha='center', va='center', linespacing=1.35)

fig.text(0.5, 0.015,
    'Data: Arkheion realtest-20 · Ethereum Yellow Paper (Berlin) · EIP-2535 · EIP-3529  |  Estimated values marked where noted',
    fontsize=8, color=C_GRAY, ha='center')

plt.savefig('/Users/steve/Desktop/fsca-cli-opensource/documents/publications/gas_comparison.png',
    dpi=150, bbox_inches='tight', facecolor='white')
print("saved")
