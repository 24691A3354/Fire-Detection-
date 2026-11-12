/**
 * AURA-FIRE // AI-Powered Anti-Gravity Fire Detection System
 * Main Orchestrator tying all 7 Architectural Layers together.
 * Fully integrates live laptop webcam flame detection and radiometric FLIR imaging.
 */

import { AntiGravityEngine } from './modules/antiGravityEngine.js';
import { AudioSynthEngine } from './modules/audioSynth.js';
import { TelemetryState } from './modules/telemetryState.js';
import { CameraSimEngine } from './modules/cameraSim.js';
import { AIDetectionEngine } from './modules/aiDetectionEngine.js';
import { FloorPlanEngine } from './modules/floorPlan.js';
import { AlertSystemEngine } from './modules/alertSystem.js';
import { UserDatabaseEngine } from './modules/userDatabase.js';
import { WebcamDetectorEngine } from './modules/webcamDetector.js';

class AuraFireSystem {
  constructor() {
    // Instantiate all subsystem engines
    this.audio = new AudioSynthEngine();
    this.telemetry = new TelemetryState();
    this.webcam = new WebcamDetectorEngine(this.telemetry);
    this.antiGravity = new AntiGravityEngine('antiGravityCanvas');
    this.camera = new CameraSimEngine('cameraCanvas', this.telemetry, this.webcam);
    this.aiEngine = new AIDetectionEngine(this.telemetry, this.webcam);
    this.alertSystem = new AlertSystemEngine(this.telemetry, this.audio);
    this.database = new UserDatabaseEngine(this.telemetry);

    this.floorPlan = new FloorPlanEngine('floorPlanCanvas', this.telemetry, (zoneId) => {
      this.switchZone(zoneId);
    });

    this.waveformCanvas = document.getElementById('waveformCanvas');
    this.waveCtx = this.waveformCanvas ? this.waveformCanvas.getContext('2d') : null;

    this.hasLoggedCurrentFire = false;
    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupHeaderControls();
    this.setupCameraControls();
    this.setupPipelineControls();
    this.setupFusionSliders();
    this.setupAdminControls();
    this.setupFloorPlanControls();
    this.switchZone('webcam'); // Start directly focused on Laptop Camera feed
    this.camera.setWebcamMode(true);
    this.startMainLoop();

    // Automatically initialize and display live laptop camera
    this.autoStartCamera();

    // If browser security requires user gesture before media stream, trigger on first interaction
    const onUserGesture = () => {
      if (!this.webcam.isWebcamActive || this.webcam.isVirtualWebcam) {
        this.autoStartCamera();
      }
    };
    window.addEventListener('click', onUserGesture, { once: true });
    window.addEventListener('keydown', onUserGesture, { once: true });
  }

  async autoStartCamera() {
    const btnToggleWebcam = document.getElementById('btnToggleWebcam');
    const webcamBtnLabel = document.getElementById('webcamBtnLabel');
    const webcamToolbar = document.getElementById('webcamToolbar');
    const cameraPermBanner = document.getElementById('cameraPermBanner');

    try {
      if (webcamBtnLabel) webcamBtnLabel.innerText = 'CONNECTING CAMERA...';
      const res = await this.webcam.startWebcam();
      if (res && res.success) {
        this.camera.setWebcamMode(true);
        cameraPermBanner?.classList.add('hidden');
        if (webcamBtnLabel) webcamBtnLabel.innerText = 'NORMAL CAMERA ACTIVE (STOP)';
        if (btnToggleWebcam) btnToggleWebcam.className = 'btn btn-danger btn-sm';
        webcamToolbar?.classList.remove('hidden');
        this.switchZone('webcam');
        this.alertSystem.showToast('CAMERA CONNECTED', 'Live laptop normal camera active! Strike a match or hold flame in view.', false);
      } else {
        console.warn('Physical camera fallback:', res?.error);
        if (res && res.permissionDenied) {
          cameraPermBanner?.classList.remove('hidden');
          if (webcamBtnLabel) webcamBtnLabel.innerText = 'CAMERA BLOCKED (CLICK TO RETRY)';
          if (btnToggleWebcam) btnToggleWebcam.className = 'btn btn-warning btn-sm';
        } else {
          if (webcamBtnLabel) webcamBtnLabel.innerText = 'START NORMAL CAMERA';
          if (btnToggleWebcam) btnToggleWebcam.className = 'btn btn-primary btn-sm';
        }
        this.webcam.enableVirtualWebcam();
        this.camera.setWebcamMode(true);
        webcamToolbar?.classList.remove('hidden');
      }
    } catch (e) {
      console.warn('Auto camera exception:', e);
      this.webcam.enableVirtualWebcam();
      this.camera.setWebcamMode(true);
      webcamToolbar?.classList.remove('hidden');
    }
  }

  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.audio.playClick();
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabTarget = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tabTarget}`)?.classList.add('active');
      });
    });
  }

  setupHeaderControls() {
    // Audio Mute / Unmute
    const btnAudio = document.getElementById('btnAudioToggle');
    btnAudio?.addEventListener('click', () => {
      const isSound = this.audio.toggleSound();
      document.getElementById('audioIcon').innerText = isSound ? '🔊' : '🔇';
      document.getElementById('audioText').innerText = isSound ? 'SOUND ON' : 'MUTED';
    });

    // Compute Node Switcher (Edge NPU vs Cloud Backend) - Layer 7
    const btnNode = document.getElementById('btnToggleComputeNode');
    btnNode?.addEventListener('click', () => {
      this.audio.playClick();
      if (this.telemetry.computeNode === 'edge') {
        this.telemetry.computeNode = 'cloud';
        document.getElementById('nodeTypeLabel').innerText = 'CLOUD CLUSTER';
        document.getElementById('nodeLatencyBadge').innerText = '48ms';
        this.alertSystem.showToast('SYSTEM', 'Failover: Switched compute to Cloud Distributed GPU Cluster.', false);
      } else {
        this.telemetry.computeNode = 'edge';
        document.getElementById('nodeTypeLabel').innerText = 'EDGE NPU';
        document.getElementById('nodeLatencyBadge').innerText = '8ms';
        this.alertSystem.showToast('SYSTEM', 'Compute Node: Switched to Local Jetson AGX Edge NPU.', false);
      }
    });

    // Fire Drill Simulation Dropdown
    const btnDrill = document.getElementById('btnDrillMenu');
    const drillMenu = document.getElementById('drillDropdown');

    btnDrill?.addEventListener('click', (e) => {
      e.stopPropagation();
      drillMenu?.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      drillMenu?.classList.add('hidden');
    });

    drillMenu?.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const scenario = item.getAttribute('data-scenario');
        this.telemetry.setScenario(scenario);
        this.audio.playClick();
        this.hasLoggedCurrentFire = false;

        const zone = this.telemetry.getCurrentZone();
        this.alertSystem.addDispatch('PUSH', `Drill Simulator: Activated "${scenario.toUpperCase()}" scenario in ${zone.name}.`);
      });
    });

    // Clean Agent Suppression Button
    const btnSuppression = document.getElementById('btnTriggerSuppression');
    btnSuppression?.addEventListener('click', () => {
      this.audio.playSuppressionHiss();
      this.telemetry.triggerSuppression();
      const zone = this.telemetry.getCurrentZone();
      this.alertSystem.addDispatch('SMS', `CRITICAL ACTION: Manual ${zone.suppressionSystem} triggered in ${zone.name}! Aerosol discharge active.`, true);
    });
  }

  setupCameraControls() {
    // 1. Laptop Webcam Activation Toggle
    const btnToggleWebcam = document.getElementById('btnToggleWebcam');
    const webcamToolbar = document.getElementById('webcamToolbar');
    const webcamBtnLabel = document.getElementById('webcamBtnLabel');
    const cameraPermBanner = document.getElementById('cameraPermBanner');

    btnToggleWebcam?.addEventListener('click', async () => {
      this.audio.playClick();
      if (this.webcam.isWebcamActive && !this.webcam.isVirtualWebcam) {
        // Disconnect camera and switch to virtual camera
        this.webcam.stopWebcam();
        this.webcam.enableVirtualWebcam();
        this.camera.setWebcamMode(true);
        webcamBtnLabel.innerText = 'START NORMAL CAMERA';
        btnToggleWebcam.className = 'btn btn-primary btn-sm';
        this.switchZone('webcam');
        this.alertSystem.showToast('CAMERA', 'Switched to Virtual Simulator.', false);
      } else {
        // Start live camera
        webcamBtnLabel.innerText = 'STARTING CAMERA...';
        this.alertSystem.showToast('CAMERA', 'Connecting camera... Please click "ALLOW" on the browser prompt!', false);
        const res = await this.webcam.startWebcam();
        if (res.success) {
          this.camera.setWebcamMode(true);
          cameraPermBanner?.classList.add('hidden');
          webcamBtnLabel.innerText = 'NORMAL CAMERA ACTIVE (STOP)';
          btnToggleWebcam.className = 'btn btn-danger btn-sm';
          webcamToolbar?.classList.remove('hidden');
          this.switchZone('webcam');
          this.alertSystem.showToast('CAMERA READY', 'Live normal camera active! Hold glowing match or lighter in view.', false);
        } else {
          console.warn('Camera error:', res.error);
          this.webcam.enableVirtualWebcam();
          this.camera.setWebcamMode(true);
          if (res.permissionDenied) {
            cameraPermBanner?.classList.remove('hidden');
            webcamBtnLabel.innerText = 'CAMERA BLOCKED (CLICK TO RETRY)';
            btnToggleWebcam.className = 'btn btn-warning btn-sm';
            this.alertSystem.showToast('CAMERA BLOCKED', 'Camera access blocked in Chrome. Click camera icon in address bar ➔ Allow.', true);
          } else {
            webcamBtnLabel.innerText = 'START NORMAL CAMERA';
            btnToggleWebcam.className = 'btn btn-primary btn-sm';
            this.alertSystem.showToast('VIRTUAL SIMULATOR', `${res.error || 'Camera permission needed.'} Armed virtual simulator for testing.`, false);
          }
          webcamToolbar?.classList.remove('hidden');
          this.switchZone('webcam');
        }
      }
    });

    // 1b. Direct Retry Button on Permission Banner
    const btnRetryCam = document.getElementById('btnRetryCamera');
    btnRetryCam?.addEventListener('click', () => {
      this.audio.playClick();
      btnToggleWebcam?.click();
    });

    // 1b. Direct Virtual Camera Toggle
    const btnVirtualCam = document.getElementById('btnToggleVirtualCam');
    btnVirtualCam?.addEventListener('click', () => {
      this.audio.playClick();
      this.webcam.enableVirtualWebcam();
      this.camera.setWebcamMode(true);
      webcamBtnLabel.innerText = 'VIRTUAL SIMULATOR ACTIVE';
      btnToggleWebcam.className = 'btn btn-warning btn-sm';
      webcamToolbar?.classList.remove('hidden');
      this.switchZone('webcam');
      this.alertSystem.showToast('VIRTUAL SIMULATOR', 'Virtual Simulator active! Click "🔥 TEST FLAME (SIMULATOR)" to test.', false);
    });

    // 2. Webcam Sensitivity Slider
    const sensSlider = document.getElementById('webcamSensitivity');
    sensSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      this.webcam.sensitivity = val / 100;
      document.getElementById('webcamSensVal').innerText = `${val}%`;
    });

    // 3. Flicker Filter Toggle
    const btnFlicker = document.getElementById('btnToggleFlicker');
    btnFlicker?.addEventListener('click', () => {
      this.audio.playClick();
      this.webcam.flickerFilterEnabled = !this.webcam.flickerFilterEnabled;
      btnFlicker.innerText = `Dynamic Flicker Filter: ${this.webcam.flickerFilterEnabled ? 'ON' : 'OFF'}`;
      btnFlicker.className = `btn-xs btn-secondary ${this.webcam.flickerFilterEnabled ? 'active' : ''}`;
    });

    // 4. Mode Pills: Split / RGB / Thermal
    const modePills = document.querySelectorAll('.mode-pill');
    modePills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.audio.playClick();
        modePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.camera.setStreamMode(pill.getAttribute('data-mode'));
      });
    });

    // 5. Camera Zone Dock (Includes Laptop Cam)
    const dockButtons = document.querySelectorAll('.dock-zone-btn');
    dockButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const zoneAttr = btn.getAttribute('data-zone');
        const zoneId = (zoneAttr === 'webcam') ? 'webcam' : parseInt(zoneAttr);

        if (zoneId === 'webcam' && !this.webcam.isWebcamActive) {
          // If user clicked laptop cam dock and it's not active, start it
          btnToggleWebcam?.click();
        } else {
          this.switchZone(zoneId);
        }
      });
    });
  }

  setupPipelineControls() {
    // 1. Test Flame Simulator Toggle (Allows instant classroom / evaluation testing)
    const btnSimFlame = document.getElementById('btnToggleSimFlame');
    btnSimFlame?.addEventListener('click', () => {
      this.audio.playClick();
      const isActive = this.webcam.toggleSimulatedFlame();
      btnSimFlame.classList.toggle('active', isActive);
      btnSimFlame.innerText = isActive ? '🔥 TEST FLAME: ACTIVE' : '🔥 TEST FLAME (SIMULATOR)';

      // Switch to webcam view automatically so user sees the flame
      if (isActive && this.telemetry.currentZoneId !== 'webcam') {
        this.switchZone('webcam');
      }

      this.alertSystem.showToast('SIMULATOR', isActive ? 'Test flame ignited on camera view! Watch flame grow, send Gmail snapshot, and trigger call.' : 'Test flame extinguished.', false);
    });

    // 2. View Sent Gmail & Photo Evidence Button
    const btnViewEmail = document.getElementById('btnPipelineViewEmail');
    btnViewEmail?.addEventListener('click', () => {
      this.audio.playClick();
      this.alertSystem.openGmailSentModal();
    });

    // 3. User Acknowledgment ("I Am Safe / Cancel Call")
    const btnAck = document.getElementById('btnPipelineAcknowledge');
    btnAck?.addEventListener('click', () => {
      this.alertSystem.acknowledgeAlert();
      this.hasLoggedCurrentFire = false;
    });

    // 4. Modal Close Handlers for Gmail Viewer
    document.getElementById('btnCloseGmailModal')?.addEventListener('click', () => {
      this.alertSystem.closeGmailSentModal();
    });
    document.getElementById('btnCloseGmailModalBtn')?.addEventListener('click', () => {
      this.alertSystem.closeGmailSentModal();
    });

    // 5. Registered Contact Edit Modal Handlers
    const editModal = document.getElementById('editRegisteredContactModal');
    const btnOpenEdit = document.getElementById('btnOpenEditRegModal');
    const btnCloseEdit = document.getElementById('btnCloseEditRegModal');
    const btnCancelEdit = document.getElementById('btnCancelEditReg');
    const btnSaveReg = document.getElementById('btnSaveRegisteredContact');

    btnOpenEdit?.addEventListener('click', () => {
      this.audio.playClick();
      const u = this.database.getPrimaryUser();
      const inpName = document.getElementById('inpRegName');
      const inpEmail = document.getElementById('inpRegEmail');
      const inpPhone = document.getElementById('inpRegPhone');
      const inpSec = document.getElementById('inpRegSeconds');

      if (inpName) inpName.value = u.name;
      if (inpEmail) inpEmail.value = u.email;
      if (inpPhone) inpPhone.value = u.phone;
      if (inpSec) inpSec.value = u.escalationSeconds;

      editModal?.classList.remove('hidden');
    });

    const closeRegModal = () => editModal?.classList.add('hidden');
    btnCloseEdit?.addEventListener('click', closeRegModal);
    btnCancelEdit?.addEventListener('click', closeRegModal);

    btnSaveReg?.addEventListener('click', () => {
      this.audio.playClick();
      const name = document.getElementById('inpRegName')?.value.trim() || 'Aditya Sharma';
      const email = document.getElementById('inpRegEmail')?.value.trim() || 'aditya.fireproject@gmail.com';
      const phone = document.getElementById('inpRegPhone')?.value.trim() || '+91 9876543210';
      const escalationSeconds = parseInt(document.getElementById('inpRegSeconds')?.value) || 15;

      this.database.savePrimaryUser({ name, email, phone, escalationSeconds });
      closeRegModal();

      this.alertSystem.showToast('PROFILE SAVED', `Emergency contact set to ${name} (${email}, ${phone}). Initializing camera surveillance...`, false);

      // Automatically switch to webcam surveillance and start camera if not active
      if (!this.webcam.isWebcamActive) {
        document.getElementById('btnToggleWebcam')?.click();
      } else {
        this.switchZone('webcam');
      }
    });
  }

  switchZone(zoneId) {
    this.audio.playClick();
    this.telemetry.setZone(zoneId);
    this.hasLoggedCurrentFire = false;

    const isWebcam = (zoneId === 'webcam');
    this.camera.setWebcamMode(isWebcam);

    // Update dock buttons
    document.querySelectorAll('.dock-zone-btn').forEach(b => {
      const bZone = b.getAttribute('data-zone');
      if (bZone === String(zoneId)) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    // Update Header labels
    const zone = this.telemetry.getCurrentZone();
    const activeLabel = document.getElementById('activeZoneLabel');
    if (activeLabel) activeLabel.innerText = `${zone.code} (${zone.name.split(' ')[0]})`;

    const camTitle = document.getElementById('currentCameraTitle');
    if (camTitle) camTitle.innerText = `${zone.code}: ${zone.name}`;

    // Update Selected Zone card in floorplan
    const szName = document.getElementById('szName');
    if (szName) szName.innerText = `${zone.code}: ${zone.name}`;
  }

  setupFusionSliders() {
    const s1 = document.getElementById('sliderW1');
    const s2 = document.getElementById('sliderW2');
    const s3 = document.getElementById('sliderW3');

    const updateWeights = () => {
      const v1 = parseInt(s1.value);
      const v2 = parseInt(s2.value);
      const v3 = parseInt(s3.value);
      const total = v1 + v2 + v3;

      this.telemetry.weights.w1_optical = v1 / total;
      this.telemetry.weights.w2_thermal = v2 / total;
      this.telemetry.weights.w3_sensors = v3 / total;

      document.getElementById('sliderW1Val').innerText = `${Math.round((v1/total)*100)}%`;
      document.getElementById('sliderW2Val').innerText = `${Math.round((v2/total)*100)}%`;
      document.getElementById('sliderW3Val').innerText = `${Math.round((v3/total)*100)}%`;
    };

    s1?.addEventListener('input', updateWeights);
    s2?.addEventListener('input', updateWeights);
    s3?.addEventListener('input', updateWeights);

    document.getElementById('btnResetWeights')?.addEventListener('click', () => {
      s1.value = 40; s2.value = 35; s3.value = 25;
      updateWeights();
    });
  }

  setupAdminControls() {
    const thFlame = document.getElementById('adminThreshFlame');
    const thTemp = document.getElementById('adminThreshTemp');
    const thSmoke = document.getElementById('adminThreshSmoke');

    thFlame?.addEventListener('input', (e) => {
      this.telemetry.thresholds.flameConfidence = parseInt(e.target.value);
      document.getElementById('adminThreshFlameVal').innerText = `${e.target.value}%`;
    });

    thTemp?.addEventListener('input', (e) => {
      this.telemetry.thresholds.thermalMaxTemp = parseInt(e.target.value);
      document.getElementById('adminThreshTempVal').innerText = `${e.target.value}°C`;
    });

    thSmoke?.addEventListener('input', (e) => {
      this.telemetry.thresholds.smokeObscuration = parseInt(e.target.value);
      document.getElementById('adminThreshSmokeVal').innerText = `${e.target.value} PPM`;
    });

    document.getElementById('btnSaveAdminConfig')?.addEventListener('click', () => {
      this.audio.playWarningPing();
      this.alertSystem.showToast('ADMIN', 'Configuration parameters successfully saved to secure flash memory.', false);
    });

    // Emergency Call buttons
    document.getElementById('btnTestEmergencyCall')?.addEventListener('click', () => {
      this.alertSystem.initiateEmergencyCall();
    });

    document.getElementById('btnEndEmergencyCall')?.addEventListener('click', () => {
      this.alertSystem.endEmergencyCall();
    });

    document.getElementById('btnReplayAudioVoice')?.addEventListener('click', () => {
      this.alertSystem.initiateEmergencyCall();
    });

    document.getElementById('btnClearAlertHistory')?.addEventListener('click', () => {
      document.getElementById('dispatchesStream').innerHTML = '<div style="padding: 10px; color: #8899b5; font-size: 0.75rem;">Feed cleared.</div>';
    });

    document.getElementById('btnSwitchToSelectedZone')?.addEventListener('click', () => {
      document.querySelector('.nav-tab[data-tab="dashboard"]')?.click();
    });
  }

  setupFloorPlanControls() {
    const btnIso = document.getElementById('btnFloorViewIsometric');
    const btnHeat = document.getElementById('btnFloorViewHeatmap');
    const btnMist = document.getElementById('btnFloorViewSuppression');

    const setActive = (btn, mode) => {
      [btnIso, btnHeat, btnMist].forEach(b => b?.classList.remove('active'));
      btn?.classList.add('active');
      this.floorPlan.setViewMode(mode);
    };

    btnIso?.addEventListener('click', () => setActive(btnIso, 'isometric'));
    btnHeat?.addEventListener('click', () => setActive(btnHeat, 'thermal'));
    btnMist?.addEventListener('click', () => setActive(btnMist, 'suppression'));
  }

  startMainLoop() {
    const tick = () => {
      // 1. Process Live Laptop Webcam frame if active or simulated flame is enabled
      if (this.webcam.isWebcamActive || this.webcam.isSimulatedFlame) {
        const webDet = this.webcam.processFrame();
        this.telemetry.syncWebcamDetection(webDet);

        // Update webcam dock status pill
        const pill = document.getElementById('webcamPill');
        if (pill) {
          if (webDet.flameDetected) {
            pill.innerText = 'FIRE!';
            pill.className = 'zone-status-pill red';
          } else if (webDet.flameConfidence > 55 && (webDet.corePixelCount || 0) >= 4) {
            pill.innerText = 'GLOW';
            pill.className = 'zone-status-pill amber';
          } else {
            pill.innerText = 'LIVE';
            pill.className = 'zone-status-pill green';
          }
        }

        // Live update pipeline flame growth during escalation countdown
        if (this.alertSystem.pipelineStage === 'AWAITING_RESPONSE') {
          this.alertSystem.lastFlameStats = {
            flameConfidence: webDet.flameConfidence,
            flameAreaPercent: webDet.flameAreaPercent,
            flameGrowthPercent: webDet.flameGrowthPercent,
            isFlameIncreasing: webDet.isFlameIncreasing,
            flameDetected: webDet.flameDetected,
            thermalMax: webDet.thermalMax
          };

          const growthEl = document.getElementById('pipelineFlameGrowthRate');
          if (growthEl) {
            growthEl.innerText = `+${webDet.flameGrowthPercent}%`;
            growthEl.style.color = webDet.isFlameIncreasing ? '#ff0055' : '#00f5d4';
          }
        }
      }

      // 2. Update sensor physics & Kalman filters
      this.telemetry.update();

      // 3. Run AI detection inference
      const detection = this.aiEngine.infer();

      // 4. Render dual-stream video canvas (Webcam or Zone)
      this.camera.render(detection);

      // 5. Render 2.5D Floor plan
      this.floorPlan.render();

      // 6. Render Kalman Filtered Waveform
      this.renderWaveformCanvas();

      // 7. Update UI Telemetry Readouts
      this.updateTelemetryUI(detection);

      // 8. Handle Critical Fire Alarm Trigger
      this.handleFireState(detection);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  updateTelemetryUI(det) {
    const zone = this.telemetry.getCurrentZone();

    // Sensor Readouts
    const elTemp = document.getElementById('telemetryTemp');
    if (elTemp) elTemp.innerText = zone.temp.toFixed(1);

    const elSmoke = document.getElementById('telemetrySmoke');
    if (elSmoke) elSmoke.innerText = zone.smokePpm.toFixed(0);

    const elAqi = document.getElementById('telemetryAqi');
    if (elAqi) elAqi.innerText = zone.aqi;

    const elHum = document.getElementById('telemetryHumidity');
    if (elHum) elHum.innerText = zone.humidity.toFixed(1);

    // AI HUD Top Metrics
    const hudFlame = document.getElementById('hudFlameConf');
    if (hudFlame) hudFlame.querySelector('.val').innerText = `${det.flameConfidence.toFixed(1)}%`;

    const hudSmoke = document.getElementById('hudSmokeConf');
    if (hudSmoke) hudSmoke.querySelector('.val').innerText = `${det.smokeConfidence.toFixed(1)}%`;

    const hudTherm = document.getElementById('hudThermalMax');
    if (hudTherm) hudTherm.querySelector('.val').innerText = `${zone.thermalMax.toFixed(1)}°C`;

    const hudLat = document.getElementById('hudInferenceTime');
    if (hudLat) hudLat.querySelector('.val').innerText = `${det.inferenceTimeMs.toFixed(1)}ms`;

    // Risk Meter SVG Arc Gauge
    const meterNum = document.getElementById('meterBigNum');
    const meterFill = document.getElementById('meterFillPath');
    if (meterNum) meterNum.innerText = `${Math.round(det.fusionRiskIndex)}%`;

    if (meterFill) {
      const maxOffset = 251.2;
      const offset = maxOffset - (det.fusionRiskIndex / 100) * maxOffset;
      meterFill.style.strokeDashoffset = offset;
    }

    // Weight breakdowns
    document.getElementById('weightValOptical').innerText = `${det.flameConfidence.toFixed(0)}%`;
    document.getElementById('weightValThermal').innerText = `${zone.thermalMax.toFixed(0)}°C (${det.thermalAnomaly.toFixed(0)}%)`;
    document.getElementById('weightValSmoke').innerText = `${zone.smokePpm.toFixed(0)} PPM`;
    document.getElementById('weightValRoR').innerText = `${zone.rateOfRise > 0 ? '+' : ''}${zone.rateOfRise}°C/min`;

    // Decision state badge
    const badgeState = document.getElementById('fusionDecisionState');
    if (badgeState) {
      badgeState.innerText = det.decisionState;
      badgeState.className = `badge ${det.isRealFire ? 'red' : (det.decisionState.includes('WARNING') ? 'amber' : 'green')}`;
    }

    // Coordinates Readout
    const coordsEl = document.getElementById('hudBoundingBoxCoords');
    if (coordsEl) {
      if (zone.flameDetected || det.flameConfidence > 40) {
        coordsEl.innerText = `Coords: [X: ${zone.flameCoords.x.toFixed(2)}, Y: ${zone.flameCoords.y.toFixed(2)}, W: ${zone.flameCoords.w.toFixed(2)}, H: ${zone.flameCoords.h.toFixed(2)}]`;
      } else {
        coordsEl.innerText = 'Coords: [X: --, Y: --, W: --, H: --]';
      }
    }

    // Update Decision Logic Tab Rules Readout
    const dotVis = document.getElementById('dotRuleVisual');
    const stateVis = document.getElementById('stateRuleVisual');
    if (det.flameConfidence > 75) {
      dotVis?.classList.add('active-red');
      if (stateVis) stateVis.innerText = `FLAME DETECTED (${det.flameConfidence.toFixed(1)}%) — RULE TRIGGERED`;
    } else {
      dotVis?.classList.remove('active-red');
      if (stateVis) stateVis.innerText = `NO FLAME DETECTED (${det.flameConfidence.toFixed(1)}%)`;
    }

    const dotTherm = document.getElementById('dotRuleThermal');
    const stateTherm = document.getElementById('stateRuleThermal');
    if (zone.thermalMax > 65) {
      dotTherm?.classList.add('active-red');
      if (stateTherm) stateTherm.innerText = `HIGH THERMAL ANOMALY (${zone.thermalMax.toFixed(1)}°C) — RULE TRIGGERED`;
    } else {
      dotTherm?.classList.remove('active-red');
      if (stateTherm) stateTherm.innerText = `NOMINAL (${zone.thermalMax.toFixed(1)}°C, ${zone.rateOfRise}°C/min)`;
    }

    const dotGas = document.getElementById('dotRuleGas');
    const stateGas = document.getElementById('stateRuleGas');
    if (zone.smokePpm > 60) {
      dotGas?.classList.add('active-red');
      if (stateGas) stateGas.innerText = `DENSE SMOKE OBSCURATION (${zone.smokePpm.toFixed(0)} PPM) — RULE TRIGGERED`;
    } else {
      dotGas?.classList.remove('active-red');
      if (stateGas) stateGas.innerText = `CLEAR ATMOSPHERE (${zone.smokePpm.toFixed(0)} PPM)`;
    }

    const dotFinal = document.getElementById('dotRuleFusionFinal');
    const stateFinal = document.getElementById('stateRuleFusionFinal');
    if (det.isRealFire) {
      dotFinal?.classList.add('active-red');
      if (stateFinal) stateFinal.innerText = `CRITICAL THREAT CONFIRMED (INDEX: ${det.fusionRiskIndex.toFixed(1)}%) — AUTO DISPATCH ACTIVE`;
    } else {
      dotFinal?.classList.remove('active-red');
      if (stateFinal) stateFinal.innerText = `STATUS: ARMED & CALIBRATED (INDEX: ${det.fusionRiskIndex.toFixed(1)}%)`;
    }
  }

  handleFireState(det) {
    const fireBanner = document.getElementById('fireHudBanner');
    const sysStateVal = document.getElementById('sysStateVal');
    const brandOrb = document.getElementById('brandOrb');

    if (det.isRealFire) {
      fireBanner?.classList.remove('hidden');
      if (sysStateVal) {
        sysStateVal.innerText = det.isWebcamSource ? 'WEBCAM FIRE DETECTED' : 'CRITICAL FIRE ALARM';
        sysStateVal.style.color = '#ff0055';
      }
      if (brandOrb) brandOrb.style.background = '#ff0055';

      this.audio.startFireSiren();

      // Trigger Stage 1 & Stage 2 of the Emergency Escalation Pipeline
      if (!this.hasLoggedCurrentFire) {
        this.hasLoggedCurrentFire = true;
        const zone = this.telemetry.getCurrentZone();
        const primaryUser = this.database.getPrimaryUser();

        // 1. Capture high-res evidence snapshot from webcam
        const snapshotUrl = this.webcam.captureSnapshot({ email: primaryUser.email });

        // 2. Trigger Stage 1 (Email with snapshot to Gmail) & start Stage 2 (Response countdown)
        this.alertSystem.triggerFireDetected(snapshotUrl, {
          flameConfidence: det.flameConfidence,
          flameAreaPercent: this.webcam.detection?.flameAreaPercent || 12.5,
          flameGrowthPercent: this.webcam.detection?.flameGrowthPercent || 0,
          isFlameIncreasing: this.webcam.detection?.isFlameIncreasing || false,
          flameDetected: true,
          thermalMax: zone.thermalMax,
          zone: zone.name
        }, primaryUser);

        // 3. Archive incident to database (Layer 5)
        this.database.logCurrentIncident({
          id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          zone: `${zone.code}: ${zone.name}`,
          trigger: det.isWebcamSource ? 'Live Laptop Webcam CV Flame Segmentation' : 'AI ViT + Radiometric FLIR + Sensor Fusion',
          maxTemp: zone.thermalMax,
          smokePpm: Math.round(zone.smokePpm),
          confidence: det.fusionRiskIndex,
          severity: 'CRITICAL',
          dispatchStatus: `Snapshot Emailed to ${primaryUser.email}`,
          details: `Fire detected. Evidence photo transmitted to ${primaryUser.email}. Awaiting response before telephony escalation.`
        });
      }
    } else {
      fireBanner?.classList.add('hidden');
      this.audio.stopSiren();
      if (sysStateVal) {
        sysStateVal.innerText = 'ACTIVE MONITORING';
        sysStateVal.style.color = '#05ffa1';
      }
      if (brandOrb) brandOrb.style.background = 'radial-gradient(circle, #ff4500 0%, #ff0055 70%, transparent 100%)';
    }
  }

  // Layer 2: Realtime Preprocessing Waveform (Raw vs Kalman Filtered)
  renderWaveformCanvas() {
    if (!this.waveCtx) return;
    const w = this.waveformCanvas.width;
    const h = this.waveformCanvas.height;

    this.waveCtx.clearRect(0, 0, w, h);

    const raw = this.telemetry.rawHistory;
    const filtered = this.telemetry.filteredHistory;
    const step = w / (this.telemetry.historyLength - 1);

    this.waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.waveCtx.lineWidth = 1;
    for (let y = 20; y < h; y += 30) {
      this.waveCtx.beginPath();
      this.waveCtx.moveTo(0, y);
      this.waveCtx.lineTo(w, y);
      this.waveCtx.stroke();
    }

    const threshY = h - (65 / 150) * h;
    this.waveCtx.strokeStyle = 'rgba(255, 0, 85, 0.5)';
    this.waveCtx.setLineDash([6, 4]);
    this.waveCtx.beginPath();
    this.waveCtx.moveTo(0, threshY);
    this.waveCtx.lineTo(w, threshY);
    this.waveCtx.stroke();
    this.waveCtx.setLineDash([]);

    // 1. Raw Noisy Jitter (Blue)
    this.waveCtx.beginPath();
    this.waveCtx.strokeStyle = '#3a86ff';
    this.waveCtx.lineWidth = 1.2;
    for (let i = 0; i < raw.length; i++) {
      const val = raw[i];
      const y = h - (val / 150) * (h * 0.85) - 10;
      if (i === 0) this.waveCtx.moveTo(0, y);
      else this.waveCtx.lineTo(i * step, y);
    }
    this.waveCtx.stroke();

    // 2. Kalman Filtered Smooth Signal (Cyan)
    this.waveCtx.beginPath();
    this.waveCtx.strokeStyle = '#00f5d4';
    this.waveCtx.lineWidth = 2.5;
    for (let i = 0; i < filtered.length; i++) {
      const val = filtered[i];
      const y = h - (val / 150) * (h * 0.85) - 10;
      if (i === 0) this.waveCtx.moveTo(0, y);
      else this.waveCtx.lineTo(i * step, y);
    }
    this.waveCtx.stroke();
  }
}

// Initialize safely regardless of document readyState (handles initial load & Vite HMR)
function boot() {
  if (window.AuraFireInstance && typeof window.AuraFireInstance.destroy === 'function') {
    window.AuraFireInstance.destroy();
  }
  window.AuraFireInstance = new AuraFireSystem();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
