/**
 * Camera Simulation & Real Webcam Fusion Engine (Layers 1 & 3)
 * Renders live dual-stream video: Optical RGB and Radiometric FLIR Thermal Infrared.
 * Supports both Live Laptop Webcam (with real-time fire CV detection) and Simulated Facility Zones (1-4).
 */

export class CameraSimEngine {
  constructor(canvasId, telemetryState, webcamDetector = null) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.telemetry = telemetryState;
    this.webcam = webcamDetector;
    this.streamMode = 'rgb'; // Default to 'rgb' (Normal Camera)
    this.time = 0;
    this.isWebcamMode = true; // Default to true on startup
    this.particles = [];
    this.init();

    // Click canvas when in prompt mode to activate webcam directly
    this.canvas.addEventListener('click', () => {
      if (this.isWebcamMode && this.webcam && !this.webcam.isWebcamActive) {
        document.getElementById('btnToggleWebcam')?.click();
      }
    });
  }

  init() {
    this.createSmokeParticles();
  }

  setWebcamDetector(webcamDetector) {
    this.webcam = webcamDetector;
  }

  setWebcamMode(enabled) {
    this.isWebcamMode = enabled;
  }

  setStreamMode(mode) {
    this.streamMode = mode;
  }

  createSmokeParticles() {
    this.smokeParticles = [];
    for (let i = 0; i < 40; i++) {
      this.smokeParticles.push({
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 2 - 1,
        radius: Math.random() * 15 + 10,
        opacity: Math.random() * 0.4 + 0.1,
        age: Math.random() * 60
      });
    }
  }

  render(detectionResult) {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.time += 0.05;

    const liveVideo = document.getElementById('liveWebcamVideo');

    // 1. Check if we are in Live Laptop Webcam mode
    if (this.isWebcamMode && this.webcam) {
      if (liveVideo) liveVideo.style.display = 'none'; // Keep video element off-screen; canvas draws frames directly
      this.renderWebcamFeed(w, h, detectionResult);
      return;
    }

    // 2. Otherwise render Simulated Industrial Facility Zone (Zones 1-4)
    if (liveVideo) liveVideo.style.display = 'none';
    const zone = this.telemetry.getCurrentZone();

    // Render based on stream mode
    if (this.streamMode === 'rgb') {
      this.renderScene(0, 0, w, h, 'rgb', zone);
    } else if (this.streamMode === 'thermal') {
      this.renderScene(0, 0, w, h, 'thermal', zone);
    } else {
      // Split Screen: Left RGB, Right Thermal
      const halfW = w / 2;
      this.renderScene(0, 0, halfW, h, 'rgb', zone);
      this.renderScene(halfW, 0, halfW, h, 'thermal', zone);

      // Dividing tactical split line
      this.ctx.beginPath();
      this.ctx.moveTo(halfW, 0);
      this.ctx.lineTo(halfW, h);
      this.ctx.strokeStyle = '#00f5d4';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Split labels
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      this.ctx.fillRect(8, 8, 125, 22);
      this.ctx.fillRect(halfW + 8, 8, 160, 22);

      this.ctx.font = '600 11px "JetBrains Mono"';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText('RGB OPTICAL 4K', 14, 23);
      this.ctx.fillStyle = '#ff9100';
      this.ctx.fillText('FLIR THERMAL IR (8-14μm)', halfW + 14, 23);
    }

    // Overlay AI Bounding Box & Coordinates (Layer 3 output)
    if (detectionResult && (detectionResult.flameConfidence > 45 || detectionResult.thermalAnomaly > 45 || zone.flameDetected)) {
      this.renderBoundingBox(detectionResult, zone.flameCoords, zone.thermalMax, w, h, 'SIMULATED ZONE FLAME');
    }

    // Realtime Camera Scanlines & Timestamp Watermark
    this.renderOverlays(w, h, `${zone.code} // RTSP://192.168.1.10${zone.id}:554/H265`);
  }

  // Render Real Webcam Video Feed with Live Flame Detection & Radiometric FLIR
  renderWebcamFeed(w, h, detectionResult) {
    const webDet = this.webcam.detection;

    if (this.streamMode === 'rgb') {
      this.webcam.drawRgbWebcam(this.ctx, 0, 0, w, h);
    } else if (this.streamMode === 'thermal') {
      this.webcam.drawThermalWebcam(this.ctx, 0, 0, w, h);
    } else {
      // Split Screen: Left Real RGB Webcam, Right Radiometric Thermal Webcam
      const halfW = w / 2;
      this.webcam.drawRgbWebcam(this.ctx, 0, 0, halfW, h);
      this.webcam.drawThermalWebcam(this.ctx, halfW, 0, halfW, h);

      // Dividing neon line
      this.ctx.beginPath();
      this.ctx.moveTo(halfW, 0);
      this.ctx.lineTo(halfW, h);
      this.ctx.strokeStyle = '#00f5d4';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Labels
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(8, 8, 160, 22);
      this.ctx.fillRect(halfW + 8, 8, 190, 22);

      this.ctx.font = '600 11px "JetBrains Mono"';
      this.ctx.fillStyle = '#00f5d4';
      this.ctx.fillText('📷 LIVE LAPTOP WEBCAM', 14, 23);
      this.ctx.fillStyle = '#ff9100';
      this.ctx.fillText('RADIOMETRIC FLIR THERMAL', halfW + 14, 23);
    }

    // If real flame detected in webcam feed, draw bounding box
    if (webDet && webDet.flameDetected) {
      this.renderBoundingBox(detectionResult, webDet.bbox, webDet.thermalMax, w, h, 'LIVE WEBCAM FLAME');
    }

    // Watermark
    const isLivePhysical = (this.webcam.isWebcamActive && this.webcam.stream && !this.webcam.isVirtualWebcam);
    this.renderOverlays(w, h, isLivePhysical ? 'NORMAL LAPTOP CAMERA // 1080P DIRECT SENSOR' : 'VIRTUAL SURVEILLANCE FEED // 60 FPS');

    // On-screen notification if browser blocked camera access
    if (this.webcam && this.webcam.status === 'permission_denied') {
      this.ctx.fillStyle = 'rgba(255, 30, 80, 0.94)';
      this.ctx.fillRect(w * 0.03, 38, w * 0.94, 40);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '700 13px "Space Grotesk"';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('📷 Camera Blocked in Chrome! Click the camera icon with red ❌ in URL bar (left of localhost:5173) ➔ Always allow ➔ Done', w / 2, 63);
      this.ctx.textAlign = 'start';
    }
  }

  // Render Prompt when Webcam is selected but not yet enabled
  renderWebcamPrompt(w, h) {
    this.ctx.fillStyle = '#060910';
    this.ctx.fillRect(0, 0, w, h);

    // Subtle grid
    this.ctx.strokeStyle = 'rgba(0, 245, 212, 0.08)';
    for (let x = 0; x < w; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '700 16px "Space Grotesk"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('📷 LAPTOP WEBCAM DIRECT FIRE DETECTION', w / 2, h / 2 - 25);

    this.ctx.font = '400 12px "Outfit"';
    this.ctx.fillStyle = '#8899b5';
    this.ctx.fillText('Click "ACTIVATE WEBCAM" below to enable your laptop camera for real-time fire detection.', w / 2, h / 2 + 5);

    this.ctx.font = '500 11px "JetBrains Mono"';
    this.ctx.fillStyle = '#00f5d4';
    this.ctx.fillText('Test with a lighter, candle, match, or a fire video on your phone screen!', w / 2, h / 2 + 35);
    this.ctx.textAlign = 'start';
  }

  renderScene(x, y, width, height, mode, zone) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, width, height);
    this.ctx.clip();

    // 1. Render Industrial Room Background
    if (mode === 'rgb') {
      this.renderRgbRoom(x, y, width, height, zone);
    } else {
      this.renderThermalRoom(x, y, width, height, zone);
    }

    // 2. Render Flames & Smoke if flame detected or active scenario
    if (zone.flameIntensity > 0.05 || zone.status !== 'NOMINAL') {
      const fx = x + width * zone.flameCoords.x;
      const fy = y + height * zone.flameCoords.y;
      const fScale = zone.flameIntensity;

      if (mode === 'rgb') {
        this.renderFlamesRgb(fx, fy, fScale);
        this.renderSmokeRgb(fx, fy - 20, fScale, width, height);
      } else {
        this.renderFlamesThermal(fx, fy, fScale);
      }
    }

    // 3. Clean Agent Aerosol Mist Extinguishment effect if active
    if (this.telemetry.suppressionActive) {
      this.renderSuppressionMist(x, y, width, height);
    }

    this.ctx.restore();
  }

  // Realistic RGB Industrial Room
  renderRgbRoom(x, y, w, h, zone) {
    const floorY = y + h * 0.72;
    
    // Ceiling / Back wall
    const wallGrad = this.ctx.createLinearGradient(x, y, x, floorY);
    wallGrad.addColorStop(0, '#0a0e17');
    wallGrad.addColorStop(1, '#141c2c');
    this.ctx.fillStyle = wallGrad;
    this.ctx.fillRect(x, y, w, floorY - y);

    // Floor
    const floorGrad = this.ctx.createLinearGradient(x, floorY, x, y + h);
    floorGrad.addColorStop(0, '#101724');
    floorGrad.addColorStop(1, '#080c14');
    this.ctx.fillStyle = floorGrad;
    this.ctx.fillRect(x, floorY, w, (y + h) - floorY);

    // Grid Perspective on floor
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;
    for (let gx = x; gx < x + w; gx += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(gx, floorY);
      this.ctx.lineTo(x + (gx - x) * 1.5 - w * 0.25, y + h);
      this.ctx.stroke();
    }

    // Equipment based on Zone
    if (zone.roomType === 'battery' || zone.roomType === 'server') {
      for (let i = 0; i < 3; i++) {
        const rackX = x + w * (0.2 + i * 0.25);
        const rackY = floorY - h * 0.45;
        const rackW = w * 0.18;
        const rackH = h * 0.45;

        this.ctx.fillStyle = '#182030';
        this.ctx.fillRect(rackX, rackY, rackW, rackH);
        this.ctx.strokeStyle = '#2d3b55';
        this.ctx.strokeRect(rackX, rackY, rackW, rackH);

        for (let b = 0; b < 6; b++) {
          const by = rackY + b * (rackH / 6.5) + 6;
          this.ctx.fillStyle = '#0f1624';
          this.ctx.fillRect(rackX + 4, by, rackW - 8, rackH / 8);

          const isGreen = (Math.sin(this.time * 4 + i + b) > 0);
          this.ctx.fillStyle = isGreen ? '#05ffa1' : '#3a86ff';
          this.ctx.fillRect(rackX + 8, by + 4, 3, 3);
          this.ctx.fillStyle = isGreen ? '#00f5d4' : '#05ffa1';
          this.ctx.fillRect(rackX + 14, by + 4, 3, 3);
        }
      }
    } else {
      const tableX = x + w * 0.25;
      const tableY = floorY - h * 0.35;
      this.ctx.fillStyle = '#222d42';
      this.ctx.fillRect(tableX, tableY, w * 0.5, h * 0.35);
      this.ctx.strokeStyle = '#3d4f73';
      this.ctx.strokeRect(tableX, tableY, w * 0.5, h * 0.35);
    }
  }

  // Radiometric FLIR Thermal Infrared Heatmap Room
  renderThermalRoom(x, y, w, h, zone) {
    const thermGrad = this.ctx.createLinearGradient(x, y, x, y + h);
    thermGrad.addColorStop(0, '#100b2b'); // 20°C
    thermGrad.addColorStop(1, '#241242'); // 23°C
    this.ctx.fillStyle = thermGrad;
    this.ctx.fillRect(x, y, w, h);

    for (let i = 0; i < 3; i++) {
      const rackX = x + w * (0.2 + i * 0.25);
      const rackY = y + h * 0.27;
      const rackW = w * 0.18;
      const rackH = h * 0.45;

      this.ctx.fillStyle = 'rgba(157, 78, 221, 0.45)';
      this.ctx.fillRect(rackX, rackY, rackW, rackH);

      this.ctx.fillStyle = 'rgba(255, 183, 3, 0.4)';
      this.ctx.fillRect(rackX + 6, rackY + rackH * 0.8, rackW - 12, 10);
    }

    if (zone.temp > 45 || zone.flameIntensity > 0.05) {
      const fx = x + w * zone.flameCoords.x;
      const fy = y + h * zone.flameCoords.y;
      const rad = 50 + (zone.temp - 20) * 1.5;

      const heatBloom = this.ctx.createRadialGradient(fx, fy, 5, fx, fy, rad);
      heatBloom.addColorStop(0, '#ffffff');
      heatBloom.addColorStop(0.2, '#fff200');
      heatBloom.addColorStop(0.5, '#ff4500');
      heatBloom.addColorStop(0.75, '#ff0055');
      heatBloom.addColorStop(1, 'transparent');

      this.ctx.fillStyle = heatBloom;
      this.ctx.beginPath();
      this.ctx.arc(fx, fy, rad, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.arc(fx, fy, rad * 0.6, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  // Realistic Procedural Flame Tongues in RGB
  renderFlamesRgb(x, y, scale) {
    this.ctx.save();
    const count = 12;

    for (let i = 0; i < count; i++) {
      const offsetX = (Math.sin(this.time * 8 + i * 2) * 16) * scale;
      const flameH = (70 + Math.sin(this.time * 12 + i) * 35) * scale;
      const flameW = (25 + Math.cos(this.time * 6 + i) * 8) * scale;

      this.ctx.beginPath();
      this.ctx.moveTo(x - flameW / 2 + offsetX, y);
      this.ctx.quadraticCurveTo(x + offsetX, y - flameH * 0.6, x + offsetX, y - flameH);
      this.ctx.quadraticCurveTo(x + flameW / 2 + offsetX, y - flameH * 0.4, x + flameW / 2 + offsetX, y);
      this.ctx.closePath();

      const flameGrad = this.ctx.createLinearGradient(x, y, x, y - flameH);
      flameGrad.addColorStop(0, 'rgba(255, 69, 0, 0.9)');
      flameGrad.addColorStop(0.6, 'rgba(255, 145, 0, 0.85)');
      flameGrad.addColorStop(1, 'rgba(255, 240, 100, 0.0)');
      this.ctx.fillStyle = flameGrad;
      this.ctx.fill();

      if (i % 2 === 0) {
        this.ctx.beginPath();
        this.ctx.moveTo(x - flameW * 0.25 + offsetX * 0.5, y);
        this.ctx.quadraticCurveTo(x, y - flameH * 0.35, x, y - flameH * 0.5);
        this.ctx.quadraticCurveTo(x + flameW * 0.25, y - flameH * 0.25, x + flameW * 0.25, y);
        this.ctx.fillStyle = 'rgba(255, 255, 220, 0.95)';
        this.ctx.fill();
      }
    }

    for (let s = 0; s < 8; s++) {
      const ex = x + (Math.sin(this.time * 5 + s) * 45) * scale;
      const ey = y - (scale * 80) - ((this.time * 80 + s * 30) % 90);
      this.ctx.fillStyle = '#ffee55';
      this.ctx.beginPath();
      this.ctx.arc(ex, ey, Math.random() * 2 + 1, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  renderFlamesThermal(x, y, scale) {
    this.ctx.save();
    const radius = 60 * scale;

    const radGrad = this.ctx.createRadialGradient(x, y - radius * 0.5, 2, x, y - radius * 0.5, radius * 1.5);
    radGrad.addColorStop(0, '#ffffff');
    radGrad.addColorStop(0.3, '#ffff00');
    radGrad.addColorStop(0.6, '#ff0055');
    radGrad.addColorStop(1, 'transparent');

    this.ctx.fillStyle = radGrad;
    this.ctx.beginPath();
    this.ctx.arc(x, y - radius * 0.5, radius * 1.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  renderSmokeRgb(x, y, scale, w, h) {
    this.ctx.save();
    for (let p of this.smokeParticles) {
      p.y += p.vy * scale;
      p.x += p.vx * scale + Math.sin(this.time + p.age) * 0.4;
      p.radius += 0.3 * scale;
      p.age++;

      if (p.age > 80 || p.y < -h * 0.5) {
        p.x = x + (Math.random() - 0.5) * 30;
        p.y = y;
        p.radius = Math.random() * 12 + 6;
        p.age = 0;
      }

      const grad = this.ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.radius);
      grad.addColorStop(0, `rgba(40, 45, 55, ${p.opacity * scale})`);
      grad.addColorStop(1, 'transparent');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  renderSuppressionMist(x, y, w, h) {
    this.ctx.save();
    const mistGrad = this.ctx.createLinearGradient(x, y, x, y + h);
    mistGrad.addColorStop(0, 'rgba(0, 245, 212, 0.45)');
    mistGrad.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
    this.ctx.fillStyle = mistGrad;
    this.ctx.fillRect(x, y, w, h);

    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const px = x + Math.random() * w;
      const py = y + Math.random() * h;
      this.ctx.fillRect(px, py, 2, 4);
    }
    this.ctx.restore();
  }

  // Draw AI Bounding Box & Target Crosshairs
  renderBoundingBox(det, coords, thermalMax, w, h, label = 'FIRE THREAT') {
    // If split mode, render bounding box on the left RGB half
    const activeW = (this.streamMode === 'split') ? (w / 2) : w;

    const bx = coords.x * activeW - (coords.w * activeW) / 2;
    const by = coords.y * h - (coords.h * h) / 2;
    const bw = Math.max(40, coords.w * activeW);
    const bh = Math.max(40, coords.h * h);

    this.ctx.save();
    this.ctx.strokeStyle = '#ff0055';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(bx, by, bw, bh);

    // Corner brackets
    const bLen = 14;
    this.ctx.strokeStyle = '#ff4500';
    this.ctx.lineWidth = 3;

    // Top-Left
    this.ctx.beginPath();
    this.ctx.moveTo(bx, by + bLen);
    this.ctx.lineTo(bx, by);
    this.ctx.lineTo(bx + bLen, by);
    this.ctx.stroke();

    // Bottom-Right
    this.ctx.beginPath();
    this.ctx.moveTo(bx + bw, by + bh - bLen);
    this.ctx.lineTo(bx + bw, by + bh);
    this.ctx.lineTo(bx + bw - bLen, by + bh);
    this.ctx.stroke();

    // AI Classification Badge Tag
    const conf = det ? det.flameConfidence : 95.0;
    const tag = `🔥 ${label}: ${conf.toFixed(1)}% | ${thermalMax.toFixed(1)}°C`;
    this.ctx.fillStyle = 'rgba(255, 0, 85, 0.9)';
    this.ctx.fillRect(bx, Math.max(0, by - 24), Math.min(activeW - bx, 280), 22);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '700 11px "JetBrains Mono"';
    this.ctx.fillText(tag, bx + 6, Math.max(14, by - 8));

    // Also mirror bounding box on right thermal half if in split mode!
    if (this.streamMode === 'split') {
      const halfW = w / 2;
      const tbx = halfW + bx;

      this.ctx.strokeStyle = '#ffff00';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(tbx, by, bw, bh);

      this.ctx.fillStyle = 'rgba(255, 145, 0, 0.9)';
      this.ctx.fillRect(tbx, Math.max(0, by - 24), Math.min(halfW - (tbx - halfW), 280), 22);
      this.ctx.fillStyle = '#050a12';
      this.ctx.font = '700 11px "JetBrains Mono"';
      this.ctx.fillText(`FLIR SPOT: ${thermalMax.toFixed(1)}°C`, tbx + 6, Math.max(14, by - 8));
    }

    this.ctx.restore();
  }

  renderOverlays(w, h, streamSource) {
    this.ctx.save();
    this.ctx.font = '500 10px "JetBrains Mono"';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    this.ctx.fillText(`CAM-STREAM: ${streamSource}`, 12, h - 12);

    const now = new Date();
    const timeStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    this.ctx.fillText(timeStr, w - 190, h - 12);

    // Scanline
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    const scanY = (this.time * 90) % h;
    this.ctx.fillRect(0, scanY, w, 2);
    this.ctx.restore();
  }
}
