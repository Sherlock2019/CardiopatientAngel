import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { api } from "../lib/api";
import { BeatingHeart } from "./Illustrations";

interface Reply { intent: string; answer: string; patients: { patient_id: string; synthetic_name: string }[] }
type Msg = { role: "me" | "angel"; text: string; patients?: Reply["patients"]; intent?: string };

const SUGGEST = ["Any emergencies right now?", "Who is on call?", "Who is on apixaban?", "Patients with heart failure", "How many patients are at risk?"];

// **bold** + line breaks only; everything else is plain text (no HTML injection)
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <div key={i} className={line.startsWith("•") ? "pl-2" : undefined}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith("**") ? <b key={j}>{part.slice(2, -2)}</b> : <span key={j}>{part}</span>)}
        </div>
      ))}
    </>
  );
}

export default function HeartAngel() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const ask = useMutation({
    mutationFn: (question: string) => api<Reply>("/api/heartangel/ask", { method: "POST", body: JSON.stringify({ question }) }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "angel", text: r.answer, patients: r.patients, intent: r.intent }]),
    onError: (e) => setMsgs((m) => [...m, { role: "angel", text: e instanceof Error ? e.message : "Heart Angel is unavailable." }]),
  });
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, ask.isPending]);

  const send = (text: string) => {
    const t = text.trim();
    if (t.length < 2 || ask.isPending) return;
    setMsgs((m) => [...m, { role: "me", text: t }]);
    setQ("");
    setOpen(true);
    ask.mutate(t);
  };

  return (
    <div className="relative min-w-0 flex-1 md:max-w-xl">
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex items-center gap-2 rounded-full border border-[#e5484d]/30 bg-[#fff5f5] py-1 pl-1.5 pr-1">
        <BeatingHeart size={22} bpm={64} />
        <label className="sr-only" htmlFor="heart-angel-q">Ask Heart Angel</label>
        <input
          id="heart-angel-q" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)}
          placeholder="Ask Heart Angel — patients, medications, family contacts, emergencies…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <button type="submit" disabled={ask.isPending || q.trim().length < 2} aria-label="Send to Heart Angel"
          className="rounded-full bg-[#e5484d] p-1.5 text-white disabled:opacity-40">
          {ask.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>

      {open && (
        <div role="dialog" aria-label="Heart Angel" className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-black/10 bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><BeatingHeart size={20} /> Heart Angel</div>
            <button onClick={() => setOpen(false)} aria-label="Close Heart Angel" className="rounded p-1 text-muted hover:bg-black/5"><X size={14} /></button>
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3 text-[13px]">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-ink-2">I answer from the patient record. Dosing, treatment changes and diagnosis stay with the doctor in charge or on call.</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-ink-2 hover:bg-black/5">{s}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "me" ? "ml-10 rounded-lg bg-brand-soft px-3 py-2" : "mr-4 rounded-lg border border-black/10 px-3 py-2"}>
                {m.role === "angel" && m.intent === "clinical_decision" && <div className="mb-1 text-[11px] font-semibold text-[#a86b00]">Physician decision</div>}
                {m.role === "angel" && m.intent === "emergency" && <div className="mb-1 text-[11px] font-semibold text-crit">Emergencies</div>}
                <Rich text={m.text} />
                {m.patients && m.patients.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.patients.map((p) => (
                      <Link key={p.patient_id} to={`/patients/${p.patient_id}`} onClick={() => setOpen(false)}
                        className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-brand-dark hover:underline">{p.synthetic_name} →</Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {ask.isPending && <div className="flex items-center gap-2 text-xs text-muted"><Loader2 size={12} className="animate-spin" /> Looking it up…</div>}
            <div ref={end} />
          </div>
          <p className="border-t border-black/5 px-3 py-1.5 text-[10.5px] text-muted">Synthetic data · every question is audited · not for clinical decisions</p>
        </div>
      )}
    </div>
  );
}
