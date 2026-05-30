import { useState, useEffect, useRef, useCallback } from "react";
import {
  Swords, Zap, Trophy, Skull, Clock, Pencil, Check, X, Loader2, Dices, Users, Bot,
  ChevronLeft, ChevronRight, Send, Hash, Sparkles, Settings, Gift, Share2, Server,
  Copy, Volume2, VolumeX, Vibrate, Globe, Info, Trash2, Plus, Lock, Play, UserRound,
  Search, RefreshCw, DoorOpen, Crown, Star, ShoppingBag,
} from "lucide-react";

/* ============================================================
   Virtual DND — креативные PvP-дуэли с ИИ-Арбитром (фронтенд-прототип)
   Серверы и рефералы хранятся в общем window.storage (shared),
   хостинг позже просто заменит этот слой на реальный API/WebSocket.
   ============================================================ */

const STORE_KEY = "tg_arena_profile_v3";
const SRV_PREFIX = "arena_srv:";
const REF_PREFIX = "arena_refs:";
const LB_PREFIX = "arena_lb:";
const QUEUE_PREFIX = "arena_queue:";
const FIGHT_COST = 5;
const MAX_HP = 100;
const APP_VERSION = "0.5.0";
const BOT_USERNAME = import.meta.env?.VITE_BOT_USERNAME || "YourVirtualDndBot";
const INVOICE_ENDPOINT = import.meta.env?.VITE_INVOICE_ENDPOINT || "";
const STAR_PACKS = [10, 50, 100, 500];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Manrope:wght@400;500;600;700;800&display=swap');
:root{
  --bg:#0a0912; --panel:#14121f; --panel2:#1c1930; --line:#2a2740;
  --ember:#ff8a3d; --ember2:#ffb24d; --steel:#52d6ff; --steel2:#3a8dff;
  --arb:#b885ff; --arb2:#8a5cff; --hp:#ff4d6d; --txt:#ece9f5; --mut:#8e88a8;
}
*{box-sizing:border-box}
.arena-root{font-family:'Manrope',sans-serif;color:var(--txt)}
.display{font-family:'Cinzel',serif}
@keyframes pop{0%{transform:scale(.55) rotate(-8deg);opacity:0}55%{transform:scale(1.18) rotate(4deg)}100%{transform:scale(1) rotate(0)}}
@keyframes drift{0%{transform:translate(0,0)}50%{transform:translate(20px,-26px)}100%{transform:translate(0,0)}}
@keyframes bubbleIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes glowPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes slideIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
.bubble{animation:bubbleIn .4s cubic-bezier(.2,.9,.3,1.2) both}
.emoji-pop{animation:pop .5s cubic-bezier(.2,.9,.3,1.3) both}
.rise{animation:rise .5s ease both}
.slide{animation:slideIn .35s ease both}
.tap{cursor:pointer;transition:transform .12s ease,filter .2s ease,box-shadow .2s ease}
.tap:active{transform:scale(.96)}
.tap:hover{filter:brightness(1.1)}
.scroll::-webkit-scrollbar{width:6px}
.scroll::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
textarea,input{font-family:'Manrope',sans-serif}
.noanim *{animation:none!important;transition-duration:.01ms!important}
`;

/* ---------- storage — личное в localStorage, общее через Supabase API ---------- */
const mem = {};

// Личное хранилище (профиль игрока) — localStorage
async function sGet(key, def, shared = false) {
  if (shared) return sGetShared(key, def);
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
}
async function sSet(key, val, shared = false) {
  if (shared) return sSetShared(key, val);
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}
async function sDel(key, shared = false) {
  if (shared) return sDelShared(key);
  try { localStorage.removeItem(key); } catch (e) {}
}
async function sList(prefix, shared = false) {
  if (shared) return sListShared(prefix);
  return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
}

// Общее хранилище — наш Vercel API → Supabase
const API_BASE = "";  // пусто = относительный путь /api/...
async function sGetShared(key, def) {
  try {
    const r = await fetch(`${API_BASE}/api/kv?key=${encodeURIComponent(key)}`);
    if (!r.ok) return def;
    const d = await r.json();
    return d.value !== undefined ? d.value : def;
  } catch (e) { return def; }
}
async function sSetShared(key, val) {
  try { await fetch(`${API_BASE}/api/kv`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: val }) }); } catch (e) {}
}
async function sDelShared(key) {
  try { await fetch(`${API_BASE}/api/kv?key=${encodeURIComponent(key)}`, { method: "DELETE" }); } catch (e) {}
}
async function sListShared(prefix) {
  try {
    const r = await fetch(`${API_BASE}/api/kv?prefix=${encodeURIComponent(prefix)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.keys || [];
  } catch (e) { return []; }
}

/* ---------- telegram ---------- */
function getTgUser() {
  try {
    const tg = window.Telegram?.WebApp; tg?.ready?.(); tg?.expand?.();
    const u = tg?.initDataUnsafe?.user;
    // считываем @username из Telegram; если его нет — оставляем пустым (честно)
    if (u) return { id: u.id, name: u.first_name || "Игрок", username: u.username || "", photo: u.photo_url || "" };
  } catch (e) {}
  return { id: 100000000 + Math.floor(Math.random() * 899999999), name: "Странник", username: "guest", photo: "" };
}
// показывает @username, либо честную пометку об его отсутствии
const tagOf = (u) => (u ? "@" + u : "без @username");
function getStartParam() { try { return window.Telegram?.WebApp?.initDataUnsafe?.start_param || ""; } catch (e) { return ""; } }
function haptic(kind, settings) { if (settings && !settings.haptics) return; try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind || "light"); } catch (e) {} }

/* ---------- AI — через Vercel /api/ai → Gemini 2.0 Flash (бесплатно) ---------- */
async function callClaude(system, user) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user }),
  });
  if (!res.ok) throw new Error("AI error " + res.status);
  const data = await res.json();
  return (data.text || "").replace(/```json|```/g, "").trim();
}
function safeJSON(t, fb) { try { return JSON.parse(t); } catch (e) { const m = t && t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} } return fb; } }

/* ---------- мягкая цензура нецензурной лексики ---------- */
const BAD = /(ху[йяеёюи]|пизд|еба[тл]|[еёо]бан|бля[дть]|муда[кч]|пидор|пидар|гандон|залуп|fuck|shit|bitch|cunt|asshole|motherfuck)/i;
function censor(t) {
  return String(t || "").split(/(\s+)/).map((w) => {
    const core = w.replace(/[^\p{L}]/gu, "");
    return core && BAD.test(core) ? "✶✶✶" : w;
  }).join("");
}

const BOTS = [
  { name: "Кали", bio: "Бывшая наёмница, коллекционирует шрамы как трофеи.", emoji: "🗡️", level: 7 },
  { name: "Вольт", bio: "Уличный техномаг, разговаривает с дронами по душам.", emoji: "⚡", level: 5 },
  { name: "Мирра", bio: "Танцует в бою — считает драку формой искусства.", emoji: "🌀", level: 9 },
  { name: "Грэй", bio: "Молчаливый кузнец, бьёт редко, но как наковальней.", emoji: "🔨", level: 6 },
];

const xpForNext = (l) => l * 100;
const ratingOf = (p) => Math.max(0, (p.level || 1) * 100 + (p.wins || 0) * 20 - (p.losses || 0) * 5);
const fmtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}ч ${m}м` : `${m}м ${Math.floor(s % 60)}с`; };
const refLink = (id) => `https://t.me/${BOT_USERNAME}/app?startapp=ref_${id}`;

const DEFAULT_PROFILE = {
  bio: "", level: 1, xp: 0, energy: 20,
  wins: 0, losses: 0, timePlayedSec: 0, settings: { sound: true, haptics: true, anim: true, lang: "ru" },
};

/* ================================================================== */
export default function App() {
  const [tg] = useState(getTgUser);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("menu");
  const [toast, setToast] = useState("");
  const [room, setRoom] = useState(null);
  const [, force] = useState(0);

  // battle state
  const [mode, setMode] = useState("ai");
  const [opp, setOpp] = useState(null);
  const [p1Hp, setP1Hp] = useState(MAX_HP);
  const [p2Hp, setP2Hp] = useState(MAX_HP);
  const [msgs, setMsgs] = useState([]);
  const [emoji, setEmoji] = useState("⚔️");
  const [emojiKey, setEmojiKey] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [hotTurn, setHotTurn] = useState(1);
  const [pendingP1, setPendingP1] = useState("");
  const [outcome, setOutcome] = useState(null);
  const battleStart = useRef(0);

  useEffect(() => {
    (async () => {
      const raw = await sGet(STORE_KEY, DEFAULT_PROFILE);
      const p = { ...DEFAULT_PROFILE, ...raw, settings: { ...DEFAULT_PROFILE.settings, ...(raw.settings || {}) } };
      setProfile(p); await sSet(STORE_KEY, p); setLoaded(true);
      publishProfile(p);
      // реферальная привязка по ссылке: ?startapp=ref_<id>
      const sp = getStartParam();
      if (sp.startsWith("ref_")) {
        const refId = sp.slice(4);
        if (refId && String(refId) !== String(tg.id)) {
          const key = REF_PREFIX + refId;
          const list = await sGet(key, [], true);
          if (!list.some((f) => String(f.id) === String(tg.id))) {
            list.push({ id: tg.id, name: tg.name, username: tg.username, photo: tg.photo, level: p.level, ts: Date.now() });
            await sSet(key, list, true);
          }
        }
      }
    })();
  }, []);

  const save = useCallback((upd) => setProfile((p) => { const n = { ...p, ...upd }; sSet(STORE_KEY, n); return n; }), []);
  async function publishProfile(p) {
    const card = { id: tg.id, name: tg.name, username: tg.username, photo: tg.photo, level: p.level, xp: p.xp, wins: p.wins, losses: p.losses, timePlayedSec: p.timePlayedSec, bio: p.bio, rating: ratingOf(p), ts: Date.now() };
    await sSet(LB_PREFIX + tg.id, card, true);
    // Также сохраняем в Supabase через API
    try {
      await fetch("/api/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: String(tg.id), name: tg.name, username: tg.username, photo: tg.photo, level: p.level, xp: p.xp, wins: p.wins, losses: p.losses, time_played: p.timePlayedSec, bio: p.bio }),
      });
    } catch (e) {}
  }
  const publish = (over) => publishProfile({ ...profile, ...(over || {}) });
  const showToast = useCallback((t) => { setToast(t); setTimeout(() => setToast(""), 2200); }, []);
  const go = (s) => { haptic("light", profile.settings); setScreen(s); };
  const pushMsg = (m) => setMsgs((prev) => [...prev, { id: Date.now() + Math.random(), ...m }]);
  const setScene = (e) => { setEmoji(e || "⚔️"); setEmojiKey((k) => k + 1); };
  const enterLobby = (srv) => { setRoom(srv); setScreen("lobby"); };
  const refreshRoom = async () => { if (!room) return; const s = await sGet(SRV_PREFIX + room.id, null, true); if (s) setRoom(s); };

  async function startMatch(m, oppOverride) {
    if (profile.energy < FIGHT_COST) { showToast("Не хватает энергии"); return; }
    haptic("medium", profile.settings);
    save({ energy: profile.energy - FIGHT_COST });
    setMode(m);

    let opponent;
    if (oppOverride) {
      opponent = oppOverride;
    } else if (m === "hotseat") {
      opponent = { name: "Игрок 2", bio: "Второй боец за этим устройством.", emoji: "🛡️", level: 1 };
    } else if (m === "random") {
      // Реальный матчмейкинг: ищем другого игрока в очереди
      setScreen("matching");
      const myKey = QUEUE_PREFIX + tg.id;
      const myCard = { id: tg.id, name: tg.name, username: tg.username, photo: tg.photo, level: profile.level, bio: profile.bio, ts: Date.now() };
      await sSet(myKey, myCard, true);

      // Ищем других игроков в очереди (не себя, свежих — последние 60 сек)
      let foundOpp = null;
      const keys = await sList(QUEUE_PREFIX, true);
      const now = Date.now();
      for (const k of keys) {
        if (k === myKey) continue;
        const card = await sGet(k, null, true);
        if (card && card.id && card.id !== tg.id && (now - (card.ts || 0)) < 60000) {
          foundOpp = card;
          // Удаляем найденного соперника из очереди
          await sDel(k, true);
          break;
        }
      }
      // Удаляем себя из очереди
      await sDel(myKey, true);

      if (foundOpp) {
        opponent = { name: foundOpp.name, bio: foundOpp.bio || "Незнакомец из очереди.", emoji: "⚔️", level: foundOpp.level || 1, username: foundOpp.username, photo: foundOpp.photo };
        showToast(`Найден соперник: ${foundOpp.name}!`);
      } else {
        // Никого нет в очереди — берём случайного бота с пометкой
        opponent = { ...BOTS[Math.floor(Math.random() * BOTS.length)], isBot: true };
        showToast("Живых соперников нет — бой с ботом");
      }
    } else {
      // m === "ai" — бой против бота напрямую
      opponent = BOTS[Math.floor(Math.random() * BOTS.length)];
    }

    setOpp(opponent);
    setP1Hp(MAX_HP); setP2Hp(MAX_HP); setMsgs([]); setHotTurn(1); setPendingP1(""); setInput(""); setOutcome(null); setScene("⚔️");
    setScreen("matching");
    battleStart.current = Date.now();
    await new Promise((r) => setTimeout(r, m === "random" ? 600 : 1700));
    setScreen("battle");
    setThinking(true);
    const sys = "Ты — Арбитр креативной боевой арены. Отвечай ТОЛЬКО сырым JSON без markdown и пояснений. Пиши на русском, ярко и кинематографично.";
    const usr = `Придумай завязку дуэли. Боец 1: «${tg.name}», ур.${profile.level}, био: «${profile.bio || "загадка без прошлого"}». Боец 2: «${opponent.name}», ур.${opponent.level}, био: «${opponent.bio || "неизвестный боец"}». Опиши в 2-3 предложениях как и где они столкнулись. JSON: {"intro":"...","emoji":"эмодзи сцены"}`;
    const j = safeJSON(await callClaude(sys, usr).catch(() => ""), { intro: `${tg.name} и ${opponent.name} сходятся в кругу арены. Бой начинается.`, emoji: "⚔️" });
    setScene(j.emoji); pushMsg({ role: "arbiter", text: j.intro });
    pushMsg({ role: "system", text: m === "hotseat" ? "Ход Игрока 1 — опишите свой удар." : "Ваш ход. Опишите удар как можно креативнее." });
    setThinking(false);
  }

  async function judge(a1, a2) {
    setThinking(true);
    const sys = "Ты — Арбитр креативной боевой арены. Читаешь атаки ОБОИХ бойцов и честно судишь, чья КРЕАТИВНЕЕ и эффектнее. Только проигравший раунд получает урон — победитель не ранен. Не используй мат. Символы «✶✶✶» — вырезанный мат, игнорируй. Отвечай ТОЛЬКО сырым JSON без markdown. На русском.";
    const ctx = `Бой: «${tg.name}» (ур.${profile.level}, bio: «${profile.bio || "загадочный боец"}») HP=${p1Hp} ПРОТИВ «${opp.name}» (ур.${opp.level}, bio: «${opp.bio || "незнакомец"}») HP=${p2Hp}.`;

    let oppAttackText = a2;

    if (mode === "ai") {
      // Отдельный запрос: генерируем атаку бота на основе его bio и атаки игрока
      const genSys = `Ты — персонаж «${opp.name}» (${opp.bio || "загадочный боец"}, уровень ${opp.level}). Ты участвуешь в креативной дуэли. Твоя задача: написать свой ответный удар ярко, образно и в духе своего персонажа. Без мата. Только текст удара, без JSON и пояснений.`;
      const genUsr = `Твой противник «${tg.name}» атаковал тебя: «${a1}». Ответь своим креативным ударом (2-4 предложения). Опирайся на свой характер и биографию.`;
      oppAttackText = await callClaude(genSys, genUsr).catch(() => `${opp.name} уворачивается и наносит ответный удар.`);
      oppAttackText = censor(oppAttackText.replace(/```[\s\S]*?```/g, "").trim());
      await new Promise((r) => setTimeout(r, 500));
      pushMsg({ role: "p2", text: oppAttackText });
      await new Promise((r) => setTimeout(r, 400));
    }

    // Судим обе атаки
    const usr = `${ctx}
Атака «${tg.name}»: «${a1}».
Атака «${opp.name}»: «${oppAttackText}».
Задача: опиши в verdict что конкретно делает каждый боец (2 предложения), затем чья атака БОЛЕЕ КРЕАТИВНА и почему (1-2 предложения). Победитель раунда (roundWinner) НЕ получает урон (его damage = 0). Проигравший получает 15-35 HP урона. При ничье (tie) оба получают по 5-15 HP.
JSON: {"verdict":"...","p1Damage":число,"p2Damage":число,"emoji":"эмодзи","roundWinner":"p1|p2|tie"}`;

    const fb = (() => {
      const w = (a1 || "").length >= (oppAttackText || "").length ? "p1" : "p2";
      const dmg = 14 + Math.floor(Math.random() * 16);
      return { verdict: `${tg.name} наносит удар, ${opp.name} отвечает. Один из них оказался убедительнее в этом раунде.`, p1Damage: w === "p1" ? 0 : dmg, p2Damage: w === "p1" ? dmg : 0, emoji: "💥", roundWinner: w };
    })();

    const j = safeJSON(await callClaude(sys, usr).catch(() => ""), fb);

    // Гарантируем корректность урона: победитель = 0, проигравший > 0
    const winner = j.roundWinner;
    let d1 = Math.max(0, Math.min(40, Number(j.p1Damage) || 0));
    let d2 = Math.max(0, Math.min(40, Number(j.p2Damage) || 0));
    if (winner === "p1") { d1 = 0; if (d2 < 10) d2 = 10 + Math.floor(Math.random() * 15); }
    else if (winner === "p2") { d2 = 0; if (d1 < 10) d1 = 10 + Math.floor(Math.random() * 15); }

    const n1 = Math.max(0, p1Hp - d1), n2 = Math.max(0, p2Hp - d2);
    haptic("heavy", profile.settings); setScene(j.emoji);

    const dmgLine = winner === "tie"
      ? `  ⚡ Ничья — оба ранены: −${d1} ${tg.name}, −${d2} ${opp.name}.`
      : winner === "p1"
        ? `  ⚡ ${tg.name} побеждает раунд — ${opp.name} получает −${d2} HP!`
        : `  ⚡ ${opp.name} побеждает раунд — ${tg.name} получает −${d1} HP!`;

    pushMsg({ role: "arbiter", text: censor(j.verdict) + dmgLine });
    setP1Hp(n1); setP2Hp(n2); setThinking(false);
    if (n1 <= 0 || n2 <= 0) { endBattle(n1, n2); return; }
    if (mode === "hotseat") { setHotTurn(1); pushMsg({ role: "system", text: "Ход Игрока 1 — опишите свой удар." }); }
    else pushMsg({ role: "system", text: "Ваш ход." });
  }

  function send() {
    const t = input.trim(); if (!t || thinking) return; setInput(""); haptic("light", profile.settings);
    const c = censor(t);
    if (mode === "ai") { pushMsg({ role: "p1", text: c }); judge(c, ""); return; }
    if (hotTurn === 1) { pushMsg({ role: "p1", text: c }); setPendingP1(c); setHotTurn(2); pushMsg({ role: "system", text: "Ход Игрока 2 — опишите свой удар." }); }
    else { pushMsg({ role: "p2", text: c }); judge(pendingP1, c); }
  }

  function endBattle(n1, n2) {
    const dur = Math.floor((Date.now() - battleStart.current) / 1000);
    let win = null; if (n1 <= 0 && n2 <= 0) win = "tie"; else if (n2 <= 0) win = true; else win = false;
    const upd = { timePlayedSec: profile.timePlayedSec + dur }; let lvl = profile.level, xp = profile.xp, levelUp = false;
    // Считаем wins/losses для ai и random режимов (оба — реальный бой)
    if (mode === "ai" || mode === "random") {
      if (win === true) { upd.wins = profile.wins + 1; xp += 50; }
      else if (win === false) { upd.losses = profile.losses + 1; xp += 20; }
      else xp += 30;
    } else {
      xp += 25; // hotseat
    }
    while (xp >= xpForNext(lvl)) { xp -= xpForNext(lvl); lvl++; levelUp = true; }
    upd.level = lvl; upd.xp = xp; save(upd);
    publishProfile({ ...profile, ...upd });
    setOutcome({ win, levelUp, hotWinner: mode === "hotseat" ? (n1 <= 0 ? 2 : 1) : null });
    setScene(win === true || win === "tie" ? "🏆" : "💀"); setTimeout(() => setScreen("result"), 900);
  }

  function shareApp() {
    haptic("light", profile.settings);
    const url = `https://t.me/share/url?url=${encodeURIComponent(refLink(tg.id))}&text=${encodeURIComponent("Сразись со мной на Virtual DND — креативные дуэли с ИИ-Арбитром ⚔️")}`;
    try { if (window.Telegram?.WebApp?.openTelegramLink) { window.Telegram.WebApp.openTelegramLink(url); return; } } catch (e) {}
    window.open(url, "_blank");
  }
  async function copy(text, label) { try { await navigator.clipboard.writeText(text); } catch (e) {} showToast((label || "Скопировано") + " ✓"); haptic("light", profile.settings); }

  function creditEnergy(n) { save({ energy: profile.energy + n }); }
  async function purchase(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return;
    haptic("medium", profile.settings);
    const wa = window.Telegram?.WebApp;
    // Прод-режим: бэкенд создаёт ссылку на счёт в Telegram Stars, фронт открывает её.
    if (wa?.openInvoice && INVOICE_ENDPOINT) {
      try {
        const link = await fetch(`${INVOICE_ENDPOINT}?stars=${n}&uid=${tg.id}`).then((r) => r.text());
        wa.openInvoice(link, (status) => {
          if (status === "paid") { creditEnergy(n); showToast(`+${n}⚡ оплачено ✓`); }
          else if (status === "failed") showToast("Платёж не прошёл");
        });
      } catch (e) { showToast("Магазин временно недоступен"); }
      return;
    }
    // Демо-режим (без бэкенда): сразу начисляем энергию.
    creditEnergy(n);
    showToast(`Демо: +${n}⚡ · реальные Stars — после бэкенда`);
  }

  if (!loaded) return (<div className="arena-root" style={{ ...sx.app, alignItems: "center", justifyContent: "center" }}><style>{CSS}</style><Loader2 size={34} color="var(--arb)" style={{ animation: "spin 1s linear infinite" }} /></div>);

  const common = { tg, profile, go, showToast, save, shareApp, copy, publish };

  return (
    <div className={"arena-root" + (profile.settings.anim ? "" : " noanim")} style={sx.app}>
      <style>{CSS}</style>
      <div style={sx.bgGlowA} /><div style={sx.bgGlowB} />
      <div style={sx.frame}>
        {screen === "menu" && <Menu {...common} />}
        {screen === "play" && <PlayScreen {...common} startMatch={startMatch} />}
        {screen === "profile" && <Profile {...common} />}
        {screen === "referral" && <Referral {...common} />}
        {screen === "leaderboard" && <Leaderboard {...common} />}
        {screen === "settings" && <SettingsScreen {...common} setProfile={setProfile} />}
        {screen === "shop" && <Shop {...common} purchase={purchase} />}
        {screen === "servers" && <Servers {...common} enterLobby={enterLobby} />}
        {screen === "lobby" && <Lobby {...common} room={room} startMatch={startMatch} refreshRoom={refreshRoom} />}
        {screen === "matching" && <Matching />}
        {screen === "battle" && <Battle {...{ tg, profile, opp, mode, p1Hp, p2Hp, msgs, emoji, emojiKey, thinking, input, setInput, send, hotTurn, go }} />}
        {screen === "result" && <Result {...{ outcome, tg, opp, mode, p1Hp, p2Hp, profile, go }} />}
      </div>
      {toast && <div style={sx.toast}>{toast}</div>}
    </div>
  );
}

/* ===================== shared header ===================== */
function Header({ title, onBack, right }) {
  return (
    <div style={sx.header}>
      {onBack ? <button className="tap" style={sx.backBtn} onClick={onBack}><ChevronLeft size={20} /></button> : <div style={{ width: 34 }} />}
      <div className="display" style={{ fontSize: 19, letterSpacing: 1, flex: 1, textAlign: "center" }}>{title}</div>
      {right || <div style={{ width: 34 }} />}
    </div>
  );
}
const Pill = ({ icon, children, color }) => (<div style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 99, padding: "4px 10px", fontSize: 12.5, fontWeight: 700, color: color || "var(--txt)" }}>{icon}{children}</div>);
const Avatar = ({ photo, name, size = 44, radius = 13 }) => (
  <div style={{ width: size, height: size, borderRadius: radius, background: "linear-gradient(135deg,var(--ember),var(--ember2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#1a1006", fontSize: size / 2.4, flexShrink: 0, overflow: "hidden" }}>
    {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (name?.[0] || "?").toUpperCase()}
  </div>
);

/* ===================== MAIN MENU ===================== */
function Menu({ tg, profile, go, shareApp }) {
  return (
    <div className="scroll" style={sx.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }} className="rise">
        <div className="display" style={{ fontSize: 22, letterSpacing: 1.5, fontWeight: 900, background: "linear-gradient(90deg,var(--ember),var(--arb))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Virtual DND</div>
        <button className="tap" style={sx.iconBtn} onClick={shareApp}><Share2 size={17} /></button>
      </div>
      <div className="rise" style={sx.stripCard}>
        <div className="tap" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }} onClick={() => go("profile")}>
          <div style={{ position: "relative" }}><Avatar photo={tg.photo} name={tg.name} size={48} radius={14} /><div style={sx.lvlBadgeSm}>{profile.level}</div></div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tg.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)" }}>{tagOf(tg.username)}</div>
          </div>
        </div>
        <button className="tap" style={sx.energyBtn} onClick={() => go("shop")}>
          <Zap size={14} fill="var(--steel)" color="var(--steel)" /> <b style={{ fontSize: 15 }}>{profile.energy}</b>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "var(--steel2)" }}><Plus size={12} color="#fff" /></span>
        </button>
      </div>
      <button className="tap rise" style={sx.hero} onClick={() => go("play")}>
        <div style={{ position: "absolute", right: -10, bottom: -18, fontSize: 96, opacity: 0.18, pointerEvents: "none", userSelect: "none" }}>⚔️</div>
        <Play size={26} fill="#1a1006" color="#1a1006" />
        <div style={{ textAlign: "left" }}><div className="display" style={{ fontSize: 24, color: "#1a1006" }}>ИГРАТЬ</div><div style={{ fontSize: 12.5, color: "#5a3a14", fontWeight: 600 }}>Дуэль с ИИ · случайный соперник · 2 игрока</div></div>
      </button>
      <div style={sx.menuGrid} className="rise">
        <MenuCard icon={<Server size={22} color="var(--steel)" />} title="Серверы" sub="Создать / найти" onClick={() => go("servers")} />
        <MenuCard icon={<Crown size={22} color="#ffd54a" />} title="Рейтинг" sub="Все бойцы" onClick={() => go("leaderboard")} />
        <MenuCard icon={<Star size={22} fill="#ffd54a" color="#ffd54a" />} title="Магазин" sub="Энергия за ⭐" onClick={() => go("shop")} />
        <MenuCard icon={<Gift size={22} color="var(--arb)" />} title="Друзья" sub="Приглашённые" onClick={() => go("referral")} />
        <MenuCard icon={<UserRound size={22} color="var(--ember)" />} title="Профиль" sub={`Уровень ${profile.level}`} onClick={() => go("profile")} />
        <MenuCard icon={<Settings size={22} color="var(--mut)" />} title="Настройки" sub="Звук · язык · сброс" onClick={() => go("settings")} />
      </div>
      <div style={{ textAlign: "center", color: "var(--mut)", fontSize: 11, marginTop: 18 }}>Virtual DND v{APP_VERSION}</div>
    </div>
  );
}
const MenuCard = ({ icon, title, sub, onClick }) => (<button className="tap" style={sx.menuCard} onClick={onClick}><div style={sx.menuIconWrap}>{icon}</div><div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div><div style={{ fontSize: 11.5, color: "var(--mut)" }}>{sub}</div></button>);

/* ===================== PLAY ===================== */
function PlayScreen({ profile, go, startMatch }) {
  const low = profile.energy < FIGHT_COST;
  return (
    <div className="scroll" style={sx.page}>
      <Header title="ИГРАТЬ" onBack={() => go("menu")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 8 }} className="slide">
        <ModeBtn color="linear-gradient(135deg,var(--ember),var(--ember2))" icon={<Dices size={20} />} title="Случайный соперник" sub="Матчмейкинг из ожидающих" disabled={low} onClick={() => startMatch("random")} />
        <ModeBtn color="linear-gradient(135deg,var(--steel2),var(--steel))" icon={<Bot size={20} />} title="Бой против ИИ" sub="Соперник под управлением Арбитра" disabled={low} onClick={() => startMatch("ai")} />
        <ModeBtn color="var(--panel2)" border icon={<Users size={20} />} title="Горячий стул" sub="Двое за одним устройством" disabled={low} onClick={() => startMatch("hotseat")} />
      </div>
      {low && <div style={{ textAlign: "center", marginTop: 16 }}><div style={{ color: "var(--hp)", fontSize: 13 }}>Не хватает энергии — нужно {FIGHT_COST}.</div><button className="tap" style={{ ...sx.smallBtn, marginTop: 10, background: "linear-gradient(135deg,#ffb24d,#ffd54a)", color: "#1a1006" }} onClick={() => go("shop")}><Star size={13} fill="#1a1006" color="#1a1006" style={{ verticalAlign: -2, marginRight: 4 }} />Пополнить за Stars</button></div>}
      <div style={sx.infoBox}>Каждый бой стоит <b style={{ color: "var(--steel)" }}>{FIGHT_COST}</b> энергии. Энергия не восстанавливается сама — пополняй её в магазине за Telegram Stars. Опиши удар креативно — Арбитр (Claude) решит, чей был эффектнее, и снимет HP.</div>
    </div>
  );
}
const ModeBtn = ({ color, border, icon, title, sub, disabled, onClick }) => (
  <button disabled={disabled} className="tap" style={{ ...sx.modeBtn, background: color, border: border ? "1px solid var(--line)" : "none", opacity: disabled ? 0.5 : 1 }} onClick={onClick}>
    <div style={sx.modeIcon}>{icon}</div>
    <div style={{ textAlign: "left", flex: 1 }}><div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{sub}</div></div>
    <span style={{ display: "flex", alignItems: "center", gap: 3, fontWeight: 800 }}><Zap size={13} fill="currentColor" />{FIGHT_COST}</span>
  </button>
);

/* ===================== LEADERBOARD (рейтинг бойцов) ===================== */
function Leaderboard({ tg, go }) {
  const [players, setPlayers] = useState(null);
  const [view, setView] = useState(null);
  const load = useCallback(async () => {
    setPlayers(null);
    try {
      // Используем быстрый /api/leaderboard (прямой запрос к Supabase)
      const r = await fetch("/api/leaderboard?limit=50");
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          const arr = data.map((p) => ({
            id: p.tg_id,
            name: p.name,
            username: p.username,
            photo: p.photo,
            level: p.level,
            xp: p.xp,
            wins: p.wins,
            losses: p.losses,
            bio: p.bio,
            rating: p.rating || Math.max(0, (p.level || 1) * 100 + (p.wins || 0) * 20 - (p.losses || 0) * 5),
            timePlayedSec: p.time_played || 0,
          }));
          setPlayers(arr);
          return;
        }
      }
    } catch (e) {}
    // Fallback: KV-хранилище (если /api/leaderboard недоступен)
    const keys = await sList(LB_PREFIX, true);
    const arr = [];
    for (const k of keys) { const c = await sGet(k, null, true); if (c && c.id) arr.push(c); }
    arr.sort((a, b) => (b.rating - a.rating) || (b.wins - a.wins) || (b.level - a.level));
    setPlayers(arr);
  }, []);
  useEffect(() => { load(); }, [load]);
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null);
  return (
    <div className="scroll" style={sx.page}>
      <Header title="РЕЙТИНГ" onBack={() => go("menu")} right={<button className="tap" style={sx.iconBtn} onClick={load}><RefreshCw size={16} /></button>} />
      <div style={{ fontSize: 12.5, color: "var(--mut)", textAlign: "center", marginBottom: 12 }}>Бойцы по рейтингу. Нажми, чтобы открыть профиль.</div>
      {players === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={24} color="var(--arb)" style={{ animation: "spin 1s linear infinite" }} /></div>
      ) : players.length === 0 ? (
        <div style={sx.empty}><Crown size={28} color="var(--mut)" /><div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>Пока пусто</div><div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 4 }}>Сыграй бой — и попадёшь в рейтинг.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {players.map((p, i) => (
            <button key={p.id} className="tap slide" style={{ ...sx.lbRow, ...(p.id === tg.id ? { borderColor: "var(--ember)", background: "rgba(255,138,61,.08)" } : {}) }} onClick={() => setView(p)}>
              <div style={{ ...sx.rankBox, fontSize: medal(i) ? 20 : 13, color: medal(i) ? undefined : "var(--mut)" }}>{medal(i) || `#${i + 1}`}</div>
              <div style={{ position: "relative" }}><Avatar photo={p.photo} name={p.name} size={42} radius={12} /><div style={sx.lvlBadgeSm}>{p.level}</div></div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}{p.id === tg.id ? " (ты)" : ""}</div>
                <div style={{ fontSize: 12, color: "var(--mut)" }}>{tagOf(p.username)}</div>
              </div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 16, fontWeight: 800, color: "#ffd54a" }}>{p.rating}</div><div style={{ fontSize: 10, color: "var(--mut)" }}>рейтинг</div></div>
            </button>
          ))}
        </div>
      )}
      <div style={{ height: 8 }} />
      {view && <ProfileModal p={view} me={view.id === tg.id} onClose={() => setView(null)} />}
    </div>
  );
}
function ProfileModal({ p, me, onClose }) {
  const total = (p.wins || 0) + (p.losses || 0), wr = total ? Math.round((p.wins / total) * 100) : 0;
  return (
    <div style={sx.overlay} onClick={onClose}>
      <div style={{ ...sx.modal, maxWidth: 360 }} className="slide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="tap" style={sx.iconBtn} onClick={onClose}><X size={16} /></button></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ position: "relative" }}><Avatar photo={p.photo} name={p.name} size={72} radius={20} /><div style={sx.lvlBadge}>{p.level}</div></div>
          <div className="display" style={{ fontSize: 22, marginTop: 10 }}>{p.name}{me ? " (ты)" : ""}</div>
          <div style={{ fontSize: 13, color: "var(--steel)" }}>{tagOf(p.username)}</div>
          <div style={{ fontSize: 11, color: "var(--mut)", display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}><Hash size={11} />ID {p.id}</div>
          <div style={{ marginTop: 10, padding: "5px 14px", borderRadius: 99, background: "var(--panel2)", border: "1px solid var(--line)", color: "#ffd54a", fontWeight: 800, fontSize: 14 }}>★ Рейтинг {p.rating}</div>
        </div>
        <p style={{ ...sx.bioText, marginTop: 14, textAlign: "center", color: p.bio ? "#cdc8df" : "var(--mut)" }}>{p.bio || "Биография не заполнена."}</p>
        <div style={{ ...sx.statGrid, marginTop: 14 }}>
          <Stat icon={<Trophy size={18} color="var(--ember)" />} v={p.wins || 0} l="Победы" />
          <Stat icon={<Skull size={18} color="var(--hp)" />} v={p.losses || 0} l="Поражения" />
          <Stat icon={<Sparkles size={18} color="var(--arb)" />} v={`${wr}%`} l="Винрейт" />
          <Stat icon={<Clock size={18} color="var(--steel)" />} v={fmtTime(p.timePlayedSec || 0)} l="В игре" />
        </div>
      </div>
    </div>
  );
}

/* ===================== SHOP (Telegram Stars) ===================== */
function Shop({ profile, go, purchase }) {
  return (
    <div className="scroll" style={sx.page}>
      <Header title="МАГАЗИН" onBack={() => go("menu")} />
      <div style={sx.shopBalance} className="slide">
        <Zap size={28} fill="var(--steel)" color="var(--steel)" />
        <div><div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{profile.energy}</div><div style={{ fontSize: 12, color: "var(--mut)", marginTop: 2 }}>энергии сейчас</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, margin: "14px 0", fontSize: 13.5, color: "#cdc8df" }}>
        <Star size={15} fill="#ffd54a" color="#ffd54a" /> 1 энергия = 1 Telegram Star
      </div>
      <div style={sx.shopGrid} className="slide">
        {STAR_PACKS.map((n) => <PackCard key={n} n={n} onBuy={() => purchase(n)} />)}
      </div>
      <div style={sx.infoBox}>Оплата — через <b style={{ color: "#ffd54a" }}>Telegram Stars</b> (валюта XTR). Звёзды списываются ботом, твой сервер подтверждает платёж и начисляет энергию. Пока бэкенд не подключён, покупка работает в демо-режиме.</div>
    </div>
  );
}
const PackCard = ({ n, onBuy }) => (
  <div style={sx.packCard}>
    <div style={{ fontSize: 30 }}>⚡</div>
    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{n}</div>
    <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 12 }}>энергии</div>
    <button className="tap" style={sx.buyBtn} onClick={onBuy}><Star size={13} fill="#1a1006" color="#1a1006" /> {n}</button>
  </div>
);

/* ===================== PROFILE ===================== */
function Profile({ tg, profile, go, save, showToast }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.bio);
  const need = xpForNext(profile.level);
  const total = profile.wins + profile.losses, wr = total ? Math.round((profile.wins / total) * 100) : 0;
  return (
    <div className="scroll" style={sx.page}>
      <Header title="ПРОФИЛЬ" onBack={() => go("menu")} />
      <div style={sx.profCard} className="slide">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ position: "relative" }}><Avatar photo={tg.photo} name={tg.name} size={64} radius={18} /><div style={sx.lvlBadge}>{profile.level}</div></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.1 }}>{tg.name}</div>
            <div style={{ fontSize: 13, color: "var(--steel)" }}>{tagOf(tg.username)}</div>
            <div style={{ fontSize: 11, color: "var(--mut)", display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}><Hash size={11} /> ID {tg.id}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 12, marginBottom: 4 }}>Имя и аватар берутся из Telegram</div>
        <div style={sx.xpLabel}><span style={{ color: "var(--arb)" }}>Уровень {profile.level}</span><span style={{ color: "var(--mut)" }}>{profile.xp}/{need} XP</span></div>
        <div style={sx.barBg}><div style={{ ...sx.barFill, width: `${(profile.xp / need) * 100}%`, background: "linear-gradient(90deg,var(--arb2),var(--arb))" }} /></div>
      </div>
      <div style={sx.section} className="slide">
        <div style={sx.secHead}>
          <span style={sx.secTitle}>Биография</span>
          {!editing ? <button className="tap" style={sx.iconBtn} onClick={() => { setDraft(profile.bio); setEditing(true); }}><Pencil size={14} /></button>
            : <div style={{ display: "flex", gap: 6 }}><button className="tap" style={{ ...sx.iconBtn, color: "var(--steel)" }} onClick={() => { save({ bio: draft.slice(0, 160) }); setEditing(false); showToast("Сохранено ✓"); }}><Check size={15} /></button><button className="tap" style={{ ...sx.iconBtn, color: "var(--hp)" }} onClick={() => setEditing(false)}><X size={15} /></button></div>}
        </div>
        {!editing ? <p style={sx.bioText}>{profile.bio || "Расскажи о своём бойце — Арбитр учтёт это в завязке боя."}</p>
          : <><textarea autoFocus value={draft} maxLength={160} onChange={(e) => setDraft(e.target.value)} style={sx.bioInput} placeholder="Кто твой боец? Откуда шрамы?" /><div style={{ textAlign: "right", fontSize: 11, color: "var(--mut)", marginTop: 4 }}>{draft.length}/160</div></>}
      </div>
      <div style={sx.statGrid} className="slide">
        <Stat icon={<Trophy size={18} color="var(--ember)" />} v={profile.wins} l="Победы" />
        <Stat icon={<Skull size={18} color="var(--hp)" />} v={profile.losses} l="Поражения" />
        <Stat icon={<Sparkles size={18} color="var(--arb)" />} v={`${wr}%`} l="Винрейт" />
        <Stat icon={<Clock size={18} color="var(--steel)" />} v={fmtTime(profile.timePlayedSec)} l="В игре" />
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}
const Stat = ({ icon, v, l }) => (<div style={sx.statCard}>{icon}<div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{v}</div><div style={{ fontSize: 11, color: "var(--mut)" }}>{l}</div></div>);

/* ===================== REFERRAL (приглашённые друзья) ===================== */
function Referral({ tg, profile, go, copy, shareApp }) {
  const [friends, setFriends] = useState(null);
  const link = refLink(tg.id);
  useEffect(() => { (async () => { const list = await sGet(REF_PREFIX + tg.id, [], true); list.sort((a, b) => (b.ts || 0) - (a.ts || 0)); setFriends(list); })(); }, []);
  return (
    <div className="scroll" style={sx.page}>
      <Header title="ДРУЗЬЯ" onBack={() => go("menu")} right={<button className="tap" style={sx.iconBtn} onClick={shareApp}><Share2 size={16} /></button>} />
      <div style={sx.refHero} className="slide">
        <div style={{ fontSize: 40 }}>🎁</div>
        <div className="display" style={{ fontSize: 20, marginTop: 4 }}>Приглашай друзей</div>
        <div style={{ color: "var(--mut)", fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>Отправь ссылку — кто откроет приложение по ней, появится в списке ниже.</div>
        <div style={{ ...sx.codeRow, marginTop: 12 }}><span style={{ fontSize: 12, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</span><button className="tap" style={sx.iconBtn} onClick={() => copy(link, "Ссылка")}><Copy size={15} /></button></div>
        <button className="tap" style={{ ...sx.bigBtn, marginTop: 10, background: "linear-gradient(135deg,var(--arb2),var(--arb))" }} onClick={shareApp}><Share2 size={18} /> Поделиться</button>
      </div>

      <div style={{ ...sx.secHead, marginTop: 18 }}><span style={sx.secTitle}>Приглашённые ({friends ? friends.length : 0})</span></div>
      {friends === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={24} color="var(--arb)" style={{ animation: "spin 1s linear infinite" }} /></div>
      ) : friends.length === 0 ? (
        <div style={sx.empty}><Users size={30} color="var(--mut)" /><div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>Пока никого</div><div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 4, lineHeight: 1.5 }}>Друзья появятся здесь, как только откроют Virtual DND по твоей ссылке.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 6 }}>
          {friends.map((f) => (
            <div key={f.id} style={sx.friendRow} className="slide">
              <div style={{ position: "relative" }}><Avatar photo={f.photo} name={f.name} size={44} radius={13} /><div style={sx.lvlBadgeSm}>{f.level || 1}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div><div style={{ fontSize: 12, color: "var(--steel)" }}>{tagOf(f.username)}</div></div>
              <div style={{ fontSize: 11, color: "var(--mut)", display: "flex", alignItems: "center", gap: 3 }}><Hash size={10} />{f.id}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ===================== SETTINGS ===================== */
function SettingsScreen({ profile, go, save, showToast, setProfile }) {
  const s = profile.settings;
  const [confirm, setConfirm] = useState(false);
  const setS = (k, v) => save({ settings: { ...s, [k]: v } });
  function reset() { const fresh = { ...DEFAULT_PROFILE }; setProfile(fresh); sSet(STORE_KEY, fresh); setConfirm(false); showToast("Прогресс сброшен"); }
  return (
    <div className="scroll" style={sx.page}>
      <Header title="НАСТРОЙКИ" onBack={() => go("menu")} />
      <div style={sx.section} className="slide">
        <Toggle icon={s.sound ? <Volume2 size={18} color="var(--steel)" /> : <VolumeX size={18} color="var(--mut)" />} label="Звук" on={s.sound} onClick={() => setS("sound", !s.sound)} />
        <Divider />
        <Toggle icon={<Vibrate size={18} color={s.haptics ? "var(--ember)" : "var(--mut)"} />} label="Вибрация" on={s.haptics} onClick={() => setS("haptics", !s.haptics)} />
        <Divider />
        <Toggle icon={<Sparkles size={18} color={s.anim ? "var(--arb)" : "var(--mut)"} />} label="Анимации" on={s.anim} onClick={() => setS("anim", !s.anim)} />
      </div>
      <div style={sx.section} className="slide">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><Globe size={18} color="var(--steel)" /><span style={{ fontWeight: 700, fontSize: 15 }}>Язык</span></div>
        <div style={sx.segment}>{["ru", "en"].map((l) => <button key={l} className="tap" style={{ ...sx.segBtn, background: s.lang === l ? "var(--arb2)" : "transparent", color: s.lang === l ? "#fff" : "var(--mut)" }} onClick={() => { setS("lang", l); showToast(l === "en" ? "English coming soon" : "Русский"); }}>{l === "ru" ? "Русский" : "English"}</button>)}</div>
      </div>
      <div style={sx.section} className="slide"><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Info size={18} color="var(--mut)" /><div><div style={{ fontWeight: 700, fontSize: 14 }}>Virtual DND</div><div style={{ fontSize: 12, color: "var(--mut)" }}>Версия {APP_VERSION}</div></div></div></div>
      {!confirm ? <button className="tap" style={sx.dangerBtn} onClick={() => setConfirm(true)}><Trash2 size={16} /> Сбросить прогресс</button>
        : <div style={{ ...sx.section, borderColor: "var(--hp)" }} className="slide"><div style={{ fontSize: 13, marginBottom: 10 }}>Точно сбросить уровень, статистику и энергию?</div><div style={{ display: "flex", gap: 8 }}><button className="tap" style={{ ...sx.smallBtn, flex: 1, background: "var(--hp)" }} onClick={reset}>Сбросить</button><button className="tap" style={{ ...sx.smallBtn, flex: 1, background: "var(--panel2)", border: "1px solid var(--line)" }} onClick={() => setConfirm(false)}>Отмена</button></div></div>}
      <div style={{ height: 8 }} />
    </div>
  );
}
const Toggle = ({ icon, label, on, onClick }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>{icon}<span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{label}</span>
    <button className="tap" onClick={onClick} style={{ width: 46, height: 27, borderRadius: 99, border: "none", background: on ? "var(--steel2)" : "var(--line)", position: "relative", transition: "background .2s" }}><span style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left .2s" }} /></button>
  </div>
);
const Divider = () => <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />;

/* ===================== SERVERS (создать/найти, 2 игрока, пароль) ===================== */
function Servers({ tg, profile, go, showToast, enterLobby }) {
  const [servers, setServers] = useState(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinTarget, setJoinTarget] = useState(null);
  const [joinPass, setJoinPass] = useState("");

  const load = useCallback(async () => {
    setServers(null);
    const keys = await sList(SRV_PREFIX, true);
    const arr = [];
    for (const k of keys) { const s = await sGet(k, null, true); if (s && s.id) arr.push(s); }
    arr.sort((a, b) => b.createdTs - a.createdTs);
    setServers(arr);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createServer() {
    if (!name.trim() || !pass.trim()) { showToast("Название и пароль обязательны"); return; }
    const id = `${tg.id}_${Date.now().toString(36)}`;
    const srv = { id, name: name.trim().slice(0, 30), password: pass.trim().slice(0, 20), hostId: tg.id, hostName: tg.name, hostUser: tg.username, hostPhoto: tg.photo, hostLevel: profile.level, hostBio: profile.bio, guestId: null, createdTs: Date.now(), status: "open" };
    await sSet(SRV_PREFIX + id, srv, true);
    haptic("medium", profile.settings); showToast("Сервер создан ✓");
    setName(""); setPass(""); setCreating(false); load();
  }
  async function delServer(s) { await sDel(SRV_PREFIX + s.id, true); showToast("Сервер удалён"); load(); }
  async function doJoin() {
    const s = joinTarget;
    if (joinPass.trim() !== s.password) { showToast("Неверный пароль"); haptic("heavy", profile.settings); return; }
    let updated = s;
    if (s.hostId !== tg.id && !s.guestId) {
      updated = { ...s, guestId: tg.id, guestName: tg.name, guestUser: tg.username, guestPhoto: tg.photo, guestLevel: profile.level, status: "full" };
      await sSet(SRV_PREFIX + s.id, updated, true);
    }
    setJoinTarget(null); setJoinPass(""); enterLobby(updated);
  }

  const list = (servers || []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const mine = list.filter((s) => s.hostId === tg.id);
  const others = list.filter((s) => s.hostId !== tg.id);

  return (
    <div className="scroll" style={sx.page}>
      <Header title="СЕРВЕРЫ" onBack={() => go("menu")} right={<button className="tap" style={sx.iconBtn} onClick={load}><RefreshCw size={16} /></button>} />

      {!creating ? (
        <button className="tap slide" style={{ ...sx.bigBtn, background: "linear-gradient(135deg,var(--steel2),var(--steel))", marginBottom: 14 }} onClick={() => setCreating(true)}><Plus size={18} /> Создать свой сервер</button>
      ) : (
        <div style={sx.section} className="slide">
          <span style={sx.secTitle}>Новый сервер · 2 игрока</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Название сервера" style={{ ...sx.input, marginTop: 8 }} />
          <div style={{ position: "relative", marginTop: 8 }}>
            <Lock size={15} color="var(--mut)" style={{ position: "absolute", left: 12, top: 13 }} />
            <input value={pass} onChange={(e) => setPass(e.target.value)} maxLength={20} placeholder="Пароль" style={{ ...sx.input, paddingLeft: 36 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="tap" style={{ ...sx.smallBtn, flex: 1, background: "var(--steel2)" }} onClick={createServer}>Создать</button>
            <button className="tap" style={{ ...sx.smallBtn, flex: 1, background: "var(--panel2)", border: "1px solid var(--line)" }} onClick={() => { setCreating(false); setName(""); setPass(""); }}>Отмена</button>
          </div>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 12 }} className="slide">
        <Search size={16} color="var(--mut)" style={{ position: "absolute", left: 13, top: 13 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск сервера по названию…" style={{ ...sx.input, paddingLeft: 38 }} />
      </div>

      {servers === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={24} color="var(--arb)" style={{ animation: "spin 1s linear infinite" }} /></div>
      ) : (
        <>
          {mine.length > 0 && <><div style={sx.secTitle}>Мои серверы</div><div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0 14px" }}>{mine.map((s) => <ServerRow key={s.id} s={s} mine onJoin={() => enterLobby(s)} onDel={() => delServer(s)} />)}</div></>}
          <div style={sx.secTitle}>Доступные серверы</div>
          {others.length === 0 ? (
            <div style={sx.empty}><Server size={28} color="var(--mut)" /><div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>{q ? "Ничего не найдено" : "Серверов пока нет"}</div><div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 4 }}>{q ? "Попробуй другое название." : "Создай свой — и друг найдёт его по поиску."}</div></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>{others.map((s) => <ServerRow key={s.id} s={s} onJoin={() => setJoinTarget(s)} />)}</div>
          )}
        </>
      )}
      <div style={{ height: 8 }} />

      {joinTarget && (
        <div style={sx.overlay} onClick={() => setJoinTarget(null)}>
          <div style={sx.modal} className="slide" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}><Avatar photo={joinTarget.hostPhoto} name={joinTarget.hostName} size={44} radius={13} /><div><div style={{ fontWeight: 800, fontSize: 15 }}>{joinTarget.name}</div><div style={{ fontSize: 12, color: "var(--mut)" }}>хост: {joinTarget.hostName}</div></div></div>
            <div style={{ fontSize: 13, color: "var(--mut)", marginBottom: 8 }}>Введите пароль сервера:</div>
            <div style={{ position: "relative" }}><Lock size={15} color="var(--mut)" style={{ position: "absolute", left: 12, top: 13 }} /><input autoFocus value={joinPass} onChange={(e) => setJoinPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doJoin(); }} placeholder="Пароль" style={{ ...sx.input, paddingLeft: 36 }} /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="tap" style={{ ...sx.smallBtn, flex: 1, background: "var(--steel2)" }} onClick={doJoin}><DoorOpen size={15} style={{ verticalAlign: -2, marginRight: 4 }} />Войти</button>
              <button className="tap" style={{ ...sx.smallBtn, flex: 1, background: "var(--panel2)", border: "1px solid var(--line)" }} onClick={() => setJoinTarget(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function ServerRow({ s, mine, onJoin, onDel }) {
  const full = s.status === "full" && !mine;
  return (
    <div style={sx.serverRow}>
      <div style={{ position: "relative" }}><Avatar photo={s.hostPhoto} name={s.hostName} size={40} radius={11} />{mine && <div style={{ position: "absolute", top: -6, right: -6, background: "var(--ember)", borderRadius: "50%", padding: 3 }}><Crown size={10} color="#1a1006" /></div>}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", display: "flex", alignItems: "center", gap: 6 }}><span>{s.hostName}</span><Lock size={10} /><span>{s.guestId ? "2/2" : "1/2"}</span></div>
      </div>
      {mine ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="tap" style={{ ...sx.smallBtn, background: "var(--steel2)", padding: "9px 12px" }} onClick={onJoin}>Открыть</button>
          <button className="tap" style={{ ...sx.iconBtn, color: "var(--hp)" }} onClick={onDel}><Trash2 size={15} /></button>
        </div>
      ) : (
        <button disabled={full} className="tap" style={{ ...sx.smallBtn, background: full ? "var(--panel2)" : "var(--ember)", color: full ? "var(--mut)" : "#1a1006", border: full ? "1px solid var(--line)" : "none", padding: "9px 14px", opacity: full ? 0.7 : 1 }} onClick={onJoin}>{full ? "Полон" : "Войти"}</button>
      )}
    </div>
  );
}

/* ===================== LOBBY ===================== */
function Lobby({ tg, profile, room, go, startMatch, refreshRoom, showToast }) {
  const youHost = room.hostId === tg.id;
  const guest = room.guestId ? { id: room.guestId, name: room.guestName, username: room.guestUser, photo: room.guestPhoto, level: room.guestLevel } : null;
  function begin() {
    const opp = youHost
      ? (guest ? { name: guest.name, bio: "Соперник, присоединившийся к серверу.", emoji: "🛡️", level: guest.level || 1 } : { name: "Соперник", bio: "Случайный претендент на арене.", emoji: "🛡️", level: 1 })
      : { name: room.hostName, bio: room.hostBio || "Хозяин сервера.", emoji: "👑", level: room.hostLevel || 1 };
    startMatch("ai", opp);
  }
  return (
    <div className="scroll" style={sx.page}>
      <Header title="ЛОББИ" onBack={() => go("servers")} right={<button className="tap" style={sx.iconBtn} onClick={refreshRoom}><RefreshCw size={16} /></button>} />
      <div style={{ textAlign: "center", marginTop: 6 }} className="slide">
        <div className="display" style={{ fontSize: 24 }}>{room.name}</div>
        <div style={{ color: "var(--mut)", fontSize: 12.5, marginTop: 2 }}>Сервер на 2 игроков · {room.guestId ? "заполнен" : "ожидание соперника"}</div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 18 }} className="slide">
        <Slot photo={room.hostPhoto} name={room.hostName} level={room.hostLevel} tag="Хост" color="var(--ember)" you={youHost} />
        {guest ? <Slot photo={guest.photo} name={guest.name} level={guest.level} tag="Гость" color="var(--steel)" you={!youHost} />
          : <div style={{ ...sx.slot, justifyContent: "center", borderStyle: "dashed" }}><Loader2 size={22} color="var(--mut)" style={{ animation: "spin 1.4s linear infinite" }} /><div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 8 }}>Ожидание игрока…</div></div>}
      </div>
      <button className="tap" style={{ ...sx.bigBtn, marginTop: 20, background: "linear-gradient(135deg,var(--ember),var(--ember2))" }} onClick={begin}><Swords size={18} /> Начать бой <span style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: 4 }}><Zap size={13} fill="currentColor" />{FIGHT_COST}</span></button>
      <div style={sx.infoBox}>Сервер виден всем в списке и ищется по названию. Живой бой двух реальных игроков в реальном времени включится после подключения хостинга — сейчас Арбитр ведёт бой против выбранного соперника.</div>
    </div>
  );
}
const Slot = ({ photo, name, level, tag, color, you }) => (
  <div style={{ ...sx.slot, borderColor: color }}>
    <div style={{ position: "relative" }}><Avatar photo={photo} name={name} size={56} radius={16} /><div style={sx.lvlBadge}>{level || 1}</div></div>
    <div style={{ fontSize: 14, fontWeight: 800, marginTop: 10, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{name}{you ? " (ты)" : ""}</div>
    <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 2 }}>{tag}</div>
  </div>
);

/* ===================== MATCHING ===================== */
function Matching() {
  return (<div style={{ ...sx.page, alignItems: "center", justifyContent: "center", textAlign: "center" }}><div style={{ fontSize: 64, animation: "drift 3s ease-in-out infinite" }}>🌀</div><Loader2 size={26} color="var(--arb)" style={{ animation: "spin 1s linear infinite", marginTop: 18 }} /><div className="display" style={{ fontSize: 22, marginTop: 16, letterSpacing: 1 }}>ПОИСК СОПЕРНИКА</div><div style={{ color: "var(--mut)", marginTop: 6, fontSize: 14 }}>Собираем сессию из ожидающих бойцов…</div></div>);
}

/* ===================== BATTLE ===================== */
function Battle({ tg, opp, mode, p1Hp, p2Hp, msgs, emoji, emojiKey, thinking, input, setInput, send, hotTurn, go }) {
  const placeholder = mode === "hotseat" ? (hotTurn === 1 ? "Удар Игрока 1…" : "Удар Игрока 2…") : "Опиши свой креативный удар…";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={sx.battleTop}>
        <button className="tap" style={sx.backBtn} onClick={() => go("menu")}><ChevronLeft size={20} /></button>
        <Fighter name={tg.name} hp={p1Hp} color="var(--ember)" emoji="🧍" align="left" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 4px" }}><Swords size={16} color="var(--arb)" /><span style={{ fontSize: 9, color: "var(--mut)", marginTop: 2 }}>VS</span></div>
        <Fighter name={opp.name} hp={p2Hp} color="var(--steel)" emoji={opp.emoji} align="right" />
      </div>
      <div style={sx.scene}><div key={emojiKey} className="emoji-pop" style={{ fontSize: 60, filter: "drop-shadow(0 6px 18px rgba(184,133,255,.35))" }}>{emoji}</div></div>
      <Feed {...{ msgs, thinking, tg, opp }} />
      <div style={sx.inputBar}>
        <div style={sx.turnTag}>{mode === "hotseat" ? <span style={{ color: hotTurn === 1 ? "var(--ember)" : "var(--steel)" }}>● Игрок {hotTurn}</span> : <span style={{ color: "var(--ember)" }}>● Твой ход</span>}</div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={placeholder} rows={1} disabled={thinking} style={{ ...sx.textarea, opacity: thinking ? 0.5 : 1 }} />
        <button className="tap" onClick={send} disabled={thinking || !input.trim()} style={{ ...sx.sendBtn, opacity: thinking || !input.trim() ? 0.4 : 1 }}><Send size={18} /></button>
      </div>
    </div>
  );
}
function Fighter({ name, hp, color, emoji, align }) {
  const dead = hp <= 0;
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: align }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {align === "left" && <span style={{ fontSize: 18, filter: dead ? "grayscale(1)" : "none" }}>{emoji}</span>}
        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 80 }}>{name}</span>
        {align === "right" && <span style={{ fontSize: 18, filter: dead ? "grayscale(1)" : "none" }}>{emoji}</span>}
      </div>
      <div style={{ ...sx.barBg, height: 7, marginTop: 5 }}><div style={{ ...sx.barFill, width: `${Math.max(0, hp)}%`, background: `linear-gradient(90deg,var(--hp),${color})`, marginLeft: align === "right" ? "auto" : 0 }} /></div>
      <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 3 }}>{Math.max(0, hp)} HP</div>
    </div>
  );
}
function Feed({ msgs, thinking, tg, opp }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs, thinking]);
  return (
    <div ref={ref} className="scroll" style={sx.feed}>
      {msgs.map((m) => {
        if (m.role === "system") return <div key={m.id} className="bubble" style={sx.sysMsg}>{m.text}</div>;
        if (m.role === "arbiter") return <div key={m.id} className="bubble" style={sx.arbWrap}><div style={sx.arbHead}><Sparkles size={12} color="var(--arb)" /> Арбитр</div><div style={sx.arbBody}>{m.text}</div></div>;
        const mine = m.role === "p1";
        return (<div key={m.id} className="bubble" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}><div style={{ ...sx.chatBubble, background: mine ? "linear-gradient(135deg,var(--ember),var(--ember2))" : "var(--panel2)", color: mine ? "#1a1006" : "var(--txt)", border: mine ? "none" : "1px solid var(--line)" }}><div style={{ fontSize: 10, fontWeight: 800, opacity: 0.7, marginBottom: 2 }}>{mine ? tg.name : opp.name}</div>{m.text}</div></div>);
      })}
      {thinking && <div style={sx.arbWrap}><div style={sx.arbHead}><Sparkles size={12} color="var(--arb)" /> Арбитр размышляет</div><div style={{ display: "flex", gap: 5, padding: "6px 2px" }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--arb)", animation: `dot 1.2s ${i * 0.15}s infinite` }} />)}</div></div>}
    </div>
  );
}

/* ===================== RESULT ===================== */
function Result({ outcome, tg, opp, mode, p1Hp, p2Hp, profile, go }) {
  const o = outcome || {}; let title, color, em;
  if (mode === "hotseat") { title = `Победил Игрок ${o.hotWinner}`; color = "var(--arb)"; em = "🏆"; }
  else if (o.win === true) { title = "ПОБЕДА"; color = "var(--ember)"; em = "🏆"; }
  else if (o.win === "tie") { title = "НИЧЬЯ"; color = "var(--steel)"; em = "🤝"; }
  else { title = "ПОРАЖЕНИЕ"; color = "var(--hp)"; em = "💀"; }
  return (
    <div style={{ ...sx.page, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div className="emoji-pop" style={{ fontSize: 80 }}>{em}</div>
      <div className="display" style={{ fontSize: 38, color, letterSpacing: 2, marginTop: 8, textShadow: `0 0 24px ${color}55` }}>{title}</div>
      <div style={{ color: "var(--mut)", marginTop: 6 }}>{tg.name} {p1Hp} HP · {opp.name} {p2Hp} HP</div>
      {o.levelUp && <div style={{ marginTop: 16, padding: "8px 16px", borderRadius: 12, background: "var(--panel2)", border: "1px solid var(--arb)", color: "var(--arb)", fontWeight: 700, animation: "glowPulse 1.5s infinite" }}>✦ Новый уровень {profile.level}!</div>}
      <button className="tap" style={{ ...sx.bigBtn, marginTop: 30, maxWidth: 240, background: "linear-gradient(135deg,var(--arb2),var(--arb))" }} onClick={() => go("menu")}><ChevronLeft size={18} /> В меню</button>
    </div>
  );
}

/* ===================== STYLES ===================== */
const sx = {
  app: { minHeight: "100vh", width: "100%", display: "flex", justifyContent: "center", background: "radial-gradient(120% 80% at 50% -10%, #1a1430 0%, var(--bg) 55%)", position: "relative", overflow: "hidden" },
  bgGlowA: { position: "absolute", top: -80, left: -60, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,138,61,.18), transparent 70%)", animation: "drift 12s ease-in-out infinite", pointerEvents: "none" },
  bgGlowB: { position: "absolute", bottom: -100, right: -60, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(82,214,255,.14), transparent 70%)", animation: "drift 15s ease-in-out infinite reverse", pointerEvents: "none" },
  frame: { width: "100%", maxWidth: 440, height: "100vh", maxHeight: 900, background: "linear-gradient(180deg, rgba(20,18,31,.6), rgba(10,9,18,.85))", borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", position: "relative", backdropFilter: "blur(2px)" },
  page: { flex: 1, overflowY: "auto", padding: "16px 16px 20px", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  iconBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--txt)", width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  backBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--txt)", width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  toast: { position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--panel2)", border: "1px solid var(--arb)", color: "var(--txt)", padding: "10px 18px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, zIndex: 60, boxShadow: "0 8px 30px rgba(0,0,0,.5)", animation: "rise .3s ease both" },

  stripCard: { width: "100%", display: "flex", alignItems: "center", gap: 12, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 18, padding: "12px 14px", marginBottom: 14, color: "var(--txt)" },
  energyBtn: { display: "flex", alignItems: "center", gap: 7, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 99, padding: "7px 9px 7px 12px", color: "var(--steel)", flexShrink: 0 },
  shopBalance: { display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(160deg, var(--panel), var(--panel2))", border: "1px solid var(--line)", borderRadius: 18, padding: "16px 18px" },
  shopGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 },
  packCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 18, padding: "16px 12px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  buyBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", border: "none", borderRadius: 11, padding: "10px", fontWeight: 800, fontSize: 14, fontFamily: "Manrope", background: "linear-gradient(135deg,#ffb24d,#ffd54a)", color: "#1a1006" },
  lvlBadgeSm: { position: "absolute", bottom: -5, right: -5, background: "var(--arb2)", color: "#fff", fontSize: 10, fontWeight: 800, width: 21, height: 21, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bg)" },
  hero: { width: "100%", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(135deg,var(--ember),var(--ember2))", border: "none", borderRadius: 20, padding: "18px 20px", marginBottom: 14, boxShadow: "0 10px 30px rgba(255,138,61,.25)" },
  menuGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 },
  menuCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 18, padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, color: "var(--txt)", textAlign: "left" },
  menuIconWrap: { width: 42, height: 42, borderRadius: 12, background: "var(--panel2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 },

  modeBtn: { width: "100%", display: "flex", alignItems: "center", gap: 13, borderRadius: 16, padding: "15px 16px", color: "#fff", fontFamily: "Manrope", boxShadow: "0 8px 24px rgba(0,0,0,.3)" },
  modeIcon: { width: 40, height: 40, borderRadius: 12, background: "rgba(0,0,0,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  infoBox: { marginTop: 18, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, fontSize: 13, color: "#cdc8df", lineHeight: 1.5 },

  profCard: { background: "linear-gradient(160deg, var(--panel), var(--panel2))", border: "1px solid var(--line)", borderRadius: 22, padding: 18, boxShadow: "0 10px 40px rgba(0,0,0,.4)" },
  lvlBadge: { position: "absolute", bottom: -6, right: -6, background: "var(--arb2)", color: "#fff", fontSize: 12, fontWeight: 800, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bg)" },
  xpLabel: { display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 5 },
  barBg: { height: 9, background: "rgba(0,0,0,.35)", borderRadius: 99, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, transition: "width .6s cubic-bezier(.3,.9,.3,1)" },

  section: { marginTop: 14, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 18, padding: 16 },
  secHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  secTitle: { fontSize: 12, fontWeight: 700, color: "var(--mut)", textTransform: "uppercase", letterSpacing: 1 },
  bioText: { fontSize: 14, lineHeight: 1.5, color: "#cdc8df", margin: 0 },
  bioInput: { width: "100%", minHeight: 64, resize: "none", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--txt)", padding: 11, fontSize: 14, outline: "none" },
  input: { width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--txt)", padding: "11px 13px", fontSize: 14, outline: "none" },

  statGrid: { marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 },
  statCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },

  bigBtn: { width: "100%", border: "none", borderRadius: 16, padding: "15px 18px", color: "#fff", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "Manrope", boxShadow: "0 8px 24px rgba(0,0,0,.35)" },
  smallBtn: { border: "none", borderRadius: 11, padding: "11px 14px", color: "#fff", fontWeight: 700, fontSize: 13, fontFamily: "Manrope" },
  dangerBtn: { marginTop: 14, width: "100%", border: "1px solid var(--hp)", background: "transparent", color: "var(--hp)", borderRadius: 14, padding: "13px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Manrope", cursor: "pointer" },

  refHero: { background: "linear-gradient(160deg, rgba(138,92,255,.18), rgba(138,92,255,.05))", border: "1px solid rgba(184,133,255,.35)", borderRadius: 20, padding: 18, textAlign: "center" },
  codeRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px" },
  friendRow: { display: "flex", alignItems: "center", gap: 11, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 12px" },
  empty: { textAlign: "center", padding: "28px 16px", background: "var(--panel)", border: "1px dashed var(--line)", borderRadius: 16, marginTop: 6 },

  segment: { display: "flex", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, border: "none", borderRadius: 9, padding: "9px", fontWeight: 700, fontSize: 13, fontFamily: "Manrope", transition: "background .2s" },

  serverRow: { display: "flex", alignItems: "center", gap: 11, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 12px" },
  lbRow: { display: "flex", alignItems: "center", gap: 11, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 12px", color: "var(--txt)", width: "100%" },
  rankBox: { width: 30, textAlign: "center", fontWeight: 800, flexShrink: 0 },
  slot: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 18, padding: "20px 12px", minHeight: 150, justifyContent: "flex-start" },

  overlay: { position: "absolute", inset: 0, background: "rgba(6,5,12,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 70, backdropFilter: "blur(3px)" },
  modal: { width: "100%", maxWidth: 340, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 20, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.6)" },

  battleTop: { display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 10px", borderBottom: "1px solid var(--line)", background: "rgba(10,9,18,.6)" },
  scene: { display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0 10px", background: "radial-gradient(60% 100% at 50% 0%, rgba(184,133,255,.10), transparent)" },
  feed: { flex: 1, overflowY: "auto", padding: "6px 14px 14px", display: "flex", flexDirection: "column", gap: 10 },
  sysMsg: { alignSelf: "center", fontSize: 11.5, color: "var(--mut)", background: "rgba(255,255,255,.04)", padding: "5px 12px", borderRadius: 99, border: "1px solid var(--line)" },
  arbWrap: { alignSelf: "center", maxWidth: "92%", background: "linear-gradient(160deg, rgba(138,92,255,.14), rgba(138,92,255,.05))", border: "1px solid rgba(184,133,255,.35)", borderRadius: 14, padding: "10px 13px" },
  arbHead: { fontSize: 11, fontWeight: 800, color: "var(--arb)", letterSpacing: .5, display: "flex", alignItems: "center", gap: 5, marginBottom: 4, textTransform: "uppercase" },
  arbBody: { fontSize: 13.5, lineHeight: 1.5, color: "#e9e4fb", fontStyle: "italic" },
  chatBubble: { maxWidth: "78%", padding: "9px 13px", borderRadius: 16, fontSize: 14, lineHeight: 1.4 },
  inputBar: { borderTop: "1px solid var(--line)", padding: "10px 12px 12px", background: "rgba(10,9,18,.7)", display: "flex", alignItems: "flex-end", gap: 9, position: "relative" },
  turnTag: { position: "absolute", top: -9, left: 16, fontSize: 10.5, fontWeight: 800, background: "var(--bg)", padding: "1px 8px", borderRadius: 99, border: "1px solid var(--line)" },
  textarea: { flex: 1, resize: "none", maxHeight: 110, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 14, color: "var(--txt)", padding: "11px 13px", fontSize: 14, outline: "none", lineHeight: 1.4 },
  sendBtn: { background: "linear-gradient(135deg,var(--arb2),var(--arb))", border: "none", color: "#fff", width: 44, height: 44, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
};
