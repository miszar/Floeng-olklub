import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Cropper from "react-easy-crop";
import LoginBox from "./LoginBox.jsx";

const SUPABASE_URL = "https://auiurmkojwpcbxarewdn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1aXVybWtvandwY2J4YXJld2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2ODE2NzMsImV4cCI6MjA3MjI1NzY3M30.09Hv3K3OADK69y56R-KkvHzzcEfbwN2cmNqwtYwsHHA";
const CLUB_ID = "floeng-olklub";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- helpers ---------- */
function uuid() { return crypto.randomUUID(); }
function dataURLtoFile(dataUrl, filename) {
  const arr = dataUrl.split(","), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new File([u8], filename, { type: mime });
}
async function getSignedUrl(path, ttlHours = 24 * 7) {
  if (!path) return null;
  const { data } = await supabase.storage.from("photos").createSignedUrl(path, 60 * 60 * ttlHours);
  return data?.signedUrl ?? null;
}
async function getCroppedImg(imageSrc, cropPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const w = Math.round(cropPixels.width);
  const h = Math.round(cropPixels.height);
  const sx = Math.round(cropPixels.x);
  const sy = Math.round(cropPixels.y);
  canvas.width = w; canvas.height = h;
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/* ---------- UI helpers ---------- */
function card(extra = {}) {
  return { background: "#0b0d12", border: "1px solid #2a2e39", borderRadius: 14, padding: 12, ...extra };
}
function input(extra = {}) {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "10px 12px", height: 40, borderRadius: 10,
    border: "1px solid #2a2e39", background: "#0b0d12", color: "white",
    ...extra,
  };
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
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={() => onChange?.(n)} style={{ cursor: "pointer", color: n <= value ? "#ffd84d" : "#444", fontSize: 20 }}>★</span>
      ))}
    </div>
  );
}

/* ---------- hovedkomponent ---------- */
export default function App() {
  const [user, setUser] = useState(null);

  // --- auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  // Vis login-boks indtil der ER en bruger
  if (!user) {
    return <LoginBox onLoggedIn={() => window.location.reload()} />;
  }

  async function signOut() { await supabase.auth.signOut(); }

  /* state */
  const [beers, setBeers] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [coverUrl, setCoverUrl] = useState(null);

  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");

  // add-modal
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", brewery: "", style: "", color: "", price: "", rating: 0, photoDataUrl: "" });

  // edit-modal
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  // file refs
  const coverFileRef = useRef(null); const addFileRef = useRef(null); const editFileRef = useRef(null);

  // cropper
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const [cropFor, setCropFor] = useState("create"); // "create" | "edit" | "cover"
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

  /* load data */
  useEffect(() => { if (user) loadBeers(); }, [user, sortBy, sortDir, search]);
  useEffect(() => { if (user) loadCover(); }, [user]);

  async function loadBeers() {
    let q = supabase
      .from("beers")
      .select("id, name, brewery, style, color, price, rating, photo_path, created_at")
      .eq("club_id", CLUB_ID);

    if (search) {
      q = q.or(`name.ilike.%${search}%,brewery.ilike.%${search}%,style.ilike.%${search}%,color.ilike.%${search}%`);
    }

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

  /* CRUD */
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
      club_id: CLUB_ID,
      name: draft.name,
      brewery: draft.brewery || null,
      style: draft.style || null,
      color: draft.color || null,
      price: draft.price || null,
      rating: draft.rating || 0,
      photo_path
    });
    if (error) { alert(error.message); return; }

    setDraft({ name: "", brewery: "", style: "", color: "", price: "", rating: 0, photoDataUrl: "" });
    setAddOpen(false);
    await loadBeers();
  }

  async function updateBeer() {
    if (!editing) return;

    let photo_path = editing.photo_path;
    if (editDraft.photoDataUrl) {
      if (photo_path) { try { await supabase.storage.from("photos").remove([photo_path]); } catch {} }
      const file = dataURLtoFile(editDraft.photoDataUrl, `${uuid()}.jpg`);
      photo_path = `${CLUB_ID}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(photo_path, file, { contentType: "image/jpeg" });
      if (upErr) { alert("Upload fejlede: " + upErr.message); return; }
    }

    const { error } = await supabase.from("beers")
      .update({
        name: editDraft.name,
        brewery: editDraft.brewery || null,
        style: editDraft.style || null,
        color: editDraft.color || null,
        price: editDraft.price || null,
        rating: editDraft.rating ?? 0,
        photo_path
      })
      .eq("id", editing.id);
    if (error) { alert(error.message); return; }

    setEditing(null); setEditDraft(null);
    await loadBeers();
  }

  async function deleteBeer(b) {
    const sure = window.confirm(`Slet "${b.name}"?`);
    if (!sure) return;
    const { error } = await supabase.from("beers").delete().eq("id", b.id);
    if (error) { alert(error.message); return; }
    if (b.photo_path) { try { await supabase.storage.from("photos").remove([b.photo_path]); } catch {} }
    await loadBeers();
  }

  /* layout-konstanter */
  const IMG_W = 140, IMG_H = 220;
  const PORTRAIT_ASPECT = IMG_W / IMG_H;
  const COVER_H = 180, COVER_ASPECT = 3;

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "white" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
        {/* Titel + logout */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0 }}>Fløng Ølklub 🍻</h1>
          <button onClick={signOut} style={btn("ghost-sm")}>Log ud</button>
        </div>

        {/* Cover */}
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
        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
          <input
            ref={coverFileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader();
              r.onload = () => { setCropSrc(r.result); setCropFor("cover"); setCropOpen(true); setZoom(1); setCrop({ x: 0, y: 0 }); };
              r.readAsDataURL(f);
            }}
          />
          <button onClick={() => coverFileRef.current?.click()} style={btn("ghost-sm")}>Skift cover</button>
        </div>

        {/* Topbar: Tilføj + Søg */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button onClick={() => setAddOpen(true)} style={btn("primary")}>Tilføj Øl</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg øl…" style={{ ...input(), maxWidth: 260 }} />
        </div>

        {/* Sortering */}
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

        {/* Liste */}
        <section style={{ marginTop: 16 }}>
          {beers.length === 0 ? (
            <div style={{ opacity: .7 }}>Ingen øl endnu – brug “Tilføj Øl” 🍺</div>
          ) : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
              {beers.map((b) => (
                <article key={b.id} style={card({ padding: 0 })}>
                  <div style={{ display: "flex", flexWrap: "wrap" }}>
                    {/* venstre: billede */}
                    {photoUrls[b.id] ? (
                      <img src={photoUrls[b.id]} alt={b.name}
                        style={{ width: IMG_W, height: IMG_H, objectFit: "cover", borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />
                    ) : (
                      <div style={{ width: IMG_W, height: IMG_H, display: "grid", placeItems: "center", background: "#161922", color: "#8b8f9a", borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }}>
                        (intet billede)
                      </div>
                    )}

                    {/* højre: tekst */}
                    <div style={{ flex: 1, minWidth: 200, padding: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 2 }}>{b.name || "(uden navn)"}</div>
                      <div style={{ opacity: .9, fontSize: 16 }}>
                        {b.brewery || "—"} • {b.style || "—"} • <b>Farve:</b> {b.color || "—"}
                      </div>
                      <div style={{ opacity: .85, marginTop: 6, fontSize: 16 }}>Pris: {b.price || "—"}</div>
                      <div style={{ marginTop: 8 }}><Stars value={b.rating ?? 0} onChange={() => {}} /></div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => {
                            setEditing(b);
                            setEditDraft({ name: b.name || "", brewery: b.brewery || "", style: b.style || "", color: b.color || "", price: b.price || "", rating: b.rating || 0, photoDataUrl: "" });
                          }}
                          style={btn("ghost-sm")}
                        >
                          Redigér
                        </button>
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

      {/* ADD MODAL */}
      {addOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ background: "#0b0d12", padding: 16, borderRadius: 12, border: "1px solid #2a2e39", width: "min(720px, 92vw)" }}>
            <h3 style={{ marginTop: 0 }}>Tilføj Øl</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, 1fr)" }}>
              <input style={input()} placeholder="Navn*" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input style={input()} placeholder="Bryggeri" value={draft.brewery} onChange={(e) => setDraft({ ...draft, brewery: e.target.value })} />
              <input style={input()} placeholder="Stil" value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })} />
              <input style={input()} placeholder="Farve (fx Gylden / Amber / Mørk)" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
              <input style={input()} placeholder="Pris" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              <div style={{ display: "flex", alignItems: "center" }}>
                <Stars value={draft.rating} onChange={(v) => setDraft({ ...draft, rating: v })} />
              </div>
              <input
                ref={addFileRef} type="file" accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader();
                  r.onload = () => { setCropSrc(r.result); setCropFor("create"); setCropOpen(true); setZoom(1); setCrop({ x: 0, y: 0 }); };
                  r.readAsDataURL(f);
                }}
                style={{ ...input(), gridColumn: "1 / -1" }}
              />
            </div>
            {draft.photoDataUrl && <img alt="preview" src={draft.photoDataUrl} style={{ marginTop: 12, width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12, border: "1px solid #333" }} />}
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAddOpen(false)} style={btn("ghost-sm")}>Annuller</button>
              <button onClick={addBeer} style={btn("primary")}>Gem</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && editDraft && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ background: "#0b0d12", padding: 16, borderRadius: 12, border: "1px solid #2a2e39", width: "min(720px, 92vw)" }}>
            <h3 style={{ marginTop: 0 }}>Redigér: {editing.name}</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, 1fr)" }}>
              <input style={input()} placeholder="Navn" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
              <input style={input()} placeholder="Bryggeri" value={editDraft.brewery} onChange={(e) => setEditDraft({ ...editDraft, brewery: e.target.value })} />
              <input style={input()} placeholder="Stil" value={editDraft.style} onChange={(e) => setEditDraft({ ...editDraft, style: e.target.value })} />
              <input style={input()} placeholder="Farve" value={editDraft.color} onChange={(e) => setEditDraft({ ...editDraft, color: e.target.value })} />
              <input style={input()} placeholder="Pris" value={editDraft.price} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} />
              <div style={{ display: "flex", alignItems: "center" }}>
                <Stars value={editDraft.rating} onChange={(v) => setEditDraft({ ...editDraft, rating: v })} />
              </div>
              <input
                ref={editFileRef} type="file" accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader();
                  r.onload = () => { setCropSrc(r.result); setCropFor("edit"); setCropOpen(true); setZoom(1); setCrop({ x: 0, y: 0 }); };
                  r.readAsDataURL(f);
                }}
                style={{ ...input(), gridColumn: "1 / -1" }}
              />
            </div>
            {editDraft.photoDataUrl && <img alt="preview" src={editDraft.photoDataUrl} style={{ marginTop: 12, width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12, border: "1px solid #333" }} />}
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setEditing(null); setEditDraft(null); }} style={btn("ghost-sm")}>Annuller</button>
              <button onClick={updateBeer} style={btn("primary")}>Gem</button>
            </div>
          </div>
        </div>
      )}

      {/* Cropper modal */}
      {cropOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 60 }}>
          <div style={{ width: "min(720px, 92vw)", background: "#0b0d12", border: "1px solid #2a2e39", borderRadius: 14, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Beskær billede</h3>
            <div style={{ position: "relative", width: "100%", height: 360, background: "#111", borderRadius: 12, overflow: "hidden" }}>
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={cropFor === "cover" ? COVER_ASPECT : PORTRAIT_ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                restrictPosition
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <span style={{ opacity: .8, fontSize: 14 }}>Zoom</span>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1 }} />
              <button onClick={() => setCropOpen(false)} style={btn("ghost-sm")}>Annuller</button>
              <button onClick={confirmCrop} style={btn("primary")}>Brug udsnit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
