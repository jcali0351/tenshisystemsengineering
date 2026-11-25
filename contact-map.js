(() => {
  const hero = document.getElementById('contact-map-hero');
  const stage = document.getElementById('cm-stage');
  const canvas = document.getElementById('cm-canvas');
  if (!hero || !stage || !canvas) return;
  const ctx = canvas.getContext('2d');

  const pinHost = document.getElementById('cm-pin-host');
  const pinServer = document.getElementById('cm-pin-server');
  const popover = document.getElementById('cm-popover');
  const popTag = document.getElementById('cm-pop-tag');
  const popTitle = document.getElementById('cm-pop-title');
  const popMeta = document.getElementById('cm-pop-meta');
  const popClose = document.getElementById('cm-pop-close');
  const popFocus = document.getElementById('cm-pop-focus');
  const popArcs = document.getElementById('cm-pop-arcs');
  const tooltip = document.getElementById('cm-tooltip');
  const tipCity = document.getElementById('cm-tip-city');
  const tipMeta = document.getElementById('cm-tip-meta');
  const zoomReadout = document.getElementById('cm-zoom-readout');

  const WORLD_W = 1600;
  const WORLD_H = 820;

  const NODES = {
    host: {
      id: 'host',
      label: 'HOST',
      tag: 'Digital & Remote-First',
      title: 'Host — Downtown Madison, WI',
      lat: 43.0731,
      lon: -89.4012,
      tz: 'America/Chicago',
      coords: '43.0731° N, 89.4012° W'
    },
    server: {
      id: 'server',
      label: 'SERVER',
      tag: 'Online • Core Node',
      title: 'Server — Kuala Lumpur, Malaysia',
      lat: 3.1390,
      lon: 101.6869,
      tz: 'Asia/Kuala_Lumpur',
      coords: '3.1390° N, 101.6869° E'
    }
  };

  const VISITORS = [
    { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo', hub: 'server' },
    { city: 'London', country: 'UK', lat: 51.5072, lon: -0.1276, tz: 'Europe/London', hub: 'host' },
    { city: 'São Paulo', country: 'Brazil', lat: -23.5505, lon: -46.6333, tz: 'America/Sao_Paulo', hub: 'host' },
    { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney', hub: 'server' },
    { city: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin', hub: 'host' },
    { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792, tz: 'Africa/Lagos', hub: 'host' },
    { city: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832, tz: 'America/Toronto', hub: 'host' },
    { city: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul', hub: 'server' },
    { city: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', hub: 'server' },
    { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', hub: 'host' },
    { city: 'Mexico City', country: 'Mexico', lat: 19.4326, lon: -99.1332, tz: 'America/Mexico_City', hub: 'host' },
    { city: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241, tz: 'Africa/Johannesburg', hub: 'host' },
    { city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore', hub: 'server' },
    { city: 'New York', country: 'USA', lat: 40.7128, lon: -74.006, tz: 'America/New_York', hub: 'host' },
    { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires', hub: 'host' },
    { city: 'Dublin', country: 'Ireland', lat: 53.3498, lon: -6.2603, tz: 'Europe/Dublin', hub: 'host' },
    { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219, tz: 'Africa/Nairobi', hub: 'host' },
    { city: 'Auckland', country: 'New Zealand', lat: -36.8485, lon: 174.7633, tz: 'Pacific/Auckland', hub: 'server' },
    { city: 'Stockholm', country: 'Sweden', lat: 59.3293, lon: 18.0686, tz: 'Europe/Stockholm', hub: 'host' },
    { city: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357, tz: 'Africa/Cairo', hub: 'host' }
  ];

  // Real coastlines: Natural Earth land 1:50m (public domain), precomputed by tools/build-contact-map-land.py
  let LAND = [];
  const LAND_URL = 'contact-map-land.json?v=1f235ae4';

  function project(lon, lat) {
    const x = ((lon + 180) / 360) * WORLD_W;
    const clampedLat = Math.max(-78, Math.min(82, lat));
    const y = ((85 - clampedLat) / 160) * WORLD_H;
    return { x, y };
  }

  const hostPt = project(NODES.host.lon, NODES.host.lat);
  const serverPt = project(NODES.server.lon, NODES.server.lat);
  const visitorPts = VISITORS.map((v, i) => ({
    ...v,
    ...project(v.lon, v.lat),
    phase: (i * 0.43) % 1
  }));

  const cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1, tx: WORLD_W / 2, ty: WORLD_H / 2, tzoom: 1, vx: 0, vy: 0 };
  let width = 0, height = 0, dpr = 1;
  let dragging = false, lastX = 0, lastY = 0;
  let showArcs = true;
  let activeNode = null;
  let hoveredVisitor = null;
  let ripples = [];
  let isVisible = true;
  let rafId = null;

  function worldToScreen(wx, wy) {
    return {
      x: (wx - cam.x) * cam.zoom + width / 2,
      y: (wy - cam.y) * cam.zoom + height / 2
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - width / 2) / cam.zoom + cam.x,
      y: (sy - height / 2) / cam.zoom + cam.y
    };
  }

  function fitAll(instant = false) {
    const pts = [hostPt, serverPt, ...visitorPts];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const padX = width > 900 ? width * 0.22 : 40;
    const availW = Math.max(200, width - padX - 60);
    const availH = Math.max(200, height - 120);
    const scale = Math.min(availW / (maxX - minX), availH / (maxY - minY));
    const z = Math.max(0.45, Math.min(2.2, scale));
    const offsetX = width > 900 ? -110 / z : 0;
    cam.tzoom = z;
    cam.tx = (minX + maxX) / 2 + offsetX;
    cam.ty = (minY + maxY) / 2;
    if (instant) {
      cam.zoom = cam.tzoom;
      cam.x = cam.tx;
      cam.y = cam.ty;
    }
  }

  function focusNode(key) {
    const pt = key === 'host' ? hostPt : serverPt;
    cam.tzoom = Math.max(1.85, Math.min(2.6, width / 560));
    cam.tx = pt.x - (width > 900 ? 80 / cam.tzoom : 0);
    cam.ty = pt.y;
    openPopover(key);
  }

  function formatTime(tz) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
      }).format(new Date());
    } catch { return ''; }
  }

  function openPopover(key) {
    const node = NODES[key];
    activeNode = key;
    popTag.textContent = node.tag;
    popTag.className = 'cm-popover-tag cm-popover-tag--' + key;
    popTitle.textContent = node.title;
    popMeta.innerHTML =
      `<div><strong>Local Time:</strong> ${formatTime(node.tz)}</div>` +
      `<div><strong>Coords:</strong> ${node.coords}</div>`;
    popFocus.textContent = cam.tzoom > 1.7 ? 'Fit All' : `Focus ${node.label}`;
    popover.hidden = false;
  }

  function spawnPing(visitor) {
    const v = visitor || visitorPts[Math.floor(Math.random() * visitorPts.length)];
    ripples.push({ x: v.x, y: v.y, t: 0, color: v.hub === 'server' ? '#a855f7' : '#ff7a1a' });
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitAll(true);
  }

  function drawArc(p1, p2, colorA, colorB, tOffset, isBackbone = false) {
    const mx = (p1.x + p2.x) / 2;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const my = (p1.y + p2.y) / 2 - Math.min(180, dist * 0.24);

    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = (isBackbone ? 2.4 : 1.15) / cam.zoom;
    ctx.globalAlpha = isBackbone ? 0.85 : 0.36;
    ctx.stroke();

    const drawPulse = (u, pulseColor, r) => {
      const inv = 1 - u;
      const px = inv * inv * p1.x + 2 * inv * u * mx + u * u * p2.x;
      const py = inv * inv * p1.y + 2 * inv * u * my + u * u * p2.y;
      ctx.beginPath();
      ctx.arc(px, py, r / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = pulseColor;
      ctx.globalAlpha = 0.95;
      ctx.fill();
    };

    drawPulse(tOffset % 1, '#ffb36b', isBackbone ? 4.2 : 2.5);
    if (isBackbone) {
      drawPulse(1 - (tOffset % 1), '#d294ff', 4.2);
    }
    ctx.globalAlpha = 1;
  }

  function render(now) {
    if (!isVisible) { rafId = null; return; }
    const time = now * 0.001;

    if (!dragging) {
      cam.x += (cam.tx - cam.x) * 0.1 + cam.vx;
      cam.y += (cam.ty - cam.y) * 0.1 + cam.vy;
      cam.tx += cam.vx;
      cam.ty += cam.vy;
      cam.vx *= 0.9;
      cam.vy *= 0.9;
    }
    cam.zoom += (cam.tzoom - cam.zoom) * 0.12;
    if (zoomReadout) zoomReadout.textContent = Math.round(cam.zoom * 100) + '%';

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Graticule grid
    ctx.strokeStyle = 'rgba(155, 77, 255, 0.09)';
    ctx.lineWidth = 1 / cam.zoom;
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * WORLD_W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
    }
    for (let lat = -60; lat <= 75; lat += 25) {
      const y = ((85 - lat) / 160) * WORLD_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
    }

    // Continents (each item is a polygon: a list of rings of [lon, lat]; rings are not pre-closed)
    ctx.fillStyle = '#161026';
    ctx.strokeStyle = 'rgba(155, 77, 255, 0.55)';
    ctx.lineWidth = 1.25 / cam.zoom;
    for (const poly of LAND) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lon, lat], idx) => {
          const p = project(lon, lat);
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }

    // Arcs
    if (showArcs) {
      for (const v of visitorPts) {
        const target = v.hub === 'server' ? serverPt : hostPt;
        const cA = v.hub === 'server' ? '#a855f7' : '#ff6b1a';
        const cB = v.hub === 'server' ? '#ff8533' : '#9b4dff';
        drawArc(v, target, cA, cB, time * 0.22 + v.phase, false);
      }
      drawArc(hostPt, serverPt, '#ff7a1a', '#a855f7', time * 0.28, true);
    }

    // Radar rings for HOST & SERVER
    [
      { pt: hostPt, color: 'rgba(255, 122, 26,' },
      { pt: serverPt, color: 'rgba(168, 85, 247,' }
    ].forEach(({ pt, color }, idx) => {
      for (let r = 0; r < 2; r++) {
        const p = (time * 0.55 + r * 0.5 + idx * 0.25) % 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, (8 + p * 42) / cam.zoom, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}${(1 - p) * 0.65})`;
        ctx.lineWidth = 1.8 / cam.zoom;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5 / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? '#ff8533' : '#c084fc';
      ctx.fill();
    });

    // Visitor dots
    for (const v of visitorPts) {
      const isHover = hoveredVisitor === v;
      ctx.beginPath();
      ctx.arc(v.x, v.y, (isHover ? 6.5 : 3.6) / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = isHover ? '#fff' : (v.hub === 'server' ? '#c084fc' : '#ff8c3a');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x, v.y, (isHover ? 11 : 7) / cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = v.hub === 'server' ? 'rgba(168,85,247,0.45)' : 'rgba(255,122,26,0.45)';
      ctx.lineWidth = 1.2 / cam.zoom;
      ctx.stroke();
    }

    // Ping ripples
    ripples = ripples.filter(rp => rp.t < 1);
    for (const rp of ripples) {
      rp.t += 0.018;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, (6 + rp.t * 36) / cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = rp.color;
      ctx.globalAlpha = 1 - rp.t;
      ctx.lineWidth = 2 / cam.zoom;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    const hs = worldToScreen(hostPt.x, hostPt.y);
    const ss = worldToScreen(serverPt.x, serverPt.y);
    pinHost.style.left = hs.x + 'px';
    pinHost.style.top = hs.y + 'px';
    pinServer.style.left = ss.x + 'px';
    pinServer.style.top = ss.y + 'px';

    if (activeNode && !popover.hidden) {
      const pos = activeNode === 'host' ? hs : ss;
      popover.style.left = Math.max(145, Math.min(width - 145, pos.x)) + 'px';
      popover.style.top = Math.max(190, pos.y) + 'px';
    }

    rafId = requestAnimationFrame(render);
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .cm-popover')) return;
    dragging = true;
    stage.classList.add('is-dragging');
    lastX = e.clientX;
    lastY = e.clientY;
    cam.vx = cam.vy = 0;
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', (e) => {
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragging) {
      const dx = (e.clientX - lastX) / cam.zoom;
      const dy = (e.clientY - lastY) / cam.zoom;
      cam.x -= dx; cam.tx = cam.x;
      cam.y -= dy; cam.ty = cam.y;
      cam.vx = -dx * 0.25;
      cam.vy = -dy * 0.25;
      lastX = e.clientX;
      lastY = e.clientY;
      tooltip.hidden = true;
      return;
    }

    const w = screenToWorld(sx, sy);
    const hitRadius = 14 / cam.zoom;
    hoveredVisitor = visitorPts.find(v => Math.hypot(v.x - w.x, v.y - w.y) < hitRadius) || null;
    if (hoveredVisitor) {
      const sp = worldToScreen(hoveredVisitor.x, hoveredVisitor.y);
      tipCity.textContent = `${hoveredVisitor.city}, ${hoveredVisitor.country}`;
      tipMeta.textContent = `Local ${formatTime(hoveredVisitor.tz)} • Routed via ${hoveredVisitor.hub.toUpperCase()}`;
      tooltip.style.left = sp.x + 'px';
      tooltip.style.top = sp.y + 'px';
      tooltip.hidden = false;
    } else {
      tooltip.hidden = true;
    }
  });

  const endDrag = () => { dragging = false; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.16 : 0.86;
    cam.tzoom = Math.max(0.45, Math.min(4.5, cam.tzoom * factor));
    cam.tx = before.x - (sx - width / 2) / cam.tzoom;
    cam.ty = before.y - (sy - height / 2) / cam.tzoom;
  }, { passive: false });

  pinHost.addEventListener('click', () => openPopover('host'));
  pinServer.addEventListener('click', () => openPopover('server'));
  popClose.addEventListener('click', () => { popover.hidden = true; activeNode = null; });
  popFocus.addEventListener('click', () => {
    if (cam.tzoom > 1.7) { fitAll(); popFocus.textContent = `Focus ${NODES[activeNode].label}`; }
    else { focusNode(activeNode); }
  });
  popArcs.addEventListener('click', () => { showArcs = !showArcs; });

  hero.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cm-action]');
    if (!btn) return;
    const act = btn.dataset.cmAction;
    if (act === 'host') focusNode('host');
    else if (act === 'server') focusNode('server');
    else if (act === 'fit') { popover.hidden = true; activeNode = null; fitAll(); }
    else if (act === 'zoom-in') cam.tzoom = Math.min(4.5, cam.tzoom * 1.25);
    else if (act === 'zoom-out') cam.tzoom = Math.max(0.45, cam.tzoom * 0.8);
    else if (act === 'ping') spawnPing();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
      if (isVisible && !rafId) rafId = requestAnimationFrame(render);
    }, { threshold: 0.05 }).observe(stage);
  }

  setInterval(() => { if (isVisible) spawnPing(); }, 2800);
  window.addEventListener('resize', resize);
  resize();
  rafId = requestAnimationFrame(render);
  fetch(LAND_URL).then((r) => r.json()).then((data) => {
    LAND = data.polygons || [];
  }).catch(() => {});
})();
