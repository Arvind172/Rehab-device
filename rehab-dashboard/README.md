# React + Vite

## ESP32 setup

The dashboard connects to the ESP32 over WebSocket. For a new ESP32, set the
board's WebSocket URL in a local Vite env file:

```env
VITE_ESP32_WS_URL=ws://YOUR_ESP32_IP:81
```

Use the IP printed by the ESP32 sketch or shown in your router. If your new
sketch uses a different WebSocket port, replace `81` too.

The current sensor parser accepts ESP32 packets like:

```json
{
  "fsr1": 1234,
  "fsr2": 2048,
  "fsr3": 3100,
  "p1": 20.5,
  "p2": 40.0,
  "p3": 70.2
}
```

For the foot heatmap, the dashboard maps `p1` to heel, `p2` to midfoot, and
`p3` to forefoot.

It also accepts packets like:

```json
{
  "imu": {
    "knee": 45,
    "thigh": 10,
    "calf": 30,
    "foot": 5
  },
  "pressure": {
    "heel": 20,
    "midfoot": 40,
    "forefoot": 70
  },
  "reps": 3
}
```

Several alternate names are supported too, including `kneeAngle`, `hipAngle`,
`ankleAngle`, `repCount`, `toe`, `toes`, `front`, `mid`, and `arch`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
