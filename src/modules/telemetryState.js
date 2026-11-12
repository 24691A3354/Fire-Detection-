/**
 * Telemetry State Manager (Layers 1, 2, 7)
 * Handles multi-modal sensor inputs across zones, historical buffers, and simulation scenarios.
 * Fully supports live laptop webcam telemetry.
 */

export class TelemetryState {
  constructor() {
    this.currentZoneId = 'webcam';
    this.currentScenario = 'normal';
    this.suppressionActive = false;
    this.suppressionCountdown = 0;
    this.computeNode = 'edge'; // 'edge' or 'cloud'

    // Multi-Zone Definitions & Live Status
    this.zones = {
      1: {
        id: 1,
        code: 'Z1',
        name: 'Battery Energy Storage (BESS)',
        roomType: 'battery',
        status: 'NOMINAL', // NOMINAL, WARNING, CRITICAL
        temp: 23.8,
        tempTarget: 23.8,
        smokePpm: 14.0,
        smokeTarget: 14.0,
        humidity: 44.5,
        aqi: 38,
        voc: 110, // ppb
        rateOfRise: 0.1, // °C/min
        flameDetected: false,
        flameIntensity: 0.0,
        flameCoords: { x: 0.52, y: 0.62, w: 0.22, h: 0.35 },
        thermalMax: 24.2,
        suppressionSystem: 'Clean Agent Aerosol (Aero-K)'
      },
      2: {
        id: 2,
        code: 'Z2',
        name: 'Server Room Alpha (HPC Cluster)',
        roomType: 'server',
        status: 'NOMINAL',
        temp: 21.2,
        tempTarget: 21.2,
        smokePpm: 10.0,
        smokeTarget: 10.0,
        humidity: 42.0,
        aqi: 28,
        voc: 85,
        rateOfRise: 0.05,
        flameDetected: false,
        flameIntensity: 0.0,
        flameCoords: { x: 0.45, y: 0.55, w: 0.20, h: 0.30 },
        thermalMax: 22.0,
        suppressionSystem: 'Inert Gas IG-541 (Inergen)'
      },
      3: {
        id: 3,
        code: 'Z3',
        name: 'Chemical Synthesis Lab',
        roomType: 'chemical',
        status: 'NOMINAL',
        temp: 22.4,
        tempTarget: 22.4,
        smokePpm: 16.0,
        smokeTarget: 16.0,
        humidity: 48.0,
        aqi: 45,
        voc: 140,
        rateOfRise: 0.1,
        flameDetected: false,
        flameIntensity: 0.0,
        flameCoords: { x: 0.60, y: 0.58, w: 0.25, h: 0.38 },
        thermalMax: 23.1,
        suppressionSystem: 'High-Pressure Water Mist'
      },
      4: {
        id: 4,
        code: 'Z4',
        name: 'Logistics Hub & Automated Cargo',
        roomType: 'warehouse',
        status: 'NOMINAL',
        temp: 20.5,
        tempTarget: 20.5,
        smokePpm: 18.0,
        smokeTarget: 18.0,
        humidity: 50.0,
        aqi: 52,
        voc: 95,
        rateOfRise: 0.08,
        flameDetected: false,
        flameIntensity: 0.0,
        flameCoords: { x: 0.38, y: 0.65, w: 0.28, h: 0.40 },
        thermalMax: 21.5,
        suppressionSystem: 'Early Suppression Fast Response (ESFR)'
      },
      webcam: {
        id: 'webcam',
        code: 'WEBCAM',
        name: 'Laptop Camera (Live Sensor)',
        roomType: 'webcam',
        status: 'NOMINAL',
        temp: 23.5,
        tempTarget: 23.5,
        smokePpm: 12.0,
        smokeTarget: 12.0,
        humidity: 45.0,
        aqi: 35,
        voc: 92,
        rateOfRise: 0.0,
        flameDetected: false,
        flameIntensity: 0.0,
        flameCoords: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
        thermalMax: 23.5,
        suppressionSystem: 'Autonomous Telephony Dispatch & Alert Chime'
      }
    };

    // Raw Sensor Stream Buffer for Waveform Graph (Layer 2 Preprocessing)
    this.rawHistory = [];
    this.filteredHistory = [];
    this.historyLength = 120;
    this.kalmanEstimate = 20.0;
    this.kalmanError = 1.0;
    this.kalmanQ = 0.05; // process noise
    this.kalmanR = 2.5;  // measurement noise

    for (let i = 0; i < this.historyLength; i++) {
      this.rawHistory.push(20 + (Math.random() - 0.5) * 4);
      this.filteredHistory.push(20);
    }

    // AI Detection Weight Configuration
    this.weights = {
      w1_optical: 0.40, // 40%
      w2_thermal: 0.35, // 35%
      w3_sensors: 0.25  // 25%
    };

    // Thresholds
    this.thresholds = {
      flameConfidence: 75, // %
      thermalMaxTemp: 65,  // °C
      smokeObscuration: 60 // PPM
    };
  }

  getCurrentZone() {
    return this.zones[this.currentZoneId] || this.zones[1];
  }

  setZone(zoneId) {
    if (this.zones[zoneId]) {
      this.currentZoneId = zoneId;
    }
  }

  // Set test scenario for the active zone
  setScenario(scenarioKey) {
    this.currentScenario = scenarioKey;
    const zone = this.getCurrentZone();

    switch (scenarioKey) {
      case 'normal':
        zone.tempTarget = 23.5;
        zone.smokeTarget = 14.0;
        zone.flameDetected = false;
        zone.flameIntensity = 0.0;
        zone.status = 'NOMINAL';
        break;

      case 'smolder':
        zone.tempTarget = 52.0;
        zone.smokeTarget = 145.0;
        zone.flameDetected = false;
        zone.flameIntensity = 0.15;
        zone.status = 'WARNING';
        break;

      case 'thermal':
        zone.tempTarget = 135.0;
        zone.smokeTarget = 85.0;
        zone.flameDetected = true;
        zone.flameIntensity = 0.45;
        zone.status = 'CRITICAL';
        break;

      case 'flame':
        zone.tempTarget = 195.0;
        zone.smokeTarget = 210.0;
        zone.flameDetected = true;
        zone.flameIntensity = 0.95;
        zone.status = 'CRITICAL';
        break;

      case 'false_alarm':
        zone.tempTarget = 78.0;
        zone.smokeTarget = 18.0;
        zone.humidity = 95.0;
        zone.flameDetected = false;
        zone.flameIntensity = 0.0;
        zone.status = 'WARNING';
        break;
    }
  }

  // Sync real webcam detection data into the webcam zone
  syncWebcamDetection(webDet) {
    const zone = this.zones['webcam'];
    if (!zone || !webDet) return;

    zone.flameDetected = webDet.flameDetected;
    zone.flameIntensity = Math.min(1.0, webDet.flameConfidence / 100);
    zone.flameCoords = webDet.bbox;
    zone.thermalMax = webDet.thermalMax;

    if (webDet.flameDetected) {
      zone.status = 'CRITICAL';
      zone.tempTarget = Math.max(zone.tempTarget, webDet.thermalMax);
      zone.smokeTarget = Math.max(zone.smokeTarget, 95.0);
    } else {
      if (webDet.flameConfidence > 35) {
        zone.status = 'WARNING';
        zone.tempTarget = 38.0;
      } else {
        zone.status = 'NOMINAL';
        zone.tempTarget = 23.5;
        zone.smokeTarget = 12.0;
      }
    }
  }

  // Activate Clean Agent Extinguishment
  triggerSuppression() {
    this.suppressionActive = true;
    this.suppressionCountdown = 10;
    const zone = this.getCurrentZone();

    const quenchInterval = setInterval(() => {
      this.suppressionCountdown--;
      zone.tempTarget = Math.max(22.0, zone.tempTarget - 30);
      zone.smokeTarget = Math.max(15.0, zone.smokeTarget - 35);
      zone.flameIntensity = Math.max(0.0, zone.flameIntensity - 0.25);

      if (zone.flameIntensity <= 0.05) {
        zone.flameDetected = false;
        zone.status = 'NOMINAL';
      }

      if (this.suppressionCountdown <= 0) {
        clearInterval(quenchInterval);
        this.suppressionActive = false;
        this.currentScenario = 'normal';
      }
    }, 1000);
  }

  // Smooth tick update loop for real-time physics and sensor jitter
  update(dt = 0.05) {
    const zone = this.getCurrentZone();

    // Natural jitter and approach target
    const jitter = (Math.random() - 0.5) * 0.4;
    zone.temp += (zone.tempTarget - zone.temp) * 0.08 + jitter * 0.1;
    zone.smokePpm += (zone.smokeTarget - zone.smokePpm) * 0.08 + (Math.random() - 0.5) * 1.2;

    if (zone.smokePpm < 5) zone.smokePpm = 5;
    if (zone.temp < 15) zone.temp = 15;

    zone.rateOfRise = ((zone.tempTarget - zone.temp) * 1.5).toFixed(1);
    if (this.currentZoneId !== 'webcam') {
      zone.thermalMax = Math.max(zone.temp, zone.temp + (zone.flameIntensity * 45));
    }

    // Kalman Filter step for Preprocessing Layer visualizer
    const rawMeasurement = zone.temp + (Math.random() - 0.5) * 8.0;
    
    this.kalmanError += this.kalmanQ;
    const kalmanGain = this.kalmanError / (this.kalmanError + this.kalmanR);
    this.kalmanEstimate += kalmanGain * (rawMeasurement - this.kalmanEstimate);
    this.kalmanError = (1 - kalmanGain) * this.kalmanError;

    this.rawHistory.push(rawMeasurement);
    if (this.rawHistory.length > this.historyLength) this.rawHistory.shift();

    this.filteredHistory.push(this.kalmanEstimate);
    if (this.filteredHistory.length > this.historyLength) this.filteredHistory.shift();
  }
}
