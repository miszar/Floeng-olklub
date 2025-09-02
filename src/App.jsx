import React, { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { supabase } from "./supabase";
import LoginBox from "./LoginBox.jsx";

const CLUB_ID = "floeng-olklub";

// ------- ErrorBoundary (så vi aldrig får blank skærm) -------
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(error){ return { hasError: true, err: error }; }
  componentDidCatch(error, info){ console.error("UI crashed:", error, info); }
  render(){
    if (this.state.hasError) {
      return (
        <div style={{ color:"#fff", padding: 24 }}>
          <h2>Ups, noget gik galt 😬</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.err)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ------- UI helpers -------
function card(extra = {}) {
  return { background: "#0b0d12", border: "1px solid #2a2e39", borderRadius: 14, padding: 12, ...extra };
}
function input(extra = {}) {
  return { width: "100%", boxSizing: "border-box", padding: "10px 12px", height: 40, borderRadius: 10, border: "1px solid #2a2e39", background: "#0b0d12", color: "white", ...extra };
}
function btn(variant = "primary") {
  const base = { borderRadius: 999, cursor: "pointer", lineHeight: 1 };
  if (variant === "primary") return { ...base, background: "#fff", color: "#000", border: "1px solid #fff", padding: "10px 14px", fontWeight: 700 };
  if (variant === "ghost-sm") return { ...base, background: "transparent", color: "#cfd3dc", border: "1px solid #2a2e39", padding: "6px 10px", fontSize: 13 };
  if (variant === "danger-sm") return { ...base, background: "transparent", color: "#ff7a7a", border: "1px solid #3a2a2a", padding: "6px 10px", fontSize: 13 };
  return base;
}
function Stars({ value = 0, onChange }) {
  return (
    <div>
      {[1,2,3,4,5].map((n) => (
        <span key={n} onClick={() => onChange?.(n)}
          style={{ cursor: "pointer", color: n <= value ? "#ffd84d" : "#444", fontSize: 20 }}>★</span>
      ))}
    </div>
  );
}

// ------- misc helpers -------
function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const r = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}
function dataURLtoFile(dataUrl, filename) {
  const arr = dataUrl.split(","), mime = arr[0].match(/:(.*?);/)[1];
  const b = atob(arr[1]); let n = b.length; const u8 = new Uint8Array(n);
  while (n--) u8[n] = b.charCodeAt(n);
  return new File([u8], filename, { type: mime });
}
async function getSignedUrl(path, ttlHours = 24 * 7) {
  if (!path) return null;
  const { data } = await supabase.storage.from("photos").createSignedUrl(path, 60 * 60 * ttlHours);
  return data?.signedUrl ?? null;
}
async function getCroppedImg(imageSrc, cropPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img); img.onerror = reject; img.src = imageSrc;
  });
  const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
  const w = Math.round(cropPixels.width), h = Math.round(cropPixels.height);
  const sx = Math.round(cropPixels.x), sy = Math.round(cropPixels.y);
  canvas.width = w; canvas.height = h;
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function AppInner() {
  // ------- Auth bootstrap -------
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!isMounted) return;
      setUser(s?.user ?? null);
    });

    return () => { isMounted = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  // Indtil vi VED om man er logget ind
  if (!authReady) {
    return <div style={{ color:"#fff", padding: 24, opacity: .8 }}>Loader…</div>;
  }

  // Ikke logget ind → vis LoginBox
  if (!user) return <LoginBox />;

  async function signOut() { await supabase.auth.signOut(); }

  // ------- state -------
  const [beers, setBeers] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [coverUrl, setCoverUrl] = useState(null);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", brewery: "", style: "", color: "", price: "", rating: 0, photoDataUrl: "" });
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const coverFileRef = useRef(null); const addFileRef = useRef(null); const editFileRef = useRef(null);

  // cropper
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const [cropFor, setCropFor] = useState("create");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);
  function onCropComplete(_a, p) { setCropPixels(p); }

  async function confirmCrop() {
    if (!cropPixels || !cropSrc) { setCropOpen(false); return; }
    const dataUrl = await getCroppedImg(cropSrc, cropPixels);
    if (cropFor === "create") setDraft((d) => ({ ...d, photoDataUrl: dataUrl }));
    if (cropFor === "edit") setEditDraft((d) => ({ ...d, photoDataUrl: dataUrl }));
    if (cropFor === "cover") {
      const file = dataURLtoFile(dataUrl, `${uuid()}.jpg`);
      const path = `covers/${CLUB_ID}.jpg`;
      try { await supabase.storage.from("photos").remove([path]); } catch {}
      const { error } = await supabase.storage.from("photos").upload(path, file, { contentType: "image/jpeg" });
      if (error) alert("Cover upload fejlede: " + error.message);
      else setCoverUrl(await getSignedUrl(path));
    }
    setCropOpen(false);
  }

  useEffect(() => { loadBeers(); }, [user, sortBy, sortDir, search]);
  useEffect(() => { loadCover(); }, [user]);

  async function loadBeers() {
    let q = supabase.from("beers")
      .select("id, name, brewery, style, color, price, rating, photo_path, created_at")
      .eq("club_id", CLUB_ID);

    if (search) q = q.or(`name.ilike.%${search}%,brewery.ilike.%${search}%,style.ilike.%${search}%,color.ilike.%${search}%`);

    const { data, error } = await q.order(sortBy, { ascending: sortDir === "asc" });
    if (error) { alert(error.message); return; }
    setBeers(data || []);
    const entries = await Promise.all((data || []).map(async (b) => [b.id, await getSignedUrl(b.photo_path)]));
    setPhotoUrls(Object.fromEntries(entries));
  }

  async function loadCover() {
    const path = `covers/${CLUB_ID}.jpg`;
    setCoverUrl(await getSignedUrl(path));
  }

  async function addBeer() {
    if (!draft.name.trim()) return alert("Giv øllen et navn");
    let photo_path = null;
    if (draft.photoDataUrl) {
      const file = dataURLtoFile(draft.photoDataUrl, `${uuid()}.jpg`);
      photo_path = `${CLUB_ID}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(photo_path, file, { contentType: "image/jpeg" });
      if (upErr) { alert("Upload fejlede: " + upErr.message); return; }
    }
    const { error } = await supabase.from("beers").insert({
      club_id: CLUB_ID, name: draft.name, brewery: draft.brewery || null,
      style: draft.style || null, color: draft.color || null, price: draft.price || null,
      rating: draft.rating || 0, photo_path
    });
    if (error) { alert(error.message); return; }
    setDraft({ name: "", brewery: "", style: "", color: "", price: "", rating: 0, photoDataUrl: "" });
    setAddOpen(false);
    await loadBeers();
  }

  async function updateBeer() {
    if (!editing) return;
    let photo_path = editing.photo_path;
    if (editDraft?.photoDataUrl) {
      if (photo_path) { try { await supabase.storage.from("photos").remove([photo_path]); } catch {} }
      const file = dataURLtoFile(editDraft.photoDataUrl, `${uuid()}.jpg`);
      photo_path = `${CLUB_ID}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(photo_path, file, { contentType: "image/jpeg" });
      if (upErr) { alert("Upload fejlede: " + upErr.message); return; }
    }
    const { error } = await supabase.from("beers").update({
      name: editDraft.name, brewery: editDraft.brewery || null, style: editDraft.style || null,
      color: editDraft.color || null, price: editDraft.price || null, rating: editDraft.rating ?? 0, photo_path
    }).eq("id", editing.id);
    if (error) { alert(error.message); return; }
    setEditing(null); setEditDraft(null);
    await loadBeers();
  }

  async function deleteBeer(b) {
    const sure = window.confirm(`Slet "${b.name}"?`); if (!sure) return;
    const { error } = await supabase.from("beers").delete().eq("id", b.id);
    if (error) { alert(error.message); return; }
    if (b.photo_path) { try { await supabase.storage.from("photos").remove([b.photo_path]); } catch {} }
    await loadBeers();
  }

  const IMG_W = 140, IMG_H = 220;
  const COVER_H = 180;

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "white" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0 }}>
            Fløng Ølklub 🍻 <span style={{opacity:.5,fontSize:16}}>v9</span>
          </h1>
          <button onClick={signOut} style={btn("ghost-sm")}>Log ud</button>
        </div>

        <div
          style={{
            marginTop: 8, width: "100%", height: COVER_H,
            borderRadius: 12, border: "1px solid #2a2e39", overflow: "hidden",
            background: coverUrl ? `center / cover no-repeat url(${coverUrl})` : "#161922",
            display: "grid", placeItems: coverUrl ? "unset" : "center", color: "#8b8f9a",
          }}
        >
          {!coverUrl && "(intet cover)"}
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button onClick={() => setAddOpen(true)} style={btn("primary")}>Tilføj Øl</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg øl…" style={{ ...input(), maxWidth: 260 }} />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: .8 }}>Sorter:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={input()}>
            <option value="created_at">Nyeste/ældste</option>
            <option value="rating">Bedømmelse</option>
            <option value="name">Navn</option>
            <option value="style">Stil</option>
            <option value="price">Pris</option>
          </select>
          <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={input()}>
            <option value="desc">Faldende</option>
            <option value="asc">Stigende</option>
          </select>
        </div>

        <section style={{ marginTop: 16 }}>
          {beers.length === 0 ? (
            <div style={{ opacity: .7 }}>Ingen øl endnu – brug “Tilføj Øl” 🍺</div>
          ) : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
              {beers.map((b) => (
                <article key={b.id} style={card({ padding: 0 })}>
                  <div style={{ display: "flex", flexWrap: "wrap" }}>
                    {photoUrls[b.id] ? (
                      <img src={photoUrls[b.id]} alt={b.name}
                           style={{ width: IMG_W, height: IMG_H, objectFit: "cover", borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />
                    ) : (
                      <div style={{ width: IMG_W, height: IMG_H, display: "grid", placeItems: "center", background: "#161922", color: "#8b8f9a", borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }}>
                        (intet billede)
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 200, padding: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 2 }}>{b.name || "(uden navn)"}</div>
                      <div style={{ opacity: .9, fontSize: 16 }}>
                        {b.brewery || "—"} • {b.style || "—"} • <b>Farve:</b> {b.color || "—"}
                      </div>
                      <div style={{ opacity: .85, marginTop: 6, fontSize: 16 }}>Pris: {b.price || "—"}</div>
                      <div style={{ marginTop: 8 }}><Stars value={b.rating ?? 0} onChange={() => {}} /></div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => { setEditing(b); setEditDraft({ name: b.name || "", brewery: b.brewery || "", style: b.style || "", color: b.color || "", price: b.price || "", rating: b.rating || 0, photoDataUrl: "" }); }} style={btn("ghost-sm")}>Redigér</button>
                        <button onClick={() => deleteBeer(b)} style={btn("danger-sm")}>Slet</button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* modal + cropper uændret … */}
    </div>
  );
}

export default function App(){
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
