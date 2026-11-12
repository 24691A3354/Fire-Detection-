/**
 * Audio Synthesizer & Emergency Speech Dispatch Engine
 * Utilizes Web Audio API for tactical sound effects and Web Speech API for telephony voice.
 */

export class AudioSynthEngine {
  constructor() {
    this.audioCtx = null;
    this.soundEnabled = true;
    this.activeSirenOsc = null;
    this.activeSirenGain = null;
    this.activeSirenLfo = null;
    this.isSirenPlaying = false;
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled && this.isSirenPlaying) {
      this.stopSiren();
    }
    return this.soundEnabled;
  }

  // Play a sleek UI click or chip select sound
  playClick() {
    if (!this.soundEnabled) return;
    try {
      this.ensureContext();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.05);
    } catch {
      // Audio not permitted yet
    }
  }

  // Play alert ping for warning or notification
  playWarningPing() {
    if (!this.soundEnabled) return;
    try {
      this.ensureContext();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, this.audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    } catch {
      // ignore
    }
  }

  // Start continuous modulated fire emergency siren
  startFireSiren() {
    if (!this.soundEnabled || this.isSirenPlaying) return;
    try {
      this.ensureContext();
      this.isSirenPlaying = true;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, this.audioCtx.currentTime);

      // Low frequency oscillator to modulate pitch between 650Hz and 950Hz
      lfo.frequency.setValueAtTime(1.5, this.audioCtx.currentTime);
      lfoGain.gain.setValueAtTime(180, this.audioCtx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      lfo.start();

      this.activeSirenOsc = osc;
      this.activeSirenGain = gain;
      this.activeSirenLfo = lfo;
    } catch {
      // ignore
    }
  }

  stopSiren() {
    if (!this.isSirenPlaying) return;
    try {
      if (this.activeSirenGain) {
        this.activeSirenGain.gain.linearRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.1);
      }
      setTimeout(() => {
        if (this.activeSirenOsc) {
          try { this.activeSirenOsc.stop(); } catch { /* ignore */ }
          try { this.activeSirenLfo.stop(); } catch { /* ignore */ }
        }
        this.activeSirenOsc = null;
        this.activeSirenGain = null;
        this.activeSirenLfo = null;
        this.isSirenPlaying = false;
      }, 120);
    } catch {
      this.isSirenPlaying = false;
    }
  }

  // Play telephone DTMF tones when initiating emergency call
  playDtmfTone(freq1 = 941, freq2 = 1336, duration = 0.15) {
    if (!this.soundEnabled) return;
    try {
      this.ensureContext();
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.frequency.value = freq1;
      osc2.frequency.value = freq2;

      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.audioCtx.currentTime + duration);
      osc2.stop(this.audioCtx.currentTime + duration);
    } catch {
      // ignore
    }
  }

  // Play white noise clean agent suppression gas release
  playSuppressionHiss() {
    if (!this.soundEnabled) return;
    try {
      this.ensureContext();
      const bufferSize = this.audioCtx.sampleRate * 2.5;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      // Bandpass filter for gas hiss sound
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 1.2;

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 2.5);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);

      noise.start();
    } catch {
      // ignore
    }
  }

  // Web Speech API Voice synthesis for autonomous emergency voice call
  speakEmergencyVoice(text, onBoundary = null, onEnd = null) {
    if (!('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.volume = this.soundEnabled ? 1.0 : 0.0;

    const voices = window.speechSynthesis.getVoices();
    // Prefer authoritative English voice
    const voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Alex')));
    if (voice) utterance.voice = voice;

    if (onBoundary) utterance.onboundary = onBoundary;
    if (onEnd) utterance.onend = onEnd;

    window.speechSynthesis.speak(utterance);
  }

  cancelSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
