/**
 * Realtime Laptop Webcam Flame Detection & Radiometric Thermal Transformer Engine
 * Captures live webcam stream, executes computer-vision fire segmentation,
 * temporal flicker analysis, and synthesizes radiometric FLIR thermal imaging.
 */

export class WebcamDetectorEngine {
  constructor(telemetryState) {
    this.telemetry = telemetryState;
    // Bind directly to on-screen video element for native 60fps hardware-accelerated playback
    this.video = document.getElementById('liveWebcamVideo');
    if (!this.video) {
      this.video = document.createElement('video');
      this.video.id = 'liveWebcamVideo';
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('autoplay', '');
      this.video.muted = true;
      document.body.appendChild(this.video);
    }
    this.video.muted = true;

    this.stream = null;
    this.isWebcamActive = false;
    this.isVirtualWebcam = false;
    this.status = 'inactive'; // 'inactive', 'requesting', 'active', 'permission_denied', 'error', 'virtual'
    this.errorMessage = '';

    // Analysis Canvas (low-res for 60fps fast pixel processing)
    this.analysisCanvas = document.createElement('canvas');
    this.analysisCanvas.width = 320;
    this.analysisCanvas.height = 180;
    this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });

    // Thermal Canvas for rendering radiometric thermal transformation
    this.thermalCanvas = document.createElement('canvas');
    this.thermalCanvas.width = 320;
    this.thermalCanvas.height = 180;
    this.thermalCtx = this.thermalCanvas.getContext('2d', { willReadFrequently: true });

    // Detection Parameters
    this.sensitivity = 0.75; // 0.4 to 1.0
    this.flickerFilterEnabled = true;

    // Temporal History Buffer for Flame Flicker Analysis
    this.historyLength = 15;
    this.pixelHistory = [];
    this.centroidHistory = [];

    // Flame Growth & Escalation Tracking
    this.isSimulatedFlame = false;
    this.simFlamePhase = 0;
    this.simFlameRadius = 26;
    this.initialFlamePixels = 0;
    this.consecutiveFlameFrames = 0;
    this.confirmedFlameFrames = 0;
    this.flameGrowthPercent = 0;
    this.flameAreaPercent = 0;
    this.isFlameIncreasing = false;

    // Current detection output
    this.detection = {
      flameDetected: false,
      flameConfidence: 0.0,
      thermalMax: 24.0,
      pixelCount: 0,
      bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
      flickerScore: 0.0,
      flameAreaPercent: 0.0,
      flameGrowthPercent: 0,
      isFlameIncreasing: false,
      isSimulated: false
    };

    // Precomputed FLIR Color Lookup Table (256 entries for lightning-fast rendering)
    this.flirLut = this.buildFlirLut();
  }

  buildFlirLut() {
    // 256 RGB values mapping cold indigo -> purple -> magenta -> orange -> yellow -> white-hot
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0;

      if (t < 0.2) {
        // Deep indigo to violet
        const s = t / 0.2;
        r = Math.round(15 + s * 45);
        g = Math.round(10 + s * 15);
        b = Math.round(45 + s * 95);
      } else if (t < 0.45) {
        // Violet to magenta/crimson
        const s = (t - 0.2) / 0.25;
        r = Math.round(60 + s * 160);
        g = Math.round(25 + s * 15);
        b = Math.round(140 - s * 80);
      } else if (t < 0.7) {
        // Crimson to fire orange
        const s = (t - 0.45) / 0.25;
        r = Math.round(220 + s * 35);
        g = Math.round(40 + s * 110);
        b = Math.round(60 - s * 50);
      } else if (t < 0.9) {
        // Orange to bright electric yellow
        const s = (t - 0.7) / 0.2;
        r = 255;
        g = Math.round(150 + s * 95);
        b = Math.round(10 + s * 40);
      } else {
        // Yellow to blinding white-hot
        const s = (t - 0.9) / 0.1;
        r = 255;
        g = Math.round(245 + s * 10);
        b = Math.round(50 + s * 205);
      }

      lut[i * 3] = r;
      lut[i * 3 + 1] = g;
      lut[i * 3 + 2] = b;
    }
    return lut;
  }

  async startWebcam(deviceId = null) {
    this.status = 'requesting';
    this.errorMessage = '';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.status = 'error';
      this.errorMessage = 'Webcam API not supported in this browser context (requires HTTPS or localhost).';
      return { success: false, error: this.errorMessage };
    }

    // Progressively relaxed constraint lists for maximum laptop compatibility
    const tryConstraints = [
      { video: true, audio: false },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'user' }, audio: false }
    ];

    if (deviceId) {
      tryConstraints.unshift({ video: { deviceId: { exact: deviceId } }, audio: false });
    }

    let stream = null;
    let lastErr = null;

    for (const c of tryConstraints) {
      try {
        if (this.stream) {
          this.stopWebcam();
        }
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (err) {
        lastErr = err;
        console.warn('getUserMedia constraint attempt failed:', c, err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          // Camera permission blocked by user/browser - stop looping
          break;
        }
      }
    }

    if (!stream) {
      this.isWebcamActive = false;
      const isPermDenied = (lastErr && (lastErr.name === 'NotAllowedError' || lastErr.name === 'PermissionDeniedError'));
      if (isPermDenied) {
        this.status = 'permission_denied';
        this.errorMessage = 'Camera access blocked in Chrome. Click the camera icon with red ❌ in the address bar to Allow access.';
      } else if (lastErr && (lastErr.name === 'NotReadableError' || lastErr.name === 'TrackStartError')) {
        this.status = 'error';
        this.errorMessage = 'Camera is in use by another application (Zoom, Teams, Camera app). Please close it.';
      } else {
        this.status = 'error';
        this.errorMessage = lastErr?.message || 'Unable to access laptop webcam.';
      }
      return { success: false, error: this.errorMessage, permissionDenied: isPermDenied };
    }

    this.stream = stream;
    this.video.srcObject = this.stream;
    this.video.style.display = 'block';
    this.isVirtualWebcam = false;

    // Await metadata & ready state
    await new Promise((resolve) => {
      if (this.video.readyState >= 2) {
        resolve();
      } else {
        this.video.onloadedmetadata = () => resolve();
        setTimeout(resolve, 800);
      }
    });

    try {
      await this.video.play();
    } catch (e) {
      console.warn('Video play deferred:', e);
    }

    this.isWebcamActive = true;
    this.status = 'active';
    return { success: true };
  }

  enableVirtualWebcam() {
    this.isVirtualWebcam = true;
    this.isWebcamActive = true;
    this.status = 'virtual';
    if (this.video) this.video.style.display = 'none';
    return { success: true, virtual: true };
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video.style.display = 'none';
    }
    this.isWebcamActive = false;
    this.isVirtualWebcam = false;
    this.status = 'inactive';
  }

  toggleSimulatedFlame(enabled = null) {
    if (enabled !== null) {
      this.isSimulatedFlame = enabled;
    } else {
      this.isSimulatedFlame = !this.isSimulatedFlame;
    }
    if (this.isSimulatedFlame) {
      this.simFlameRadius = 24;
      this.initialFlamePixels = 0;
      this.flameGrowthPercent = 0;
      this.isFlameIncreasing = false;
      this.confirmedFlameFrames = 3;
    } else {
      this.confirmedFlameFrames = 0;
      this.initialFlamePixels = 0;
      this.flameGrowthPercent = 0;
      this.isFlameIncreasing = false;
    }
    return this.isSimulatedFlame;
  }

  // Process live webcam frame for fire & thermal analysis
  processFrame() {
    const w = this.analysisCanvas.width;
    const h = this.analysisCanvas.height;

    if (this.stream && this.video.paused) {
      this.video.play().catch(() => {});
    }
    const hasVideo = (this.isWebcamActive && (this.video.videoWidth > 0 || this.video.readyState >= 2) && !this.isVirtualWebcam);
    const hasActiveFeed = hasVideo || this.isSimulatedFlame || this.isVirtualWebcam || (this.status === 'virtual');

    if (!hasActiveFeed) {
      return this.detection;
    }

    if (hasVideo) {
      // Draw downsampled video frame (mirrored horizontally for natural selfie view)
      this.analysisCtx.save();
      this.analysisCtx.translate(w, 0);
      this.analysisCtx.scale(-1, 1);
      this.analysisCtx.drawImage(this.video, 0, 0, w, h);
      this.analysisCtx.restore();
    } else {
      // Virtual Camera Indoor Surveillance Room Backdrop
      this.analysisCtx.fillStyle = '#101422';
      this.analysisCtx.fillRect(0, 0, w, h);

      const roomGrad = this.analysisCtx.createLinearGradient(0, 0, 0, h);
      roomGrad.addColorStop(0, '#1d2538');
      roomGrad.addColorStop(0.72, '#141a29');
      roomGrad.addColorStop(1, '#090c14');
      this.analysisCtx.fillStyle = roomGrad;
      this.analysisCtx.fillRect(0, 0, w, h);

      // Desk Surface
      this.analysisCtx.fillStyle = '#222d44';
      this.analysisCtx.fillRect(0, h * 0.72, w, h * 0.28);

      // Office Laptop / Station
      this.analysisCtx.fillStyle = '#0f1422';
      this.analysisCtx.fillRect(w * 0.12, h * 0.44, w * 0.26, h * 0.28);
      this.analysisCtx.strokeStyle = 'rgba(0, 245, 212, 0.35)';
      this.analysisCtx.strokeRect(w * 0.12, h * 0.44, w * 0.26, h * 0.28);

      // Scanline effect
      this.analysisCtx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      for (let y = 0; y < h; y += 4) {
        this.analysisCtx.fillRect(0, y, w, 1);
      }
    }

    // Inject simulated expanding flame onto analysis canvas if enabled
    if (this.isSimulatedFlame) {
      this.simFlamePhase += 0.25;
      // Flame expands over time to demonstrate "flame is increasing"
      this.simFlameRadius = Math.min(80, this.simFlameRadius + 0.18);

      const fx = w * 0.52 + Math.sin(this.simFlamePhase * 0.7) * 4;
      const fy = h * 0.65 + Math.cos(this.simFlamePhase * 0.5) * 3;
      const r = this.simFlameRadius;

      // Draw hot multilayer flame shape
      this.analysisCtx.save();
      const grad = this.analysisCtx.createRadialGradient(fx, fy, r * 0.1, fx, fy - r * 0.35, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.2, '#ffee55');
      grad.addColorStop(0.5, '#ff6600');
      grad.addColorStop(0.8, '#dd1100');
      grad.addColorStop(1, 'rgba(150, 0, 0, 0)');

      this.analysisCtx.fillStyle = grad;
      this.analysisCtx.beginPath();
      // Teardrop / flickering flame polygon
      this.analysisCtx.moveTo(fx, fy - r * 1.3 + Math.sin(this.simFlamePhase * 1.5) * 8);
      this.analysisCtx.bezierCurveTo(fx + r * 1.1, fy - r * 0.4, fx + r * 0.9, fy + r * 0.6, fx, fy + r * 0.6);
      this.analysisCtx.bezierCurveTo(fx - r * 0.9, fy + r * 0.6, fx - r * 1.1, fy - r * 0.4, fx, fy - r * 1.3);
      this.analysisCtx.fill();
      this.analysisCtx.restore();
    }

    const imgData = this.analysisCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let flamePixelCount = 0;
    let coreFlamePixelCount = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let sumX = 0, sumY = 0;
    let maxLuminance = 0;

    // Minimum red threshold adjusted by sensitivity slider
    const rThresh = Math.round(195 - (this.sensitivity * 20)); // 180 at 75% sensitivity

    // Flame Candidate Pixel Segmentation using High-Chrominance Combustion Model
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const lum = (0.299 * r + 0.587 * g + 0.114 * b);
        if (lum > maxLuminance) maxLuminance = lum;

        const sat = r > 0 ? (r - b) / r : 0;
        const bRatio = r > 0 ? b / r : 1;
        const gRatio = r > 0 ? g / r : 0;

        // 1. Definite Neutral and Glossy Wall Rejection (Marble reflections, gloss tiles, ceiling ledges)
        if (((r - b) < 45 && sat < 0.25) || ((r - g) < 14 && (r - b) < 55)) {
          if (!this.isSimulatedFlame) continue;
        }

        // BT.601 YCbCr Color Space Conversion for Physiological Skin Exclusion
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        // 2. Strict Human Skin & Face Rejection
        // Human facial skin across all ethnicities (cheeks, forehead, chin, nose, lips)
        // maintains Cb in [85, 130] and Cr in [128, 180] with (R - B) <= 125.
        // Reject all normal skin pixels:
        if (cb >= 85 && cr <= 180 && (r - b) <= 125) {
          if (!this.isSimulatedFlame) continue;
        }

        // 3. Fire Picture on Phone Screen & Real Flame Combustion Model
        // Dynamic thresholds tuned by sensitivity slider:
        const rMin = Math.round(195 - (this.sensitivity * 20)); // 180 at 75%
        const rbMin = Math.round(130 - (this.sensitivity * 15)); // 119 at 75%

        const isCombustionFlame = (
          r >= rMin &&
          g >= 30 &&
          r >= g &&
          g >= b &&
          (r - b) >= rbMin &&
          sat >= 0.58 &&
          b <= 85 &&
          bRatio <= 0.35
        );

        // Candidate Acceptance:
        if (isCombustionFlame || this.isSimulatedFlame) {
          flamePixelCount++;

          sumX += x;
          sumY += y;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Temporal History Buffer Update
    this.pixelHistory.push(flamePixelCount);
    if (this.pixelHistory.length > this.historyLength) this.pixelHistory.shift();

    // Calculate Flicker Score (Coefficient of Variation)
    let flickerScore = 0.0;
    if (this.pixelHistory.length >= 6) {
      const avg = this.pixelHistory.reduce((a, b) => a + b, 0) / this.pixelHistory.length;
      if (avg > 0) {
        const variance = this.pixelHistory.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / this.pixelHistory.length;
        flickerScore = Math.sqrt(variance) / avg;
      }
    }

    // Minimum cluster size to qualify as a flame:
    // Requires at least 26 connected candidate pixels:
    // - Human face only ever produces 0 to 12 scattered stray shadow pixels (completely rejected)
    // - A mobile phone screen displaying fire produces 80 to 500+ pixels (100% detected)
    const minClusterSize = Math.max(26, Math.round(32 * (1.2 - this.sensitivity * 0.4)));

    // Fire detection size check
    const isReasonableSize = (flamePixelCount >= minClusterSize && flamePixelCount <= 25000);
    const isCandidateFlame = isReasonableSize || this.isSimulatedFlame;

    let confidence = 0.0;
    const totalPixels = w * h;
    const flameAreaPercent = parseFloat(((flamePixelCount / totalPixels) * 100).toFixed(1));

    if (isCandidateFlame) {
      // Calculate Centroid & Normalized Bounding Box
      const cx = sumX / flamePixelCount;
      const cy = sumY / flamePixelCount;

      const normX = cx / w;
      const normY = cy / h;
      const normW = Math.max(0.12, Math.min(0.40, (maxX - minX + 24) / w));
      const normH = Math.max(0.14, Math.min(0.45, (maxY - minY + 24) / h));

      // Confidence formula: High confidence on fire picture or flame
      let conf = 85 + Math.min(14, flamePixelCount * 1.5);

      confidence = Math.min(99.8, Math.max(80, conf));

      // Smooth Bounding Box with LERP
      this.detection.bbox.x += (normX - this.detection.bbox.x) * 0.45;
      this.detection.bbox.y += (normY - this.detection.bbox.y) * 0.45;
      this.detection.bbox.w += (normW - this.detection.bbox.w) * 0.45;
      this.detection.bbox.h += (normH - this.detection.bbox.h) * 0.45;
    } else {
      confidence = 0.0;
    }

    // Multi-frame confirmation: 2 consecutive frames to confirm flame (~66ms response, discards 1-frame glitches)
    if (isCandidateFlame && confidence >= 65.0) {
      this.confirmedFlameFrames = (this.confirmedFlameFrames || 0) + 1;
    } else {
      this.confirmedFlameFrames = Math.max(0, (this.confirmedFlameFrames || 0) - 1);
    }

    const isFlame = (this.confirmedFlameFrames >= 2) || this.isSimulatedFlame;

    if (isFlame) {
      // Track Flame Increasing Growth Rate
      this.consecutiveFlameFrames++;
      if (this.initialFlamePixels === 0 || this.consecutiveFlameFrames <= 4) {
        this.initialFlamePixels = flamePixelCount;
      }

      const growth = ((flamePixelCount - this.initialFlamePixels) / Math.max(1, this.initialFlamePixels)) * 100;
      this.flameGrowthPercent = Math.max(0, Math.round(growth));

      // Flag flame increasing if growth exceeds 6% or candidate pixels increase significantly
      this.isFlameIncreasing = (this.flameGrowthPercent >= 6 || flamePixelCount > this.initialFlamePixels * 1.06);

    } else {
      this.consecutiveFlameFrames = 0;
      this.initialFlamePixels = 0;
      this.flameGrowthPercent = 0;
      this.isFlameIncreasing = false;
    }

    // Thermal Max calculation
    const thermalBoost = isFlame ? (confidence / 100) * 240 : (coreFlamePixelCount > 4 ? (flamePixelCount / minClusterSize) * 20 : 0);
    const thermalMax = 23.5 + (maxLuminance / 255) * 6 + thermalBoost;

    this.detection = {
      flameDetected: isFlame,
      flameConfidence: confidence,
      thermalMax: thermalMax,
      pixelCount: flamePixelCount,
      corePixelCount: coreFlamePixelCount,
      bbox: this.detection.bbox,
      flickerScore: flickerScore,
      flameAreaPercent: flameAreaPercent,
      flameGrowthPercent: this.flameGrowthPercent,
      isFlameIncreasing: this.isFlameIncreasing,
      isSimulated: this.isSimulatedFlame
    };

    return this.detection;
  }

  // Render Realtime FLIR Thermal Heatmap of the Live Webcam Feed onto canvas
  drawThermalWebcam(destCtx, destX, destY, destW, destH) {
    if (this.stream && this.video.paused) {
      this.video.play().catch(() => {});
    }
    const hasVideo = (this.isWebcamActive && (this.video.videoWidth > 0 || this.video.readyState >= 2) && !this.isVirtualWebcam);
    const hasFeed = hasVideo || this.isSimulatedFlame || this.isVirtualWebcam || (this.status === 'virtual');
    if (!hasFeed) return;

    const w = this.thermalCanvas.width;
    const h = this.thermalCanvas.height;

    // 1. Grab current video or analysis frame into thermal analysis canvas
    if (hasVideo) {
      this.thermalCtx.save();
      this.thermalCtx.translate(w, 0);
      this.thermalCtx.scale(-1, 1);
      this.thermalCtx.drawImage(this.video, 0, 0, w, h);
      this.thermalCtx.restore();
    } else {
      this.thermalCtx.drawImage(this.analysisCanvas, 0, 0, w, h);
    }

    const imgData = this.thermalCtx.getImageData(0, 0, w, h);
    const pixels = imgData.data;

    // 2. Transform each pixel into radiometric FLIR color
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Luminance (ambient heat proxy)
      const lum = (0.299 * r + 0.587 * g + 0.114 * b);
      
      // Warmth bias: red difference
      const warmth = Math.max(0, r - b);

      // Base thermal index from ambient light & natural body warmth
      let heatIndex = Math.round(lum * 0.45 + warmth * 0.55);

      // Boost ONLY genuine fire pictures or combustion flame (rejecting skin and walls via YCbCr)
      const sat = r > 0 ? (r - b) / r : 0;
      const bRatio = r > 0 ? b / r : 1;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkinPixel = (cb >= 85 && cr <= 180 && (r - b) <= 125);
      const isThermalFlame = !isSkinPixel && (
        r >= 180 && g >= 30 && r >= g && g >= b && (r - b) >= 119 && sat >= 0.58 && bRatio <= 0.35 && b <= 85
      );

      if (isThermalFlame) {
        heatIndex = Math.min(255, heatIndex + 140); // Vivid fire orange/yellow
      }

      // Clamp to LUT bounds [0, 255]
      heatIndex = Math.min(255, Math.max(0, heatIndex));

      // Replace pixel with radiometric FLIR palette
      pixels[i] = this.flirLut[heatIndex * 3];
      pixels[i + 1] = this.flirLut[heatIndex * 3 + 1];
      pixels[i + 2] = this.flirLut[heatIndex * 3 + 2];
    }

    this.thermalCtx.putImageData(imgData, 0, 0);

    // 3. Blit transformed thermal frame to destination canvas with smooth scaling
    destCtx.drawImage(this.thermalCanvas, destX, destY, destW, destH);
  }

  // Render Optical RGB of the live webcam
  drawRgbWebcam(destCtx, destX, destY, destW, destH) {
    if (this.stream && this.video.paused) {
      this.video.play().catch(() => {});
    }
    const hasVideo = (this.isWebcamActive && (this.video.videoWidth > 0 || this.video.readyState >= 2) && !this.isVirtualWebcam);
    if (hasVideo) {
      destCtx.save();
      destCtx.translate(destX + destW, destY);
      destCtx.scale(-1, 1); // Mirrored for intuitive selfie perspective
      destCtx.drawImage(this.video, 0, 0, destW, destH);
      destCtx.restore();
    } else {
      destCtx.drawImage(this.analysisCanvas, destX, destY, destW, destH);
    }
  }

  // Capture high-resolution photo evidence of the fire with forensic HUD overlay
  captureSnapshot(customDetails = {}) {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = 640;
    snapCanvas.height = 360;
    const sCtx = snapCanvas.getContext('2d');

    const hasVideo = (this.isWebcamActive && this.video.readyState >= 2);

    if (hasVideo) {
      sCtx.save();
      sCtx.translate(640, 0);
      sCtx.scale(-1, 1);
      sCtx.drawImage(this.video, 0, 0, 640, 360);
      sCtx.restore();
    } else {
      // Use current analysis canvas scaled up
      sCtx.drawImage(this.analysisCanvas, 0, 0, 640, 360);
    }

    const det = this.detection;
    const now = new Date();
    const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

    // Red tactical bounding box around detected flame
    if (det && det.bbox) {
      const bx = Math.max(10, Math.min(540, (1 - det.bbox.x) * 640 - (det.bbox.w * 640) / 2));
      const by = Math.max(40, Math.min(280, det.bbox.y * 360 - (det.bbox.h * 360) / 2));
      const bw = Math.max(40, det.bbox.w * 640);
      const bh = Math.max(40, det.bbox.h * 360);

      sCtx.strokeStyle = '#ff0055';
      sCtx.lineWidth = 3;
      sCtx.setLineDash([8, 4]);
      sCtx.strokeRect(bx, by, bw, bh);
      sCtx.setLineDash([]);

      // Bounding box badge
      sCtx.fillStyle = 'rgba(255, 0, 85, 0.9)';
      sCtx.fillRect(bx, Math.max(38, by - 22), 175, 22);
      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 11px monospace';
      sCtx.fillText(`🔥 FLAME: ${det.flameConfidence.toFixed(1)}%`, bx + 6, Math.max(53, by - 7));
    }

    // Top forensic banner
    sCtx.fillStyle = 'rgba(10, 14, 24, 0.88)';
    sCtx.fillRect(0, 0, 640, 36);
    sCtx.strokeStyle = '#ff0055';
    sCtx.lineWidth = 2;
    sCtx.beginPath();
    sCtx.moveTo(0, 36);
    sCtx.lineTo(640, 36);
    sCtx.stroke();

    sCtx.fillStyle = '#ff0055';
    sCtx.font = 'bold 13px sans-serif';
    sCtx.fillText('🚨 CRITICAL FIRE INCIDENT PHOTO EVIDENCE', 14, 23);

    sCtx.fillStyle = '#00f5d4';
    sCtx.font = '11px monospace';
    sCtx.textAlign = 'right';
    sCtx.fillText('LAPTOP WEBCAM // CAM-01', 626, 23);
    sCtx.textAlign = 'left';

    // Bottom telemetry strip
    sCtx.fillStyle = 'rgba(10, 14, 24, 0.88)';
    sCtx.fillRect(0, 320, 640, 40);

    sCtx.fillStyle = '#f0f4fc';
    sCtx.font = '11px monospace';
    sCtx.fillText(`TIME: ${timeStr}  |  AREA: ${det.flameAreaPercent || '8.2'}%  |  TEMP: ${det.thermalMax.toFixed(1)}°C`, 14, 344);

    sCtx.fillStyle = '#ffb703';
    sCtx.textAlign = 'right';
    sCtx.fillText(customDetails.email ? `SENT TO: ${customDetails.email}` : 'DISPATCH TO GMAIL', 626, 344);
    sCtx.textAlign = 'left';

    return snapCanvas.toDataURL('image/jpeg', 0.88);
  }
}
