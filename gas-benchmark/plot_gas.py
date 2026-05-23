#!/usr/bin/env python3
"""
Gas comparison chart: Arkheion vs Diamond (EIP-2535)
Reads gas_results.json and produces gas_comparison.png
"""

import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ── load data ────────────────────────────────────────────────────────────────

BASE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASE, "gas_results.json")) as f:
    R = json.load(f)

# ── scenario definitions ─────────────────────────────────────────────────────

# Split into two groups for two sub-plots:
#   (A) per-call gas  — small numbers, Arkheion wins
#   (B) lifecycle gas — large numbers, mixed

call_scenarios = [
    ("Read\n(getReserves)",  R["read_arkheion"],  R["read_diamond"]),
    ("Write\n(addPair)",     R["write_arkheion"], R["write_diamond"]),
    ("Swap\n(cross-module)", R["swap_arkheion"],  R["swap_diamond"]),
]

lifecycle_scenarios = [
    ("Deployment\n(full system)", R["deploy_arkheion"],      R["deploy_diamond"]),
    ("Upgrade\n(replace module)", R["upgrade_arkheion"],     R["upgrade_diamond"]),
    ("Add\nnew module",           R["add_module_arkheion"],  R["add_module_diamond"]),
]

# ── colours ──────────────────────────────────────────────────────────────────

ARK_COLOR = "#2563EB"   # blue
DIA_COLOR = "#DC2626"   # red
ARK_LIGHT = "#93C5FD"
DIA_LIGHT = "#FCA5A5"

# ── figure layout ────────────────────────────────────────────────────────────

fig = plt.figure(figsize=(16, 10))
fig.patch.set_facecolor("#0F172A")

title_ax = fig.add_axes([0, 0.92, 1, 0.08])
title_ax.axis("off")
title_ax.text(0.5, 0.5,
    "Arkheion vs Diamond (EIP-2535) — Gas Cost Comparison",
    ha="center", va="center", fontsize=18, fontweight="bold",
    color="white", transform=title_ax.transAxes)

ax1 = fig.add_axes([0.05, 0.52, 0.42, 0.36])   # per-call (top-left)
ax2 = fig.add_axes([0.55, 0.52, 0.42, 0.36])   # lifecycle (top-right)
ax3 = fig.add_axes([0.05, 0.06, 0.90, 0.36])   # delta bar (bottom)

for ax in [ax1, ax2, ax3]:
    ax.set_facecolor("#1E293B")
    ax.tick_params(colors="white")
    ax.spines[:].set_color("#334155")
    for label in ax.get_xticklabels() + ax.get_yticklabels():
        label.set_color("white")

# ── helper: grouped bar ───────────────────────────────────────────────────────

def grouped_bar(ax, scenarios, title, ylabel="Gas used"):
    labels = [s[0] for s in scenarios]
    ark    = [s[1] for s in scenarios]
    dia    = [s[2] for s in scenarios]
    x      = np.arange(len(labels))
    w      = 0.35

    bars_a = ax.bar(x - w/2, ark, w, color=ARK_COLOR, label="Arkheion", zorder=3)
    bars_d = ax.bar(x + w/2, dia, w, color=DIA_COLOR, label="Diamond",  zorder=3)

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9, color="white")
    ax.set_ylabel(ylabel, color="#94A3B8", fontsize=9)
    ax.set_title(title, color="white", fontsize=11, fontweight="bold", pad=8)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v):,}"))
    ax.grid(axis="y", color="#334155", linewidth=0.5, zorder=0)
    ax.set_axisbelow(True)

    # value labels
    for bar in bars_a:
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2, h * 1.02,
                f"{int(h):,}", ha="center", va="bottom", fontsize=7.5,
                color=ARK_LIGHT, fontweight="bold")
    for bar in bars_d:
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2, h * 1.02,
                f"{int(h):,}", ha="center", va="bottom", fontsize=7.5,
                color=DIA_LIGHT, fontweight="bold")

    ax.legend(handles=[
        mpatches.Patch(color=ARK_COLOR, label="Arkheion"),
        mpatches.Patch(color=DIA_COLOR, label="Diamond"),
    ], facecolor="#1E293B", edgecolor="#334155", labelcolor="white", fontsize=8)

grouped_bar(ax1, call_scenarios,
            "Per-Call Gas Cost\n(lower = better)",
            ylabel="Gas units")

grouped_bar(ax2, lifecycle_scenarios,
            "Lifecycle Gas Cost\n(lower = better)",
            ylabel="Gas units")

# ── delta bar (bottom) ────────────────────────────────────────────────────────

all_scenarios = [
    ("Read\n(getReserves)",   R["read_arkheion"],       R["read_diamond"]),
    ("Write\n(addPair)",      R["write_arkheion"],      R["write_diamond"]),
    ("Swap\n(cross-module)",  R["swap_arkheion"],       R["swap_diamond"]),
    ("Deployment",            R["deploy_arkheion"],     R["deploy_diamond"]),
    ("Upgrade",               R["upgrade_arkheion"],    R["upgrade_diamond"]),
    ("Add module",            R["add_module_arkheion"], R["add_module_diamond"]),
]

labels  = [s[0] for s in all_scenarios]
deltas  = [s[2] - s[1] for s in all_scenarios]   # Diamond - Arkheion
colors  = [ARK_COLOR if d > 0 else DIA_COLOR for d in deltas]
x       = np.arange(len(labels))

bars = ax3.bar(x, deltas, color=colors, zorder=3, width=0.5)
ax3.axhline(0, color="#94A3B8", linewidth=1, zorder=4)
ax3.set_xticks(x)
ax3.set_xticklabels(labels, fontsize=9, color="white")
ax3.set_ylabel("Gas saved by Arkheion →\n← Gas saved by Diamond", color="#94A3B8", fontsize=8)
ax3.set_title("Gas Delta (Diamond − Arkheion)  |  Blue = Arkheion cheaper  |  Red = Diamond cheaper",
              color="white", fontsize=10, fontweight="bold", pad=8)
ax3.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v):,}"))
ax3.grid(axis="y", color="#334155", linewidth=0.5, zorder=0)
ax3.set_axisbelow(True)

for bar, d in zip(bars, deltas):
    va  = "bottom" if d >= 0 else "top"
    off = max(abs(d) * 0.02, 500)
    ax3.text(bar.get_x() + bar.get_width()/2,
             d + (off if d >= 0 else -off),
             f"{int(d):+,}", ha="center", va=va,
             fontsize=8, color="white", fontweight="bold")

# ── save ─────────────────────────────────────────────────────────────────────

out = os.path.join(BASE, "gas_comparison.png")
plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
print(f"Chart saved → {out}")
