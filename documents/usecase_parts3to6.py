import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Ellipse

plt.rcParams['font.family'] = 'PingFang HK'
plt.rcParams['axes.unicode_minus'] = False

OUT = '/Users/steve/Desktop/fsca-cli-opensource/documents/'

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

# ─── Part 3: Pod Dependency Management ───────────────────────────────────────

def part3():
    fig, ax = plt.subplots(figsize=(18, 11))
    ax.set_xlim(0, 18); ax.set_ylim(0, 11); ax.axis('off')
    fig.patch.set_facecolor('white')
    add_title(fig, 'Arkheion CLI — 用例图 Part 3: Pod 依赖管理',
              'Use Case Diagram · Pod Dependency Management Subsystem')

    draw_boundary(ax, 3.0, 0.8, 11.5, 9.2, 'Arkheion CLI Pod 依赖管理子系统')

    draw_actor(ax, 1.4, 5.5, '开发者\nDeveloper', '#1A5276')
    draw_actor(ax, 16.2, 6.0, '区块链网络\nBlockchain', '#117A65')

    # Use cases
    draw_uc(ax, 6.5, 9.5, 3.2, 0.9, '选择当前合约', 'arkheion cluster choose',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5, 8.2, 3.2, 0.9, '查看当前合约', 'arkheion cluster current',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5, 6.9, 3.2, 0.9, '链接 Pod 依赖', 'arkheion cluster link',
            fc='#D5F5E3', ec='#1E8449')
    draw_uc(ax, 6.5, 5.6, 3.2, 0.9, '解除 Pod 链接', 'arkheion cluster unlink',
            fc='#D5F5E3', ec='#1E8449')
    draw_uc(ax, 6.5, 4.3, 3.2, 0.9, '查看合约详情', 'arkheion cluster info',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5, 3.0, 3.2, 0.9, '列举集群合约', 'cluster list mounted|all',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5, 1.7, 3.2, 0.9, '生成拓扑图', 'arkheion cluster graph',
            fc='#F4ECF7', ec='#7D3C98')

    # Shared sub use case
    draw_uc(ax, 12.0, 6.25, 3.2, 0.9, '同步 Pod 快照',
            'getAllActive/PassiveModules',
            fc='#D5F5E3', ec='#1E8449')

    # Associations
    for cy in [9.5, 8.2, 6.9, 5.6, 4.3, 3.0, 1.7]:
        assoc(ax, 1.4, 6.3, 5.0, cy)
    assoc(ax, 16.2, 6.8, 13.6, 6.25)

    # Include
    inc(ax, 8.1, 6.9, 10.4, 6.25)
    inc(ax, 8.1, 5.6, 10.4, 6.25)

    add_legend(ax, 3.3, 2.5)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(OUT + 'usecase_part3_pod.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print('Part 3 saved')

# ─── Part 4: Auto-Assembly ────────────────────────────────────────────────────

def part4():
    fig, ax = plt.subplots(figsize=(20, 14))
    ax.set_xlim(0, 20); ax.set_ylim(0, 14); ax.axis('off')
    fig.patch.set_facecolor('white')
    add_title(fig, 'Arkheion CLI — 用例图 Part 4: 自动装配与静态检查',
              'Use Case Diagram · Auto-Assembly & Static Check Subsystem')

    draw_boundary(ax, 3.0, 0.8, 13.5, 12.2, 'Arkheion CLI 自动装配子系统')

    draw_actor(ax, 1.4, 7.5, '开发者\nDeveloper', '#1A5276')
    draw_actor(ax, 18.2, 9.0, '区块链网络\nBlockchain', '#117A65')
    draw_actor(ax, 18.2, 5.5, 'Hardhat\n编译工具', '#6E2F8A')

    # Main use cases
    draw_uc(ax, 6.5, 12.0, 3.4, 1.0, '运行自动装配', 'arkheion cluster auto',
            fc='#D6EAF8', ec='#1A5276', fs=9)
    draw_uc(ax, 6.5,  4.5, 3.4, 1.0, '运行静态检查', 'arkheion cluster check',
            fc='#FEF9E7', ec='#D4AC0D', fs=9)

    # auto sub use cases
    draw_uc(ax, 13.0, 13.0, 3.2, 0.85, '静态分析', 'scan+parse+graph+funcgraph',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0, 12.0, 3.2, 0.85, '协调项目状态', 'reconcile vs project.json',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0, 11.0, 3.2, 0.85, '编译所有合约', 'npx hardhat compile',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0, 10.0, 3.2, 0.85, '部署所有合约', 'deploy all CAs first',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  9.0, 3.2, 0.85, '链接 Pod (BeforeMount)', 'skip cycle/func-cycle edges',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  8.0, 3.2, 0.85, '挂载所有合约', 'registerContract on-chain',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  7.0, 3.2, 0.85, '处理 AfterMount 链接',
            'deferred + pod-cycle edges',
            fc='#EBF5FB', ec='#2980B9', fs=8)
    draw_uc(ax, 13.0,  6.0, 3.2, 0.85, '预览装配计划', '--dry-run',
            fc='#FDEBD0', ec='#D35400', fs=8)
    draw_uc(ax, 13.0,  5.0, 3.2, 0.85, '从断点恢复', '--resume / --restart',
            fc='#FDEBD0', ec='#D35400', fs=8)

    # check sub use cases
    draw_uc(ax, 13.0,  4.5, 3.2, 0.85, '扫描合约注解', '@Arkheion-* annotations',
            fc='#FEF9E7', ec='#D4AC0D', fs=8)
    draw_uc(ax, 13.0,  3.5, 3.2, 0.85, '检测 ID 冲突', 'fatal — stops assembly',
            fc='#FDEDEC', ec='#C0392B', fs=8)
    draw_uc(ax, 13.0,  2.5, 3.2, 0.85, '检测 Pod 环', 'warn — auto afterMount',
            fc='#FEF9E7', ec='#D4AC0D', fs=8)
    draw_uc(ax, 13.0,  1.5, 3.2, 0.85, '检测函数调用环', 'error — skip affected links',
            fc='#FDEDEC', ec='#C0392B', fs=8)

    # Associations
    assoc(ax, 1.4, 8.3, 5.0, 12.0)
    assoc(ax, 1.4, 8.3, 5.0,  4.5)
    assoc(ax, 18.2, 9.8, 16.2, 10.0)
    assoc(ax, 18.2, 6.3, 16.2, 11.0)

    # auto includes
    inc(ax, 8.2, 12.0, 11.4, 13.0)
    inc(ax, 8.2, 12.0, 11.4, 12.0)
    inc(ax, 8.2, 12.0, 11.4, 11.0)
    inc(ax, 8.2, 12.0, 11.4, 10.0)
    inc(ax, 8.2, 12.0, 11.4,  9.0)
    inc(ax, 8.2, 12.0, 11.4,  8.0)
    inc(ax, 8.2, 12.0, 11.4,  7.0)
    ext(ax, 8.2, 12.0, 11.4,  6.0)
    ext(ax, 8.2, 12.0, 11.4,  5.0)

    # check includes
    inc(ax, 8.2,  4.5, 11.4,  4.5)
    inc(ax, 8.2,  4.5, 11.4,  3.5)
    inc(ax, 8.2,  4.5, 11.4,  2.5)
    inc(ax, 8.2,  4.5, 11.4,  1.5)

    add_legend(ax, 3.3, 2.5)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(OUT + 'usecase_part4_auto.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print('Part 4 saved')

# ─── Part 5: MultiSig Wallet Governance ──────────────────────────────────────

def part5():
    fig, ax = plt.subplots(figsize=(18, 12))
    ax.set_xlim(0, 18); ax.set_ylim(0, 12); ax.axis('off')
    fig.patch.set_facecolor('white')
    add_title(fig, 'Arkheion CLI — 用例图 Part 5: 多签钱包治理',
              'Use Case Diagram · MultiSig Wallet Governance Subsystem')

    draw_boundary(ax, 3.0, 0.8, 11.5, 10.2, 'Arkheion CLI 多签钱包治理子系统')

    draw_actor(ax, 1.4, 6.0, '多签成员\nMultiSig Owner', '#6E2F8A')
    draw_actor(ax, 16.2, 6.0, '区块链网络\nBlockchain', '#117A65')

    # Use cases
    draw_uc(ax, 6.5, 10.5, 3.2, 0.9, '提交多签交易', 'wallet submit',
            fc='#F5EEF8', ec='#6E2F8A')
    draw_uc(ax, 6.5,  9.2, 3.2, 0.9, '确认多签交易', 'wallet confirm',
            fc='#F5EEF8', ec='#6E2F8A')
    draw_uc(ax, 6.5,  7.9, 3.2, 0.9, '执行多签交易', 'wallet execute',
            fc='#F5EEF8', ec='#6E2F8A')
    draw_uc(ax, 6.5,  6.6, 3.2, 0.9, '撤销确认', 'wallet revoke',
            fc='#F5EEF8', ec='#6E2F8A')
    draw_uc(ax, 6.5,  5.3, 3.2, 0.9, '列举交易', 'wallet list [--pending]',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5,  4.0, 3.2, 0.9, '查看交易详情', 'wallet info <txIndex>',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5,  2.7, 3.2, 0.9, '查看所有者与阈值', 'wallet owners',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5,  1.4, 3.2, 0.9, '提议治理变更',
            'add-owner|remove-owner|change-threshold',
            fc='#FDEDEC', ec='#C0392B')

    # Sub use cases for propose
    draw_uc(ax, 12.0, 2.5, 3.2, 0.9, '提议添加所有者', 'propose add-owner',
            fc='#F5EEF8', ec='#6E2F8A', fs=8)
    draw_uc(ax, 12.0, 1.5, 3.2, 0.9, '提议移除所有者', 'propose remove-owner',
            fc='#F5EEF8', ec='#6E2F8A', fs=8)
    draw_uc(ax, 12.0, 0.5, 3.2, 0.9, '提议修改阈值', 'propose change-threshold',
            fc='#F5EEF8', ec='#6E2F8A', fs=8)

    # Associations
    for cy in [10.5, 9.2, 7.9, 6.6, 5.3, 4.0, 2.7, 1.4]:
        assoc(ax, 1.4, 6.8, 5.0, cy)
    assoc(ax, 16.2, 6.8, 14.5, 7.9)

    # propose includes submit
    inc(ax, 8.1, 1.4, 10.4, 2.5, dy=0.15)
    inc(ax, 8.1, 1.4, 10.4, 1.5, dy=0.15)
    inc(ax, 8.1, 1.4, 10.4, 0.5, dy=0.15)

    # propose sub-cases include submit
    inc(ax, 13.6, 2.5, 8.1, 10.5, dy=0.15, rad=-0.3)
    inc(ax, 13.6, 1.5, 8.1, 10.5, dy=0.15, rad=-0.3)
    inc(ax, 13.6, 0.5, 8.1, 10.5, dy=0.15, rad=-0.3)

    add_legend(ax, 3.3, 2.0)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(OUT + 'usecase_part5_wallet.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print('Part 5 saved')

# ─── Part 6: Operator & Rights Management ────────────────────────────────────

def part6():
    fig, ax = plt.subplots(figsize=(18, 10))
    ax.set_xlim(0, 18); ax.set_ylim(0, 10); ax.axis('off')
    fig.patch.set_facecolor('white')
    add_title(fig, 'Arkheion CLI — 用例图 Part 6: Operator 与权限管理',
              'Use Case Diagram · Operator & Rights Management Subsystem')

    draw_boundary(ax, 3.0, 0.8, 11.5, 8.2, 'Arkheion CLI Operator 与权限管理子系统')

    draw_actor(ax, 1.4, 5.0, '开发者\nDeveloper', '#1A5276')
    draw_actor(ax, 16.2, 5.0, '区块链网络\nBlockchain', '#117A65')

    # Operator management
    draw_uc(ax, 6.5, 8.2, 3.2, 0.9, '列举 Operator', 'cluster operator list',
            fc='#EBF5FB', ec='#2980B9')
    draw_uc(ax, 6.5, 7.0, 3.2, 0.9, '添加 Operator', 'cluster operator add',
            fc='#D5F5E3', ec='#1E8449')
    draw_uc(ax, 6.5, 5.8, 3.2, 0.9, '移除 Operator', 'cluster operator remove',
            fc='#FDEDEC', ec='#C0392B')

    # Rights management
    draw_uc(ax, 6.5, 4.3, 3.2, 0.9, '设置 ABI 函数权限',
            'normal right set <abiId> <maxRight>',
            fc='#D5F5E3', ec='#1E8449')
    draw_uc(ax, 6.5, 3.1, 3.2, 0.9, '移除 ABI 函数权限',
            'normal right remove <abiId>',
            fc='#FDEDEC', ec='#C0392B')
    draw_uc(ax, 6.5, 1.9, 3.2, 0.9, '查询合约模块',
            'normal get modules active|passive',
            fc='#EBF5FB', ec='#2980B9')

    # Shared sub: ClusterManager call
    draw_uc(ax, 12.5, 5.0, 3.2, 0.9, '通过 ClusterManager\n执行链上操作',
            'via MultiSig flow',
            fc='#D5F5E3', ec='#117A65', fs=8)

    # Associations
    for cy in [8.2, 7.0, 5.8, 4.3, 3.1, 1.9]:
        assoc(ax, 1.4, 5.8, 5.0, cy)
    assoc(ax, 16.2, 5.8, 14.1, 5.0)

    # include ClusterManager call
    for cy in [7.0, 5.8, 4.3, 3.1]:
        inc(ax, 8.1, cy, 10.9, 5.0)

    add_legend(ax, 3.3, 2.2)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(OUT + 'usecase_part6_operator.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print('Part 6 saved')

part3()
part4()
part5()
part6()
