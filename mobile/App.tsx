/**
 * CardioWatch patient app (React Native + TypeScript, Expo). Synthetic data only.
 * Graphic, older-adult friendly UI: oscilloscope-style heart display, ring gauges, area charts.
 * Large type, high contrast, big touch targets; motion can be paused and respects "reduce motion".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, LayoutChangeEvent, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
// react-native-svg's Text is aliased to SvgText so it does not clash with React Native's Text
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from "react-native-svg";

// Web build is served behind the same nginx as the API (relative URLs). Native/dev: set EXPO_PUBLIC_API_URL.
const API = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : "http://10.0.2.2:8010");
const C = {
  bg: "#eef3f9", card: "#ffffff", ink: "#0b1726", ink2: "#3d4a5c", brand: "#1c5cab", brand2: "#2a78d6",
  navy: "#0b2545", scope: "#04140d", trace: "#39ff88", grid: "#0f3b26", good: "#0a7a3a", crit: "#b42323",
  line: "#c9d4e2", heart: "#e5484d", oxy: "#2a78d6", bp: "#7a4fd6",
};

type Tab = "today" | "trends" | "meds" | "checkin";
interface Me { first_name: string; care_unit: string; device: { type: string; battery_pct: number | null; last_sync_at: string | null } | null;
  latest: Record<string, { value: number; unit: string; observed_at: string }>; signals: string[] }
interface Point { t: string; v: number }

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `Request failed (${res.status})`);
  return res.json();
}

const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return m < 2 ? "just now" : m < 90 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(200, Math.round(e.nativeEvent.layout.width)))];
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled?.().then(setReduce).catch(() => undefined); }, []);
  return reduce;
}

// ------------------------------------------------------------------------------------------- icons
type IconName = "heart" | "drop" | "gauge" | "pill" | "chart" | "home" | "check" | "clock" | "walk";
function Icon({ name, size = 24, color = C.brand }: { name: IconName; size?: number; color?: string }) {
  const p: Record<IconName, React.ReactElement> = {
    heart: <Path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.3 4.5 7 4.5c2.1 0 3.5 1.2 5 3 1.5-1.8 2.9-3 5-3 3.7 0 6 3.8 4.5 7.3C19.5 16.4 12 21 12 21z" fill={color} />,
    drop: <Path d="M12 2.5S5 10.2 5 14.6A7 7 0 0 0 19 14.6C19 10.2 12 2.5 12 2.5z" fill={color} />,
    gauge: <G><Path d="M3 17a9 9 0 1 1 18 0" stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" /><Path d="M12 17l5-6" stroke={color} strokeWidth={2.6} strokeLinecap="round" /></G>,
    pill: <G><Rect x={3} y={8} width={18} height={8} rx={4} fill="none" stroke={color} strokeWidth={2.4} /><Path d="M12 8v8" stroke={color} strokeWidth={2.4} /><Rect x={3} y={8} width={9} height={8} rx={4} fill={color} /></G>,
    chart: <G><Path d="M3 20h18" stroke={color} strokeWidth={2.4} strokeLinecap="round" /><Polyline points="4,15 9,10 13,13 20,5" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></G>,
    home: <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill={color} />,
    check: <G><Rect x={3} y={3} width={18} height={18} rx={5} fill="none" stroke={color} strokeWidth={2.4} /><Path d="M7.5 12.5l3 3 6-7" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></G>,
    clock: <G><Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2.4} /><Path d="M12 7v5l3 2" stroke={color} strokeWidth={2.4} strokeLinecap="round" /></G>,
    walk: <G><Circle cx={13} cy={4.5} r={2} fill={color} /><Path d="M10 21l2-6 3 3v3M9 12l1-4 4 1 2 3 3 1M10 8l-3 3" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></G>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">{p[name]}</Svg>;
}

// ------------------------------------------------------------------------------------------- oscilloscope
/** One PQRST complex as a sum of Gaussians, phase in [0,1). Illustration only, not recorded ECG data. */
function ecg(phase: number) {
  const g = (mu: number, a: number, w: number) => a * Math.exp(-(((phase - mu) / w) ** 2));
  return g(0.12, 0.12, 0.028) + g(0.215, -0.12, 0.009) + g(0.235, 1.0, 0.011) + g(0.258, -0.28, 0.011) + g(0.46, 0.3, 0.045);
}

function Oscilloscope({ bpm }: { bpm: number }) {
  const [w, onLayout] = useWidth(340);
  const reduce = useReduceMotion();
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState(0.35);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (paused || reduce) return;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      setT((x) => x + (now - last) / 1000);
      last = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [paused, reduce]);

  const H = 170, pxPerSec = 110, period = 60 / Math.max(30, Math.min(bpm, 200));
  // sweep display: the trace is redrawn left-to-right, with a small erase gap ahead of the cursor
  const span = w / pxPerSec, cursor = ((t % span) / span) * w, gap = 18;
  const pts: string[] = [];
  const pts2: string[] = [];
  for (let x = 0; x <= w; x += 2) {
    const age = x <= cursor ? cursor - x : cursor + w - x;  // seconds-ago in pixels
    if (x > cursor && x < cursor + gap) continue;
    const time = t - age / pxPerSec;
    const y = H * 0.62 - ecg(((time / period) % 1 + 1) % 1) * H * 0.48;
    (x <= cursor ? pts : pts2).push(`${x},${y.toFixed(1)}`);
  }
  const beat = ((t / period) % 1 + 1) % 1;
  const pulse = 1 + 0.22 * Math.exp(-(((beat - 0.24) / 0.06) ** 2));

  return (
    <View style={s.scope} onLayout={onLayout} accessible accessibilityLabel={`Heart rhythm display at ${Math.round(bpm)} beats per minute`}>
      <Svg width={w} height={H}>
        {Array.from({ length: Math.ceil(w / 20) }, (_, i) => <Line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={H} stroke={C.grid} strokeWidth={i % 5 === 0 ? 1.2 : 0.6} />)}
        {Array.from({ length: Math.ceil(H / 20) }, (_, i) => <Line key={`h${i}`} x1={0} y1={i * 20} x2={w} y2={i * 20} stroke={C.grid} strokeWidth={i % 5 === 0 ? 1.2 : 0.6} />)}
        {[pts2, pts].map((p, i) => p.length > 1 && (
          <G key={i}>
            <Polyline points={p.join(" ")} fill="none" stroke={C.trace} strokeOpacity={0.25} strokeWidth={7} strokeLinejoin="round" />
            <Polyline points={p.join(" ")} fill="none" stroke={C.trace} strokeWidth={2.4} strokeLinejoin="round" />
          </G>
        ))}
        {!paused && !reduce && <Circle cx={cursor} cy={H * 0.62 - ecg(beat) * H * 0.48} r={4.5} fill="#d9ffe9" />}
      </Svg>
      <View style={s.scopeHud} pointerEvents="box-none">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ transform: [{ scale: pulse }] }}><Icon name="heart" size={30} color={C.heart} /></View>
          <Text style={s.scopeBpm}>{Math.round(bpm)}</Text>
          <Text style={s.scopeUnit}>BPM</Text>
        </View>
        <Pressable onPress={() => setPaused(!paused)} accessibilityRole="button" accessibilityLabel={paused ? "Resume animation" : "Pause animation"} style={s.scopeBtn}>
          <Text style={{ color: C.trace, fontSize: 16, fontWeight: "700" }}>{paused || reduce ? "▶ Play" : "❚❚ Pause"}</Text>
        </Pressable>
      </View>
      <Text style={s.scopeNote}>Illustration paced by your latest heart rate — not a medical ECG recording.</Text>
    </View>
  );
}

// ------------------------------------------------------------------------------------------- gauges & charts
function Ring({ value, min, max, color, size = 132, children }: { value: number | null; min: number; max: number; color: string; size?: number; children: React.ReactNode }) {
  const r = size / 2 - 12, circ = 2 * Math.PI * r, arc = circ * 0.75;  // 270° dial
  const frac = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <G rotation={135} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="#e3e9f2" strokeWidth={14} fill="none" strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={14} fill="none" strokeDasharray={`${arc * frac} ${circ}`} strokeLinecap="round" />
        </G>
      </Svg>
      {children}
    </View>
  );
}

function AreaChart({ points, color, unit }: { points: Point[]; color: string; unit: string }) {
  const [w, onLayout] = useWidth(320);
  const H = 200, pad = { l: 44, r: 12, t: 14, b: 26 };
  const vals = points.map((p) => p.v);
  const lo = Math.floor(Math.min(...vals) - 2), hi = Math.ceil(Math.max(...vals) + 2);
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const days = Array.from(new Set(points.map((p) => new Date(p.t).toLocaleDateString(undefined, { weekday: "short" }))));
  const last = points[points.length - 1];
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={H}>
        <Defs>
          <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} /><Stop offset="1" stopColor={color} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((f) => {
          const v = lo + f * (hi - lo);
          return (
            <G key={f}>
              <Line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#e3e9f2" strokeWidth={1} />
              <SvgLabel x={pad.l - 6} y={y(v) + 4} text={String(Math.round(v))} anchor="end" />
            </G>
          );
        })}
        <Path d={area} fill="url(#fill)" />
        <Path d={line} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" />
        {last && <Circle cx={x(points.length - 1)} cy={y(last.v)} r={6} fill="#fff" stroke={color} strokeWidth={3} />}
        {days.map((d, i) => <SvgLabel key={d + i} x={pad.l + (i + 0.5) * ((w - pad.l - pad.r) / days.length)} y={H - 6} text={d} anchor="middle" />)}
      </Svg>
      <Text style={s.small}>Unit: {unit}. Each point is an hourly average from your device.</Text>
    </View>
  );
}

function SvgLabel({ x, y, text, anchor }: { x: number; y: number; text: string; anchor: "start" | "middle" | "end" }) {
  return <SvgText x={x} y={y} fontSize={13} fill={C.ink2} textAnchor={anchor}>{text}</SvgText>;
}

// ------------------------------------------------------------------------------------------- building blocks
function Button({ label, onPress, kind = "primary", selected, a11y, children }: { label: string; onPress: () => void; kind?: "primary" | "plain"; selected?: boolean; a11y?: string; children?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [s.btn, kind === "plain" && s.btnPlain, selected && s.btnSelected, pressed && { opacity: 0.85 }]}>
      {children}
      <Text style={[s.btnText, kind === "plain" && !selected && { color: C.brand }]}>{selected ? "✓ " : ""}{label}</Text>
    </Pressable>
  );
}

function Card({ title, icon, children, dark }: { title?: string; icon?: IconName; children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={[s.card, dark && { backgroundColor: C.navy, borderColor: C.navy }]}>
      {title && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
          {icon && <Icon name={icon} size={24} color={dark ? "#9cc4ff" : C.brand} />}
          <Text style={[s.h2, dark && { color: "#fff" }]} accessibilityRole="header">{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
}

function Battery({ pct }: { pct: number | null }) {
  if (pct === null) return <Text style={s.chipText}>mains</Text>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel={`Battery ${pct} percent`}>
      <View style={s.batt}><View style={[s.battFill, { width: `${pct}%`, backgroundColor: pct < 20 ? "#ff6b6b" : "#4ade80" }]} /></View>
      <Text style={s.chipText}>{pct}%</Text>
    </View>
  );
}

// ------------------------------------------------------------------------------------------- screens
function Login({ onToken }: { onToken: (t: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    try { onToken((await call<{ access_token: string }>("/api/auth/login", null, { method: "POST", body: JSON.stringify({ username: "patient.demo" }) })).access_token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={[s.screen, { justifyContent: "center" }]}>
      <View style={[s.card, { backgroundColor: C.navy, borderColor: C.navy, alignItems: "center", paddingVertical: 28 }]}>
        <Icon name="heart" size={56} color={C.heart} />
        <Text style={[s.h1, { color: "#fff", marginTop: 8 }]} accessibilityRole="header">CardioWatch</Text>
        <Text style={[s.p, { color: "#c9dcf5", textAlign: "center" }]}>Your heart monitoring companion</Text>
      </View>
      <Oscilloscope bpm={72} />
      <Text style={s.p}>This is a demonstration with a synthetic patient — no real health data.</Text>
      <Button label={busy ? "Signing in…" : "Sign in as demo patient"} onPress={go} a11y="Sign in as demo patient" />
      {err && <Text style={[s.p, { color: C.crit }]} accessibilityRole="alert">{err}</Text>}
    </ScrollView>
  );
}

function Today({ token }: { token: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [tips, setTips] = useState<string[]>([]);
  useEffect(() => {
    call<Me>("/api/me", token).then(setMe).catch(() => setMe(null));
    call<{ messages: string[] }>("/api/me/coaching", token).then((r) => setTips(r.messages)).catch(() => setTips([]));
  }, [token]);
  if (!me) return <ActivityIndicator size="large" style={{ marginTop: 40 }} />;
  const L = me.latest;
  const hr = L.heart_rate?.value ?? 72;
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <View style={s.hero}>
        <View style={s.avatar}><Text style={{ color: "#fff", fontSize: 26, fontWeight: "800" }}>{me.first_name[0]}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.h1, { color: "#fff" }]} accessibilityRole="header">Hello, {me.first_name}</Text>
          {me.device && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              <View style={s.chip}><View style={s.dot} /><Text style={s.chipText}>{me.device.type}</Text></View>
              <View style={s.chip}><Battery pct={me.device.battery_pct} /></View>
              <View style={s.chip}><Text style={s.chipText}>synced {ago(me.device.last_sync_at)}</Text></View>
            </View>
          )}
        </View>
      </View>

      <Oscilloscope bpm={hr} />

      <Text style={[s.h2, { marginTop: 4 }]} accessibilityRole="header">Latest readings</Text>
      <View style={s.tiles}>
        <View style={s.tile} accessible accessibilityLabel={`Oxygen ${L.spo2 ? Math.round(L.spo2.value) : "unknown"} percent, ${ago(L.spo2?.observed_at)}`}>
          <Ring value={L.spo2?.value ?? null} min={80} max={100} color={C.oxy}>
            <Icon name="drop" size={22} color={C.oxy} />
            <Text style={s.ringVal}>{L.spo2 ? Math.round(L.spo2.value) : "—"}<Text style={s.ringUnit}>%</Text></Text>
          </Ring>
          <Text style={s.tileLabel}>Oxygen</Text>
          <Text style={s.small}>{ago(L.spo2?.observed_at)}</Text>
        </View>
        <View style={s.tile} accessible accessibilityLabel={`Blood pressure ${L.systolic_bp ? Math.round(L.systolic_bp.value) : "unknown"} over ${L.diastolic_bp ? Math.round(L.diastolic_bp.value) : "unknown"}`}>
          <Ring value={L.systolic_bp?.value ?? null} min={60} max={200} color={C.bp}>
            <Icon name="gauge" size={22} color={C.bp} />
            <Text style={s.ringVal}>{L.systolic_bp ? Math.round(L.systolic_bp.value) : "—"}</Text>
            <Text style={s.ringUnit}>/{L.diastolic_bp ? Math.round(L.diastolic_bp.value) : "—"} mmHg</Text>
          </Ring>
          <Text style={s.tileLabel}>Blood pressure</Text>
          <Text style={s.small}>{ago(L.systolic_bp?.observed_at)}</Text>
        </View>
        <View style={s.tile} accessible accessibilityLabel={`Heart rate ${Math.round(hr)} beats per minute`}>
          <Ring value={hr} min={40} max={160} color={C.heart}>
            <Icon name="heart" size={22} color={C.heart} />
            <Text style={s.ringVal}>{Math.round(hr)}</Text>
            <Text style={s.ringUnit}>bpm</Text>
          </Ring>
          <Text style={s.tileLabel}>Heart rate</Text>
          <Text style={s.small}>{ago(L.heart_rate?.observed_at)}</Text>
        </View>
      </View>

      <Card title="For today" icon="walk">
        {tips.map((t) => (
          <View key={t} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 4 }}>
            <Icon name="check" size={22} color={C.good} />
            <Text style={[s.p, { flex: 1 }]}>{t}</Text>
          </View>
        ))}
      </Card>
      <Text style={s.small}>Your care team reviews your readings and decides what they mean for you. If you feel very unwell, call emergency services.</Text>
    </ScrollView>
  );
}

const SIGNALS: { key: string; label: string; color: string; icon: IconName }[] = [
  { key: "heart_rate", label: "Heart rate", color: C.heart, icon: "heart" },
  { key: "systolic_bp", label: "Blood pressure", color: C.bp, icon: "gauge" },
  { key: "spo2", label: "Oxygen", color: C.oxy, icon: "drop" },
];

function Trends({ token }: { token: string }) {
  const [signal, setSignal] = useState(SIGNALS[0]);
  const [data, setData] = useState<{ unit: string; points: Point[] } | null>(null);
  useEffect(() => {
    setData(null);
    call<{ unit: string; points: Point[] }>(`/api/me/trends?signal=${signal.key}&days=7`, token).then(setData).catch(() => setData({ unit: "", points: [] }));
  }, [signal, token]);
  const vals = data?.points.map((p) => p.v) ?? [];
  const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1} accessibilityRole="header">Your trends</Text>
      <View style={s.wrap}>
        {SIGNALS.map((sg) => (
          <Button key={sg.key} label={sg.label} kind="plain" selected={signal.key === sg.key} onPress={() => setSignal(sg)}>
            <Icon name={sg.icon} size={22} color={signal.key === sg.key ? "#fff" : sg.color} />
          </Button>
        ))}
      </View>
      <Card title={`${signal.label} · last 7 days`} icon="chart">
        {!data ? <ActivityIndicator /> : data.points.length < 2 ? <Text style={s.p}>Not enough readings yet.</Text> : (
          <>
            <AreaChart points={data.points} color={signal.color} unit={data.unit} />
            <View style={s.statsRow} accessible accessibilityLabel={`Average ${avg.toFixed(0)}, lowest ${Math.min(...vals).toFixed(0)}, highest ${Math.max(...vals).toFixed(0)} ${data.unit}`}>
              {[["Average", avg], ["Lowest", Math.min(...vals)], ["Highest", Math.max(...vals)]].map(([k, v]) => (
                <View key={k as string} style={s.stat}><Text style={s.statVal}>{(v as number).toFixed(0)}</Text><Text style={s.small}>{k as string}</Text></View>
              ))}
            </View>
          </>
        )}
      </Card>
      <Text style={s.small}>Your care team decides what these numbers mean for you.</Text>
    </ScrollView>
  );
}

function Meds({ token }: { token: string }) {
  const [meds, setMeds] = useState<{ name: string; dose: string; times: string[] }[] | null>(null);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  useEffect(() => { call<typeof meds>("/api/me/medications", token).then(setMeds).catch(() => setMeds([])); }, [token]);
  const list = (meds ?? []).filter((m) => m.times.length);
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1} accessibilityRole="header">Medication reminders</Text>
      {!meds ? <ActivityIndicator /> : list.length === 0 ? <Card><Text style={s.p}>No reminders right now.</Text></Card> : list.map((m) => (
        <View key={m.name + m.dose} style={[s.card, { flexDirection: "row", gap: 14, alignItems: "center" }]}>
          <View style={[s.medIcon, taken[m.name] && { backgroundColor: "#dcfce7" }]}><Icon name="pill" size={34} color={taken[m.name] ? C.good : C.brand} /></View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.h2}>{m.name}</Text>
            <Text style={s.p}>{m.dose}</Text>
            <View style={s.wrap}>{m.times.map((t) => <View key={t} style={s.timeChip}><Icon name="clock" size={18} color={C.brand} /><Text style={{ fontSize: 18, fontWeight: "700", color: C.brand }}>{t}</Text></View>)}</View>
            <Button label={taken[m.name] ? "Taken today" : "Mark as taken"} kind="plain" selected={taken[m.name]} onPress={() => setTaken({ ...taken, [m.name]: !taken[m.name] })} />
          </View>
        </View>
      ))}
      <Text style={s.small}>Do not change how you take your medicines without talking to your care team.</Text>
    </ScrollView>
  );
}

const FEEL = [["😣", "Very poor"], ["🙁", "Poor"], ["😐", "Okay"], ["🙂", "Good"], ["😄", "Very good"]];

function CheckIn({ token }: { token: string }) {
  const [options, setOptions] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [meds, setMeds] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<{ submitted_at: string; feeling: number; symptoms: string[] }[]>([]);
  const load = useCallback(() => call<{ symptom_options: string[]; items: typeof history }>("/api/me/checkins", token)
    .then((r) => { setOptions(r.symptom_options.filter((x) => x !== "None")); setHistory(r.items); }), [token]);
  useEffect(() => { load(); }, [load]);
  const submit = async () => {
    try {
      const r = await call<{ message: string }>("/api/me/checkins", token, { method: "POST", body: JSON.stringify({ feeling, symptoms, took_medications: meds, notes: notes || null }) });
      setMsg(r.message); setFeeling(null); setSymptoms([]); setMeds(null); setNotes(""); load();
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1} accessibilityRole="header">Daily check-in</Text>
      {msg && <Card><Text style={[s.p, { color: C.good }]} accessibilityRole="alert">{msg}</Text></Card>}
      <Card title="How do you feel today?">
        <View style={[s.wrap, { justifyContent: "space-between" }]}>
          {FEEL.map(([emoji, label], i) => (
            <Pressable key={label} onPress={() => setFeeling(i + 1)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: feeling === i + 1 }}
              style={[s.face, feeling === i + 1 && s.faceOn]}>
              <Text style={{ fontSize: 34 }}>{emoji}</Text>
              <Text style={[s.faceText, feeling === i + 1 && { color: "#fff" }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card title="Any of these today?">
        <View style={s.wrap}>{options.map((o) => <Button key={o} label={o} kind="plain" selected={symptoms.includes(o)}
          onPress={() => setSymptoms(symptoms.includes(o) ? symptoms.filter((x) => x !== o) : [...symptoms, o])} />)}</View>
      </Card>
      <Card title="Did you take your medicines?" icon="pill">
        <View style={s.wrap}><Button label="Yes" kind="plain" selected={meds === true} onPress={() => setMeds(true)} /><Button label="No" kind="plain" selected={meds === false} onPress={() => setMeds(false)} /></View>
      </Card>
      <Card title="Anything else? (optional)">
        <TextInput value={notes} onChangeText={setNotes} maxLength={500} multiline accessibilityLabel="Notes for your care team" style={s.input} />
      </Card>
      <Button label="Send check-in" onPress={submit} a11y={feeling && meds !== null ? "Send check-in" : "Send check-in (choose how you feel and medicines first)"} />
      {(!feeling || meds === null) && <Text style={s.small}>Choose how you feel and whether you took your medicines.</Text>}
      {history.length > 0 && (
        <Card title="Recent check-ins" icon="check">
          {history.slice(0, 5).map((h) => (
            <View key={h.submitted_at} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 26 }}>{FEEL[h.feeling - 1][0]}</Text>
              <Text style={[s.p, { flex: 1 }]}>{new Date(h.submitted_at).toLocaleDateString()} · {FEEL[h.feeling - 1][1]}{h.symptoms.length ? ` · ${h.symptoms.join(", ")}` : ""}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const TABS: [Tab, string, IconName][] = [["today", "Today", "home"], ["trends", "Trends", "chart"], ["meds", "Medicines", "pill"], ["checkin", "Check-in", "check"]];

export default function App() {
  const [token, setToken] = useState<string | null>(null);  // kept in memory only
  const [tab, setTab] = useState<Tab>("today");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <Text style={s.banner}>SYNTHETIC DEMO DATA · NOT FOR MEDICAL USE</Text>
      {!token ? <Login onToken={setToken} /> : (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {tab === "today" && <Today token={token} />}
            {tab === "trends" && <Trends token={token} />}
            {tab === "meds" && <Meds token={token} />}
            {tab === "checkin" && <CheckIn token={token} />}
          </View>
          <View style={s.tabs} accessibilityRole="tablist">
            {TABS.map(([k, l, ic]) => (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityLabel={l} accessibilityState={{ selected: tab === k }} style={[s.tab, tab === k && s.tabOn]}>
                <Icon name={ic} size={26} color={tab === k ? "#fff" : C.brand} />
                <Text style={[s.tabText, tab === k && { color: "#fff" }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  banner: { backgroundColor: C.ink, color: "#fff", textAlign: "center", fontSize: 12, paddingVertical: 4, fontWeight: "600" },
  screen: { padding: 18, gap: 16, maxWidth: 680, width: "100%", alignSelf: "center", flexGrow: 1 },
  h1: { fontSize: 30, fontWeight: "800", color: C.ink },
  h2: { fontSize: 22, fontWeight: "700", color: C.ink },
  p: { fontSize: 19, lineHeight: 27, color: C.ink2 },
  small: { fontSize: 15, lineHeight: 21, color: C.ink2 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, gap: 6, shadowColor: "#0b2545", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  hero: { backgroundColor: C.navy, borderRadius: 22, padding: 18, flexDirection: "row", gap: 14, alignItems: "center" },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.brand2, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: "#e6f0ff", fontSize: 15, fontWeight: "600" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4ade80" },
  batt: { width: 30, height: 14, borderRadius: 3, borderWidth: 2, borderColor: "#e6f0ff", overflow: "hidden" },
  battFill: { height: "100%" },
  scope: { backgroundColor: C.scope, borderRadius: 20, overflow: "hidden", borderWidth: 2, borderColor: "#123d29" },
  scopeHud: { position: "absolute", top: 10, left: 14, right: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scopeBpm: { color: C.trace, fontSize: 40, fontWeight: "800", fontVariant: ["tabular-nums"] },
  scopeUnit: { color: "#8af5b7", fontSize: 16, fontWeight: "700", marginTop: 12 },
  scopeBtn: { borderWidth: 1.5, borderColor: "#1f6b45", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  scopeNote: { color: "#7fd3a6", fontSize: 13, paddingHorizontal: 14, paddingBottom: 10 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  tile: { flexGrow: 1, flexBasis: 180, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: "center", paddingVertical: 14, gap: 2 },
  tileLabel: { fontSize: 19, fontWeight: "700", color: C.ink, marginTop: 4 },
  ringVal: { fontSize: 30, fontWeight: "800", color: C.ink },
  ringUnit: { fontSize: 14, fontWeight: "700", color: C.ink2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  btn: { minHeight: 56, borderRadius: 14, paddingHorizontal: 18, justifyContent: "center", alignItems: "center", backgroundColor: C.brand, flexDirection: "row", gap: 8 },
  btnPlain: { backgroundColor: "#fff", borderWidth: 2, borderColor: C.brand },
  btnSelected: { backgroundColor: C.brand },
  btnText: { color: "#fff", fontSize: 19, fontWeight: "700" },
  input: { minHeight: 90, borderWidth: 2, borderColor: C.line, borderRadius: 12, padding: 12, fontSize: 19, color: C.ink, textAlignVertical: "top" },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 6 },
  stat: { alignItems: "center" },
  statVal: { fontSize: 28, fontWeight: "800", color: C.ink },
  medIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#e8f1fc", alignItems: "center", justifyContent: "center" },
  timeChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#e8f1fc", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  face: { alignItems: "center", gap: 4, minWidth: 96, minHeight: 96, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 18, borderWidth: 2, borderColor: C.brand, backgroundColor: "#fff", justifyContent: "center" },
  faceOn: { backgroundColor: C.brand },
  faceText: { fontSize: 16, fontWeight: "700", color: C.brand },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, backgroundColor: "#fff" },
  tab: { flex: 1, minHeight: 70, justifyContent: "center", alignItems: "center", gap: 2 },
  tabOn: { backgroundColor: C.brand },
  tabText: { fontSize: 16, fontWeight: "700", color: C.brand },
});
