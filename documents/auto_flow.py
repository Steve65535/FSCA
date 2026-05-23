import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Circle

plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(figsize=(15, 28))
ax.set_xlim(0, 15)
ax.set_ylim(0, 28)
ax.axis('off')
fig.patch.set_facecolor('white')

C_TITLE   = '#1C2833'
C_GRAY    = '#7F8C8D'
C_START   = '#1A252F'
C_PRE     = '#1A5276'
C_REC     = '#117A65'
C_COMP    = '#6C3483'
C_DEPLOY  = '#154360'
C_LINK    = '#1E8449'
C_MOUNT   = '#4A235A'
C_AFTER   = '#784212'
C_SNAP    = '#1B4F72'
C_ERR     = '#C0392B'

CX = 7.5
W  = 9.0
LX = CX - W/2

def action(x, y, w, h, label, sub=None, fc='#EBF5FB', ec=C_PRE, lw=1.8, fs=11):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0.15", lw=lw, edgecolor=ec, facecolor=fc, zorder=4))
    ty = y + h/2 + (0.2 if sub else 0)
    ax.text(x + w/2, ty, label,
        fontsize=fs, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=5)
    if sub:
        ax.text(x + w/2, y + h/2 - 0.25, sub,
            fontsize=9, color='#5D6D7E',
            va='center', ha='center', zorder=5)

def decision(x, y, w, h, label, ec=C_PRE):
    cx, cy = x + w/2, y + h/2
    pts = [(cx, y+h), (x+w, cy), (cx, y), (x, cy)]
    ax.add_patch(Polygon(pts, closed=True,
        facecolor='#FDFEFE', edgecolor=ec, lw=1.8, zorder=4))
    ax.text(cx, cy, label,
        fontsize=10, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=5)

def start_node(x, y):
    ax.add_patch(Circle((x, y), 0.3, color=C_START, zorder=6))

def end_node(x, y):
    ax.add_patch(Circle((x, y), 0.38, color=C_START, fill=False, lw=3, zorder=6))
    ax.add_patch(Circle((x, y), 0.24, color=C_START, zorder=6))

def fork_bar(x, y, w=W, color=C_START):
    ax.add_patch(FancyBboxPatch((x, y), w, 0.14,
        boxstyle="square,pad=0", facecolor=color, edgecolor=color, zorder=5))

def arr(x1, y1, x2, y2, color='#2C3E50', lw=1.5):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                        connectionstyle='arc3,rad=0.0'), zorder=3)

def guard(x, y, label, color='#2C3E50', ha='left'):
    ax.text(x, y, f'[{label}]',
        fontsize=9.5, color=color, va='center', ha=ha, style='italic', zorder=6)

def note(x, y, lines, ec='#BDC3C7'):
    h = len(lines) * 0.38 + 0.3
    ax.add_patch(FancyBboxPatch((x, y), 3.8, h,
        boxstyle="round,pad=0.1", lw=1.0,
        edgecolor=ec, facecolor='#FDFEFE', zorder=3))
    for i, t in enumerate(lines):
        ax.text(x + 0.2, y + h - 0.25 - i*0.38, t,
            fontsize=8.5, color='#5D6D7E', va='top')

# ── Title ──────────────────────────────────────────────────────
ax.text(CX, 27.6, 'cluster auto — Activity Diagram',
    fontsize=17, fontweight='bold', color=C_TITLE, va='center', ha='center')
ax.text(CX, 27.1, 'arkheion cluster auto',
    fontsize=11, color=C_GRAY, va='center', ha='center', style='italic')

# ── Initial node ───────────────────────────────────────────────
start_node(CX, 26.6)
arr(CX, 26.3, CX, 25.95)

# ── [1] Pre-flight ─────────────────────────────────────────────
action(LX, 25.0, W, 0.85, '[1/6]  Pre-flight Static Analysis',
    'scan .sol → parse @Arkheion-* → ID conflict check → pod graph → func cycle detect',
    fc='#EBF5FB', ec=C_PRE)
arr(CX, 25.0, CX, 24.65)

decision(CX-2.4, 23.85, 4.8, 0.75, 'annotation errors?', ec=C_ERR)
arr(CX, 24.65, CX, 24.6)
arr(CX, 23.85, CX, 23.5)
guard(CX+0.12, 23.68, 'no errors', color='#27AE60')
ax.plot([CX+2.4, 12.8], [24.22, 24.22], '-', color=C_ERR, lw=1.5, zorder=3)
arr(12.8, 24.22, 12.8, 22.85, color=C_ERR)
guard(CX+2.5, 24.32, 'errors found', color=C_ERR)
action(11.1, 22.1, 3.6, 0.7, 'exit(1)',
    fc='#FDEDEC', ec=C_ERR, lw=1.6, fs=10)

# ── [2] Reconcile ──────────────────────────────────────────────
action(LX, 22.55, W, 0.85, '[2/6]  Reconcile with project.json',
    'compare annotations vs state → determine deploy / link / mount per contract',
    fc='#D4EFDF', ec=C_REC)
arr(CX, 22.55, CX, 22.2)

decision(CX-2.4, 21.4, 4.8, 0.75, 'dry-run mode?', ec=C_GRAY)
arr(CX, 22.2, CX, 22.15)
arr(CX, 21.4, CX, 21.05)
guard(CX+0.12, 21.23, 'no', color='#27AE60')
ax.plot([CX+2.4, 12.8], [21.77, 21.77], '-', color=C_GRAY, lw=1.5, zorder=3)
arr(12.8, 21.77, 12.8, 22.1, color=C_GRAY)
action(11.1, 22.1, 3.6, 0.7, 'exit(1)',
    fc='#FDEDEC', ec=C_ERR, lw=1.6, fs=10)
action(11.1, 22.85, 3.6, 0.7, 'print plan\n+ exit',
    fc='#F8F9FA', ec=C_GRAY, lw=1.4, fs=10)
guard(CX+2.5, 21.87, 'dry-run', color=C_GRAY)

# confirm gate
action(LX+1.5, 20.1, W-3.0, 0.85, 'User Confirmation',
    '--yes flag or interactive prompt',
    fc='#EBF5FB', ec=C_PRE)
arr(CX, 21.05, CX, 20.97)
arr(CX, 20.1, CX, 19.75)

# ── [3] Compile ────────────────────────────────────────────────
action(LX, 18.8, W, 0.85, '[3/6]  Compile Contracts',
    'npx hardhat compile  ·  ID conflict check',
    fc='#F5EEF8', ec=C_COMP)
arr(CX, 18.8, CX, 18.45)

# ── [4] Deploy all ─────────────────────────────────────────────
action(LX, 17.5, W, 0.85, '[4/6]  Deploy All Contracts',
    'for each undeployed → deployContract() → save address → write project.json',
    fc='#D6EAF8', ec=C_DEPLOY, lw=2.0)
arr(CX, 17.5, CX, 17.15)

note(0.3, 16.6, [
    'ctor args:',
    '  0 params → []',
    '  1 param  → [clusterAddr]',
    '  2 params → [clusterAddr, name]',
], ec=C_DEPLOY)
ax.plot([4.1, LX], [17.1, 17.1], '--', color=C_DEPLOY, lw=1.0, zorder=2)

# ── [5] Link ───────────────────────────────────────────────────
action(LX, 16.2, W, 0.85, '[5/6]  Link All Pods  (beforeMount)',
    'addActivePodBeforeMount / addPassivePodBeforeMount',
    fc='#EAFAF1', ec=C_LINK, lw=2.0)
arr(CX, 16.2, CX, 15.85)

note(0.3, 14.8, [
    'Skip edge if:',
    '  [pod-cycle edge]',
    '  [func-cycle edge]',
    '  [target undeployed]',
    '    → defer to afterMount',
], ec=C_LINK)
ax.plot([4.1, LX], [15.5, 15.5], '--', color=C_LINK, lw=1.0, zorder=2)

# ── [6] Mount all ──────────────────────────────────────────────
action(LX, 14.9, W, 0.85, '[6/6]  Mount All Contracts',
    'ClusterManager.registerContract()  ·  update project.json',
    fc='#E8DAEF', ec=C_MOUNT, lw=2.0)
arr(CX, 14.9, CX, 14.55)

# ── AfterMount ① ──────────────────────────────────────────────
action(LX, 13.6, W, 0.85, 'AfterMount  ①  Deferred Links',
    'targets now registered → addActive/PassivePodAfterMount',
    fc='#FEF9E7', ec=C_AFTER, lw=1.6)
arr(CX, 13.6, CX, 13.25)

# ── AfterMount ② ──────────────────────────────────────────────
action(LX, 12.3, W, 0.85, 'AfterMount  ②  Pod-Cycle Edges',
    'cycle edges only  ·  func-cycle edges permanently skipped',
    fc='#FEF9E7', ec=C_AFTER, lw=1.6)
arr(CX, 12.3, CX, 11.95)

# ── Pod snapshot sync ─────────────────────────────────────────
action(LX, 11.0, W, 0.85, 'Pod Snapshot Sync',
    'getAllActiveModules()  ·  getAllPassiveModules()  →  podSnapshot → project.json',
    fc='#D4EFDF', ec=C_SNAP, lw=1.8)
arr(CX, 11.0, CX, 10.65)

decision(CX-2.4, 9.85, 4.8, 0.75, 'all snapshots ok?', ec=C_SNAP)
arr(CX, 10.65, CX, 10.6)
arr(CX, 9.85, CX, 9.5)
guard(CX+0.12, 9.68, 'ok', color='#27AE60')
ax.plot([CX+2.4, 12.8], [10.22, 10.22], '-', color=C_ERR, lw=1.5, zorder=3)
ax.plot([12.8, 12.8], [10.22, 22.1], '-', color=C_ERR, lw=1.5, zorder=3)
guard(CX+2.5, 10.32, 'failed', color=C_ERR)

# ── Write report ──────────────────────────────────────────────
action(LX+1.5, 8.55, W-3.0, 0.85, 'Write auto-report.json',
    'if cycles / warnings / skipped links',
    fc='#FDFEFE', ec=C_GRAY)
arr(CX, 9.5, CX, 9.42)
arr(CX, 8.55, CX, 8.2)

# ── Final node ────────────────────────────────────────────────
end_node(CX, 7.9)

# ── Error column label ────────────────────────────────────────
ax.text(12.8, 22.95, 'error\nexit(1)',
    fontsize=9, color=C_ERR, va='center', ha='center',
    fontweight='bold')

plt.tight_layout(pad=0.3)
plt.savefig('/Users/steve/Desktop/fsca-cli-opensource/documents/auto_flow.png',
    dpi=150, bbox_inches='tight', facecolor='white')
print("saved")
