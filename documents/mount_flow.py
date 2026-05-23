import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Circle

plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(figsize=(14, 22))
ax.set_xlim(0, 14)
ax.set_ylim(0, 22)
ax.axis('off')
fig.patch.set_facecolor('white')

C_TITLE   = '#1C2833'
C_GRAY    = '#7F8C8D'
C_START   = '#1A252F'
C_ACTION  = '#1A5276'
C_CHAIN   = '#154360'
C_CACHE   = '#1E8449'
C_ERR     = '#C0392B'

def action(x, y, w, h, label, sub=None, fc='#EBF5FB', ec='#1A5276', lw=1.6, fs=11):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0.15", lw=lw, edgecolor=ec, facecolor=fc, zorder=4))
    ty = y + h/2 + (0.18 if sub else 0)
    ax.text(x + w/2, ty, label,
        fontsize=fs, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=5)
    if sub:
        ax.text(x + w/2, y + h/2 - 0.22, sub,
            fontsize=9, color='#5D6D7E',
            va='center', ha='center', zorder=5)

def decision(x, y, w, h, label, ec='#1A5276'):
    cx, cy = x + w/2, y + h/2
    pts = [(cx, y+h), (x+w, cy), (cx, y), (x, cy)]
    ax.add_patch(Polygon(pts, closed=True,
        facecolor='#FDFEFE', edgecolor=ec, lw=1.6, zorder=4))
    ax.text(cx, cy, label,
        fontsize=10, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=5)

def start_node(x, y):
    ax.add_patch(Circle((x, y), 0.28, color=C_START, zorder=6))

def end_node(x, y):
    ax.add_patch(Circle((x, y), 0.36, color=C_START, fill=False, lw=3, zorder=6))
    ax.add_patch(Circle((x, y), 0.22, color=C_START, zorder=6))

def arr(x1, y1, x2, y2, color='#2C3E50', lw=1.5):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                        connectionstyle='arc3,rad=0.0'), zorder=3)

def guard(x, y, label, color='#2C3E50', ha='left'):
    ax.text(x, y, f'[{label}]',
        fontsize=9.5, color=color, va='center', ha=ha,
        style='italic', zorder=6)

CX = 7.0   # center x
W  = 8.0   # action box width
H  = 0.9   # action box height
LX = CX - W/2

# ── Title ──────────────────────────────────────────────────────
ax.text(CX, 21.6, 'cluster mount — Activity Diagram',
    fontsize=16, fontweight='bold', color=C_TITLE, va='center', ha='center')
ax.text(CX, 21.15, 'arkheion cluster mount <id> <name>',
    fontsize=10.5, color=C_GRAY, va='center', ha='center', style='italic')

# ── Initial node ───────────────────────────────────────────────
start_node(CX, 20.65)
arr(CX, 20.37, CX, 20.05)

# ── A1: Validate inputs ────────────────────────────────────────
action(LX, 19.2, W, H, 'Validate Inputs',
    'id · name · currentOperating address')
arr(CX, 19.2, CX, 18.85)

# ── D1: deprecated / archived? ────────────────────────────────
decision(CX-2.2, 18.1, 4.4, 0.7, 'deprecated / archived?', ec=C_ERR)
arr(CX, 18.85, CX, 18.8)
# [no] → down
arr(CX, 18.1, CX, 17.75)
guard(CX+0.12, 17.93, 'no', color='#27AE60')
# [yes] → right → error
ax.plot([CX+2.2, 11.5], [18.45, 18.45], '-', color=C_ERR, lw=1.5, zorder=3)
arr(11.5, 18.45, 11.5, 17.3, color=C_ERR)
guard(CX+2.3, 18.55, 'yes', color=C_ERR)
action(10.0, 16.5, 3.0, 0.75, 'throw Error\nexit(1)',
    fc='#FDEDEC', ec=C_ERR, lw=1.6, fs=10)

# ── A2: Connect to chain ───────────────────────────────────────
action(LX, 16.9, W, H, 'Connect to Chain',
    'getProvider(rpc) · getSigner(privateKey) · load ClusterManager ABI')
arr(CX, 16.9, CX, 16.55)

# ── A3: Acquire cluster lock ───────────────────────────────────
action(LX, 15.7, W, H, 'Acquire Cluster Lock',
    'acquireLock(rootDir, clusterAddr)')
arr(CX, 15.7, CX, 15.35)

# ── A4: Send on-chain tx ───────────────────────────────────────
action(LX, 14.5, W, H, 'ClusterManager.registerContract(id, name, addr)',
    'on-chain tx → EvokerManager.mount() → lock contract (whetherMounted = 1)',
    fc='#D6EAF8', ec=C_CHAIN, lw=2.0)
arr(CX, 14.5, CX, 14.15)

# ── D2: tx confirmed? ─────────────────────────────────────────
decision(CX-2.2, 13.4, 4.4, 0.7, 'tx confirmed?', ec=C_CHAIN)
arr(CX, 14.15, CX, 14.1)
arr(CX, 13.4, CX, 13.05)
guard(CX+0.12, 13.23, 'confirmed', color='#27AE60')
ax.plot([CX+2.2, 11.5], [13.75, 13.75], '-', color=C_ERR, lw=1.5, zorder=3)
ax.plot([11.5, 11.5], [13.75, 17.25], '-', color=C_ERR, lw=1.5, zorder=3)
guard(CX+2.3, 13.85, 'reverted', color=C_ERR)

# ── A5: Update project.json ────────────────────────────────────
action(LX, 12.2, W, H, 'Update project.json',
    'unmountedcontracts → runningcontracts  ·  status = mounted  ·  generation++',
    fc='#D4EFDF', ec=C_CACHE, lw=1.8)
arr(CX, 12.2, CX, 11.85)

# ── A6: Pod snapshot sync ──────────────────────────────────────
action(LX, 11.0, W, H, 'Pod Snapshot Sync',
    'getAllActiveModules()  ·  getAllPassiveModules()  →  write podSnapshot',
    fc='#D4EFDF', ec=C_CACHE, lw=1.8)
arr(CX, 11.0, CX, 10.65)

# ── D3: snapshot ok? ──────────────────────────────────────────
decision(CX-2.2, 9.9, 4.4, 0.7, 'snapshot sync ok?', ec=C_CACHE)
arr(CX, 10.65, CX, 10.6)
arr(CX, 9.9, CX, 9.55)
guard(CX+0.12, 9.73, 'ok', color='#27AE60')
ax.plot([CX+2.2, 11.5], [10.25, 10.25], '-', color=C_ERR, lw=1.5, zorder=3)
ax.plot([11.5, 11.5], [10.25, 17.25], '-', color=C_ERR, lw=1.5, zorder=3)
guard(CX+2.3, 10.35, 'failed', color=C_ERR)
ax.text(11.6, 13.8, 'throw Error\n(on-chain ok,\nsnapshot failed)',
    fontsize=8.5, color=C_ERR, va='center')

# ── A7: Release lock ──────────────────────────────────────────
action(LX, 8.7, W, H, 'Release Cluster Lock',
    'lock.release()  ·  finally block')
arr(CX, 8.7, CX, 8.35)

# ── Final node ────────────────────────────────────────────────
end_node(CX, 8.05)

# ── On-chain effect note ──────────────────────────────────────
ax.add_patch(FancyBboxPatch((0.4, 13.5), 3.0, 2.5,
    boxstyle="round,pad=0.12", lw=1.2,
    edgecolor='#BDC3C7', facecolor='#FDFEFE', zorder=3))
ax.text(1.9, 15.85, 'On-Chain Effect',
    fontsize=10, fontweight='bold', color=C_CHAIN,
    va='top', ha='center')
for i, t in enumerate([
    'ClusterManager:',
    '  id → name → addr',
    'EvokerManager:',
    '  create dep edges',
    '  whetherMounted = 1',
]):
    ax.text(0.65, 15.6 - i*0.38, t,
        fontsize=9, color='#5D6D7E', va='top')
ax.plot([3.4, LX], [14.75, 14.75], '--', color=C_CHAIN, lw=1.0, zorder=2)

plt.tight_layout(pad=0.3)
plt.savefig('/Users/steve/Desktop/fsca-cli-opensource/documents/mount_flow.png',
    dpi=150, bbox_inches='tight', facecolor='white')
print("saved")
