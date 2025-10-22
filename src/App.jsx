import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const OBJECT_TYPES = [
  {
    id: 'pebble',
    label: 'Камешек',
  },
  {
    id: 'shard',
    label: 'Стеклышко',
  },
  {
    id: 'orb',
    label: 'Шарик',
  },
];

const COLOR_SWATCHES = [
  'rgba(88, 144, 192, 0.62)',
  'rgba(98, 195, 182, 0.55)',
  'rgba(253, 191, 108, 0.58)',
  'rgba(143, 130, 192, 0.5)',
  'rgba(205, 171, 143, 0.52)',
  'rgba(186, 204, 162, 0.52)',
];

const DOUBLE_TAP_DELAY = 280;
const REMOVE_FADE_MS = 220;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const randomFrom = (array) => array[Math.floor(Math.random() * array.length)];

const randomBetween = (min, max) => Math.random() * (max - min) + min;

let objectCounter = 0;

const buildObject = (type) => ({
  id: `fidget-${++objectCounter}`,
  type,
  size: randomBetween(78, 126),
  color: randomFrom(COLOR_SWATCHES),
  rotation: randomBetween(-26, 26),
  x: 0,
  y: 0,
  isRemoving: false,
  isDragging: false,
});

export default function App() {
  const canvasRef = useRef(null);
  const dragState = useRef(null);
  const lastTapRef = useRef(new Map());
  const tapResetTimers = useRef(new Map());
  const removalTimers = useRef(new Map());

  const [objects, setObjects] = useState([]);

  const shapeClassMap = useMemo(
    () => ({
      pebble: 'shape-pebble',
      shard: 'shape-shard',
      orb: 'shape-orb',
    }),
    []
  );

  const clearTapMetadata = useCallback((id) => {
    const timer = tapResetTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      tapResetTimers.current.delete(id);
    }
    lastTapRef.current.delete(id);
  }, []);

  const endDrag = useCallback(
    (targetId) => {
      const active = dragState.current;
      if (!active) {
        return;
      }
      if (targetId && active.id !== targetId) {
        return;
      }
      window.removeEventListener('pointermove', active.moveListener);
      window.removeEventListener('pointerup', active.upListener);
      dragState.current = null;
      setObjects((prev) =>
        prev.map((obj) =>
          obj.id === (targetId ?? active.id) ? { ...obj, isDragging: false } : obj
        )
      );
    },
    []
  );

  const scheduleRemoval = useCallback(
    (id) => {
      if (removalTimers.current.has(id)) {
        return;
      }
      const timeout = window.setTimeout(() => {
        setObjects((prev) => prev.filter((obj) => obj.id !== id));
        removalTimers.current.delete(id);
        clearTapMetadata(id);
      }, REMOVE_FADE_MS);
      removalTimers.current.set(id, timeout);
    },
    [clearTapMetadata]
  );

  const removeObject = useCallback(
    (id) => {
      endDrag(id);
      setObjects((prev) =>
        prev.map((obj) => (obj.id === id ? { ...obj, isRemoving: true } : obj))
      );
      scheduleRemoval(id);
    },
    [endDrag, scheduleRemoval]
  );

  const startDrag = useCallback(
    (id, pointerId, offsetX, offsetY) => {
      endDrag();
      const moveListener = (event) => {
        if (event.pointerId !== pointerId) {
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        setObjects((prev) =>
          prev.map((obj) => {
            if (obj.id !== id) {
              return obj;
            }
            const maxX = Math.max(rect.width - obj.size, 0);
            const maxY = Math.max(rect.height - obj.size, 0);
            const nextX = clamp(pointerX - offsetX, 0, maxX);
            const nextY = clamp(pointerY - offsetY, 0, maxY);
            return { ...obj, x: nextX, y: nextY };
          })
        );
      };
      const upListener = (event) => {
        if (event.pointerId !== pointerId) {
          return;
        }
        endDrag(id);
      };
      dragState.current = { id, pointerId, moveListener, upListener };
      setObjects((prev) =>
        prev.map((obj) => (obj.id === id ? { ...obj, isDragging: true } : obj))
      );
      window.addEventListener('pointermove', moveListener);
      window.addEventListener('pointerup', upListener);
    },
    [endDrag]
  );

  const spawnFromPalette = useCallback(
    (type, event) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const fidget = buildObject(type);
      const initialX = clamp(pointerX - fidget.size / 2, 0, Math.max(rect.width - fidget.size, 0));
      const initialY = clamp(pointerY - fidget.size / 2, 0, Math.max(rect.height - fidget.size, 0));
      fidget.x = initialX;
      fidget.y = initialY;
      setObjects((prev) => [...prev, fidget]);
      requestAnimationFrame(() => {
        startDrag(fidget.id, event.pointerId, pointerX - initialX, pointerY - initialY);
      });
    },
    [startDrag]
  );

  const handleObjectPointerDown = useCallback(
    (object, event) => {
      event.preventDefault();
      event.stopPropagation();

      const now = performance.now();
      const lastTap = lastTapRef.current.get(object.id) ?? 0;
      if (now - lastTap < DOUBLE_TAP_DELAY) {
        clearTapMetadata(object.id);
        removeObject(object.id);
        return;
      }

      lastTapRef.current.set(object.id, now);
      const resetTimer = window.setTimeout(() => {
        clearTapMetadata(object.id);
      }, DOUBLE_TAP_DELAY);
      tapResetTimers.current.set(object.id, resetTimer);

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      startDrag(object.id, event.pointerId, pointerX - object.x, pointerY - object.y);
    },
    [clearTapMetadata, removeObject, startDrag]
  );

  const handleCanvasPointerDown = useCallback((event) => {
    if (event.target === canvasRef.current) {
      event.preventDefault();
    }
  }, []);

  const handleClear = useCallback(() => {
    setObjects((prev) => {
      prev.forEach((obj) => {
        scheduleRemoval(obj.id);
      });
      return prev.map((obj) => ({ ...obj, isRemoving: true }));
    });
  }, [scheduleRemoval]);

  useEffect(() => {
    return () => {
      endDrag();
      removalTimers.current.forEach((timeout) => clearTimeout(timeout));
      tapResetTimers.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, [endDrag]);

  return (
    <div className="app">
      <aside className="palette" aria-label="Палитра объектов">
        {OBJECT_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`palette-item ${shapeClassMap[type.id]}`}
            onPointerDown={(event) => spawnFromPalette(type.id, event)}
            aria-label={type.label}
          />
        ))}
      </aside>
      <main className="workspace">
        <div
          className="canvas"
          ref={canvasRef}
          role="application"
          aria-label="Холст для перетаскивания объектов"
          onPointerDown={handleCanvasPointerDown}
        >
          {objects.map((object) => (
            <div
              key={object.id}
              className={`fidget-object ${shapeClassMap[object.type]}`}
              style={{
                width: object.size,
                height: object.size,
                transform: `translate(${object.x}px, ${object.y}px) rotate(${object.rotation}deg)`,
                background: object.color,
                opacity: object.isRemoving ? 0 : 1,
                transition: object.isDragging
                  ? 'none'
                  : `transform 90ms ease-out, opacity ${REMOVE_FADE_MS}ms ease`,
              }}
              onPointerDown={(event) => handleObjectPointerDown(object, event)}
            >
              <span className="object-gloss" />
            </div>
          ))}
        </div>
        <button type="button" className="clear-button" onClick={handleClear}>
          Очистить
        </button>
      </main>
    </div>
  );
}
