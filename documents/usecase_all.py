import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Ellipse
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

OUT = '/Users/steve/Desktop/fsca-cli-opensource/documents/'

# ─── Primitives ───────────────────────────────────────────────────────────────

def draw_actor(ax, x, y, label, color='#1A5276'):
    s = 0.26
    ax.add_patch(plt.Circle((x, y + s*3.2), s*0.85,
        fill=True, facecolor='white', edgecolor=color, lw=1.8, zorder=7))
    ax.plot([x, x], [y+s*2.35, y+s*1.1], color=color, lw=1.8, zorder=7)
    ax.plot([x-s*1.4, x+s*1.4], [y+s*1.9, y+s*1.9], color=color, lw=1.8, zorder=7)
    ax.plot([x, x-s*1.2], [y+s*1.1, y-s*0.3], color=color, lw=1.8, zorder=7)
    ax.plot([x, x+s*1.2], [y+s*1.1, y-s*0.3], color=color, lw=1.8, zorder=7)
    for i, line in enumerate(label.split('\n')):
        ax.text(x, y - s*0.5 - i*0.30, line, fontsize=8.5, color=color,
                fontweight='bold', ha='center', va='top', zorder=7)

def draw_uc(ax, cx, cy, w, h, label, sub=None, fc='#EBF5FB', ec='#2980B9', fs=8.5):
    ax.add_patch(Ellipse((cx, cy), w, h,
        fill=True, facecolor=fc, edgecolor=ec, lw=1.5, zorder=5))
    ty = cy + 0.13 if sub else cy
    ax.text(cx, ty, label, fontsize=fs, color='#1C2833', fontweight='bold',
            ha='center', va='center', zorder=6, multialignment='center')
    if sub:
        ax.text(cx, cy - 0.22, sub, fontsize=6.8, color='#5D6D7E',
                ha='center', va='center', zorder=6, style='italic')

def draw_boundary(ax, x, y, w, h, title, ec='#2C3E50', fc='#FAFAFA'):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="square,pad=0", lw=2, edgecolor=ec, facecolor=fc, zorder=1))
    ax.text(x + w/2, y + h + 0.08, title, fontsize=11, fontweight='bold',
            color=ec, ha='center', va='bottom', zorder=6)

def assoc(ax, x1, y1, x2, y2, color='#555555'):
    ax.plot([x1, x2], [y1, y2], '-', color=color, lw=1.3, zorder=3)

def drel(ax, x1, y1, x2, y2, label, color, dy=0.13, rad=0.0):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle='->', color=color, lw=1.2,
                        linestyle='dashed',
                        connectionstyle=f'arc3,rad={rad}'), zorder=4)
    mx, my = (x1+x2)/2, (y1+y2)/2 + dy
    ax.text(mx, my, label, fontsize=7.2, color=color, ha='center', va='bottom',
            zorder=5, style='italic',
            bbox=dict(boxstyle='round,pad=0.08', fc='white', ec='none', alpha=0.85))

def inc(ax, x1, y1, x2, y2, dy=0.13, rad=0.0):
    drel(ax, x1, y1, x2, y2, '«include»', '#1E8449', dy, rad)

def ext(ax, x1, y1, x2, y2, dy=0.13, rad=0.0):
    drel(ax, x1, y1, x2, y2, '«extend»', '#D35400', dy, rad)

def add_legend(ax, x, y):
    ax.text(x, y, '图例', fontsize=8.5, fontweight='bold', color='#1C2833')
    specs = [
        ('#1E8449', '--', '«include» 必须执行的子用例'),
        ('#D35400', '--', '«extend»  可选扩展行为'),
        ('#555555', '-',  '关联      Actor 与用例的交互'),
    ]
    for i, (c, ls, lbl) in enumerate(specs):
        yy = y - 0.38*(i+1)
        ax.plot([x, x+0.55], [yy, yy], ls, color=c, lw=1.4)
        if ls == '--':
            ax.annotate('', xy=(x+0.55, yy), xytext=(x+0.35, yy),
                arrowprops=dict(arrowstyle='->', color=c, lw=1.1))
        ax.text(x+0.7, yy, lbl, fontsize=7.8, color='#1C2833', va='center')

def add_title(fig, title, subtitle):
    fig.text(0.5, 0.97, title, fontsize=14, fontweight='bold',
             color='#1C2833', ha='center', va='top')
    fig.text(0.5, 0.945, subtitle, fontsize=9.5, color='#7F8C8D',
             ha='center', va='top', style='italic')

# ─── Part 1: Initialization ───────────────────────────────────────────────────

def part1():
    fig, ax = plt.subplots(figsize=(18, 11))
    ax.set_xlim(0, 18); ax.set_ylim(0, 11); ax.axis('off')
    fig.patch.set_facecolor('white')
    add_title(fig, 'Arkheion CLI — 用例图 Part 1: 项目与集群初始化',
              'Use Case Diagram · Initialization Subsystem')

    draw_boundary(ax, 3.2, 0.8, 11.2, 9.2, 'Arkheion CLI 初始化子系统')

    # Actors
    draw_actor(ax, 1.5, 5.5, '开发者\nDeveloper', '#1A5276')
    draw_actor(ax, 16.2, 6.5, '区块链网络\nBlockchain', '#117A65')
    draw_actor(ax, 16.2, 2.8, 'Hardhat\n编译工具', '#6E2F8A')

    # Main use cases
    draw_uc(ax, 6.5, 8.5, 3.2, 1.0, '初始化项目', 'arkheion init',
            fc='#D6EAF8', ec='#1A5276')
    draw_uc(ax, 6.5, 4.5, 3.2, 1.0, '初始化集群', 'arkheion cluster init',
            fc='#D5F5E3', ec='#1E8449')

    # Sub use cases — init
    draw_uc(ax, 11.5, 9.5, 3.0, 0.85, '配置网络与账户', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 11.5, 8.5, 3.0, 0.85, '安装 Hardhat 依赖', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 11.5, 7.5, 3.0, 0.85, '创建 project.json', fc='#EBF5FB', ec='#2980B9', fs=8)

    # Sub use cases — cluster init
    draw_uc(ax, 11.5, 5.5, 3.0, 0.85, '确认操作', '(--yes 可跳过)',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 11.5, 4.5, 3.0, 0.85, '部署核心合约组',
            'MultiSig / ClusterMgr / Evoker / Proxy',
            fc='#D5F5E3', ec='#1E8449', fs=8)
    draw_uc(ax, 11.5, 3.3, 3.0, 0.85, '清理编译产物',
            'keep | soft | hard',
            fc='#FDEBD0', ec='#D35400', fs=8)

    # Associations
    assoc(ax, 1.5, 6.3, 5.0, 8.5)
    assoc(ax, 1.5, 6.3, 5.0, 4.5)
    assoc(ax, 16.2, 7.3, 13.0, 4.5)
    assoc(ax, 16.2, 3.6, 13.0, 8.5)

    # Include / Extend
    inc(ax, 8.1, 8.5, 10.0, 9.5)
    inc(ax, 8.1, 8.5, 10.0, 8.5)
    inc(ax, 8.1, 8.5, 10.0, 7.5)
    inc(ax, 8.1, 4.5, 10.0, 5.5)
    inc(ax, 8.1, 4.5, 10.0, 4.5)
    ext(ax, 8.1, 4.5, 10.0, 3.3)

    add_legend(ax, 3.5, 2.2)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(OUT + 'usecase_part1_init.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print('Part 1 saved')

# ─── Part 2: Contract Lifecycle ───────────────────────────────────────────────

def part2():
    fig, ax = plt.subplots(figsize=(20, 13))
    ax.set_xlim(0, 20); ax.set_ylim(0, 13); ax.axis('off')
    fig.patch.set_facecolor('white')
    add_title(fig, 'Arkheion CLI — 用例图 Part 2: 合约生命周期管理',
              'Use Case Diagram · Contract Lifecycle Subsystem')

    draw_boundary(ax, 3.0, 0.8, 13.5, 11.2, 'Arkheion CLI 合约生命周期子系统')

    draw_actor(ax, 1.4, 6.5, '开发者\nDeveloper', '#1A5276')
    draw_actor(ax, 18.2, 7.0, '区块链网络\nBlockchain', '#117A65')

    # Main use cases (left column)
    mains = [
        (6.5, 11.2, '部署业务合约', 'arkheion deploy', '#D6EAF8', '#1A5276'),
        (6.5,  8.8, '挂载合约到集群', 'arkheion cluster mount', '#D5F5E3', '#1E8449'),
        (6.5,  7.0, '从集群卸载合约', 'arkheion cluster unmount', '#D5F5E3', '#1E8449'),
        (6.5,  5.2, '热替换升级合约', 'arkheion cluster upgrade', '#FDEDEC', '#C0392B'),
        (6.5,  3.2, '回滚合约版本', 'arkheion cluster rollback', '#FEF9E7', '#D4AC0D'),
        (6.5,  1.6, '查看版本历史', 'arkheion cluster history', '#F4ECF7', '#7D3C98'),
    ]
    for cx, cy, lbl, sub, fc, ec in mains:
        draw_uc(ax, cx, cy, 3.2, 0.95, lbl, sub, fc=fc, ec=ec)

    # Sub use cases (right column)
    subs = [
        (13.0, 11.8, '编译合约', 'npx hardhat compile', '#EBF5FB', '#2980B9'),
        (13.0, 10.8, '确认操作', '(--yes 可跳过)', '#EBF5FB', '#2980B9'),
        (13.0,  9.8, '清理编译产物', 'keep|soft|hard', '#FDEBD0', '#D35400'),
        (13.0,  8.8, '同步 Pod 快照', 'getAllActive/PassiveModules', '#D5F5E3', '#1E8449'),
        (13.0,  5.8, '复制 Pod 配置', 'BeforeMount copy', '#EBF5FB', '#2980B9'),
        (13.0,  4.8, '卸载旧合约', 'unmount old', '#EBF5FB', '#2980B9'),
        (13.0,  3.8, '挂载新合约', 'mount new', '#EBF5FB', '#2980B9'),
        (13.0,  2.8, '跳过 Pod 复制', '--skip-copy-pods', '#FDEBD0', '#D35400'),
        (13.0,  1.9, '从断点恢复', '--resume / --restart', '#FDEBD0', '#D35400'),
        (13.0,  3.2, '验证链上字节码', 'on-chain bytecode check', '#EBF5FB', '#2980B9'),
        (13.0,  2.2, '恢复 Pod 连接', 'podSnapshot restore', '#EBF5FB', '#2980B9'),
        (13.0,  1.2, '预览回滚计划', '--dry-run', '#FDEBD0', '#D35400'),
    ]

    # Reposition subs to avoid overlap — use separate right columns per main UC
    # deploy subs
    draw_uc(ax, 13.0, 11.8, 3.0, 0.8, '编译合约', 'npx hardhat compile', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0, 10.9, 3.0, 0.8, '确认操作', '(--yes 可跳过)', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0, 10.0, 3.0, 0.8, '清理编译产物', 'keep|soft|hard', fc='#FDEBD0', ec='#D35400', fs=8)
    # mount sub
    draw_uc(ax, 13.0,  8.8, 3.0, 0.8, '同步 Pod 快照', 'getAllActive/PassiveModules', fc='#D5F5E3', ec='#1E8449', fs=8)
    # upgrade subs
    draw_uc(ax, 13.0,  6.2, 3.0, 0.8, '复制 Pod 配置', 'BeforeMount copy', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  5.3, 3.0, 0.8, '卸载旧合约', 'unmount old', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  4.4, 3.0, 0.8, '挂载新合约', 'mount new', fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  3.5, 3.0, 0.8, '跳过 Pod 复制', '--skip-copy-pods', fc='#FDEBD0', ec='#D35400', fs=8)
    draw_uc(ax, 13.0,  2.6, 3.0, 0.8, '从断点恢复', '--resume / --restart', fc='#FDEBD0', ec='#D35400', fs=8)
    # rollback subs
    draw_uc(ax, 13.0,  3.2, 3.0, 0.8, '验证链上字节码', 'on-chain bytecode check', fc='#EBF5FB', ec='#2980B9', fs=8)

    # Associations
    for _, cy, _, _, _, _ in mains:
        assoc(ax, 1.4, 7.3, 5.0, cy)
    assoc(ax, 18.2, 7.8, 16.5, 8.8)  # blockchain → sync pod
    assoc(ax, 18.2, 7.8, 16.5, 4.4)  # blockchain → mount new

    # deploy includes
    inc(ax, 8.1, 11.2, 11.5, 11.8)
    inc(ax, 8.1, 11.2, 11.5, 10.9)
    ext(ax, 8.1, 11.2, 11.5, 10.0)
    # mount includes
    inc(ax, 8.1,  8.8, 11.5,  8.8)
    # upgrade includes
    inc(ax, 8.1,  5.2, 11.5,  6.2)
    inc(ax, 8.1,  5.2, 11.5,  5.3)
    inc(ax, 8.1,  5.2, 11.5,  4.4)
    ext(ax, 8.1,  5.2, 11.5,  3.5)
    ext(ax, 8.1,  5.2, 11.5,  2.6)

    add_legend(ax, 3.3, 2.0)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(OUT + 'usecase_part2_lifecycle.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print('Part 2 saved')

part1()
part2()
