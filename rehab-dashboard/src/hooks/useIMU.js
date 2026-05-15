import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_WS_URL = import.meta.env.VITE_ESP32_WS_URL || "ws://10.209.124.172:81";
const SMOOTHING = 0.22;
const RECONNECT_DELAY_MS = 2500;

const emptyAngles = {
  thigh: 0,
  calf: 0,
  foot: 0,
  knee: 0,
  ankle: 0,
};

const emptyPressure = {
  heel: 0,
  midfoot: 0,
  forefoot: 0,
  heel_load: 0,
  mid_load: 0,
  toe_load: 0,
  p1: 0,
  p2: 0,
  p3: 0,
  fsr1: 0,
  fsr2: 0,
  fsr3: 0,
};

const emptyRom = {
  knee: 0,
  ankle: 0,
};

const emptyGait = {
  phase: "Unknown",
  steps: 0,
  cadence: 0,
};

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function pickAnyNumber(data, keys, min, max, fallback = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return clampNumber(data[key], min, max, fallback);
    }
  }

  return fallback;
}

function pickNumber(data, keys, fallback = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return clampNumber(data[key], -180, 180, fallback);
    }
  }

  return fallback;
}

function pickText(data, keys, fallback = "") {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] != null) {
      return String(data[key]);
    }
  }

  return fallback;
}

function pickPressure(data, keys, fallback = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return clampNumber(data[key], 0, 100, fallback);
    }
  }

  return fallback;
}

function pickRawPressure(data, keys, fallback = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return clampNumber(data[key], 0, 4095, fallback);
    }
  }

  return fallback;
}

function smoothObject(current, target, factor) {
  return Object.fromEntries(
    Object.keys(current).map((key) => [
      key,
      current[key] + (target[key] - current[key]) * factor,
    ]),
  );
}

function parsePayload(payload, previous) {
  const source = payload?.imu || payload?.angles || payload;
  const pressureSource = payload?.pressure || payload?.footPressure || payload;

  const knee = pickNumber(source, ["knee", "kneeAngle", "angle"], previous.angles.knee);
  const ankle = pickNumber(source, ["ankle", "ankleAngle"], previous.angles.ankle);
  const p1 = pickPressure(
    pressureSource,
    ["p1", "heel", "heel_load"],
    previous.pressure.p1,
  );
  const p2 = pickPressure(
    pressureSource,
    ["p2", "midfoot", "mid", "arch", "mid_load"],
    previous.pressure.p2,
  );
  const p3 = pickPressure(
    pressureSource,
    ["p3", "forefoot", "toe", "toes", "front", "toe_load"],
    previous.pressure.p3,
  );

  return {
    angles: {
      thigh: pickNumber(source, ["thigh", "hip", "hipAngle"], previous.angles.thigh),
      calf: pickNumber(source, ["calf", "lowerLeg", "shin"], knee),
      foot: pickNumber(source, ["foot", "footAngle"], ankle),
      knee,
      ankle,
    },
    pressure: {
      heel: p1,
      midfoot: p2,
      forefoot: p3,
      heel_load: p1,
      mid_load: p2,
      toe_load: p3,
      p1,
      p2,
      p3,
      fsr1: pickRawPressure(pressureSource, ["fsr1"], previous.pressure.fsr1),
      fsr2: pickRawPressure(pressureSource, ["fsr2"], previous.pressure.fsr2),
      fsr3: pickRawPressure(pressureSource, ["fsr3"], previous.pressure.fsr3),
    },
    rom: {
      knee: pickNumber(source, ["knee_rom", "kneeRom", "kneeROM"], previous.rom.knee),
      ankle: pickNumber(source, ["ankle_rom", "ankleRom", "ankleROM"], previous.rom.ankle),
    },
    gait: {
      phase: pickText(payload, ["phase", "gait_phase", "gaitPhase"], previous.gait.phase),
      steps: pickAnyNumber(payload, ["steps", "stepCount"], 0, 99999, previous.gait.steps),
      cadence: pickAnyNumber(payload, ["cadence"], 0, 300, previous.gait.cadence),
    },
    reps: clampNumber(payload?.reps ?? payload?.repCount, 0, 999, previous.reps),
  };
}

export default function useIMU(wsUrl = DEFAULT_WS_URL) {
  const targetRef = useRef({
    angles: emptyAngles,
    pressure: emptyPressure,
    rom: emptyRom,
    gait: emptyGait,
    reps: 0,
  });
  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);
  const shouldReconnectRef = useRef(true);

  const [state, setState] = useState({
    angles: emptyAngles,
    pressure: emptyPressure,
    rom: emptyRom,
    gait: emptyGait,
    reps: 0,
    connected: false,
    status: "disconnected",
    lastUpdated: null,
    error: null,
  });

  useEffect(() => {
    shouldReconnectRef.current = true;

    function connect() {
      setState((current) => ({
        ...current,
        status: "connecting",
        error: null,
      }));

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setState((current) => ({
          ...current,
          connected: true,
          status: "connected",
          error: null,
        }));
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          targetRef.current = parsePayload(payload, targetRef.current);

          setState((current) => ({
            ...current,
            reps: targetRef.current.reps,
            gait: targetRef.current.gait,
            connected: true,
            status: "connected",
            lastUpdated: Date.now(),
            error: null,
          }));
        } catch (error) {
          setState((current) => ({
            ...current,
            error: `Invalid sensor packet: ${error.message}`,
          }));
        }
      };

      socket.onerror = () => {
        setState((current) => ({
          ...current,
          error: "WebSocket error",
        }));
      };

      socket.onclose = () => {
        targetRef.current = {
          angles: emptyAngles,
          pressure: emptyPressure,
          rom: emptyRom,
          gait: emptyGait,
          reps: targetRef.current.reps,
        };

        setState((current) => ({
          ...current,
          connected: false,
          status: "disconnected",
          angles: emptyAngles,
          pressure: emptyPressure,
          rom: emptyRom,
          gait: emptyGait,
        }));

        if (shouldReconnectRef.current) {
          reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((current) => {
        const angles = current.connected
          ? smoothObject(current.angles, targetRef.current.angles, SMOOTHING)
          : emptyAngles;
        const pressure = current.connected
          ? smoothObject(current.pressure, targetRef.current.pressure, SMOOTHING)
          : emptyPressure;
        const rom = current.connected
          ? smoothObject(current.rom, targetRef.current.rom, SMOOTHING)
          : emptyRom;

        return {
          ...current,
          angles,
          pressure,
          rom,
        };
      });
    }, 33);

    return () => window.clearInterval(interval);
  }, []);

  return useMemo(
    () => ({
      ...state,
      wsUrl,
    }),
    [state, wsUrl],
  );
}
