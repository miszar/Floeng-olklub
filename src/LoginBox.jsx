// src/LoginBox.jsx
import React, { useState } from "react";
import { supabase } from "./supabase";

export default function LoginBox() {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    if (!email) return;
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("verify");
      setMsg("Vi har sendt en 6-cifret kode til din mail.");
    } catch (e) {
      setMsg(e.message || "Kunne ikke sende kode.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!email || code.length < 6) return;
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;

      // ✅ VIGTIGT: sørg for at app'en rehydreres med den nye session
      setMsg("Logget ind…");
      // lille delay så cookie/session kan sætte sig, derefter fuld reload
      setTimeout(() => {
        window.location.replace(window.location.origin + window.location.pathname);
      }, 100);
    } catch (e) {
      setMsg(e.message || "Forkert kode?");
    } finally {
      setBusy(false);
    }
  }

  const box={maxWidth:420,margin:"40px auto",background:"#111",padding:20,borderRadius:16,border:"1px solid #2a2e39",color:"#fff"};
  const input={width:"100%",padding:12,borderRadius:10,border:"1px solid #333",background:"#0b0d12",color:"#fff"};
  const btn={width:"100%",padding:12,borderRadius:10,cursor:"pointer"};

  return (
    <div style={box}>
      <h2 style={{margin:0,marginBottom:12}}>Log ind</h2>

      {step==="request" ? (
        <>
          <input type="email" placeholder="din@mail.dk" value={email}
                 onChange={(e)=>setEmail(e.target.value)}
                 style={{...input,marginBottom:10}} />
          <button onClick={sendOtp} disabled={busy||!email} style={btn}>Send kode</button>
        </>
      ) : (
        <>
          <div style={{fontSize:14,opacity:.85,marginBottom:8}}>Indtast 6-cifret kode fra mailen:</div>
          <input inputMode="numeric" maxLength={6} placeholder="123456"
                 value={code}
                 onChange={(e)=>setCode(e.target.value.replace(/\D/g,""))}
                 style={{...input,letterSpacing:3,textAlign:"center",marginBottom:10}} />
          <button onClick={verifyOtp} disabled={busy||code.length<6} style={btn}>Log ind</button>
          <button onClick={()=>{ setStep("request"); setCode(""); setMsg(""); }}
                  style={{...btn,marginTop:8,background:"transparent",border:"1px solid #333",color:"#fff"}}>
            Tilbage / Skift mail
          </button>
        </>
      )}

      {msg && <div style={{marginTop:12,fontSize:13,opacity:.9}}>{msg}</div>}
    </div>
  );
}
