// Sun, sky and weather -> one "environment" object that drives every layer.
import * as SunCalc from "suncalc";

export const DUBAI = { lat: 25.2048, lng: 55.2708, utcOffsetMin: 240 }; // Asia/Dubai, no DST

export type RGB = [number, number, number];
export interface Weather {
  temp: number; cloud: number; visibility: number; code: number; wind: number; humidity: number; ok: boolean;
}
export interface Env {
  date: Date;
  altitude: number; // deg
  azimuth: number;  // deg, clockwise from north
  sunDir: [number, number, number]; // scene ENU unit vector towards the sun
  sunColor: RGB; sunIntensity: number;
  skyAmbient: RGB; groundAmbient: RGB;
  night: number;   // 0 day .. 1 night
  golden: number;  // 0..1 golden hour
  haze: number;    // 0..1 extra haze from weather
  dust: number;    // 0..1 sandy haze
  overcast: number;
  fogColor: RGB; skyColor: RGB; horizonColor: RGB;
  fogNear: number; fogFar: number;
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const css = (c: RGB) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

/** Minutes since midnight in Dubai for an instant. */
export function dubaiMinutes(d: Date) {
  return Math.floor(((d.getTime() / 60000 + DUBAI.utcOffsetMin) % 1440 + 1440) % 1440);
}
/** The instant today (Dubai calendar day) at `min` minutes past midnight Dubai time. */
export function dubaiDateAt(min: number, now = new Date()) {
  const dubaiNow = now.getTime() + DUBAI.utcOffsetMin * 60000;
  const dayStart = Math.floor(dubaiNow / 86400000) * 86400000;
  return new Date(dayStart + min * 60000 - DUBAI.utcOffsetMin * 60000);
}
export function fmtDubai(d: Date) {
  const m = dubaiMinutes(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function computeEnv(date: Date, w: Weather | null): Env {
  const p = SunCalc.getPosition(date, DUBAI.lat, DUBAI.lng);
  const altitude = (p.altitude * 180) / Math.PI;
  const azimuth = ((p.azimuth * 180) / Math.PI + 180) % 360; // suncalc: 0 = south
  const az = (azimuth * Math.PI) / 180, al = p.altitude;
  const sunDir: [number, number, number] = [Math.sin(az) * Math.cos(al), Math.cos(az) * Math.cos(al), Math.sin(al)];

  const night = 1 - ss(-7, 1, altitude);
  const golden = (1 - ss(5, 20, altitude)) * ss(-5, 1, altitude);
  const cloud = w?.ok ? w.cloud / 100 : 0.08;
  const vis = w?.ok ? w.visibility : 24000;
  const fogCode = w?.ok && [45, 48].includes(w.code) ? 1 : 0;
  const rain = w?.ok && w.code >= 51 ? 0.6 : 0;
  const haze = Math.min(1, Math.max(0, (16000 - vis) / 14000) + fogCode * 0.6 + rain * 0.4 + cloud * 0.25);
  const dust = w?.ok ? Math.min(1, Math.max(0, (10000 - vis) / 8000) * (w.humidity < 60 ? 1 : 0.3)) : 0;
  const overcast = Math.min(1, cloud * 0.9 + rain);

  let sunColor = mix(hex("#fff6e6"), hex("#ffb26b"), golden);
  sunColor = mix(sunColor, hex("#ff8a5c"), ss(4, -2, altitude) * (1 - night));
  const sunIntensity = ss(-3, 10, altitude) * (1 - overcast * 0.6) * (1 - dust * 0.35);

  const daySky = mix(hex("#3fa6f0"), hex("#a9c2d4"), overcast);
  let skyColor = mix(daySky, hex("#6c86c6"), golden * 0.7);
  skyColor = mix(skyColor, hex("#08142d"), night);
  skyColor = mix(skyColor, hex("#cdb48a"), dust * (1 - night) * 0.8);
  let horizonColor = mix(hex("#e4f2fa"), hex("#ffcd96"), golden);
  horizonColor = mix(horizonColor, hex("#1f3460"), night);
  horizonColor = mix(horizonColor, hex("#e2cfa6"), dust * (1 - night));
  let fogColor = mix(hex("#d8ecf8"), hex("#f4d6b4"), golden);
  fogColor = mix(fogColor, hex("#121d36"), night);
  fogColor = mix(fogColor, hex("#dcc8a0"), dust * (1 - night * 0.7));

  let skyAmbient = mix(hex("#cfe0f2"), hex("#e9cfc1"), golden);
  skyAmbient = mix(skyAmbient, hex("#33416b"), night);
  let groundAmbient = mix(hex("#ebe0cc"), hex("#d9b49a"), golden);
  groundAmbient = mix(groundAmbient, hex("#1d2235"), night);

  const fogFar = 22000 - haze * 15000;
  return {
    date, altitude, azimuth, sunDir, sunColor, sunIntensity, skyAmbient, groundAmbient, night, golden,
    haze, dust, overcast, fogColor, skyColor, horizonColor, fogNear: 4000 - haze * 3000, fogFar,
  };
}

export async function fetchWeather(): Promise<Weather | null> {
  const u = new URL(location.href).searchParams;
  if (u.get("weather") === "dust") return { temp: 36, cloud: 20, visibility: 3000, code: 0, wind: 30, humidity: 25, ok: true };
  if (u.get("weather") === "clear") return { temp: 31, cloud: 0, visibility: 30000, code: 0, wind: 10, humidity: 50, ok: true };
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${DUBAI.lat}&longitude=${DUBAI.lng}` +
      `&current=temperature_2m,relative_humidity_2m,cloud_cover,visibility,weather_code,wind_speed_10m&timezone=Asia%2FDubai`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const c = (await r.json()).current;
    return {
      temp: c.temperature_2m, cloud: c.cloud_cover ?? 0, visibility: c.visibility ?? 24000, code: c.weather_code ?? 0,
      wind: c.wind_speed_10m ?? 0, humidity: c.relative_humidity_2m ?? 50, ok: true,
    };
  } catch (e) {
    console.warn("weather unavailable", e);
    return null;
  }
}

export function weatherLabel(w: Weather) {
  const c = w.code;
  const icon = c >= 95 ? "⛈" : c >= 61 ? "🌧" : c >= 51 ? "🌦" : c === 45 || c === 48 ? "🌫" : w.visibility < 6000 ? "🌫" : w.cloud > 70 ? "☁️" : w.cloud > 30 ? "⛅" : "☀️";
  return `${icon} ${Math.round(w.temp)}°C`;
}
