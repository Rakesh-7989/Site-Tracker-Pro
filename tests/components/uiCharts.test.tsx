// SiteTrack Pro — Option 4 / Phase 5: Charts.tsx (dependency-free SVG charts).
// Pure geometry helpers + component smoke: BarChart, PieChart, LineChart,
// ChartLegend replace the former single-consumer recharts integration.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  BarChart,
  BarGroup,
  ChartLegend,
  PieChart,
  LineChart,
  chartMax,
  chartAriaLabel,
  barGroupMax,
  barGroupAriaLabel,
  datumColor,
  pieSegments,
  linePoints,
  linePath,
  areaPath,
  type BarGroupSeries,
} from "@/components/ui/Charts";

const DATA = [
  { label: "active", value: 4 },
  { label: "completed", value: 2 },
  { label: "on hold", value: 1 },
];

describe("Charts — pure helpers", () => {
  it("chartMax floors at 1 for zero/empty data", () => {
    expect(chartMax(DATA)).toBe(4);
    expect(chartMax([])).toBe(1);
    expect(chartMax([{ label: "a", value: 0 }])).toBe(1);
  });

  it("chartAriaLabel joins label:value pairs", () => {
    expect(chartAriaLabel(DATA)).toBe("active: 4, completed: 2, on hold: 1");
  });

  it("datumColor prefers explicit color else palette by index", () => {
    expect(datumColor({ label: "a", value: 1, color: "#fff" }, 0)).toBe("#fff");
    expect(datumColor(DATA[0], 0)).toBe("var(--st-success)");
    expect(datumColor(DATA[0], 1)).toBe("var(--st-warning)");
    // palette wraps: index 6 → success
    expect(datumColor(DATA[0], 6)).toBe("var(--st-success)");
  });

  it("pieSegments computes fractions, dash/offset geometry and sums to full circumference", () => {
    const segs = pieSegments(DATA, 40);
    expect(segs).toHaveLength(3);
    const C = 2 * Math.PI * 40;
    const dashTotal = segs.reduce((s, x) => s + x.dash, 0);
    expect(dashTotal).toBeCloseTo(C);
    const fracTotal = segs.reduce((s, x) => s + x.fraction, 0);
    expect(fracTotal).toBeCloseTo(1);
    // first segment starts at top (offset 0), later segments cascade
    expect(segs[0].offset).toBe(0);
    expect(segs[1].offset).toBeCloseTo(segs[0].dash);
    expect(segs[1].gap).toBeCloseTo(C);
  });

  it("pieSegments returns [] for zero/empty total", () => {
    expect(pieSegments([], 40)).toEqual([]);
    expect(pieSegments([{ label: "a", value: 0 }], 40)).toEqual([]);
  });

  it("linePoints yields normalized x across and y inverted by value", () => {
    const pts = linePoints([{ label: "a", value: 0 }, { label: "b", value: 10 }]);
    expect(pts[0].x).toBeCloseTo(6);
    expect(pts[1].x).toBeCloseTo(94);
    expect(pts[0].y).toBeGreaterThan(pts[1].y);
    // single row centers horizontally
    expect(linePoints([{ label: "a", value: 5 }])[0].x).toBeCloseTo(50);
  });

  it("linePath/areaPath build expected SVG path strings", () => {
    const pts = [
      { x: 6, y: 90 },
      { x: 94, y: 10 },
    ];
    expect(linePath(pts)).toBe("M6 90 L94 10");
    expect(areaPath(pts)).toBe("M6 90 L94 10 L94 100 L6 100 Z");
    expect(areaPath([])).toBe("");
  });
});

describe("BarChart", () => {
  it("renders a bar per datum with proportional heights + labels", () => {
    const { container } = render(<BarChart data={DATA} />);
    const bars = container.querySelectorAll("[title]");
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute("title")).toBe("active: 4");
    // tallest bar is 100%, shortest ~25%
    expect((bars[0] as HTMLElement).style.height).toBe("100%");
    expect((bars[2] as HTMLElement).style.height).toBe("25%");
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("on hold")).toBeInTheDocument();
  });

  it("hides value labels unless showValues", () => {
    const { container, rerender } = render(<BarChart data={DATA} />);
    expect(container.querySelectorAll("span.absolute")).toHaveLength(0);
    rerender(<BarChart data={DATA} showValues />);
    expect(container.querySelectorAll("span.absolute")).toHaveLength(3);
  });

  it("uses the `color` prop as default bar fill (jsdom normalizes hex to rgb)", () => {
    const { container } = render(<BarChart data={DATA} color="#123456" />);
    expect(container.querySelector("[title]")?.getAttribute("style")).toContain("rgb(18, 52, 86)");
  });

  it("applies formatValue to value labels, tooltips and the aria summary", () => {
    const fmt = (v: number) => `₹${v}k`;
    const { container } = render(<BarChart data={[{ label: "a", value: 4 }]} showValues formatValue={fmt} />);
    // value label
    expect(screen.getByText("₹4k")).toBeInTheDocument();
    // tooltip
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe("a: ₹4k");
    // aria summary
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("a: ₹4k");
  });

  it("falls back to raw values when formatValue is omitted", () => {
    const { container } = render(<BarChart data={DATA} />);
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Bar chart: active: 4, completed: 2, on hold: 1",
    );
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe("active: 4");
  });

  it("exposes a bar-chart aria-label on a role=img element", () => {
    render(<BarChart data={DATA} />);
    expect(screen.getByRole("img", { name: "Bar chart: active: 4, completed: 2, on hold: 1" })).toBeInTheDocument();
  });
});

describe("BarGroup", () => {
  const GROUPS = ["Design Hub", "Villa"];
  const SERIES: BarGroupSeries[] = [
    { name: "Fee", values: [500000, 900000] },
    { name: "Billed", color: "var(--st-accent)", values: [300000, 800000] },
  ];

  it("barGroupMax floors at 1 and scans every series", () => {
    expect(barGroupMax(GROUPS, SERIES)).toBe(900000);
    expect(barGroupMax([], [])).toBe(1);
    expect(barGroupMax(["a"], [{ name: "s", values: [0] }])).toBe(1);
  });

  it("barGroupAriaLabel joins group/series pairs", () => {
    expect(barGroupAriaLabel(GROUPS, SERIES)).toBe(
      "Design Hub: Fee 500000, Design Hub: Billed 300000, Villa: Fee 900000, Villa: Billed 800000",
    );
  });

  it("renders paired bars per group with palette fallback + default colors", () => {
    const { container } = render(<BarGroup groups={GROUPS} series={SERIES} />);
    const bars = container.querySelectorAll("[title]");
    expect(bars).toHaveLength(4);
    // explicit accent color used; fee series falls back to palette[0]
    const owns = (el: Element, sub: string) => (el.getAttribute("style") ?? "").includes(sub);
    expect([...bars].filter(el => owns(el, "var(--st-accent)"))).toHaveLength(2);
    expect([...bars].filter(el => owns(el, "var(--st-success)"))).toHaveLength(2);
    // tallest bar (900000) is 100%, the 300000 bar is ~33%
    const [, b2, b3] = Array.from(bars);
    expect((b3 as HTMLElement).style.height).toBe("100%");
    expect(parseFloat((b2 as HTMLElement).style.height)).toBeCloseTo(33.33, 1);
    // x-axis group labels render
    expect(screen.getByText("Design Hub")).toBeInTheDocument();
    expect(screen.getByText("Villa")).toBeInTheDocument();
  });

  it("hides value labels unless showValues", () => {
    const { container, rerender } = render(<BarGroup groups={GROUPS} series={SERIES} />);
    expect(container.querySelectorAll("span.absolute")).toHaveLength(0);
    rerender(<BarGroup groups={GROUPS} series={SERIES} showValues />);
    // fee labels for 500000, 900000 + billed labels for 300000, 800000 (zero-valued skipped)
    expect(container.querySelectorAll("span.absolute")).toHaveLength(4);
  });

  it("applies formatValue to value labels, tooltips and the aria summary", () => {
    const fmt = (v: number) => `₹${v}k`;
    const { container } = render(<BarGroup groups={["a"]} series={[{ name: "Fee", values: [4] }]} showValues formatValue={fmt} />);
    expect(screen.getByText("₹4k")).toBeInTheDocument();
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe("a · Fee: ₹4k");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("a: Fee ₹4k");
  });

  it("exposes a grouped-bar aria-label on a role=img element", () => {
    render(<BarGroup groups={GROUPS} series={SERIES} />);
    expect(screen.getByRole("img", { name: "Grouped bar chart: Design Hub: Fee 500000, Design Hub: Billed 300000, Villa: Fee 900000, Villa: Billed 800000" })).toBeInTheDocument();
  });
});

describe("PieChart", () => {
  it("renders a stroke-circle per nonzero segment with design-system colors", () => {
    const { container } = render(<PieChart data={DATA} />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(3);
    expect(circles[0].getAttribute("stroke")).toBe("var(--st-success)");
    expect(circles[1].getAttribute("stroke")).toBe("var(--st-warning)");
    expect(circles[0].getAttribute("stroke-dashoffset")).toBe("0");
    expect(circles[1].getAttribute("stroke-dashoffset")).not.toBe("0");
  });

  it("shows a single track ring when the total is zero", () => {
    const { container } = render(<PieChart data={[{ label: "a", value: 0 }]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("renders the center label", () => {
    render(<PieChart data={DATA} centerLabel="7" />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("exposes a pie-chart aria-label", () => {
    render(<PieChart data={DATA} />);
    expect(screen.getByRole("img", { name: "Pie chart: active: 4, completed: 2, on hold: 1" })).toBeInTheDocument();
  });
});

describe("LineChart", () => {
  it("renders the line path and (by default) an area fill", () => {
    const { container } = render(<LineChart data={DATA} />);
    expect(container.querySelector("path[fill-opacity]")).toBeTruthy();
    expect(container.querySelector("path[stroke]")).toBeTruthy();
  });

  it("omits the area when area=false", () => {
    const { container } = render(<LineChart data={DATA} area={false} />);
    expect(container.querySelector("path[fill-opacity]")).toBeNull();
    expect(container.querySelector("path[stroke]")).toBeTruthy();
  });

  it("renders point dots when showPoints, not otherwise", () => {
    const { container, rerender } = render(<LineChart data={DATA} />);
    expect(container.querySelectorAll("span[title]")).toHaveLength(0);
    rerender(<LineChart data={DATA} showPoints />);
    expect(container.querySelectorAll("span[title]")).toHaveLength(3);
  });
});

describe("ChartLegend", () => {
  it("renders swatch + label (count) per datum", () => {
    render(<ChartLegend data={DATA} />);
    expect(screen.getByText("active (4)")).toBeInTheDocument();
    expect(screen.getByText("completed (2)")).toBeInTheDocument();
    const swatches = document.querySelectorAll(".w-2.h-2");
    expect(swatches).toHaveLength(3);
    expect((swatches[0] as HTMLElement).style.backgroundColor).toBe("var(--st-success)");
  });
});