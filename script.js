const canvas = document.querySelector('.canvas');
const paletteItems = document.querySelectorAll('.palette-item');
const clearButton = document.querySelector('.clear-button');

const colorPalette = {
  stone: [
    'linear-gradient(135deg, rgba(85, 110, 103, 0.8), rgba(196, 214, 206, 0.65))',
    'linear-gradient(135deg, rgba(105, 134, 124, 0.75), rgba(214, 224, 217, 0.6))',
    'linear-gradient(135deg, rgba(99, 125, 116, 0.78), rgba(171, 190, 180, 0.55))'
  ],
  glass: [
    'linear-gradient(145deg, rgba(116, 171, 196, 0.55), rgba(226, 244, 255, 0.35))',
    'linear-gradient(145deg, rgba(165, 198, 209, 0.55), rgba(220, 240, 255, 0.32))',
    'linear-gradient(145deg, rgba(125, 174, 193, 0.5), rgba(215, 238, 248, 0.28))'
  ],
  orb: [
    'radial-gradient(circle at 28% 28%, rgba(255, 255, 255, 0.72), rgba(116, 157, 212, 0.6))',
    'radial-gradient(circle at 32% 32%, rgba(255, 255, 255, 0.78), rgba(138, 180, 220, 0.58))',
    'radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.75), rgba(174, 205, 233, 0.55))'
  ]
};

const objectShapes = {
  stone: {
    size: [80, 130],
    borderRadius: '58% 42% 60% 40% / 62% 48% 54% 46%',
    boxShadow: 'inset -10px -12px 22px rgba(0, 0, 0, 0.12)',
    extraStyles: {
      filter: 'drop-shadow(0 12px 20px rgba(59, 78, 72, 0.15))'
    }
  },
  glass: {
    size: [90, 140],
    borderRadius: '24% 40% 46% 22% / 28% 48% 36% 42%',
    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.5)',
    extraStyles: {
      backdropFilter: 'blur(1px)',
      border: '1px solid rgba(255, 255, 255, 0.45)'
    }
  },
  orb: {
    size: [60, 100],
    borderRadius: '50%',
    boxShadow: 'inset -8px -10px 16px rgba(0, 0, 0, 0.18), 0 12px 20px rgba(94, 124, 173, 0.15)',
    extraStyles: {}
  }
};

const pointerSessions = new Map();
const lastTapTimes = new WeakMap();

const DOUBLE_TAP_DELAY = 300;
const DRAG_THRESHOLD = 6;

paletteItems.forEach((item) => {
  item.addEventListener('pointerdown', handlePalettePointerDown);
  item.addEventListener('pointermove', handlePalettePointerMove);
  item.addEventListener('pointerup', handlePalettePointerUp);
  item.addEventListener('pointercancel', handlePalettePointerCancel);
});

clearButton.addEventListener('click', clearCanvas);

function handlePalettePointerDown(event) {
  event.preventDefault();
  const type = event.currentTarget.dataset.objectType;
  const element = createFidgetObject(type);

  canvas.appendChild(element);
  requestAnimationFrame(() => element.classList.add('visible'));

  const session = {
    element,
    fromPalette: true,
    offsetX: element.offsetWidth / 2,
    offsetY: element.offsetHeight / 2,
    hasMoved: true,
    pointerId: event.pointerId
  };

  pointerSessions.set(event.pointerId, session);
  positionElement(element, event.clientX, event.clientY, session.offsetX, session.offsetY);

  event.currentTarget.setPointerCapture(event.pointerId);
}

function handlePalettePointerMove(event) {
  const session = pointerSessions.get(event.pointerId);
  if (!session || !session.fromPalette) {
    return;
  }
  positionElement(session.element, event.clientX, event.clientY, session.offsetX, session.offsetY);
}

function handlePalettePointerUp(event) {
  finalizePaletteDrag(event, false);
}

function handlePalettePointerCancel(event) {
  finalizePaletteDrag(event, true);
}

function finalizePaletteDrag(event, cancelled) {
  const session = pointerSessions.get(event.pointerId);
  if (!session || !session.fromPalette) {
    return;
  }

  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (cancelled || !isInsideCanvas(event.clientX, event.clientY)) {
    session.element.remove();
  }

  pointerSessions.delete(event.pointerId);
}

function createFidgetObject(type) {
  const element = document.createElement('div');
  element.className = 'fidget-object';
  element.dataset.type = type;

  const shape = objectShapes[type];
  const color = pickRandom(colorPalette[type]);
  const size = randomBetween(shape.size[0], shape.size[1]);
  const aspectJitter = type === 'stone' ? randomBetween(0.85, 1.2) : 1;

  element.style.width = `${size}px`;
  element.style.height = `${Math.round(size * aspectJitter)}px`;
  element.style.background = color;
  element.style.borderRadius = shape.borderRadius;
  element.style.boxShadow = shape.boxShadow;

  const rotation = randomBetween(-18, 18);
  element.style.transform = `rotate(${rotation}deg)`;

  if (shape.extraStyles) {
    Object.entries(shape.extraStyles).forEach(([prop, value]) => {
      element.style[prop] = value;
    });
  }

  element.addEventListener('pointerdown', handleObjectPointerDown);
  element.addEventListener('pointermove', handleObjectPointerMove);
  element.addEventListener('pointerup', handleObjectPointerUp);
  element.addEventListener('pointercancel', handleObjectPointerCancel);
  element.addEventListener('dblclick', () => removeObject(element));
  element.addEventListener('transitionend', handleTransitionEnd);

  return element;
}

function handleObjectPointerDown(event) {
  event.preventDefault();
  const element = event.currentTarget;

  const session = {
    element,
    fromPalette: false,
    hasMoved: false,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    pointerType: event.pointerType
  };

  pointerSessions.set(event.pointerId, session);
}

function handleObjectPointerMove(event) {
  const session = pointerSessions.get(event.pointerId);
  if (!session || session.fromPalette) {
    return;
  }

  if (!session.hasMoved) {
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) {
      return;
    }

    const rect = session.element.getBoundingClientRect();
    session.offsetX = event.clientX - rect.left;
    session.offsetY = event.clientY - rect.top;
    session.hasMoved = true;
    session.element.setPointerCapture(event.pointerId);
  }

  positionElement(session.element, event.clientX, event.clientY, session.offsetX, session.offsetY);
}

function handleObjectPointerUp(event) {
  const session = pointerSessions.get(event.pointerId);
  if (!session || session.fromPalette) {
    return;
  }

  if (session.element.hasPointerCapture(event.pointerId)) {
    session.element.releasePointerCapture(event.pointerId);
  }

  if (!session.hasMoved) {
    handlePossibleDoubleTap(session.element, session.pointerType);
  }

  pointerSessions.delete(event.pointerId);
}

function handleObjectPointerCancel(event) {
  const session = pointerSessions.get(event.pointerId);
  if (!session || session.fromPalette) {
    return;
  }

  if (session.element.hasPointerCapture(event.pointerId)) {
    session.element.releasePointerCapture(event.pointerId);
  }

  pointerSessions.delete(event.pointerId);
}

function positionElement(element, clientX, clientY, offsetX, offsetY) {
  const rect = canvas.getBoundingClientRect();
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const rawX = clientX - rect.left - offsetX;
  const rawY = clientY - rect.top - offsetY;

  const maxX = Math.max(0, rect.width - width);
  const maxY = Math.max(0, rect.height - height);
  const clampedX = clamp(rawX, 0, maxX);
  const clampedY = clamp(rawY, 0, maxY);

  element.style.left = `${clampedX}px`;
  element.style.top = `${clampedY}px`;
}

function isInsideCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function handlePossibleDoubleTap(element, pointerType) {
  if (pointerType === 'mouse') {
    return;
  }

  const now = performance.now();
  const lastTap = lastTapTimes.get(element) || 0;

  if (now - lastTap < DOUBLE_TAP_DELAY) {
    removeObject(element);
    lastTapTimes.delete(element);
  } else {
    lastTapTimes.set(element, now);
  }
}

function removeObject(element) {
  if (!element || element.classList.contains('fade-out')) {
    return;
  }

  element.classList.add('fade-out');
}

function handleTransitionEnd(event) {
  if (event.propertyName === 'opacity' && event.currentTarget.classList.contains('fade-out')) {
    event.currentTarget.remove();
  }
}

function clearCanvas() {
  const objects = Array.from(canvas.querySelectorAll('.fidget-object'));
  objects.forEach((object) => removeObject(object));
}

function randomBetween(min, max) {
  if (min > max) {
    [min, max] = [max, min];
  }
  return Math.random() * (max - min) + min;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
