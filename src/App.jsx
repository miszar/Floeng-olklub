import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { supabase } from "./supabase";
import LoginBox from "./LoginBox.jsx";

const CLUB_ID = "floeng-olklub";

/* ---------- ErrorBoundary ---------- */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(e){ return { hasError:true, err:e }; }
  componentDidCatch(e, info){ console.error("UI crashed:", e, info); }
  render(){
    if (this.state.hasError) {
      return <div style={{color:"#fff",padding:24}}>
        <h2>Ups, noget gik galt 😬</h2>
        <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.err)}</pre>
      </div>;
    }
    return this.props.children;
  }
}

/* ---------- UI helpers ---------- */
function card(extra={}){ return { background:"#0b0d12", border:"1px solid #2a2e39", borderRadius:14, padding:12, ...extra }; }
function input(extra={}){ return { width:"100%", boxSizing:"border-box", padding:"10px 12px", height:40, borderRadius:10, border:"1px solid #2a2e39", background:"#0b0d12", color:"white", ...extra }; }
function btn(variant="primary"){
  const base={ borderRadius:999, cursor:"pointer", lineHeight:1 };
  if (variant==="primary") return {...base, background:"#fff", color:"#000", border:"1px solid #fff", padding:"10px 14px", fontWeight:700};
  if (variant==="ghost-sm") return {...base, background:"transparent", color:"#cfd3dc", border:"1px solid #2a2e39", padding:"6px 10px", fontSize:13};
  if (variant==="danger-sm") return {...base, background:"transparent", color:"#ff7a7a", border:"1px solid #3a2a2a", padding:"6px 10px", fontSize:13};
  return base;
}
function Stars({ value=0, onChange }){
  return <div>{[1,2,3,4,5].map(n =>
    <span key={n} onClick={()=>onChange?.(n)} style={{cursor:"pointer", color:n<=value?"#ffd84d":"#444", fontSize:20}}>★</span>
  )}</div>;
}

/* ---------- helpers ---------- */
function uuid(){ if (crypto?.randomUUID) return crypto.randomUUID();
  const r=()=>Math.floor((1+Math.random())*0x10000).toString(16).slice(1);
  return `${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;}
function dataURLtoFile(dataUrl, filename){
  const arr=dataUrl.split(","), mime=arr[0].match(/:(.*?);/)[1]; const b=atob(arr[1]); let n=b.length; const u8=new Uint8Array(n);
  while(n--) u8[n]=b.charCodeAt(n); return new File([u8], filename, {type:mime});
}
async function getSignedUrl(path, ttlHours=24*7){
  if(!path) return null; const {data,error}=await supabase.storage.from("photos").createSignedUrl(path,60*60*ttlHours);
  if(error) throw error; return data?.signedUrl ?? null;
}
async function getCroppedImg(imageSrc, cropPixels){
  const image=await new Promise((resolve,reject)=>{ const img=new Image(); img.crossOrigin="anonymous"; img.onload=()=>resolve(img); img.onerror=reject; img.src=imageSrc; });
  const canvas=document.createElement("canvas"); const ctx=canvas.getContext("2d");
  const w=Math.round(cropPixels.width), h=Math.round(cropPixels.height);
  const sx=Math.round(cropPixels.x), sy=Math.round(cropPixels.y);
  canvas.width=w; canvas.height=h; ctx.drawImage(image, sx, sy, w, h, 0,0,w,h);
  return canvas.toDataURL("image/jpeg", 0.92);
}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

/* ---------- AuthedApp ---------- */
function AuthedApp({ user }){
  // Scroll til top FØR første paint
  useLayoutEffect(()=>{ try{ window.scrollTo(0,0); document.activeElement?.blur?.(); }catch{} }, []);

  async function signOut(){ await supabase.auth.signOut(); }

  const [beers, setBeers] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [coverUrl, setCoverUrl] = useState(null);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name:"", brewery:"", style:"", color:"", price:"", rating:0, photoDataUrl:"" });

  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const coverFileRef=useRef(null); const addFileRef=useRef(null); const editFileRef=useRef(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const [cropFor, setCropFor] = useState("create");
  const [crop, setCrop] = useState({x:0,y:0});
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);
  function onCropComplete(_a,p){ setCropPixels(p); }

  const [vw, setVw] = useState(typeof window!=="undefined"? window.innerWidth : 420);
  useEffect(()=>{ const onR=()=>setVw(window.innerWidth); window.addEventListener("resize", onR); return ()=>window.removeEventListener("resize", onR); }, []);
  const isNarrow = vw < 390;

  const PORTRAIT_ASPECT = 140/220;
  const IMG_W = isNarrow?120:140;
  const IMG_H = Math.round(IMG_W/(140/220));
  const COVER_H = 180;

  useEffect(()=>{ loadBeers(); }, [user, sortBy, sortDir, search]);
  useEffect(()=>{ loadCover(); }, [user]);

  async function loadBeers(){
    for(let attempt=1; attempt<=3; attempt++){
      try{
        let q = supabase.from("beers")
          .select("id, name, brewery, style, color, price, rating, photo_path, created_at")
          .eq("club_id", CLUB_ID);
        if (search) q = q.or(`name.ilike.%${search}%,brewery.ilike.%${search}%,style.ilike.%${search}%,color.ilike.%${search}%`);
        const { data, error } = await q.order(sortBy, { ascending: sortDir==="asc" });
        if (error) throw error;
        setBeers(data||[]);
        const entries = await Promise.all((data||[]).map(async b => [b.id, b.photo_path? await getSignedUrl(b.photo_path):null]));
        setPhotoUrls(Object.fromEntries(entries));
        return;
      }catch(e){
        console.warn(`loadBeers attempt ${attempt} failed:`, e?.message||e);
        if (attempt<3) await sleep(600*attempt);
      }
    }
    setBeers([]);
  }

  async function loadCover(){
    const path=`covers/${CLUB_ID}.jpg`;
    for(let a=1;a<=3;a++){
      try{ setCoverUrl(await getSignedUrl(path)); return; }
      catch(e){ console.warn(`loadCover attempt ${a} failed:`, e?.message||e); if(a<3) await sleep(600*a); }
    }
    setCoverUrl(null);
  }

  function cleanDraft(d){
    const toNull=(v)=> (v!=null && String(v).trim()!=="" ? String(v).trim(): null);
    const toNum =(v)=> (v===""||v==null ? null : Number(v));
    return {
      name:String(d.name||"").trim(),
      brewery:toNull(d.brewery),
      style:toNull(d.style),
      color:toNull(d.color),
      price:toNum(d.price),
      rating: typeof d.rating==="number" ? d.rating : Number(d.rating)||0,
    };
  }

  async function addBeer(){
    const cleaned = cleanDraft(draft);
    if (!cleaned.name) return alert("Giv øllen et navn");
    let photo_path=null;
    try{
      if(draft.photoDataUrl){
        const file=dataURLtoFile(draft.photoDataUrl, `${uuid()}.jpg`);
        photo_path = `${CLUB_ID}/${file.name}`;
        const {error:upErr}=await supabase.storage.from("photos").upload(photo_path, file, {contentType:"image/jpeg"});
        if(upErr) throw upErr;
      }
      const { error } = await supabase.from("beers").insert({
        club_id:CLUB_ID, name:cleaned.name, brewery:cleaned.brewery, style:cleaned.style,
        color:cleaned.color, price:cleaned.price, rating:cleaned.rating, photo_path
      }).select().single();
      if(error) throw error;
      setDraft({name:"",brewery:"",style:"",color:"",price:"",rating:0,photoDataUrl:""});
      setAddOpen(false);
      await loadBeers();
      window.scrollTo(0,0);
    }catch(e){ alert("Kunne ikke gemme (INSERT): "+(e?.message||e?.details||JSON.stringify(e))); }
  }

  async function updateBeer(){
    if(!editing) return;
    const cleaned=cleanDraft(editDraft||{});
    try{
      let photo_path=editing.photo_path;
      if(editDraft?.photoDataUrl){
        if(photo_path){ try{ await supabase.storage.from("photos").remove([photo_path]); }catch{} }
        const file=dataURLtoFile(editDraft.photoDataUrl, `${uuid()}.jpg`);
        photo_path = `${CLUB_ID}/${file.name}`;
        const {error:upErr}=await supabase.storage.from("photos").upload(photo_path, file, {contentType:"image/jpeg"});
        if(upErr) throw upErr;
      }
      const { error } = await supabase.from("beers").update({
        name:cleaned.name, brewery:cleaned.brewery, style:cleaned.style,
        color:cleaned.color, price:cleaned.price, rating:cleaned.rating, photo_path
      }).eq("id", editing.id).select().single();
      if(error) throw error;
      setEditing(null); setEditDraft(null);
      await loadBeers();
      window.scrollTo(0,0);
    }catch(e){ alert("Kunne ikke gemme (UPDATE): "+(e?.message||e?.details||JSON.stringify(e))); }
  }

  async function deleteBeer(b){
    const sure=window.confirm(`Slet "${b.name}"?`); if(!sure) return;
    const {error}=await supabase.from("beers").delete().eq("id", b.id);
    if(error){ alert(error.message); return; }
    if(b.photo_path){ try{ await supabase.storage.from("photos").remove([b.photo_path]); }catch{} }
    await loadBeers();
  }

  const gridMin = (vw<390)?300:340;

  async function confirmCrop(){
    if(!cropPixels || !cropSrc){ setCropOpen(false); return; }
    const dataUrl=await getCroppedImg(cropSrc, cropPixels);
    if (cropFor==="create") setDraft(d=>({...d, photoDataUrl:dataUrl}));
    if (cropFor==="edit")   setEditDraft(d=>({...d, photoDataUrl:dataUrl}));
    if (cropFor==="cover"){
      const file=dataURLtoFile(dataUrl, `${uuid()}.jpg`);
      const path=`covers/${CLUB_ID}.jpg`;
      try{ await supabase.storage.from("photos").remove([path]); }catch{}
      const {error}=await supabase.storage.from("photos").upload(path, file, {contentType:"image/jpeg"});
      if(error) alert("Cover upload fejlede: "+error.message);
      else setCoverUrl(await getSignedUrl(path));
    }
    setCropOpen(false);
  }

  // beregn base padding og giv ekstra top for iPhone notch
  const basePadY = vw < 390 ? 16 : 24;
  const basePadX = vw < 390 ? 12 : 24;

  return (
    <div style={{ minHeight:"100vh", background:"#0f1115", color:"white", overflowX:"hidden", touchAction:"manipulation" }}>
      <div
        style={{
          maxWidth:980,
          margin:"0 auto",
          padding: `${basePadY}px ${basePadX}px`,
          paddingTop: `calc(${basePadY}px + env(safe-area-inset-top, 0px))`,
        }}
      >
        {/* Titel */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <h1 style={{ fontSize:32, fontWeight:800, margin:0 }}>Fløng Ølklub</h1>
            <span aria-hidden="true" style={{ fontSize:28, lineHeight:1 }}>🍻</span>
          </div>
          <button onClick={signOut} style={btn("ghost-sm")}>Log ud</button>
        </div>

        {/* Cover */}
        <div
          style={{
            marginTop:8, width:"100%", height:COVER_H,
            borderRadius:12, border:"1px solid #2a2e39", overflow:"hidden",
            background: coverUrl ? `center / cover no-repeat url(${coverUrl})` : "#161922",
            display:"grid", placeItems: coverUrl ? "unset" : "center", color:"#8b8f9a",
          }}
        >
          {!coverUrl && "(intet cover)"}
        </div>
        <div style={{ marginTop:6, display:"flex", justifyContent:"flex-end" }}>
          <input
            ref={coverFileRef} type="file" accept="image/*" style={{ display:"none" }}
            onChange={(e)=>{
              const f=e.target.files?.[0]; if(!f) return;
              const r=new FileReader();
              r.onload=()=>{ setCropSrc(r.result); setCropFor("cover"); setCropOpen(true); setZoom(1); setCrop({x:0,y:0}); };
              r.readAsDataURL(f);
            }}
          />
          <button onClick={()=>coverFileRef.current?.click()} style={btn("ghost-sm")}>Skift cover</button>
        </div>

        {/* Topbar */}
        <div style={{ marginTop:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <button onClick={()=>{ setAddOpen(true); window.scrollTo(0,0); }} style={btn("primary")}>Tilføj Øl</button>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Søg øl…" style={{ ...input(), maxWidth:260 }} />
        </div>

        {/* Sortering */}
        <div style={{ marginTop:12, display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ opacity:.8 }}>Sorter:</span>
          <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} style={input()}>
            <option value="created_at">Nyeste/ældste</option>
            <option value="rating">Bedømmelse</option>
            <option value="name">Navn</option>
            <option value="style">Stil</option>
            <option value="price">Pris</option>
          </select>
          <select value={sortDir} onChange={(e)=>setSortDir(e.target.value)} style={input()}>
            <option value="desc">Faldende</option>
            <option value="asc">Stigende</option>
          </select>
        </div>

        {/* Liste */}
        <section style={{ marginTop:16 }}>
          {beers.length===0 ? (
            <div style={{ opacity:.7 }}>Ingen øl endnu – brug “Tilføj Øl” 🍺</div>
          ) : (
            <div style={{ display:"grid", gap:12, gridTemplateColumns:`repeat(auto-fill, minmax(${(vw<390)?300:340}px, 1fr))` }}>
              {beers.map(b=>(
                <article key={b.id} style={card({ padding:0 })}>
                  <div style={{ display:"flex", flexWrap:"nowrap" }}>
                    {photoUrls[b.id] ? (
                      <img src={photoUrls[b.id]} alt={b.name}
                        style={{ width:(vw<390?120:140), height:(vw<390?188:220), objectFit:"cover",
                                 borderTopLeftRadius:14, borderBottomLeftRadius:14 }} />
                    ) : (
                      <div style={{ width:(vw<390?120:140), height:(vw<390?188:220), display:"grid",
                                     placeItems:"center", background:"#161922", color:"#8b8f9a",
                                     borderTopLeftRadius:14, borderBottomLeftRadius:14 }}>
                        (intet billede)
                      </div>
                    )}
                    <div style={{ flex:1, minWidth:0, padding:12 }}>
                      <div style={{ fontWeight:800, fontSize:22, marginBottom:2, wordBreak:"break-word" }}>{b.name || "(uden navn)"}</div>

                      {/* Kun værdier – ingen labels */}
                      <div style={{ opacity:.9, fontSize:16 }}>
                        {b.brewery || "—"} • {b.style || "—"} • {b.color || "—"}
                      </div>
                      <div style={{ opacity:.85, marginTop:6, fontSize:16 }}>
                        {b.price ?? "—"}
                      </div>

                      <div style={{ marginTop:8 }}><Stars value={b.rating ?? 0} onChange={()=>{}} /></div>
                      <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap" }}>
                        <button
                          onClick={()=>{
                            setEditing(b);
                            setEditDraft({
                              name:b.name||"", brewery:b.brewery||"", style:b.style||"", color:b.color||"",
                              price:b.price ?? "", rating: typeof b.rating==="number"? b.rating : Number(b.rating)||0, photoDataUrl:""
                            });
                            window.scrollTo(0,0);
                          }}
                          style={btn("ghost-sm")}
                        >Redigér</button>
                        <button onClick={()=>deleteBeer(b)} style={btn("danger-sm")}>Slet</button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ADD MODAL */}
      {addOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"grid", placeItems:"center", zIndex:50 }}>
          <div style={{ background:"#0b0d12", padding:16, borderRadius:12, border:"1px solid #2a2e39", width:"min(720px, 92vw)" }}>
            <h3 style={{ marginTop:0 }}>Tilføj Øl</h3>
            <div style={{ display:"grid", gap:8, gridTemplateColumns:"repeat(2, 1fr)" }}>
              <input style={input()} placeholder="Navn*" value={draft.name} onChange={e=>setDraft({...draft, name:e.target.value})} />
              <input style={input()} placeholder="Bryggeri" value={draft.brewery} onChange={e=>setDraft({...draft, brewery:e.target.value})} />
              <input style={input()} placeholder="Stil" value={draft.style} onChange={e=>setDraft({...draft, style:e.target.value})} />
              <input style={input()} placeholder="Farve (fx Gylden / Amber / Mørk)" value={draft.color} onChange={e=>setDraft({...draft, color:e.target.value})} />
              <input style={input()} placeholder="Pris (tal)" value={draft.price} onChange={e=>setDraft({...draft, price:e.target.value})} />
              <div style={{ display:"flex", alignItems:"center" }}>
                <Stars value={draft.rating} onChange={v=>setDraft({...draft, rating:v})} />
              </div>
              <input
                ref={addFileRef} type="file" accept="image/*"
                onChange={(e)=>{
                  const f=e.target.files?.[0]; if(!f) return;
                  const r=new FileReader();
                  r.onload=()=>{ setCropSrc(r.result); setCropFor("create"); setCropOpen(true); setZoom(1); setCrop({x:0,y:0}); };
                  r.readAsDataURL(f);
                }}
                style={{ ...input(), gridColumn:"1 / -1" }}
              />
            </div>
            {draft.photoDataUrl && <img alt="preview" src={draft.photoDataUrl} style={{ marginTop:12, width:"100%", maxHeight:260, objectFit:"cover", borderRadius:12, border:"1px solid #333" }} />}
            <div style={{ marginTop:12, display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>setAddOpen(false)} style={btn("ghost-sm")}>Annuller</button>
              <button onClick={addBeer} style={btn("primary")}>Gem</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && editDraft && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"grid", placeItems:"center", zIndex:50 }}>
          <div style={{ background:"#0b0d12", padding:16, borderRadius:12, border:"1px solid #2a2e39", width:"min(720px, 92vw)" }}>
            <h3 style={{ marginTop:0 }}>Redigér: {editing.name}</h3>
            <div style={{ display:"grid", gap:8, gridTemplateColumns:"repeat(2, 1fr)" }}>
              <input style={input()} placeholder="Navn" value={editDraft.name} onChange={e=>setEditDraft({...editDraft, name:e.target.value})} />
              <input style={input()} placeholder="Bryggeri" value={editDraft.brewery} onChange={e=>setEditDraft({...editDraft, brewery:e.target.value})} />
              <input style={input()} placeholder="Stil" value={editDraft.style} onChange={e=>setEditDraft({...editDraft, style:e.target.value})} />
              <input style={input()} placeholder="Farve" value={editDraft.color} onChange={e=>setEditDraft({...editDraft, color:e.target.value})} />
              <input style={input()} placeholder="Pris (tal)" value={editDraft.price ?? ""} onChange={e=>setEditDraft({...editDraft, price:e.target.value})} />
              <div style={{ display:"flex", alignItems:"center" }}>
                <Stars value={editDraft.rating} onChange={v=>setEditDraft({...editDraft, rating:v})} />
              </div>
              <input
                ref={editFileRef} type="file" accept="image/*"
                onChange={(e)=>{
                  const f=e.target.files?.[0]; if(!f) return;
                  const r=new FileReader();
                  r.onload=()=>{ setCropSrc(r.result); setCropFor("edit"); setCropOpen(true); setZoom(1); setCrop({x:0,y:0}); };
                  r.readAsDataURL(f);
                }}
                style={{ ...input(), gridColumn:"1 / -1" }}
              />
            </div>
            {editDraft.photoDataUrl && <img alt="preview" src={editDraft.photoDataUrl} style={{ marginTop:12, width:"100%", maxHeight:260, objectFit:"cover", borderRadius:12, border:"1px solid #333" }} />}
            <div style={{ marginTop:12, display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>{ setEditing(null); setEditDraft(null); }} style={btn("ghost-sm")}>Annuller</button>
              <button onClick={updateBeer} style={btn("primary")}>Gem</button>
            </div>
          </div>
        </div>
      )}

      {/* Cropper modal */}
      {cropOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"grid", placeItems:"center", zIndex:60 }}>
          <div style={{ width:"min(720px, 92vw)", background:"#0b0d12", border:"1px solid #2a2e39", borderRadius:14, padding:16 }}>
            <h3 style={{ marginTop:0 }}>Beskær billede</h3>
            <div style={{ position:"relative", width:"100%", height:360, background:"#111", borderRadius:12, overflow:"hidden" }}>
              <Cropper
                image={cropSrc}
                crop={crop} zoom={zoom}
                aspect={cropFor==="cover" ? 3 : PORTRAIT_ASPECT}
                onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
                restrictPosition
              />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:12 }}>
              <span style={{ opacity:.8, fontSize:14 }}>Zoom</span>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{ flex:1 }} />
              <button onClick={()=>setCropOpen(false)} style={btn("ghost-sm")}>Annuller</button>
              <button onClick={confirmCrop} style={btn("primary")}>Brug udsnit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- AuthGate ---------- */
function AuthGate(){
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // FØR første paint
  useLayoutEffect(()=>{ try{ window.scrollTo(0,0); document.activeElement?.blur?.(); }catch{} }, []);

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{
      if(!alive) return;
      setUser(data.session?.user ?? null);
      setReady(true);
      try{ window.scrollTo(0,0); }catch{}
    });
    const { data:sub } = supabase.auth.onAuthStateChange((_e,s)=>{
      if(!alive) return;
      setUser(s?.user ?? null);
      try{ window.scrollTo(0,0); }catch{}
    });
    return ()=>{ alive=false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  if(!ready) return <div style={{color:"#fff",padding:24,opacity:.8}}>Loader…</div>;
  if(!user) return <LoginBox />;
  return <AuthedApp user={user} />;
}

/* ---------- App root ---------- */
export default function App(){
  return (
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  );
}
