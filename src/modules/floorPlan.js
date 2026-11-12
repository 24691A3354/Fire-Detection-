/**
 * Interactive 2.5D Facility Schematic (Layer 6 Visualization)
 * Renders spatial floor plan, zero-gravity floating sensor nodes, and real-time fire spread.
 */

export class FloorPlanEngine {
  constructor(canvasId, telemetryState, onZoneSelect) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.telemetry = telemetryState;
    this.onZoneSelect = onZoneSelect;
    this.time = 0;
    this.viewMode = 'isometric'; // 'isometric', 'thermal', 'suppression'

    this.rooms = [
      { id: 1, name: 'ZONE 1: Battery Storage (BESS)', x: 0.12, y: 0.15, w: 0.35, h: 0.32, color: '#00f5d4' },
      { id: 2, name: 'ZONE 2: Server Room Alpha', x: 0.53, y: 0.15, w: 0.35, h: 0.32, color: '#3a86ff' },
      { id: 3, name: 'ZONE 3: Chemical Synthesis Lab', x: 0.12, y: 0.54, w: 0.35, h: 0.34, color: '#9d4edd' },
      { id: 4, name: 'ZONE 4: Logistics & Assembly Hub', x: 0.53, y: 0.54, w: 0.35, h: 0.34, color: '#05ffa1' }
    ];

    this.init();
  }

  init() {
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  setViewMode(mode) {
    this.viewMode = mode;
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    for (let r of this.rooms) {
      if (clickX >= r.x && clickX <= r.x + r.w && clickY >= r.y && clickY <= r.y + r.h) {
        if (this.onZoneSelect) this.onZoneSelect(r.id);
        break;
      }
    }
  }

  render() {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.time += 0.04;

    this.ctx.clearRect(0, 0, w, h);

    // 1. Futuristic Tactical Background Grid
    this.renderHoloGrid(w, h);

    // 2. Render Rooms & Partition Walls
    for (let r of this.rooms) {
      this.renderRoom(r, w, h);
    }

    // 3. Render Zero-G Floating Sensor Beacons
    this.renderSensorBeacons(w, h);

    // 4. Render Active Fire Thermal Spread
    this.renderFireSpread(w, h);
  }

  renderHoloGrid(w, h) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 245, 212, 0.05)';
    this.ctx.lineWidth = 1;

    // Grid cells
    const gridSize = 32;
    for (let x = 0; x < w; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  renderRoom(room, w, h) {
    const rx = room.x * w;
    const ry = room.y * h;
    const rw = room.w * w;
    const rh = room.h * h;

    const isSelected = (this.telemetry.currentZoneId === room.id);
    const zoneData = this.telemetry.zones[room.id];
    const isFire = (zoneData.status === 'CRITICAL');
    const isWarning = (zoneData.status === 'WARNING');

    this.ctx.save();

    // Room Floor Plate
    if (isFire) {
      this.ctx.fillStyle = 'rgba(255, 0, 85, 0.18)';
      this.ctx.strokeStyle = '#ff0055';
      this.ctx.lineWidth = 2;
    } else if (isWarning) {
      this.ctx.fillStyle = 'rgba(255, 183, 3, 0.12)';
      this.ctx.strokeStyle = '#ffb703';
      this.ctx.lineWidth = 2;
    } else if (isSelected) {
      this.ctx.fillStyle = 'rgba(0, 245, 212, 0.08)';
      this.ctx.strokeStyle = '#00f5d4';
      this.ctx.lineWidth = 2;
    } else {
      this.ctx.fillStyle = 'rgba(15, 23, 38, 0.6)';
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.lineWidth = 1;
    }

    this.ctx.fillRect(rx, ry, rw, rh);
    this.ctx.strokeRect(rx, ry, rw, rh);

    // Architectural Room Label
    this.ctx.font = '700 12px "Space Grotesk"';
    this.ctx.fillStyle = isFire ? '#ff0055' : (isSelected ? '#00f5d4' : '#ffffff');
    this.ctx.fillText(room.name, rx + 14, ry + 24);

    // Sensor Readout Stamp
    this.ctx.font = '500 10.5px "JetBrains Mono"';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.fillText(`TEMP: ${zoneData.temp.toFixed(1)}°C | SMOKE: ${zoneData.smokePpm.toFixed(0)} PPM`, rx + 14, ry + 42);

    // Draw equipment interior footprints
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.fillRect(rx + 20, ry + 55, rw * 0.4, rh * 0.25);
    this.ctx.fillRect(rx + rw * 0.55, ry + 55, rw * 0.35, rh * 0.55);

    // Selection Glow
    if (isSelected) {
      this.ctx.strokeStyle = 'rgba(0, 245, 212, 0.4)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(rx - 4, ry - 4, rw + 8, rh + 8);
    }

    this.ctx.restore();
  }

  renderSensorBeacons(w, h) {
    // 4 multi-modal sensor nodes per room with zero-gravity hover
    for (let r of this.rooms) {
      const zoneData = this.telemetry.zones[r.id];
      const isFire = (zoneData.status === 'CRITICAL');

      const beaconPositions = [
        { bx: r.x * w + 35, by: r.y * h + 70 },
        { bx: (r.x + r.w) * w - 35, by: r.y * h + 70 },
        { bx: r.x * w + 35, by: (r.y + r.h) * h - 35 },
        { bx: (r.x + r.w) * w - 35, by: (r.y + r.h) * h - 35 }
      ];

      for (let i = 0; i < beaconPositions.length; i++) {
        const b = beaconPositions[i];
        const floatY = b.by + Math.sin(this.time * 2 + i + r.id) * 3;

        this.ctx.beginPath();
        this.ctx.arc(b.bx, floatY, 4, 0, Math.PI * 2);
        this.ctx.fillStyle = isFire ? '#ff0055' : '#05ffa1';
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = isFire ? '#ff0055' : '#05ffa1';
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }
    }
  }

  renderFireSpread(w, h) {
    const activeZone = this.telemetry.getCurrentZone();
    if (activeZone.status === 'CRITICAL' || activeZone.flameIntensity > 0.05) {
      const room = this.rooms.find(r => r.id === activeZone.id);
      if (!room) return;

      const cx = (room.x + room.w * 0.5) * w;
      const cy = (room.y + room.h * 0.6) * h;
      const rad = 45 + (activeZone.flameIntensity * 55);

      this.ctx.save();

      // Radiating thermal flame wave
      const grad = this.ctx.createRadialGradient(cx, cy, 5, cx, cy, rad);
      grad.addColorStop(0, 'rgba(255, 69, 0, 0.7)');
      grad.addColorStop(0.5, 'rgba(255, 0, 85, 0.4)');
      grad.addColorStop(1, 'transparent');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      this.ctx.fill();

      // Pulsing alarm rings
      const pulseSize = (this.time * 60) % rad;
      this.ctx.strokeStyle = `rgba(255, 0, 85, ${1 - pulseSize / rad})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, pulseSize, 0, Math.PI * 2);
      this.ctx.stroke();

      // Warning marker
      this.ctx.font = '700 13px "JetBrains Mono"';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText('🔥 CONFIRMED FIRE EVENT', cx - 90, cy - rad - 8);

      this.ctx.restore();
    }
  }
}
