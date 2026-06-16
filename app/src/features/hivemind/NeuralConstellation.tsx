import { useCallback, useEffect, useRef } from 'react';

// ── Neural Constellation - Animated network visualization ────────────
// A 2D canvas-based constellation of nodes + edges with subtle motion
// and purple glow representing the collective CloserEdge brain.

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  color: string;
  agentId?: string;
}

interface Edge {
  from: number;
  to: number;
  alpha: number;
}

const AGENT_COLORS: Record<string, string> = {
  eden: '#7C3AED',
  crest: '#60a5fa',
  lexis: '#fbbf24',
  haven: '#10b981',
  forge: '#ef4444',
  nora: '#A855F7',
};

const ACCENT = '#7C3AED';

export function NeuralConstellation({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  const initNetwork = useCallback((w: number, h: number) => {
    const nodes: Node[] = [];
    const agents = Object.keys(AGENT_COLORS);
    const nodeCount = Math.min(80, Math.floor((w * h) / 8000));

    for (let i = 0; i < nodeCount; i++) {
      const agentIdx = i % agents.length;
      const agent = i < agents.length * 2 ? agents[agentIdx] : undefined;
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: agent ? 3 + Math.random() * 2 : 1.5 + Math.random() * 1.5,
        baseAlpha: agent ? 0.8 : 0.3 + Math.random() * 0.3,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.3 + Math.random() * 0.7,
        color: agent ? AGENT_COLORS[agent] : ACCENT,
        agentId: agent,
      });
    }

    // Build edges based on proximity
    const edges: Edge[] = [];
    const maxDist = Math.min(w, h) * 0.18;
    for (let i = 0; i < nodes.length; i++) {
      let connections = 0;
      for (let j = i + 1; j < nodes.length && connections < 3; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          edges.push({ from: i, to: j, alpha: 1 - dist / maxDist });
          connections++;
        }
      }
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = canvas.parentElement?.clientWidth ?? 800;
    let h = canvas.parentElement?.clientHeight ?? 500;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    initNetwork(w, h);

    let time = 0;

    function animate() {
      if (!ctx) return;
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const mouse = mouseRef.current;

      // Update positions
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        // Mouse influence
        if (mouse) {
          const dx = mouse.x - node.x;
          const dy = mouse.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150 && dist > 1) {
            node.vx += (dx / dist) * 0.02;
            node.vy += (dy / dist) * 0.02;
          }
        }

        // Damping
        node.vx *= 0.995;
        node.vy *= 0.995;

        // Boundary wrap with padding
        if (node.x < -20) node.x = w + 20;
        if (node.x > w + 20) node.x = -20;
        if (node.y < -20) node.y = h + 20;
        if (node.y > h + 20) node.y = -20;
      }

      // Draw edges
      for (const edge of edges) {
        const from = nodes[edge.from];
        const to = nodes[edge.to];
        if (!from || !to) continue;

        const dx = from.x - to.x;
        const dy = from.y - to.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = Math.min(w, h) * 0.18;
        if (dist > maxDist) continue;

        const alpha = (1 - dist / maxDist) * 0.15;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Dynamic edges from proximity
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const threshold = 100;
          if (dist < threshold && dist > 0) {
            const alpha = (1 - dist / threshold) * 0.08;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const pulse = Math.sin(time * node.pulseSpeed + node.pulsePhase) * 0.3 + 0.7;
        const alpha = node.baseAlpha * pulse;
        const r = node.radius * (0.9 + pulse * 0.2);

        // Glow
        if (node.agentId) {
          const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 4);
          gradient.addColorStop(0, `${node.color}40`);
          gradient.addColorStop(1, `${node.color}00`);
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 4, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          node.color +
          Math.round(alpha * 255)
            .toString(16)
            .padStart(2, '0');
        ctx.fill();
      }

      // Center glow effect
      const centerX = w / 2;
      const centerY = h / 2;
      const glowRadius = Math.min(w, h) * 0.3;
      const centerGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        glowRadius
      );
      centerGlow.addColorStop(0, 'rgba(124, 58, 237, 0.04)');
      centerGlow.addColorStop(0.5, 'rgba(124, 58, 237, 0.02)');
      centerGlow.addColorStop(1, 'rgba(124, 58, 237, 0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, w, h);

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      w = canvas.parentElement?.clientWidth ?? 800;
      h = canvas.parentElement?.clientHeight ?? 500;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initNetwork(w, h);
    };

    const ro = new ResizeObserver(handleResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleMouseLeave = () => {
      mouseRef.current = null;
    };
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [initNetwork]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ pointerEvents: 'auto' }}
    />
  );
}
