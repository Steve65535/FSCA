import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Circle, FancyArrowPatch
import matplotlib.patches as mpatches

import matplotlib.font_manager as fm
plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(figsize=(20, 22))
ax.set_xlim(0, 20)
ax.set_ylim(0, 22)
ax.axis('off')
fig.patch.set_facecolor('white')

C_TITLE   = '#1C2833'
C_GRAY    = '#7F8C8D'
C_DEV     = '#1A5276'
C_ADMIN   = '#1E8449'
C_GOV     = '#6E2F8A'
C_AUDIT   = '#784212'
C_START   = '#1A252F'
C_SYNC    = '#BDC3C7'
C_FORK    = '#2C3E50'

LANE_W = 4.6
LANES = [
    (0.3,  C_DEV,   '开发者'),
    (5.2,  C_ADMIN, '集群管理员'),
    (10.1, C_GOV,   '多签治理成员'),
    (15.0, C_AUDIT, '审计人员'),
]

# ── Title ──────────────────────────────────────────────────────
ax.text(10, 21.6, 'Arkheion CLI — System Activity Diagram',
    fontsize=18, fontweight='bold', color=C_TITLE, va='center', ha='center')
ax.text(10, 21.15, 'Swimlane view: who does what and in what order',
    fontsize=11, color=C_GRAY, va='center', ha='center', style='italic')

# ── Swimlane headers ───────────────────────────────────────────
for lx, lc, lname in LANES:
    ax.add_patch(FancyBboxPatch((lx, 20.3), LANE_W, 0.7,
        boxstyle="round,pad=0.05", lw=1.5, edgecolor=lc, facecolor=lc, zorder=3))
    ax.text(lx + LANE_W/2, 20.65, lname,
        fontsize=12, fontweight='bold', color='white',
        va='center', ha='center', zorder=4)

# ── Swimlane background columns ────────────────────────────────
bgs = ['#F4F6F7', '#F0FBF4', '#F9F0FF', '#FFF8F0']
for (lx, lc, _), bg in zip(LANES, bgs):
    ax.add_patch(FancyBboxPatch((lx, 0.5), LANE_W, 19.75,
        boxstyle="square,pad=0", lw=1, edgecolor='#D5D8DC', facecolor=bg, zorder=1))

# ── Swimlane vertical dividers ─────────────────────────────────
for lx, _, _ in LANES[1:]:
    ax.plot([lx, lx], [0.5, 20.3], '-', color='#D5D8DC', lw=1.0, zorder=2)

# ── Helper functions ───────────────────────────────────────────
def act(x, y, w, h, label, sub=None, fc='white', ec='#5D6D7E', lw=1.4, fs=9.5):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0.12", lw=lw, edgecolor=ec, facecolor=fc, zorder=5))
    ty = y + h/2 + (0.14 if sub else 0)
    ax.text(x + w/2, ty, label, fontsize=fs, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=6)
    if sub:
        ax.text(x + w/2, y + h/2 - 0.18, sub, fontsize=7.5, color='#7F8C8D',
            va='center', ha='center', zorder=6)

def diam(x, y, w, h, label, fc='#F0F3F4', ec='#5D6D7E', fs=8.5):
    cx, cy = x + w/2, y + h/2
    pts = [(cx, y+h), (x+w, cy), (cx, y), (x, cy)]
    ax.add_patch(Polygon(pts, closed=True, facecolor=fc, edgecolor=ec, lw=1.4, zorder=5))
    ax.text(cx, cy, label, fontsize=fs, color='#1C2833', fontweight='bold',
        va='center', ha='center', zorder=6)

def start_node(x, y, r=0.22):
    ax.add_patch(Circle((x, y), r, color=C_START, zorder=6))

def end_node(x, y, r=0.22):
    ax.add_patch(Circle((x, y), r+0.08, color=C_START, fill=False, lw=2.5, zorder=6))
    ax.add_patch(Circle((x, y), r, color=C_START, zorder=6))

def arr(x1, y1, x2, y2, color='#2C3E50', lw=1.3, label='', lpos='right'):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                        connectionstyle='arc3,rad=0.0'), zorder=4)
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ox = 0.1 if lpos == 'right' else -0.1
        ha = 'left' if lpos == 'right' else 'right'
        ax.text(mx+ox, my, label, fontsize=8, color=color, va='center', ha=ha)

def sync_bar(x, y, w, h=0.12, color=C_FORK):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="square,pad=0", facecolor=color, edgecolor=color, zorder=5))

def cross_arr(x1, y1, x2, y2, color='#95A5A6', lw=1.1, style='dashed'):
    ls = '--' if style == 'dashed' else '-'
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle='->', color=color, lw=lw,
                        connectionstyle='arc3,rad=0.0',
                        linestyle=ls), zorder=3)

# Lane center x values
LC = [lx + LANE_W/2 for lx, _, _ in LANES]
# LC[0]=Dev, LC[1]=Admin, LC[2]=Gov, LC[3]=Audit
AW = 3.8   # activity box width
AH = 0.75  # activity box height

# ── START (shared) ─────────────────────────────────────────────
start_node(10, 19.95)
# fork to Dev and Admin
sync_bar(0.8, 19.55, 13.8)
arr(10, 19.73, 10, 19.67, color=C_FORK)
arr(LC[0], 19.55, LC[0], 19.2, color=C_DEV)
arr(LC[1], 19.55, LC[1], 19.2, color=C_ADMIN)

# ── Dev: 初始化项目 ────────────────────────────────────────────
act(LC[0]-AW/2, 18.35, AW, AH, '初始化项目',
    'arkheion init', fc='#EBF5FB', ec=C_DEV)
arr(LC[0], 18.35, LC[0], 17.95, color=C_DEV)

# ── Admin: 初始化集群 ──────────────────────────────────────────
act(LC[1]-AW/2, 18.35, AW, AH, '初始化集群',
    'arkheion cluster init', fc='#D4EFDF', ec=C_ADMIN)
arr(LC[1], 18.35, LC[1], 17.95, color=C_ADMIN)

# ── Dev: 编写合约 + 添加注解 ───────────────────────────────────
act(LC[0]-AW/2, 17.1, AW, AH, '编写合约 & 添加注解',
    '@Arkheion-id / active / passive / auto', fc='#EBF5FB', ec=C_DEV)
arr(LC[0], 17.1, LC[0], 16.7, color=C_DEV)

# ── Admin: 配置网络 & 账户 ─────────────────────────────────────
act(LC[1]-AW/2, 17.1, AW, AH, '配置网络 & 账户',
    'project.json · RPC · privateKey', fc='#D4EFDF', ec=C_ADMIN)
arr(LC[1], 17.1, LC[1], 16.7, color=C_ADMIN)

# ── Dev: 静态检查 ──────────────────────────────────────────────
act(LC[0]-AW/2, 15.85, AW, AH, '静态检查',
    'arkheion cluster auto check', fc='#EBF5FB', ec=C_DEV)
arr(LC[0], 15.85, LC[0], 15.45, color=C_DEV)

# decision: cycles?
diam(LC[0]-2.0, 14.65, 4.0, 0.7, 'func-cycle\ndetected?', ec=C_DEV)
arr(LC[0], 15.45, LC[0], 15.35, color=C_DEV)
arr(LC[0], 14.65, LC[0], 14.25, color=C_DEV, label='No', lpos='right')
# Yes → review
ax.annotate('', xy=(LC[0]-2.2, 14.65), xytext=(LC[0]-2.0, 15.0),
    arrowprops=dict(arrowstyle='->', color='#E74C3C', lw=1.2), zorder=4)
ax.text(LC[0]-2.5, 14.85, 'Yes\n→ review', fontsize=7.5, color='#E74C3C',
    va='center', ha='center')

# ── Dev: 自动装配 ──────────────────────────────────────────────
act(LC[0]-AW/2, 13.4, AW, AH, '自动装配',
    'arkheion cluster auto', fc='#D6EAF8', ec=C_DEV, lw=1.8)
arr(LC[0], 13.4, LC[0], 13.0, color=C_DEV)

# sub-steps inside auto (smaller boxes)
sub_aw = 3.6
for i, (lbl, sub) in enumerate([
    ('编译合约',     'npx hardhat compile'),
    ('部署所有合约', 'deploy → CA'),
    ('链接 Pod',     'beforeMount links'),
    ('挂载合约',     'registerContract'),
    ('AfterMount',   'cycle edges + deferred'),
]):
    yy = 12.15 - i * 0.88
    act(LC[0]-sub_aw/2, yy, sub_aw, 0.72, lbl, sub,
        fc='#F4F6F7', ec=C_DEV, lw=1.0, fs=8.5)
    if i < 4:
        arr(LC[0], yy, LC[0], yy - 0.16, color=C_DEV, lw=1.0)

arr(LC[0], 8.75, LC[0], 8.35, color=C_DEV)

# ── Admin: 热替换升级 ──────────────────────────────────────────
act(LC[1]-AW/2, 15.85, AW, AH, '热替换升级',
    'arkheion cluster upgrade', fc='#D4EFDF', ec=C_ADMIN)
arr(LC[1], 15.85, LC[1], 15.45, color=C_ADMIN)

act(LC[1]-AW/2, 14.6, AW, AH, '执行回滚',
    'arkheion cluster rollback', fc='#D4EFDF', ec=C_ADMIN)
arr(LC[1], 14.6, LC[1], 14.2, color=C_ADMIN)

# ── Admin: 发起多签交易 ────────────────────────────────────────
act(LC[1]-AW/2, 13.35, AW, AH, '发起多签交易',
    'MultiSigWallet.submitTransaction()', fc='#D4EFDF', ec=C_ADMIN, lw=1.8)
arr(LC[1], 13.35, LC[1], 12.95, color=C_ADMIN)

# cross-lane: Admin → Gov (confirm)
cross_arr(LC[1]+AW/2, 13.72, LC[2]-AW/2, 13.72, color=C_GOV, lw=1.2, style='solid')
ax.text((LC[1]+AW/2 + LC[2]-AW/2)/2, 13.82, '通知确认', fontsize=7.5,
    color=C_GOV, ha='center')

# ── Gov: 确认多签交易 ──────────────────────────────────────────
act(LC[2]-AW/2, 13.35, AW, AH, '确认多签交易',
    'confirmTransaction()', fc='#F5EEF8', ec=C_GOV, lw=1.8)
arr(LC[2], 13.35, LC[2], 12.95, color=C_GOV)

diam(LC[2]-2.0, 12.15, 4.0, 0.7, '达到阈值?', ec=C_GOV)
arr(LC[2], 12.95, LC[2], 12.85, color=C_GOV)
arr(LC[2], 12.15, LC[2], 11.75, color=C_GOV, label='Yes', lpos='right')
ax.text(LC[2]+2.1, 12.5, 'No →\n等待更多确认', fontsize=7.5, color=C_GOV, va='center')

act(LC[2]-AW/2, 10.9, AW, AH, '执行多签交易',
    'executeTransaction()', fc='#F5EEF8', ec=C_GOV, lw=1.8)
arr(LC[2], 10.9, LC[2], 10.5, color=C_GOV)

# ── Audit: 查看集群拓扑 ────────────────────────────────────────
act(LC[3]-AW/2, 18.35, AW, AH, '查看集群拓扑',
    'cluster state · pod graph', fc='#FEF9E7', ec=C_AUDIT)
arr(LC[3], 18.35, LC[3], 17.95, color=C_AUDIT)

act(LC[3]-AW/2, 17.1, AW, AH, '查看版本历史',
    'arkheion cluster history', fc='#FEF9E7', ec=C_AUDIT)
arr(LC[3], 17.1, LC[3], 16.7, color=C_AUDIT)

act(LC[3]-AW/2, 15.85, AW, AH, '查看日志',
    'logs/<date>.log', fc='#FEF9E7', ec=C_AUDIT)
arr(LC[3], 15.85, LC[3], 15.45, color=C_AUDIT)

act(LC[3]-AW/2, 14.6, AW, AH, '查看 auto-report',
    'cycles · skipped links · errors', fc='#FEF9E7', ec=C_AUDIT)
arr(LC[3], 14.6, LC[3], 14.2, color=C_AUDIT)

act(LC[3]-AW/2, 13.35, AW, AH, '审计 podSnapshot',
    'alldeployedcontracts · generation', fc='#FEF9E7', ec=C_AUDIT)
arr(LC[3], 13.35, LC[3], 12.95, color=C_AUDIT)

# ── Merge bar ─────────────────────────────────────────────────
merge_y = 8.1
sync_bar(0.8, merge_y, 18.4)
arr(LC[0], 8.35, LC[0], merge_y + 0.12, color=C_DEV)
arr(LC[1], 12.95, LC[1], merge_y + 0.12, color=C_ADMIN)
arr(LC[2], 10.5, LC[2], merge_y + 0.12, color=C_GOV)
arr(LC[3], 12.95, LC[3], merge_y + 0.12, color=C_AUDIT)

arr(10, merge_y, 10, 7.7, color=C_FORK)

# ── Shared: 同步 podSnapshot ──────────────────────────────────
act(10-AW/2-0.5, 6.85, AW+1.0, AH, '同步 Pod Snapshot',
    'getAllActiveModules / getAllPassiveModules → project.json',
    fc='#EBF5FB', ec='#1B4F72', lw=1.5)
arr(10, 6.85, 10, 6.45, color='#1B4F72')

# ── Shared: 写入报告 ───────────────────────────────────────────
act(10-AW/2-0.5, 5.6, AW+1.0, AH, '写入 auto-report.json',
    '(if cycles / warnings / errors)', fc='#FDFEFE', ec=C_GRAY)
arr(10, 5.6, 10, 5.2, color=C_GRAY)

# ── END ───────────────────────────────────────────────────────
end_node(10, 4.9)

# ── Legend ────────────────────────────────────────────────────
ax.text(0.5, 1.9, 'Legend:', fontsize=9.5, fontweight='bold', color=C_TITLE)
items = [
    (C_DEV,   '#EBF5FB', '开发者活动'),
    (C_ADMIN, '#D4EFDF', '集群管理员活动'),
    (C_GOV,   '#F5EEF8', '多签治理成员活动'),
    (C_AUDIT, '#FEF9E7', '审计人员活动'),
    (C_FORK,  C_FORK,    '同步 / 分叉 / 合并'),
]
for i, (ec, fc, label) in enumerate(items):
    bx = 0.5 + i * 3.8
    ax.add_patch(FancyBboxPatch((bx, 1.3), 0.45, 0.32,
        boxstyle="round,pad=0.04", lw=1.2, edgecolor=ec, facecolor=fc))
    ax.text(bx + 0.6, 1.46, label, fontsize=8.5, color=C_TITLE, va='center')

plt.tight_layout(pad=0.2)
plt.savefig('/Users/steve/Desktop/fsca-cli-opensource/documents/usecase.png',
    dpi=150, bbox_inches='tight', facecolor='white')
print("saved")
