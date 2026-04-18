/* =============================================================================
   Smart Serverless Pipeline — Chart Engine
   =============================================================================
   Lightweight Canvas-based chart rendering with smooth animations.
   No external dependencies — pure vanilla JS.
   ============================================================================= */

class ChartEngine {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.options = {
      padding: { top: 30, right: 20, bottom: 40, left: 50 },
      gridLines: 5,
      animationDuration: 800,
      fontSize: 11,
      fontFamily: "'Inter', sans-serif",
      colors: {
        grid: 'rgba(255, 255, 255, 0.06)',
        axis: 'rgba(255, 255, 255, 0.15)',
        text: '#64748b',
        tooltip: 'rgba(17, 24, 39, 0.95)',
      },
      ...options,
    };

    this.animationProgress = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = parent.clientWidth * dpr;
    this.canvas.height = parent.clientHeight * dpr;
    this.canvas.style.width = parent.clientWidth + 'px';
    this.canvas.style.height = parent.clientHeight + 'px';
    this.ctx.scale(dpr, dpr);
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;

    if (this._lastDrawFn) {
      this._lastDrawFn();
    }
  }

  get chartArea() {
    const p = this.options.padding;
    return {
      x: p.left,
      y: p.top,
      width: this.width - p.left - p.right,
      height: this.height - p.top - p.bottom,
    };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  drawGrid(maxValue, formatFn = (v) => v) {
    const { ctx } = this;
    const area = this.chartArea;
    const { gridLines, colors, fontSize, fontFamily } = this.options;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= gridLines; i++) {
      const y = area.y + area.height - (i / gridLines) * area.height;
      const value = (i / gridLines) * maxValue;

      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillText(formatFn(Math.round(value)), area.x - 8, y);
    }
  }

  drawXLabels(labels) {
    const { ctx } = this;
    const area = this.chartArea;
    const { fontSize, fontFamily, colors } = this.options;

    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const step = Math.max(1, Math.floor(labels.length / 8));
    labels.forEach((label, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const x = area.x + (i / (labels.length - 1)) * area.width;
      ctx.fillText(label, x, area.y + area.height + 10);
    });
  }

  animate(drawFn, duration = this.options.animationDuration) {
    this._lastDrawFn = drawFn;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      this.animationProgress = Math.min(1, elapsed / duration);
      // Ease out cubic
      this.animationProgress = 1 - Math.pow(1 - this.animationProgress, 3);

      this.clear();
      drawFn(this.animationProgress);

      if (elapsed < duration) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }
}

// ── Line Chart ────────────────────────────────────────────────────────────────

function drawLineChart(canvasId, data) {
  const chart = new ChartEngine(canvasId);
  if (!chart.canvas) return;

  const { labels, datasets } = data;
  const allValues = datasets.flatMap((d) => d.data);
  const maxValue = Math.max(...allValues) * 1.2 || 10;

  const draw = (progress) => {
    const area = chart.chartArea;
    const { ctx } = chart;

    chart.drawGrid(maxValue);
    chart.drawXLabels(labels);

    datasets.forEach((dataset) => {
      const points = dataset.data.map((val, i) => ({
        x: area.x + (i / (labels.length - 1)) * area.width,
        y: area.y + area.height - (val / maxValue) * area.height * progress,
      }));

      // Draw gradient fill
      if (dataset.fill !== false) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, area.y + area.height);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, area.y + area.height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, area.y, 0, area.y + area.height);
        gradient.addColorStop(0, dataset.color + '30');
        gradient.addColorStop(1, dataset.color + '00');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = dataset.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Smooth curve using bezier
      points.forEach((point, i) => {
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          const prev = points[i - 1];
          const cpx = (prev.x + point.x) / 2;
          ctx.bezierCurveTo(cpx, prev.y, cpx, point.y, point.x, point.y);
        }
      });
      ctx.stroke();

      // Draw dots
      points.forEach((point, i) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = dataset.color;
        ctx.fill();
        ctx.strokeStyle = '#0a0e17';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw legend label
      if (dataset.label) {
        ctx.font = `500 11px 'Inter', sans-serif`;
        ctx.fillStyle = dataset.color;
        ctx.textAlign = 'left';
      }
    });

    // Draw legend
    let legendX = area.x;
    const legendY = 12;
    datasets.forEach((dataset) => {
      ctx.beginPath();
      ctx.arc(legendX + 5, legendY, 4, 0, Math.PI * 2);
      ctx.fillStyle = dataset.color;
      ctx.fill();

      ctx.font = `500 11px 'Inter', sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(dataset.label, legendX + 14, legendY + 4);
      legendX += ctx.measureText(dataset.label).width + 30;
    });
  };

  chart.animate(draw);
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function drawBarChart(canvasId, data) {
  const chart = new ChartEngine(canvasId);
  if (!chart.canvas) return;

  const { labels, datasets } = data;
  const allValues = datasets.flatMap((d) => d.data);
  const maxValue = Math.max(...allValues) * 1.2 || 10;

  const draw = (progress) => {
    const area = chart.chartArea;
    const { ctx } = chart;

    chart.drawGrid(maxValue);
    chart.drawXLabels(labels);

    const groupWidth = area.width / labels.length;
    const barWidth = (groupWidth * 0.6) / datasets.length;
    const groupPadding = groupWidth * 0.2;

    datasets.forEach((dataset, di) => {
      dataset.data.forEach((value, i) => {
        const barHeight = (value / maxValue) * area.height * progress;
        const x = area.x + i * groupWidth + groupPadding + di * barWidth;
        const y = area.y + area.height - barHeight;

        // Bar with rounded top
        const radius = Math.min(4, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x, y + radius);
        ctx.arcTo(x, y, x + barWidth, y, radius);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + barHeight, radius);
        ctx.lineTo(x + barWidth, area.y + area.height);
        ctx.lineTo(x, area.y + area.height);
        ctx.closePath();

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, y, 0, area.y + area.height);
        gradient.addColorStop(0, dataset.color);
        gradient.addColorStop(1, dataset.color + '60');
        ctx.fillStyle = gradient;
        ctx.fill();
      });
    });

    // Legend
    let legendX = area.x;
    const legendY = 12;
    datasets.forEach((dataset) => {
      ctx.fillStyle = dataset.color;
      ctx.fillRect(legendX, legendY - 5, 12, 10);

      ctx.font = `500 11px 'Inter', sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(dataset.label, legendX + 16, legendY + 4);
      legendX += ctx.measureText(dataset.label).width + 30;
    });
  };

  chart.animate(draw);
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function drawDonutChart(canvasId, data) {
  const chart = new ChartEngine(canvasId, { padding: { top: 20, right: 20, bottom: 20, left: 20 } });
  if (!chart.canvas) return;

  const { labels, values, colors } = data;
  const total = values.reduce((s, v) => s + v, 0);

  const draw = (progress) => {
    const { ctx } = chart;
    const centerX = chart.width / 2;
    const centerY = chart.height / 2;
    const radius = Math.min(centerX, centerY) - 40;
    const innerRadius = radius * 0.62;

    let startAngle = -Math.PI / 2;

    values.forEach((value, i) => {
      const sliceAngle = (value / total) * Math.PI * 2 * progress;
      const endAngle = startAngle + sliceAngle;

      // Draw slice
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();

      // Draw slight gap between slices
      ctx.strokeStyle = '#0a0e17';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle = endAngle;
    });

    // Center text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `800 1.5rem 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toLocaleString(), centerX, centerY - 8);

    ctx.fillStyle = '#64748b';
    ctx.font = `500 0.7rem 'Inter', sans-serif`;
    ctx.fillText('Total Files', centerX, centerY + 14);

    // Legend (right side)
    const legendX = centerX + radius + 20;
    if (legendX + 100 < chart.width) {
      labels.forEach((label, i) => {
        const ly = centerY - (labels.length * 24) / 2 + i * 24;

        ctx.beginPath();
        ctx.arc(legendX, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = `500 12px 'Inter', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${label} (${values[i]})`, legendX + 12, ly);
      });
    } else {
      // Compact legend below for small screens
      let lx = 10;
      const ly = chart.height - 10;
      labels.forEach((label, i) => {
        ctx.beginPath();
        ctx.arc(lx + 5, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = `500 10px 'Inter', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${label}`, lx + 12, ly);
        lx += ctx.measureText(label).width + 28;
      });
    }
  };

  chart.animate(draw);
}

// ── Stacked Bar Chart ─────────────────────────────────────────────────────────

function drawStackedBarChart(canvasId, data) {
  const chart = new ChartEngine(canvasId);
  if (!chart.canvas) return;

  const { labels, datasets } = data;
  const maxValue = labels.map((_, i) =>
    datasets.reduce((sum, ds) => sum + ds.data[i], 0)
  ).reduce((a, b) => Math.max(a, b), 0) * 1.2 || 10;

  const draw = (progress) => {
    const area = chart.chartArea;
    const { ctx } = chart;

    chart.drawGrid(maxValue);
    chart.drawXLabels(labels);

    const barWidth = (area.width / labels.length) * 0.5;
    const barPadding = (area.width / labels.length) * 0.25;

    labels.forEach((_, i) => {
      let yOffset = 0;
      datasets.forEach((dataset) => {
        const value = dataset.data[i];
        const barHeight = (value / maxValue) * area.height * progress;
        const x = area.x + i * (barWidth + barPadding * 2) + barPadding;
        const y = area.y + area.height - yOffset - barHeight;

        const radius = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + radius);
        ctx.arcTo(x, y, x + barWidth, y, radius);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + barHeight, radius);
        ctx.lineTo(x + barWidth, y + barHeight);
        ctx.lineTo(x, y + barHeight);
        ctx.closePath();
        ctx.fillStyle = dataset.color;
        ctx.fill();

        yOffset += barHeight;
      });
    });

    // Legend
    let legendX = area.x;
    datasets.forEach((dataset) => {
      chart.ctx.beginPath();
      chart.ctx.arc(legendX + 5, 12, 4, 0, Math.PI * 2);
      chart.ctx.fillStyle = dataset.color;
      chart.ctx.fill();

      chart.ctx.font = `500 11px 'Inter', sans-serif`;
      chart.ctx.fillStyle = '#94a3b8';
      chart.ctx.textAlign = 'left';
      chart.ctx.fillText(dataset.label, legendX + 14, 16);
      legendX += chart.ctx.measureText(dataset.label).width + 30;
    });
  };

  chart.animate(draw);
}
