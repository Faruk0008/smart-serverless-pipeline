/* =============================================================================
   Smart Serverless Pipeline — Dashboard Application
   =============================================================================
   Main application logic: navigation, mock data, data rendering, file upload
   simulation, and real-time status updates.
   ============================================================================= */

// ── Mock Data Generator ──────────────────────────────────────────────────────

const MockData = {
  // Generate realistic processing history
  generateHistory(count = 50) {
    const pipelines = [
      { type: 'log_analysis', prefix: 'logs/', extensions: ['.log', '.txt'], icon: '📝' },
      { type: 'image_resize', prefix: 'images/', extensions: ['.jpg', '.png', '.gif'], icon: '🖼️' },
      { type: 'data_validation', prefix: 'data/', extensions: ['.csv', '.json'], icon: '📊' },
    ];

    const statuses = ['success', 'success', 'success', 'success', 'warning', 'error'];
    const fileNames = {
      log_analysis: ['app-server', 'auth-service', 'api-gateway', 'worker-node', 'scheduler', 'db-proxy', 'cache-layer'],
      image_resize: ['profile-photo', 'product-banner', 'hero-image', 'team-avatar', 'upload-screenshot', 'logo-brand'],
      data_validation: ['users-export', 'transactions-q1', 'inventory-sync', 'survey-responses', 'analytics-dump'],
    };

    const now = Date.now();

    return Array.from({ length: count }, (_, i) => {
      const pipeline = pipelines[Math.floor(Math.random() * pipelines.length)];
      const ext = pipeline.extensions[Math.floor(Math.random() * pipeline.extensions.length)];
      const names = fileNames[pipeline.type];
      const fileName = names[Math.floor(Math.random() * names.length)] + ext;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const timestamp = new Date(now - i * 1000 * 60 * Math.floor(Math.random() * 30 + 5));
      const duration = Math.floor(Math.random() * 2000 + 100);
      const fileSize = Math.floor(Math.random() * 5000 + 50);

      let details = {};
      if (pipeline.type === 'log_analysis') {
        details = {
          totalLines: Math.floor(Math.random() * 10000 + 500),
          errors: Math.floor(Math.random() * 50),
          warnings: Math.floor(Math.random() * 100),
          errorRate: (Math.random() * 15).toFixed(2) + '%',
        };
      } else if (pipeline.type === 'image_resize') {
        details = {
          originalSize: fileSize + 'KB',
          variants: 3,
          compressionRatio: (Math.random() * 60 + 20).toFixed(1) + '%',
        };
      } else {
        details = {
          totalRecords: Math.floor(Math.random() * 5000 + 100),
          validRecords: Math.floor(Math.random() * 4500 + 100),
          validationRate: (85 + Math.random() * 15).toFixed(1) + '%',
        };
      }

      return {
        id: `proc-${String(count - i).padStart(4, '0')}`,
        file: pipeline.prefix + fileName,
        fileName,
        pipelineType: pipeline.type,
        pipelineIcon: pipeline.icon,
        status,
        duration,
        durationFormatted: duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`,
        fileSize,
        timestamp: timestamp.toISOString(),
        timestampFormatted: formatTimeAgo(timestamp),
        details,
      };
    });
  },

  // Generate time-series data for charts
  generateTimeSeries(hours = 24) {
    const labels = [];
    const now = new Date();

    for (let i = hours; i >= 0; i--) {
      const t = new Date(now - i * 3600000);
      labels.push(t.getHours().toString().padStart(2, '0') + ':00');
    }

    return {
      labels,
      logAnalyzer: labels.map(() => Math.floor(Math.random() * 30 + 5)),
      imageResizer: labels.map(() => Math.floor(Math.random() * 20 + 3)),
      dataValidator: labels.map(() => Math.floor(Math.random() * 25 + 4)),
    };
  },

  // Generate alerts
  generateAlerts() {
    return [
      {
        type: 'critical',
        icon: '🔴',
        title: 'Lambda Error Rate Exceeded Threshold',
        message: 'image-resizer function reported 5 errors in the last 5 minutes. CloudWatch Alarm triggered.',
        time: '2 minutes ago',
        lambda: 'image-resizer',
      },
      {
        type: 'warning',
        icon: '🟡',
        title: 'High Memory Utilization',
        message: 'log-analyzer function using 92% of allocated memory (256MB). Consider increasing allocation.',
        time: '18 minutes ago',
        lambda: 'log-analyzer',
      },
      {
        type: 'warning',
        icon: '🟡',
        title: 'Elevated Cold Start Rate',
        message: 'data-validator function experienced 12 cold starts in the last hour (normal: 2-4).',
        time: '45 minutes ago',
        lambda: 'data-validator',
      },
      {
        type: 'info',
        icon: '🔵',
        title: 'SNS Alert Email Sent',
        message: 'Error notification sent to configured email endpoint for image-resizer errors.',
        time: '2 minutes ago',
        lambda: 'image-resizer',
      },
      {
        type: 'resolved',
        icon: '🟢',
        title: 'DynamoDB Throttling Resolved',
        message: 'Write capacity auto-scaling stabilized. No more throttled requests.',
        time: '1 hour ago',
        lambda: 'all',
      },
      {
        type: 'resolved',
        icon: '🟢',
        title: 'S3 Upload Latency Normalized',
        message: 'Upload latency returned to normal levels (<200ms p99).',
        time: '3 hours ago',
        lambda: 'all',
      },
    ];
  },

  // Aggregate stats
  computeStats(history) {
    const total = history.length;
    const successes = history.filter((h) => h.status === 'success').length;
    const errors = history.filter((h) => h.status === 'error').length;
    const avgDuration = Math.round(history.reduce((s, h) => s + h.duration, 0) / total);

    return {
      total,
      successRate: ((successes / total) * 100).toFixed(1),
      avgDuration,
      errors,
    };
  },

  // Pipeline-specific stats
  computePipelineStats(history) {
    const types = {
      log_analysis: { total: 0, errors: 0, totalDuration: 0, totalSize: 0, findings: 0 },
      image_resize: { total: 0, errors: 0, totalDuration: 0, totalSize: 0, variants: 0, compression: 0 },
      data_validation: { total: 0, errors: 0, totalDuration: 0, totalRecords: 0, validRecords: 0 },
    };

    history.forEach((h) => {
      const t = types[h.pipelineType];
      if (!t) return;
      t.total++;
      if (h.status === 'error') t.errors++;
      t.totalDuration += h.duration;
      t.totalSize += h.fileSize;

      if (h.pipelineType === 'log_analysis') {
        t.findings += h.details.errors || 0;
      } else if (h.pipelineType === 'image_resize') {
        t.variants += h.details.variants || 0;
        t.compression += parseFloat(h.details.compressionRatio) || 0;
      } else if (h.pipelineType === 'data_validation') {
        t.totalRecords += h.details.totalRecords || 0;
        t.validRecords += h.details.validRecords || 0;
      }
    });

    return types;
  },
};

// ── Utility Functions ────────────────────────────────────────────────────────

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function pipelineLabel(type) {
  const map = { log_analysis: 'Log Analysis', image_resize: 'Image Resize', data_validation: 'Data Validation' };
  return map[type] || type;
}

function pipelineClass(type) {
  const map = { log_analysis: 'log', image_resize: 'image', data_validation: 'data' };
  return map[type] || '';
}

function statusClass(status) {
  const map = { success: 'success', warning: 'warning', error: 'error' };
  return map[status] || 'info';
}

// ── Application State ────────────────────────────────────────────────────────

const App = {
  currentPage: 'dashboard',
  history: [],
  alerts: [],
  timeSeries: null,
  refreshInterval: null,
  uploadFolder: 'logs',

  init() {
    // Generate mock data
    this.history = MockData.generateHistory(60);
    this.alerts = MockData.generateAlerts();
    this.timeSeries = MockData.generateTimeSeries(24);

    // Setup navigation
    this.setupNavigation();
    this.setupUpload();
    this.setupRefresh();
    this.setupMobileMenu();
    this.setupFilters();

    // Render initial page
    this.renderDashboard();
    this.updateTimestamp();

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => this.refreshData(), 30000);
  },

  // ── Navigation ──
  setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.navigateTo(btn.dataset.page);
      });
    });

    // "View All" button on dashboard
    const viewAllBtn = document.getElementById('view-all-btn');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => this.navigateTo('history'));
    }
  },

  navigateTo(page) {
    // Update sidebar
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Update pages
    document.querySelectorAll('.page-section').forEach((el) => el.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    // Update header
    const titles = {
      dashboard: 'Dashboard',
      pipelines: 'Pipeline Status',
      architecture: 'Architecture',
      upload: 'File Upload',
      history: 'Processing History',
      alerts: 'Alerts & Monitoring',
      metrics: 'Performance Metrics',
    };
    document.getElementById('header-title').textContent = titles[page] || page;
    this.currentPage = page;

    // Render page-specific content
    switch (page) {
      case 'dashboard': this.renderDashboard(); break;
      case 'pipelines': this.renderPipelines(); break;
      case 'history': this.renderHistory(); break;
      case 'alerts': this.renderAlerts(); break;
      case 'metrics': this.renderMetrics(); break;
    }

    // Close mobile menu
    document.getElementById('sidebar').classList.remove('open');
  },

  // ── Dashboard Rendering ──
  renderDashboard() {
    const stats = MockData.computeStats(this.history);

    // Animate stat numbers
    this.animateValue('stat-total', stats.total);
    document.getElementById('stat-success').textContent = stats.successRate + '%';
    document.getElementById('stat-duration').textContent = stats.avgDuration + 'ms';
    this.animateValue('stat-errors', stats.errors);

    // Change indicators
    document.getElementById('stat-total-change').textContent = '12%';
    document.getElementById('stat-success-change').textContent = '2.3%';
    document.getElementById('stat-duration-change').textContent = '8%';
    document.getElementById('stat-errors-change').textContent = '15%';

    // Charts
    this.renderInvocationsChart();
    this.renderDistributionChart();

    // Recent activity table
    this.renderRecentActivity();
  },

  renderInvocationsChart() {
    const ts = this.timeSeries;
    drawLineChart('chart-invocations', {
      labels: ts.labels,
      datasets: [
        { label: 'Log Analyzer', data: ts.logAnalyzer, color: '#6366f1', fill: true },
        { label: 'Image Resizer', data: ts.imageResizer, color: '#a78bfa', fill: false },
        { label: 'Data Validator', data: ts.dataValidator, color: '#06b6d4', fill: false },
      ],
    });
  },

  renderDistributionChart() {
    const pipeStats = MockData.computePipelineStats(this.history);
    drawDonutChart('chart-distribution', {
      labels: ['Log Analysis', 'Image Resize', 'Data Validation'],
      values: [pipeStats.log_analysis.total, pipeStats.image_resize.total, pipeStats.data_validation.total],
      colors: ['#6366f1', '#a78bfa', '#06b6d4'],
    });
  },

  renderRecentActivity() {
    const tbody = document.getElementById('recent-activity-body');
    const recent = this.history.slice(0, 8);

    tbody.innerHTML = recent.map((item) => `
      <tr>
        <td>${item.fileName}</td>
        <td><span class="pipeline-badge ${pipelineClass(item.pipelineType)}">${item.pipelineIcon} ${pipelineLabel(item.pipelineType)}</span></td>
        <td><span class="status-badge ${statusClass(item.status)}"><span class="status-dot"></span> ${item.status}</span></td>
        <td class="text-mono">${item.durationFormatted}</td>
        <td class="text-muted">${item.timestampFormatted}</td>
      </tr>
    `).join('');
  },

  // ── Pipelines Rendering ──
  renderPipelines() {
    const stats = MockData.computePipelineStats(this.history);

    // Log analyzer
    document.getElementById('pipe-log-total').textContent = stats.log_analysis.total;
    document.getElementById('pipe-log-errors').textContent = stats.log_analysis.findings;
    document.getElementById('pipe-log-avg').textContent = stats.log_analysis.total > 0
      ? Math.round(stats.log_analysis.totalDuration / stats.log_analysis.total) + 'ms' : '0ms';
    document.getElementById('pipe-log-size').textContent = Math.round(stats.log_analysis.totalSize / 1024) + ' MB';

    // Image resizer
    document.getElementById('pipe-img-total').textContent = stats.image_resize.total;
    document.getElementById('pipe-img-saved').textContent = stats.image_resize.total > 0
      ? (stats.image_resize.compression / stats.image_resize.total).toFixed(1) + '%' : '0%';
    document.getElementById('pipe-img-avg').textContent = stats.image_resize.total > 0
      ? Math.round(stats.image_resize.totalDuration / stats.image_resize.total) + 'ms' : '0ms';
    document.getElementById('pipe-img-variants').textContent = stats.image_resize.variants;

    // Data validator
    document.getElementById('pipe-data-total').textContent = stats.data_validation.total;
    document.getElementById('pipe-data-rate').textContent = stats.data_validation.totalRecords > 0
      ? ((stats.data_validation.validRecords / stats.data_validation.totalRecords) * 100).toFixed(1) + '%' : '0%';
    document.getElementById('pipe-data-avg').textContent = stats.data_validation.total > 0
      ? Math.round(stats.data_validation.totalDuration / stats.data_validation.total) + 'ms' : '0ms';
    document.getElementById('pipe-data-records').textContent = formatNumber(stats.data_validation.totalRecords);

    // Pipeline performance chart
    const ts = this.timeSeries;
    drawBarChart('chart-pipeline-perf', {
      labels: ts.labels.filter((_, i) => i % 3 === 0),
      datasets: [
        { label: 'Log Analyzer', data: ts.logAnalyzer.filter((_, i) => i % 3 === 0), color: '#6366f1' },
        { label: 'Image Resizer', data: ts.imageResizer.filter((_, i) => i % 3 === 0), color: '#a78bfa' },
        { label: 'Data Validator', data: ts.dataValidator.filter((_, i) => i % 3 === 0), color: '#06b6d4' },
      ],
    });

    // Error rate chart
    drawLineChart('chart-error-rate', {
      labels: ts.labels,
      datasets: [
        { label: 'Log Analyzer Errors', data: ts.logAnalyzer.map(() => Math.floor(Math.random() * 3)), color: '#ef4444' },
        { label: 'Image Resizer Errors', data: ts.imageResizer.map(() => Math.floor(Math.random() * 5)), color: '#f59e0b' },
        { label: 'Data Validator Errors', data: ts.dataValidator.map(() => Math.floor(Math.random() * 2)), color: '#06b6d4' },
      ],
    });
  },

  // ── History Rendering ──
  renderHistory(filter = null) {
    const tbody = document.getElementById('history-table-body');
    let items = this.history;

    if (filter) {
      items = items.filter((h) => h.pipelineType === filter);
    }

    tbody.innerHTML = items.map((item) => {
      const detailStr = Object.entries(item.details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return `
        <tr>
          <td class="text-mono text-xs">${item.id}</td>
          <td>${item.fileName}</td>
          <td><span class="pipeline-badge ${pipelineClass(item.pipelineType)}">${item.pipelineIcon} ${pipelineLabel(item.pipelineType)}</span></td>
          <td><span class="status-badge ${statusClass(item.status)}"><span class="status-dot"></span> ${item.status}</span></td>
          <td class="text-mono">${item.durationFormatted}</td>
          <td class="text-xs text-muted">${detailStr.substring(0, 60)}${detailStr.length > 60 ? '...' : ''}</td>
          <td class="text-muted">${item.timestampFormatted}</td>
        </tr>
      `;
    }).join('');
  },

  setupFilters() {
    document.getElementById('filter-all')?.addEventListener('click', () => this.renderHistory(null));
    document.getElementById('filter-log')?.addEventListener('click', () => this.renderHistory('log_analysis'));
    document.getElementById('filter-image')?.addEventListener('click', () => this.renderHistory('image_resize'));
    document.getElementById('filter-data')?.addEventListener('click', () => this.renderHistory('data_validation'));
  },

  // ── Alerts Rendering ──
  renderAlerts() {
    const feed = document.getElementById('alerts-feed');

    // Counts
    const critical = this.alerts.filter((a) => a.type === 'critical').length;
    const warnings = this.alerts.filter((a) => a.type === 'warning').length;
    const resolved = this.alerts.filter((a) => a.type === 'resolved').length;

    document.getElementById('alert-critical').textContent = critical;
    document.getElementById('alert-warnings').textContent = warnings;
    document.getElementById('alert-resolved').textContent = resolved;
    document.getElementById('alert-count').textContent = critical + warnings;

    feed.innerHTML = this.alerts.map((alert) => `
      <div class="alert-card ${alert.type}">
        <span class="alert-icon">${alert.icon}</span>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-message">${alert.message}</div>
          <div class="alert-time">⏰ ${alert.time} · λ ${alert.lambda}</div>
        </div>
      </div>
    `).join('');
  },

  // ── Metrics Rendering ──
  renderMetrics() {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Latency P50/P95/P99
    drawLineChart('chart-latency', {
      labels: this.timeSeries.labels,
      datasets: [
        { label: 'P50', data: this.timeSeries.logAnalyzer.map((v) => v * 10 + 50), color: '#10b981' },
        { label: 'P95', data: this.timeSeries.logAnalyzer.map((v) => v * 20 + 200), color: '#f59e0b' },
        { label: 'P99', data: this.timeSeries.logAnalyzer.map((v) => v * 30 + 500), color: '#ef4444' },
      ],
    });

    // Cold starts vs warm starts
    drawStackedBarChart('chart-cold-starts', {
      labels: days,
      datasets: [
        { label: 'Warm Starts', data: days.map(() => Math.floor(Math.random() * 200 + 100)), color: '#10b981' },
        { label: 'Cold Starts', data: days.map(() => Math.floor(Math.random() * 20 + 5)), color: '#f59e0b' },
      ],
    });

    // Cost estimation
    drawBarChart('chart-cost', {
      labels: days,
      datasets: [
        { label: 'Lambda ($)', data: days.map(() => (Math.random() * 0.5 + 0.1).toFixed(2) * 100), color: '#6366f1' },
        { label: 'DynamoDB ($)', data: days.map(() => (Math.random() * 0.3 + 0.05).toFixed(2) * 100), color: '#06b6d4' },
        { label: 'S3 ($)', data: days.map(() => (Math.random() * 0.1 + 0.01).toFixed(2) * 100), color: '#a78bfa' },
      ],
    });

    // Memory utilization
    drawLineChart('chart-memory', {
      labels: this.timeSeries.labels,
      datasets: [
        { label: 'Log Analyzer', data: this.timeSeries.logAnalyzer.map(() => Math.floor(Math.random() * 40 + 50)), color: '#6366f1' },
        { label: 'Image Resizer', data: this.timeSeries.imageResizer.map(() => Math.floor(Math.random() * 30 + 60)), color: '#a78bfa' },
        { label: 'Data Validator', data: this.timeSeries.dataValidator.map(() => Math.floor(Math.random() * 35 + 40)), color: '#06b6d4' },
      ],
    });
  },

  // ── File Upload ──
  setupUpload() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('upload-input');
    const browse = document.getElementById('upload-browse');

    // Folder selection
    document.querySelectorAll('.folder-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.folder-option').forEach((o) => o.classList.remove('active'));
        opt.classList.add('active');
        this.uploadFolder = opt.querySelector('input').value;
      });
    });

    // Browse click
    browse?.addEventListener('click', (e) => {
      e.stopPropagation();
      input.click();
    });

    zone?.addEventListener('click', () => input.click());

    // Drag events
    zone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone?.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone?.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      this.handleFiles(e.dataTransfer.files);
    });

    // File input change
    input?.addEventListener('change', () => {
      this.handleFiles(input.files);
      input.value = '';
    });
  },

  handleFiles(files) {
    const queue = document.getElementById('upload-queue');

    Array.from(files).forEach((file, i) => {
      const fileIcons = {
        'log': '📝', 'txt': '📝',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'csv': '📊', 'json': '📊',
      };
      const ext = file.name.split('.').pop().toLowerCase();
      const icon = fileIcons[ext] || '📄';
      const sizeKB = (file.size / 1024).toFixed(1);

      const item = document.createElement('div');
      item.className = 'upload-item';
      item.innerHTML = `
        <span class="upload-item-icon">${icon}</span>
        <div class="upload-item-info">
          <div class="upload-item-name">${this.uploadFolder}/${file.name}</div>
          <div class="upload-item-meta">${sizeKB} KB · ${this.uploadFolder.toUpperCase()} pipeline</div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: 0%" id="progress-${i}"></div>
          </div>
        </div>
        <span class="upload-item-status text-muted" id="status-${i}">Uploading...</span>
      `;
      queue.appendChild(item);

      // Simulate upload progress
      this.simulateUpload(i, file.name);
    });
  },

  simulateUpload(index, fileName) {
    const progressEl = document.getElementById(`progress-${index}`);
    const statusEl = document.getElementById(`status-${index}`);
    let progress = 0;

    const interval = setInterval(() => {
      progress += Math.random() * 25 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);

        if (progressEl) progressEl.style.width = '100%';
        if (statusEl) {
          statusEl.textContent = '✅ Processed';
          statusEl.style.color = '#10b981';
        }

        // Add to processing history
        this.addProcessedFile(fileName);
        this.showToast('success', `${fileName} processed successfully via ${this.uploadFolder} pipeline`);
      } else {
        if (progressEl) progressEl.style.width = progress + '%';
      }
    }, 300 + Math.random() * 500);
  },

  addProcessedFile(fileName) {
    const pipelines = { logs: 'log_analysis', images: 'image_resize', data: 'data_validation' };
    const icons = { logs: '📝', images: '🖼️', data: '📊' };

    const newEntry = {
      id: `proc-${String(this.history.length + 1).padStart(4, '0')}`,
      file: `${this.uploadFolder}/${fileName}`,
      fileName,
      pipelineType: pipelines[this.uploadFolder],
      pipelineIcon: icons[this.uploadFolder],
      status: Math.random() > 0.1 ? 'success' : 'warning',
      duration: Math.floor(Math.random() * 1500 + 200),
      durationFormatted: Math.floor(Math.random() * 1500 + 200) + 'ms',
      fileSize: Math.floor(Math.random() * 2000 + 100),
      timestamp: new Date().toISOString(),
      timestampFormatted: 'Just now',
      details: { processed: 'via dashboard upload' },
    };

    this.history.unshift(newEntry);
  },

  // ── Refresh ──
  setupRefresh() {
    const btn = document.getElementById('refresh-btn');
    btn?.addEventListener('click', () => this.refreshData());
  },

  refreshData() {
    const icon = document.getElementById('refresh-icon');
    icon?.classList.add('refresh-spin');

    setTimeout(() => {
      this.timeSeries = MockData.generateTimeSeries(24);
      this.navigateTo(this.currentPage);
      this.updateTimestamp();
      icon?.classList.remove('refresh-spin');
      this.showToast('info', 'Dashboard data refreshed');
    }, 800);
  },

  updateTimestamp() {
    const now = new Date();
    document.getElementById('last-updated').textContent =
      `Updated: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  },

  // ── Mobile Menu ──
  setupMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    btn?.addEventListener('click', () => sidebar.classList.toggle('open'));
  },

  // ── Animated Number ──
  animateValue(elementId, endValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const startValue = parseInt(el.textContent) || 0;
    const duration = 800;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(startValue + (endValue - startValue) * eased);

      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  },

  // ── Toast Notifications ──
  showToast(type, message) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.classList.add('exiting'); setTimeout(() => this.parentElement.remove(), 300)">✕</button>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('exiting');
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  },
};

// ── Initialize on DOM ready ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
