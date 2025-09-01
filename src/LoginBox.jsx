import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Brug samme værdier som i App.jsx
const SUPABASE_URL = "https://auiurmkojwpcbxarewdn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1aXVybWtvandwY2J4YXJld2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2ODE2NzMsImV4cCI6MjA3MjI1NzY3M30.09Hv3K3OADK69y56R-KkvHzzcEfbwN2cmNqwtYwsHHA";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function LoginBox({ onLoggedIn }) {
  const [step, setStep] = useState("request"); // request | verify
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) onLoggedIn?.(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [onLoggedIn]);

  const sendOtp = async () => {
    if (!email) return;
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true }, // opret bruger hvis ikke findes
      });
      if (error) throw error;
      setStep("verify");
      setMsg("Vi har sendt en 6-cifret kode til din mail.");
    } catch (e) {
      setMsg(e.message || "Kunne ikke sende kode.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!email || code.length < 6) return;
    setBusy(true); setMsg("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email", // mail-OTP
      });
      if (error) throw error;
      setMsg("Logget ind ✅");
      onLoggedIn?.(data.session);
    } catch (e) {
      setMsg(e.message || "Forkert kode?");
    } finally {
      setBusy(false);
    }
  };

  const box = { maxWidth: 420, margin: "40px auto", background: "#111", padding: 20, borderRadius: 16, border: "1px solid #2a2e39", color: "#fff" };
  const input = { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #333", background: "#0b0d12", color: "#fff" };
  const btn = { width: "100%", padding: 12, borderRadius: 10 };

  return (
    <div style={box}>
      <h2 style={{ margin: 0, marginBottom: 12 }}>Log ind</h2>

      {step === "request" ? (
        <>
          <input
            type="email"
            placeholder="din@mail.dk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...input, marginBottom: 10 }}
          />
          <button onClick={sendOtp} disabled={busy || !email} style={btn}>Send kode</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, opacity: .85, marginBottom: 8 }}>Indtast 6-cifret kode fra mailen:</div>
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            style={{ ...input, letterSpacing: 3, textAlign: "center", marginBottom: 10 }}
          />
          <button onClick={verifyOtp} disabled={busy || code.length < 6} style={btn}>Log ind</button>
          <button onClick={() => { setStep("request"); setCode(""); setMsg(""); }} style={{ ...btn, marginTop: 8, background: "transparent", border: "1px solid #333", color: "#fff" }}>
            Tilbage / Skift mail
          </button>
        </>
      )}

      {msg && <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>{msg}</div>}
    </div>
  );
}
