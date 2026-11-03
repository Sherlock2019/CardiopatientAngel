/**
 * CardioWatch patient app (React Native + TypeScript, Expo). Synthetic data only.
 * Large type, high contrast and big touch targets for older adults. Uses only core React Native components.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";

// Web build is served behind the same nginx as the API (relative URLs). Native/dev: set EXPO_PUBLIC_API_URL.
const API = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : "http://10.0.2.2:8010");
const C = { bg: "#f3f6fa", card: "#ffffff", ink: "#0b0b0b", ink2: "#3d3c39", brand: "#1c5cab", good: "#006300", warn: "#8a5a00", crit: "#b42323", line: "#c3c2b7" };

type Tab = "today" | "trends" | "meds" | "checkin";
interface Me { first_name: string; care_unit: string; device: { type: string; battery_pct: number | null; last_sync_at: string | null } | null;
  latest: Record<string, { value: number; unit: string; observed_at: string }>; signals: string[] }
interface Point { t: string; v: number }

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `Request failed (${res.status})`);
  return res.json();
}

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return m < 2 ? "just now" : m < 90 ? `${Math.round(m)} minutes ago` : `${Math.round(m / 60)} hours ago`;
};

function Button({ label, onPress, kind = "primary", selected, a11y }: { label: string; onPress: () => void; kind?: "primary" | "plain"; selected?: boolean; a11y?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [s.btn, kind === "plain" && s.btnPlain, selected && s.btnSelected, pressed && { opacity: 0.8 }]}>
      <Text style={[s.btnText, (kind === "plain" && !selected) && { color: C.brand }]}>{selected ? "✓ " : ""}{label}</Text>
    </Pressable>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return <View style={s.card}>{title && <Text style={s.h2} accessibilityRole="header">{title}</Text>}{children}</View>;
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    try { onToken((await call<{ access_token: string }>("/api/auth/login", null, { method: "POST", body: JSON.stringify({ username: "patient.demo" }) })).access_token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View style={[s.screen, { justifyContent: "center" }]}>
      <Text style={s.h1} accessibilityRole="header">CardioWatch</Text>
      <Text style={s.p}>Your heart monitoring companion. This is a demonstration with a synthetic patient — no real health data.</Text>
      <Button label={busy ? "Signing in…" : "Sign in as demo patient"} onPress={go} />
      {err && <Text style={[s.p, { color: C.crit }]} accessibilityRole="alert">{err}</Text>}
    </View>
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
  const vit: [string, string, string | undefined][] = [
    ["Heart rate", L.heart_rate ? `${Math.round(L.heart_rate.value)} bpm` : "—", L.heart_rate?.observed_at],
    ["Blood pressure", L.systolic_bp && L.diastolic_bp ? `${Math.round(L.systolic_bp.value)}/${Math.round(L.diastolic_bp.value)} mmHg` : "—", L.systolic_bp?.observed_at],
    ["Oxygen", L.spo2 ? `${Math.round(L.spo2.value)} %` : "—", L.spo2?.observed_at],
  ];
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1} accessibilityRole="header">Hello, {me.first_name}</Text>
      {me.device && (
        <Card title="Your device">
          <Text style={s.p}>{me.device.type}</Text>
          <Text style={s.p}>Battery: {me.device.battery_pct ?? "—"}% · last sync {ago(me.device.last_sync_at)}</Text>
        </Card>
      )}
      <Card title="Latest readings">
        {vit.map(([k, v, t]) => (
          <View key={k} style={s.row} accessible accessibilityLabel={`${k} ${v}, ${ago(t ?? null)}`}>
            <Text style={s.label}>{k}</Text>
            <View style={{ alignItems: "flex-end" }}><Text style={s.big}>{v}</Text><Text style={s.small}>{ago(t ?? null)}</Text></View>
          </View>
        ))}
      </Card>
      <Card title="For today">{tips.map((t) => <Text key={t} style={s.p}>• {t}</Text>)}</Card>
      <Text style={s.small}>Your care team reviews your readings. If you feel very unwell, call emergency services.</Text>
    </ScrollView>
  );
}

const SIGNALS: [string, string][] = [["heart_rate", "Heart rate"], ["systolic_bp", "Blood pressure (top)"], ["spo2", "Oxygen"]];

function Trends({ token }: { token: string }) {
  const [signal, setSignal] = useState("heart_rate");
  const [data, setData] = useState<{ unit: string; points: Point[] } | null>(null);
  useEffect(() => { setData(null); call<{ unit: string; points: Point[] }>(`/api/me/trends?signal=${signal}&days=7`, token).then(setData).catch(() => setData({ unit: "", points: [] })); }, [signal, token]);
  const pts = data?.points.slice(-28) ?? [];
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.h1} accessibilityRole="header">Your trends</Text>
      <View style={s.wrap}>{SIGNALS.map(([k, l]) => <Button key={k} label={l} kind="plain" selected={signal === k} onPress={() => setSignal(k)} />)}</View>
      <Card title="Last 7 days">
        {!data ? <ActivityIndicator /> : pts.length === 0 ? <Text style={s.p}>No readings yet.</Text> : (
          <>
            <View style={s.chart} accessible accessibilityLabel={`Average ${avg.toFixed(0)} ${data.unit}, lowest ${min.toFixed(0)}, highest ${max.toFixed(0)}`}>
              {pts.map((p) => <View key={p.t} style={[s.bar, { height: `${max === min ? 50 : 15 + ((p.v - min) / (max - min)) * 85}%` }]} />)}
            </View>
            <Text style={s.p}>Average {avg.toFixed(0)} {data.unit} · lowest {min.toFixed(0)} · highest {max.toFixed(0)}</Text>
            <Text style={s.small}>Each bar is one hourly average. Your care team decides what these numbers mean for you.</Text>
          </>
        )}
      </Card>
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
        <Card key={m.name + m.dose} title={m.name}>
          <Text style={s.p}>{m.dose}</Text>
          <Text style={s.p}>Reminder at {m.times.join(" and ")}</Text>
          <Button label={taken[m.name] ? "Taken today" : "Mark as taken"} kind="plain" selected={taken[m.name]} onPress={() => setTaken({ ...taken, [m.name]: !taken[m.name] })} />
        </Card>
      ))}
      <Text style={s.small}>Do not change how you take your medicines without talking to your care team.</Text>
    </ScrollView>
  );
}

const FEEL = ["Very poor", "Poor", "Okay", "Good", "Very good"];

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
        <View style={s.wrap}>{FEEL.map((f, i) => <Button key={f} label={f} kind="plain" selected={feeling === i + 1} onPress={() => setFeeling(i + 1)} />)}</View>
      </Card>
      <Card title="Any of these today?">
        <View style={s.wrap}>{options.map((o) => <Button key={o} label={o} kind="plain" selected={symptoms.includes(o)}
          onPress={() => setSymptoms(symptoms.includes(o) ? symptoms.filter((x) => x !== o) : [...symptoms, o])} />)}</View>
      </Card>
      <Card title="Did you take your medicines?">
        <View style={s.wrap}><Button label="Yes" kind="plain" selected={meds === true} onPress={() => setMeds(true)} /><Button label="No" kind="plain" selected={meds === false} onPress={() => setMeds(false)} /></View>
      </Card>
      <Card title="Anything else? (optional)">
        <TextInput value={notes} onChangeText={setNotes} maxLength={500} multiline accessibilityLabel="Notes for your care team" style={s.input} />
      </Card>
      <Button label="Send check-in" onPress={submit} a11y={feeling && meds !== null ? "Send check-in" : "Send check-in (choose how you feel and medicines first)"} />
      {(!feeling || meds === null) && <Text style={s.small}>Choose how you feel and whether you took your medicines.</Text>}
      {history.length > 0 && (
        <Card title="Recent check-ins">
          {history.slice(0, 5).map((h) => <Text key={h.submitted_at} style={s.p}>{new Date(h.submitted_at).toLocaleDateString()} · {FEEL[h.feeling - 1]}{h.symptoms.length ? ` · ${h.symptoms.join(", ")}` : ""}</Text>)}
        </Card>
      )}
    </ScrollView>
  );
}

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
            {([["today", "Today"], ["trends", "Trends"], ["meds", "Medicines"], ["checkin", "Check-in"]] as [Tab, string][]).map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[s.tab, tab === k && s.tabOn]}>
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
  screen: { padding: 20, gap: 16, maxWidth: 640, width: "100%", alignSelf: "center", flexGrow: 1 },
  h1: { fontSize: 30, fontWeight: "700", color: C.ink },
  h2: { fontSize: 22, fontWeight: "700", color: C.ink, marginBottom: 8 },
  p: { fontSize: 20, lineHeight: 28, color: C.ink2 },
  small: { fontSize: 16, lineHeight: 22, color: C.ink2 },
  label: { fontSize: 20, color: C.ink2 },
  big: { fontSize: 26, fontWeight: "700", color: C.ink },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line, gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#ecebe6" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  btn: { minHeight: 56, borderRadius: 14, paddingHorizontal: 20, justifyContent: "center", alignItems: "center", backgroundColor: C.brand },
  btnPlain: { backgroundColor: "#fff", borderWidth: 2, borderColor: C.brand },
  btnSelected: { backgroundColor: C.brand },
  btnText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  input: { minHeight: 90, borderWidth: 2, borderColor: C.line, borderRadius: 12, padding: 12, fontSize: 20, color: C.ink, textAlignVertical: "top" },
  chart: { height: 160, flexDirection: "row", alignItems: "flex-end", gap: 3, marginVertical: 8 },
  bar: { flex: 1, backgroundColor: C.brand, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, backgroundColor: "#fff" },
  tab: { flex: 1, minHeight: 64, justifyContent: "center", alignItems: "center" },
  tabOn: { backgroundColor: C.brand },
  tabText: { fontSize: 18, fontWeight: "700", color: C.brand },
});
