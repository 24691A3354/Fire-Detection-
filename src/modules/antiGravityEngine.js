/**
 * Anti-Gravity Particle & Physics Engine
 * Implements zero-gravity floating particle fields and dynamic spatial levitation.
 */

export class AntiGravityEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 65;
    this.mouse = { x: -1000, y: -1000, radius: 180, isHovering: false };
    this.animId = null;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.isHovering = true;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.isHovering = false;
    });

    this.createParticles();
    this.animate();
    this.initCardLevitation();
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createParticles() {
    this.particles = [];
    const colors = [
      'rgba(0, 245, 212, 0.5)',   // Cyan
      'rgba(58, 134, 255, 0.45)',  // Blue
      'rgba(255, 69, 0, 0.4)',    // Flame ember
      'rgba(157, 78, 221, 0.35)', // Purple
      'rgba(255, 255, 255, 0.3)'  // Starlight
    ];

    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.6 - 0.2, // Anti-gravity: slowly floats UPWARD
        radius: Math.random() * 2.2 + 0.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        baseVy: -Math.random() * 0.5 - 0.15,
        oscillationSpeed: Math.random() * 0.02 + 0.005,
        oscillationAngle: Math.random() * Math.PI * 2,
        mass: Math.random() * 1.5 + 0.5
      });
    }
  }

  animate() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Anti-gravity harmonic drift
      p.oscillationAngle += p.oscillationSpeed;
      p.x += p.vx + Math.sin(p.oscillationAngle) * 0.3;
      p.y += p.vy;

      // Mouse gravitational interaction
      if (this.mouse.isHovering) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.mouse.radius && dist > 1) {
          // Subtle zero-g repulsion / orbital curl
          const force = (1 - dist / this.mouse.radius) * 1.5;
          p.x += (dx / dist) * force * p.mass;
          p.y += (dy / dist) * force * p.mass;
        }
      }

      // Wrap around edges
      if (p.y < -10) {
        p.y = h + 10;
        p.x = Math.random() * w;
      }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      // Render glowing anti-gravity particle
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = p.color;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      // Draw faint connections between nearby zero-g particles
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 85) {
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.strokeStyle = `rgba(0, 245, 212, ${0.12 * (1 - dist / 85)})`;
          this.ctx.lineWidth = 0.6;
          this.ctx.stroke();
        }
      }
    }

    this.animId = requestAnimationFrame(() => this.animate());
  }

  initCardLevitation() {
    // Subtle 3D mouse parallax on glassmorphic cards
    const cards = document.querySelectorAll('.glass-card');
    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const rotX = -(y / rect.height) * 3;
        const rotY = (x / rect.width) * 3;
        card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-3px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }
}
