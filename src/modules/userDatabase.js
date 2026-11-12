/**
 * User Management & Incident Archive Database (Layer 5)
 * Manages personnel directory, notification permissions, incident audits, and CSV/JSON export.
 */

export class UserDatabaseEngine {
  constructor(telemetryState) {
    this.telemetry = telemetryState;

    // Primary Registered Person (Used for Gmail Alert & Escalation Emergency Call)
    this.primaryUser = this.loadPrimaryUser();

    // Registered Personnel Directory
    this.users = [
      {
        id: 'USR-101',
        name: 'Chief Elena Rostova',
        role: 'Facility Safety Director',
        phone: '+1 (555) 234-5678',
        email: 'elena.rostova@aurafire.defense.io',
        channels: { sms: true, email: true, push: true, call: true },
        avatar: 'ER'
      },
      {
        id: 'USR-102',
        name: 'Marcus Vance',
        role: 'Chief Plant Engineer (BESS)',
        phone: '+1 (555) 876-5432',
        email: 'm.vance@facility.tech',
        channels: { sms: true, email: true, push: true, call: false },
        avatar: 'MV'
      },
      {
        id: 'USR-103',
        name: 'Capt. David Kael',
        role: 'Metro Fire Dept (Station 14 Liaison)',
        phone: '+1 (555) 911-0014',
        email: 'dispatch@metrofire.gov',
        channels: { sms: true, email: true, push: false, call: true },
        avatar: 'DK'
      },
      {
        id: 'USR-104',
        name: 'Sarah Chen, PhD',
        role: 'Chemical Safety Officer',
        phone: '+1 (555) 432-1098',
        email: 's.chen@aurafire.chem',
        channels: { sms: false, email: true, push: true, call: false },
        avatar: 'SC'
      }
    ];

    // Historical Incident & Telemetry Archive
    this.incidents = [
      {
        id: 'INC-8924',
        timestamp: '2026-11-01 14:22:18',
        zone: 'Zone 1: Battery Storage',
        trigger: 'Thermal ViT + Gas Sensor',
        maxTemp: 182.4,
        smokePpm: 195,
        confidence: 98.2,
        severity: 'CRITICAL',
        dispatchStatus: 'Dispatched (SMS + Call)',
        details: 'Thermal runaway in Lithium-Iron-Phosphate Rack 4. Clean agent released.'
      },
      {
        id: 'INC-8923',
        timestamp: '2026-10-28 09:14:02',
        zone: 'Zone 3: Chemical Synthesis Lab',
        trigger: 'Photoelectric Obscuration',
        maxTemp: 44.1,
        smokePpm: 120,
        confidence: 86.4,
        severity: 'WARNING',
        dispatchStatus: 'Dispatched (Email)',
        details: 'Organic solvent fume surge detected during distillation reflux.'
      },
      {
        id: 'INC-8922',
        timestamp: '2026-10-15 11:00:00',
        zone: 'Zone 2: Server Room Alpha',
        trigger: 'Scheduled Fire Drill',
        maxTemp: 23.5,
        smokePpm: 12,
        confidence: 100.0,
        severity: 'INFO',
        dispatchStatus: 'Logged (Drill Mode)',
        details: 'Quarterly zero-gravity optical model validation drill.'
      }
    ];

    this.init();
  }

  loadPrimaryUser() {
    try {
      const stored = localStorage.getItem('aura_fire_registered_user');
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return {
      name: 'Aditya Sharma',
      email: 'aditya.fireproject@gmail.com',
      phone: '+91 9876543210',
      escalationSeconds: 15,
      flameGrowthThreshold: 5
    };
  }

  savePrimaryUser(data) {
    this.primaryUser = { ...this.primaryUser, ...data };
    try {
      localStorage.setItem('aura_fire_registered_user', JSON.stringify(this.primaryUser));
    } catch {
      // ignore
    }
    this.syncUserHeader();
    return this.primaryUser;
  }

  getPrimaryUser() {
    return this.primaryUser;
  }

  syncUserHeader() {
    const u = this.primaryUser;
    const nameEl = document.getElementById('regUserNameBadge');
    if (nameEl) nameEl.innerText = u.name;

    const emailEl = document.getElementById('regUserEmailBadge');
    if (emailEl) emailEl.innerText = u.email;

    const phoneEl = document.getElementById('regUserPhoneBadge');
    if (phoneEl) phoneEl.innerText = u.phone;

    const timerEl = document.getElementById('regUserTimerBadge');
    if (timerEl) timerEl.innerText = `${u.escalationSeconds}s`;

    // Also sync admin phone input if present
    const adminPhone = document.getElementById('adminTwilioPhone');
    if (adminPhone) adminPhone.value = u.phone;
  }

  init() {
    this.syncUserHeader();
    this.renderUsers();
    this.renderTable();
    this.setupListeners();
  }

  setupListeners() {
    const searchInput = document.getElementById('dbSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderTable(e.target.value.toLowerCase());
      });
    }

    const btnExportJSON = document.getElementById('btnExportJSON');
    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => this.exportJSON());
    }

    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => this.exportCSV());
    }

    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        document.getElementById('incidentDetailModal')?.classList.add('hidden');
      });
    }
  }

  renderUsers() {
    const container = document.getElementById('userListContainer');
    if (!container) return;

    container.innerHTML = this.users.map(u => `
      <div class="user-card-item">
        <div class="user-avatar">${u.avatar}</div>
        <div class="user-info">
          <div class="user-name">${u.name}</div>
          <div class="user-role">${u.role} • ${u.phone}</div>
        </div>
        <div class="user-channels">
          <span class="channel-tag ${u.channels.sms ? 'active' : ''}">SMS</span>
          <span class="channel-tag ${u.channels.email ? 'active' : ''}">EMAIL</span>
          <span class="channel-tag ${u.channels.push ? 'active' : ''}">PUSH</span>
          <span class="channel-tag ${u.channels.call ? 'active' : ''}">VOICE CALL</span>
        </div>
      </div>
    `).join('');
  }

  renderTable(filter = '') {
    const tbody = document.getElementById('incidentTableBody');
    if (!tbody) return;

    const filtered = this.incidents.filter(inc => {
      if (!filter) return true;
      return inc.zone.toLowerCase().includes(filter) ||
             inc.trigger.toLowerCase().includes(filter) ||
             inc.severity.toLowerCase().includes(filter) ||
             inc.id.toLowerCase().includes(filter);
    });

    tbody.innerHTML = filtered.map(inc => `
      <tr>
        <td class="font-mono font-bold">${inc.id}</td>
        <td class="font-mono">${inc.timestamp}</td>
        <td>${inc.zone}</td>
        <td>${inc.trigger}</td>
        <td class="font-mono">${inc.maxTemp.toFixed(1)}°C</td>
        <td class="font-mono">${inc.smokePpm} PPM</td>
        <td class="font-mono text-cyan">${inc.confidence.toFixed(1)}%</td>
        <td><span class="sev-badge ${inc.severity.toLowerCase()}">${inc.severity}</span></td>
        <td>${inc.dispatchStatus}</td>
        <td>
          <button class="btn btn-xs btn-secondary btn-replay" data-id="${inc.id}">Replay Telemetry</button>
        </td>
      </tr>
    `).join('');

    // Attach replay button listeners
    tbody.querySelectorAll('.btn-replay').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.openIncidentModal(id);
      });
    });
  }

  openIncidentModal(id) {
    const incident = this.incidents.find(i => i.id === id);
    if (!incident) return;

    const modal = document.getElementById('incidentDetailModal');
    const title = document.getElementById('modalIncidentTitle');
    const details = document.getElementById('modalTelemetryDetails');
    const canvas = document.getElementById('modalSnapshotCanvas');

    if (title) title.innerText = `INCIDENT ARCHIVE AUDIT: #${incident.id}`;
    if (details) {
      details.innerHTML = `
        <div><strong>FACILITY LOCATION:</strong> ${incident.zone}</div>
        <div><strong>RECORDED TIMESTAMP:</strong> ${incident.timestamp}</div>
        <div><strong>PEAK RADIOMETRIC TEMP:</strong> <span class="text-cyan">${incident.maxTemp}°C</span></div>
        <div><strong>SMOKE OBSCURATION:</strong> ${incident.smokePpm} PPM</div>
        <div><strong>AI ViT CONFIDENCE:</strong> ${incident.confidence}%</div>
        <div><strong>DISPATCH DISCHARGE:</strong> ${incident.dispatchStatus}</div>
        <div style="margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 6px;">
          <em>Audit Note:</em> ${incident.details}
        </div>
      `;
    }

    // Render snapshot thermal reconstruction on canvas
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Procedural thermal snapshot
      const radGrad = ctx.createRadialGradient(200, 125, 5, 200, 125, 90);
      radGrad.addColorStop(0, '#ffffff');
      radGrad.addColorStop(0.3, '#ffff00');
      radGrad.addColorStop(0.7, '#ff0055');
      radGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(200, 125, 90, 0, Math.PI * 2);
      ctx.fill();

      // Bounding box
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2;
      ctx.strokeRect(140, 65, 120, 120);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 11px "JetBrains Mono"';
      ctx.fillText(`FLIR THERMAL CAPTURE: ${incident.maxTemp}°C`, 14, 25);
    }

    modal?.classList.remove('hidden');
  }

  logCurrentIncident(incidentData) {
    this.incidents.unshift(incidentData);
    if (this.incidents.length > 50) this.incidents.pop();
    this.renderTable();
  }

  exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.incidents, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `aura_fire_incidents_${Date.now()}.json`);
    dlAnchorElem.click();
  }

  exportCSV() {
    const headers = ['IncidentID', 'Timestamp', 'Zone', 'Trigger', 'MaxTempC', 'SmokePPM', 'AIConfidence', 'Severity', 'DispatchStatus'];
    const rows = this.incidents.map(i => [
      i.id,
      `"${i.timestamp}"`,
      `"${i.zone}"`,
      `"${i.trigger}"`,
      i.maxTemp,
      i.smokePpm,
      i.confidence,
      i.severity,
      `"${i.dispatchStatus}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", encodeURI(csvContent));
    dlAnchorElem.setAttribute("download", `aura_fire_incidents_${Date.now()}.csv`);
    dlAnchorElem.click();
  }
}
