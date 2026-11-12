/**
 * AI Fire Detection Engine & Decision Logic Unit (Layers 2 & 3)
 * Simulates deep learning multi-modal neural network (ViT + Bi-LSTM + Cross-Attention).
 * Ingests both live laptop camera CV detections and simulated zone sensor feeds.
 */

export class AIDetectionEngine {
  constructor(telemetryState, webcamDetector = null) {
    this.telemetry = telemetryState;
    this.webcam = webcamDetector;
    this.lastInferenceTime = 6.8; // ms
    this.fps = 30;
    this.frameCount = 0;
    this.decisionState = 'SECURE'; // SECURE, INVESTIGATING, WARNING, CRITICAL_ALARM
    this.detectionHistory = [];
  }

  setWebcamDetector(webcam) {
    this.webcam = webcam;
  }

  // Run multi-modal neural inference loop
  infer() {
    this.frameCount++;
    const zone = this.telemetry.getCurrentZone();
    const weights = this.telemetry.weights;
    const thresh = this.telemetry.thresholds;

    // Latency depending on Edge vs Cloud compute node
    if (this.telemetry.computeNode === 'edge') {
      this.lastInferenceTime = 6.2 + (Math.random() - 0.5) * 1.2;
    } else {
      this.lastInferenceTime = 46.2 + (Math.random() - 0.5) * 6.5;
    }

    let flameConfidence = 0.0;
    let smokeConfidence = 0.0;
    let thermalAnomaly = 0.0;
    let isRealFire = false;

    // Check if current active surveillance stream is the Live Laptop Webcam
    if (this.telemetry.currentZoneId === 'webcam' && this.webcam && this.webcam.isWebcamActive) {
      const webDet = this.webcam.detection;

      flameConfidence = webDet.flameConfidence;
      smokeConfidence = Math.min(95, webDet.flameConfidence * 0.85);

      const deltaT = Math.max(0, webDet.thermalMax - 25.0);
      thermalAnomaly = Math.min(100, (deltaT / (thresh.thermalMaxTemp - 25.0)) * 60 + (deltaT > (thresh.thermalMaxTemp - 25.0) ? 35 : 0));

      const opticalComponent = flameConfidence * weights.w1_optical;
      const thermalComponent = thermalAnomaly * weights.w2_thermal;
      const sensorComponent = (flameConfidence > 50 ? 60 : 15) * weights.w3_sensors;

      let fusionRiskIndex = opticalComponent + thermalComponent + sensorComponent;
      if (webDet.flameDetected && flameConfidence >= 65) {
        fusionRiskIndex = Math.max(fusionRiskIndex, flameConfidence);
      }
      fusionRiskIndex = Math.min(99.9, Math.max(0.5, fusionRiskIndex));

      // Decision Logic Unit Evaluation for Laptop Webcam
      if (webDet.flameDetected && flameConfidence >= 65) {
        this.decisionState = 'CRITICAL FIRE ALARM (WEBCAM)';
        isRealFire = true;
      } else if (webDet.flameDetected) {
        this.decisionState = 'FIRE DETECTED (WEBCAM)';
        isRealFire = true;
      } else if (flameConfidence > 50 && (webDet.corePixelCount || 0) >= 4) {
        this.decisionState = 'WARNING (WEBCAM GLOW)';
        isRealFire = false;
      } else {
        this.decisionState = 'SECURE (CAMERA ACTIVE)';
        isRealFire = false;
      }

      const result = {
        flameConfidence,
        smokeConfidence,
        thermalAnomaly,
        smokeScore: flameConfidence * 0.6,
        rorScore: 0,
        fusionRiskIndex,
        isRealFire,
        decisionState: this.decisionState,
        inferenceTimeMs: this.lastInferenceTime,
        opticalComponent,
        thermalComponent,
        sensorComponent,
        isWebcamSource: true,
        timestamp: new Date().toISOString()
      };

      this.detectionHistory.push(result);
      if (this.detectionHistory.length > 50) this.detectionHistory.shift();
      return result;
    }

    // Otherwise evaluate Simulated Industrial Facility Zone (1-4)
    if (zone.flameDetected) {
      flameConfidence = 78.0 + (zone.flameIntensity * 21.0) + (Math.random() - 0.5) * 2.5;
      flameConfidence = Math.min(99.8, Math.max(0, flameConfidence));
    } else if (zone.temp > 70 && this.telemetry.currentScenario === 'false_alarm') {
      flameConfidence = 14.0 + (Math.random() - 0.5) * 5.0;
    } else {
      flameConfidence = (Math.random() * 1.5);
    }

    if (zone.smokePpm > 40) {
      smokeConfidence = Math.min(98.5, (zone.smokePpm / 180) * 100 + (Math.random() - 0.5) * 3);
    } else {
      smokeConfidence = (zone.smokePpm / 50) * 8 + (Math.random() * 2);
    }

    const deltaT = Math.max(0, zone.thermalMax - 25.0);
    thermalAnomaly = Math.min(100, (deltaT / (thresh.thermalMaxTemp - 25.0)) * 60 + (deltaT > (thresh.thermalMaxTemp - 25.0) ? 35 : 0));

    const rorScore = Math.min(100, Math.max(0, parseFloat(zone.rateOfRise) * 15));
    const smokeScore = Math.min(100, (zone.smokePpm / thresh.smokeObscuration) * 70);

    const opticalComponent = flameConfidence * weights.w1_optical;
    const thermalComponent = thermalAnomaly * weights.w2_thermal;
    const sensorComponent = Math.max(smokeScore, rorScore) * weights.w3_sensors;

    let fusionRiskIndex = opticalComponent + thermalComponent + sensorComponent;
    fusionRiskIndex = Math.min(99.9, Math.max(0.5, fusionRiskIndex));

    if (this.telemetry.currentScenario === 'false_alarm') {
      this.decisionState = 'INVESTIGATING (STEAM/HEAT)';
      isRealFire = false;
      fusionRiskIndex = Math.min(42.0, fusionRiskIndex);
    } else if (fusionRiskIndex > 72.0 && (flameConfidence > thresh.flameConfidence || zone.smokePpm > thresh.smokeObscuration)) {
      this.decisionState = 'CRITICAL FIRE ALARM';
      isRealFire = true;
    } else if (fusionRiskIndex > 45.0) {
      this.decisionState = 'WARNING (SMOLDER/HEAT)';
      isRealFire = false;
    } else {
      this.decisionState = 'SECURE';
      isRealFire = false;
    }

    const result = {
      flameConfidence,
      smokeConfidence,
      thermalAnomaly,
      smokeScore,
      rorScore,
      fusionRiskIndex,
      isRealFire,
      decisionState: this.decisionState,
      inferenceTimeMs: this.lastInferenceTime,
      opticalComponent,
      thermalComponent,
      sensorComponent,
      isWebcamSource: false,
      timestamp: new Date().toISOString()
    };

    this.detectionHistory.push(result);
    if (this.detectionHistory.length > 50) this.detectionHistory.shift();

    return result;
  }
}
