// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// 👉 Supabase klient (holder brugere logget ind)
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

// Fast klub-id (matcher dine RLS policies)
const CLUB_ID = "floeng-olklub";

/* ---------- UI: Stjerner ---------- */
function Stars({ value = 0, onChange, size = 22 }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          style={{
            fontSize: size,
            lineHeight: 1,
            color: n <= value ? "#f6c12a" : "#666",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
          aria-label={`Sæt ${n} stjerner`}
          title={`${n} stjerner`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ---------- Storage: upload af foto ---------- */
async function uploadPhoto(file, userId) {
  if (!file) return { path: null, publicUrl: null };

  const ext = file.name.split(".").pop();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${CLUB_ID}/${userId}/${fileName}`;

  const { error: upErr } = await supabase.storage
    .from("photos")
    .upload(storagePath, file, { upsert: false });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from("photos").getPublicUrl(storagePath);
  return { path: storagePath, publicUrl: data.publicUrl };
}

/* ---------- Login-boks ---------- */
function LoginBox() {
  const [email, setEmail] = useState("");

  async function signIn() {
    if (!email.trim()) return alert("Skriv din mail 😊");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) alert(error.message);
    else alert("Tjek din mail for login-link ✉️");
  }

  return (
    <div style={{ maxWidth: 480, margin: "64px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Fløng Ølklub 🍻</h1>
      <p style={{ margin: "4px 0 12px 0", opacity: 0.8 }}>
        Log ind med den e-mail, du er inviteret med.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="din@mail.dk"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#121319",
            color: "#fff",
          }}
        />
        <button
          onClick={signIn}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#1e293b",
            color: "#fff",
          }}
        >
          Log ind
        </button>
      </div>
    </div>
  );
}

/* ---------- Tilføj Øl (med Farve) ---------- */
function AddBeer({ session, onAdded }) {
  const [name, setName] = useState("");
  const [brewery, setBrewery] = useState("");
  const [style, setStyle] = useState("");
  const [color, setColor] = useState(""); // 👈 NY
  const [price, setPrice] = useState("");
  const [rating, setRating] = useState(0);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const colorOptions = ["Lys", "Gylden", "Amber", "Kobber", "Mørk", "Sort"];

  async function handleAdd() {
    if (!name.trim()) return alert("Skriv et navn :)");
    try {
      setBusy(true);

      let photo_path = null;
      if (file) {
        const { path } = await uploadPhoto(file, session.user.id);
        photo_path = path;
      }

      const { error } = await supabase.from("beers").insert({
        user_id: session.user.id,
        club_id: CLUB_ID,
        name: name.trim(),
        brewery: brewery.trim(),
        style: style.trim(),
        color: color.trim(), // 👈 GEMMES I DB
        price: price.trim(),
        rating,
        photo_path,
      });

      if (error) throw error;

      setName("");
      setBrewery("");
      setStyle("");
      setColor("");
      setPrice("");
      setRating(0);
      setFile(null);
      onAdded?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "1fr 1fr",
        padding: 16,
        border: "1px solid #2b2b2b",
        borderRadius: 14,
        background: "#0e1117",
      }}
    >
      <div style={{ gridColumn: "1 / -1", fontWeight: 600 }}>Tilføj en øl</div>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Navn*</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Bryggeri</span>
        <input value={brewery} onChange={(e) => setBrewery(e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Stil</span>
        <input value={style} onChange={(e) => setStyle(e.target.value)} />
      </label>

      {/* 👇 NY: Farvefelt */}
      <label style={{ display: "grid", gap: 6 }}>
        <span>Farve</span>
        <input
          list="beer-colors"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="fx Gylden / Amber"
        />
        <datalist id="beer-colors">
          {colorOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Pris</span>
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="fx 45"
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Foto</span>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0])} />
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Bedømmelse</span>
        <Stars value={rating} onChange={setRating} />
        <span style={{ opacity: 0.7 }}>{rating}/5</span>
      </div>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => {
            setName("");
            setBrewery("");
            setStyle("");
            setColor("");
            setPrice("");
            setRating(0);
            setFile(null);
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "transparent",
            color: "#fff",
          }}
        >
          Annuller
        </button>
        <button
          disabled={busy}
          onClick={handleAdd}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#1e293b",
            color: "#fff",
          }}
        >
          {busy ? "Tilføjer…" : "Gem"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Ølkort (viser Farve) ---------- */
function BeerCard({ beer }) {
  const photoUrl = useMemo(() => {
    if (!beer.photo_path) return null;
    const { data } = supabase.storage.from("photos").getPublicUrl(beer.photo_path);
    return data.publicUrl;
  }, [beer.photo_path]);

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "140px 1fr",
        padding: 12,
        border: "1px solid #2b2b2b",
        borderRadius: 14,
        background: "#0e1117",
      }}
    >
      <div
        style={{
          width: 140,
          height: 100,
          background: "#0a0a0a",
          borderRadius: 10,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={beer.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6 }}>(intet billede)</div>
        )}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{beer.name}</div>
        <div style={{ opacity: 0.8 }}>
          {beer.brewery || "—"} • {beer.style || "—"} • <b>Farve:</b> {beer.color || "—"}
        </div>
        <div>Pris: {beer.price ? `${beer.price} kr` : "—"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Stars value={beer.rating || 0} onChange={() => {}} size={18} />
          <span style={{ opacity: 0.7 }}>{beer.rating || 0}/5</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- App efter login ---------- */
function BeerClubApp({ session }) {
  const [beers, setBeers] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("beers")
        .select("*")
        .eq("club_id", CLUB_ID)
        .order("created_at", { ascending: false });

      if (error) alert(error.message);
      else setBeers(data || []);
      setLoading(false);
    }
    load();
  }, [refresh]);

  async function logOut() {
    await supabase.auth.signOut();
    location.reload();
  }

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1>Fløng Ølklub 🍻</h1>
        <button
          onClick={logOut}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#1e293b",
            color: "#fff",
          }}
        >
          Log ud
        </button>
      </div>

      <AddBeer session={session} onAdded={() => setRefresh((n) => n + 1)} />

      <h2 style={{ margin: "18px 0 10px 0" }}>Øllene</h2>
      {loading ? (
        <div>Indlæser…</div>
      ) : beers.length === 0 ? (
        <div>Ingen øl endnu – brug “Tilføj øl” 😊</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {beers.map((b) => (
            <BeerCard key={b.id} beer={b} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Root App ---------- */
export default function App() {
  const [session, setSession] = useState(null);
  const [boot, setBoot] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setBoot(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    return () => sub.subscription?.unsubscribe();
  }, []);

  if (boot) return null;
  if (!session) return <LoginBox />;
  return <BeerClubApp session={session} />;
}
