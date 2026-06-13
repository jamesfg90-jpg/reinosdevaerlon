import React, { useEffect, useMemo, useState } from "react";

// Idle / Timer-based RPG (no graphics) — Single-file React component
// - Buttons to perform actions (adventure, rest, train, drink potion)
// - Actions take real time to complete; shows a progress bar
// - Gain XP, level up, earn gold, buy/equip items, fight scaling creatures
// - Auto-saves to localStorage
// TailwindCSS is assumed available.

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

type ItemSlot = "weapon" | "armor" | "trinket";

type Item = {
  id: string;
  name: string;
  slot: ItemSlot;
  atk?: number;
  def?: number;
  spd?: number;
  hp?: number;
  price: number;
  tier: number;
};

type Equipment = Partial<Record<ItemSlot, Item | null>>;

interface Player {
  name: string;
  level: number;
  xp: number;
  xpToLevel: number;
  gold: number;
  hp: number;
  maxHp: number;
  potions: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;
  equipment: Equipment;
}

type Enemy = {
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  gold: number;
  xp: number;
};

type ActionKind = "idle" | "adventure" | "train" | "rest" | "boss" | "potion";

interface RunningAction {
  kind: ActionKind;
  label: string;
  durationMs: number;
  startedAt: number;
  endsAt: number;
}

const SHOP: Item[] = [
  { id: "w1", name: "Daga Heredada", slot: "weapon", atk: 2, spd: 1, price: 20, tier: 1 },
  { id: "a1", name: "Chaleco de Cuero", slot: "armor", def: 2, hp: 5, price: 25, tier: 1 },
  { id: "t1", name: "Amuleto Simple", slot: "trinket", spd: 1, hp: 3, price: 25, tier: 1 },
  { id: "w2", name: "Espada Corta", slot: "weapon", atk: 4, spd: 1, price: 80, tier: 2 },
  { id: "a2", name: "Cota Ligera", slot: "armor", def: 4, hp: 8, price: 90, tier: 2 },
  { id: "t2", name: "Anillo de Vigor", slot: "trinket", spd: 2, hp: 6, price: 85, tier: 2 },
  { id: "w3", name: "Espada Larga", slot: "weapon", atk: 7, spd: 2, price: 220, tier: 3 },
  { id: "a3", name: "Cota de Mallas", slot: "armor", def: 7, hp: 14, price: 240, tier: 3 },
  { id: "t3", name: "Talismán Afilado", slot: "trinket", spd: 3, atk: 1, price: 230, tier: 3 },
  { id: "w4", name: "Mandoble", slot: "weapon", atk: 11, price: 600, tier: 4 },
  { id: "a4", name: "Armadura Laminar", slot: "armor", def: 11, hp: 20, price: 640, tier: 4 },
  { id: "t4", name: "Gema del Tiempo", slot: "trinket", spd: 4, price: 620, tier: 4 },
  { id: "w5", name: "Colmillo del Dragón", slot: "weapon", atk: 16, spd: 3, price: 1400, tier: 5 },
  { id: "a5", name: "Placas Benditas", slot: "armor", def: 16, hp: 30, price: 1500, tier: 5 },
  { id: "t5", name: "Sortija Épica", slot: "trinket", spd: 5, atk: 2, price: 1450, tier: 5 },
];

function getTotal(p: Player) {
  const eq = Object.values(p.equipment).filter(Boolean) as Item[];
  const sum = (k: keyof Item) => eq.reduce((a, it) => a + ((it[k] as number | undefined) || 0), 0);
  const atk = p.baseAtk + sum("atk");
  const def = p.baseDef + sum("def");
  const spd = p.baseSpd + sum("spd");
  const hpBonus = sum("hp");
  return { atk, def, spd, hpBonus };
}

function maxHpWithGear(p: Player) {
  return p.maxHp + getTotal(p).hpBonus;
}

function makeEnemy(p: Player): Enemy {
  const level = Math.max(1, p.level + rnd(-1, 2));
  const base = 8 + level * 6;
  const totals = getTotal(p);
  return {
    name: ["Rata Gigante", "Bandido", "Lobo Sombrío", "Cultista", "Gólem Roto"][rnd(0, 4)],
    level,
    hp: Math.round(base + p.level * 2),
    atk: Math.round(3 + level * 2 + totals.atk * 0.2),
    def: Math.round(2 + level * 1.5 + totals.def * 0.1),
    gold: rnd(5 + level * 2, 10 + level * 4),
    xp: rnd(8 + level * 4, 14 + level * 6),
  };
}

function makeBoss(p: Player): Enemy {
  const level = p.level + 2;
  return {
    name: "Engendro Mayor",
    level,
    hp: 80 + level * 12,
    atk: 8 + level * 3,
    def: 6 + level * 2,
    gold: 80 + level * 20,
    xp: 120 + level * 25,
  };
}

function simulateCombat(p: Player, e: Enemy) {
  let php = p.hp;
  let ehp = e.hp;
  const stats = getTotal(p);
  const pDmg = (Math.max(1, stats.atk - e.def) * rnd(80, 120)) / 100;
  const eDmg = (Math.max(1, e.atk - stats.def) * rnd(80, 120)) / 100;

  if (stats.spd > e.level && Math.random() < 0.35) {
    ehp -= Math.round(pDmg);
  }

  let rounds = 0;
  while (php > 0 && ehp > 0 && rounds < 50) {
    ehp -= Math.round(pDmg);
    if (ehp <= 0) break;
    php -= Math.round(eDmg);
    rounds += 1;
  }

  const win = php > 0 && ehp <= 0;
  return { win, php: clamp(php, 0, maxHpWithGear(p)), rounds: Math.max(1, rounds) };
}

function xpForNext(level: number) {
  return Math.round(50 + level ** 2 * 25);
}

function gainXp(player: Player, amount: number): Player {
  let level = player.level;
  let xp = player.xp + amount;
  let xpToLevel = player.xpToLevel;
  let baseAtk = player.baseAtk;
  let baseDef = player.baseDef;
  let maxHp = player.maxHp;

  while (xp >= xpToLevel) {
    xp -= xpToLevel;
    level += 1;
    xpToLevel = xpForNext(level);
    baseAtk += 1;
    baseDef += 1;
    maxHp += 3;
  }

  const leveled = { ...player, level, xp, xpToLevel, baseAtk, baseDef, maxHp };
  return { ...leveled, hp: clamp(leveled.hp + 5, 0, maxHpWithGear(leveled)) };
}

const KEY = "idle_rpg_save_v1";

function save(p: Player) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Ignore unavailable storage in private/server contexts.
  }
}

function load(): Player | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

function defaultPlayer(): Player {
  return {
    name: "Aventurero",
    level: 1,
    xp: 0,
    xpToLevel: xpForNext(1),
    gold: 0,
    hp: 20,
    maxHp: 20,
    potions: 2,
    baseAtk: 4,
    baseDef: 2,
    baseSpd: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function Progress({ progress }: { progress: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-xl bg-zinc-200">
      <div className="h-full rounded-xl bg-zinc-800 transition-all" style={{ width: `${clamp(progress, 0, 100)}%` }} />
    </div>
  );
}

const fmt = new Intl.NumberFormat();

export default function IdleRPG() {
  const [player, setPlayer] = useState<Player>(() => load() ?? defaultPlayer());
  const [log, setLog] = useState<string[]>(["Bienvenido. Usa los botones para actuar."]);
  const [running, setRunning] = useState<RunningAction | null>(null);
  const [tab, setTab] = useState<"acciones" | "equipo" | "tienda" | "registro">("acciones");

  useEffect(() => {
    save(player);
  }, [player]);

  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(timer);
  }, []);

  const totals = useMemo(() => getTotal(player), [player]);
  const maxHp = useMemo(() => maxHpWithGear(player), [player]);
  const progress = running ? ((Date.now() - running.startedAt) / running.durationMs) * 100 : 0;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      if (Date.now() >= running.endsAt) {
        clearInterval(id);
        finishAction(running);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function pushLog(message: string) {
    setLog((items) => [message, ...items].slice(0, 200));
  }

  function startAction(kind: ActionKind, label: string, baseSeconds: number) {
    if (running) return;
    const speedBonus = clamp(totals.spd * 0.06, 0, 0.6);
    const durationMs = Math.max(600, Math.round(baseSeconds * 1000 * (1 - speedBonus)));
    const now = Date.now();
    setRunning({ kind, label, durationMs, startedAt: now, endsAt: now + durationMs });
  }

  function finishAction(act: RunningAction) {
    setRunning(null);

    if (act.kind === "potion") {
      if (player.potions <= 0) {
        pushLog("No te quedan pociones.");
        return;
      }
      const heal = Math.round(maxHp * 0.5);
      setPlayer((p) => ({ ...p, potions: p.potions - 1, hp: clamp(p.hp + heal, 0, maxHp) }));
      pushLog(`Bebes poción (+${heal} PV).`);
      return;
    }

    if (act.kind === "rest") {
      const heal = Math.max(6, Math.round(maxHp * 0.35));
      setPlayer((p) => ({ ...p, hp: clamp(p.hp + heal, 0, maxHp) }));
      pushLog(`Descansas y recuperas ${heal} PV.`);
      return;
    }

    if (act.kind === "train") {
      const xpg = rnd(8, 16) + player.level;
      setPlayer((p) => gainXp({ ...p }, xpg));
      pushLog(`Entrenas y ganas ${xpg} PX.`);
      return;
    }

    if (act.kind === "adventure" || act.kind === "boss") {
      const enemy = act.kind === "boss" ? makeBoss(player) : makeEnemy(player);
      const res = simulateCombat(player, enemy);
      if (res.win) {
        const potionDrop = Math.random() < 0.12 ? 1 : 0;
        setPlayer((p0) => gainXp({ ...p0, gold: p0.gold + enemy.gold, hp: res.php, potions: p0.potions + potionDrop }, enemy.xp));
        pushLog(`${enemy.name} (Nv.${enemy.level}) derrotado. +${enemy.xp} PX, +${enemy.gold} oro${potionDrop ? ", +1 poción" : ""}.`);
      } else {
        const lost = Math.min(Math.round(player.gold * 0.1), 50);
        setPlayer((p) => ({ ...p, gold: Math.max(0, p.gold - lost), hp: Math.max(1, Math.round(maxHp * 0.3)) }));
        pushLog(`Has caído ante ${enemy.name}. Pierdes ${lost} oro y te retiran a salvo.`);
      }
    }
  }

  function buyItem(it: Item) {
    if (player.gold < it.price) {
      pushLog("No tienes suficiente oro.");
      return;
    }
    setPlayer((p) => ({ ...p, gold: p.gold - it.price, equipment: { ...p.equipment, [it.slot]: it } }));
    pushLog(`Compras y equipas ${it.name}.`);
  }

  function unequip(slot: ItemSlot) {
    if (!player.equipment[slot]) return;
    setPlayer((p) => ({ ...p, equipment: { ...p.equipment, [slot]: null } }));
  }

  function resetGame() {
    if (!confirm("¿Reiniciar progreso?")) return;
    const fresh = defaultPlayer();
    setPlayer(fresh);
    setLog(["Progreso reiniciado."]);
    setRunning(null);
    save(fresh);
  }

  const shopFiltered = useMemo(() => {
    const tierUnlocked = Math.min(5, Math.floor((player.level + 1) / 3) + 1);
    return SHOP.filter((it) => it.tier <= tierUnlocked);
  }, [player.level]);

  const actions: { key: ActionKind; label: string; seconds: number; desc: string }[] = [
    { key: "adventure", label: "Ir de aventura", seconds: 10, desc: "Encuentra criaturas y botín." },
    { key: "train", label: "Entrenar", seconds: 6, desc: "Gana PX sin riesgo." },
    { key: "rest", label: "Descansar", seconds: 5, desc: "Recupera una parte de tu vida." },
    { key: "potion", label: "Beber poción", seconds: 1, desc: "Cura 50% de tus PV máximos." },
    { key: "boss", label: "Desafiar jefe", seconds: 15, desc: "Enemigo duro, mejor botín." },
  ];

  return (
    <div className="min-h-screen w-full bg-zinc-50 p-4 text-zinc-900 md:p-8">
      <div className="mx-auto grid max-w-5xl gap-4 md:gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold md:text-3xl">RPG de Botones — Sin Gráficos</h1>
          <button onClick={resetGame} className="rounded-xl bg-zinc-200 px-3 py-2 text-sm hover:bg-zinc-300">Reiniciar</button>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{player.name}</div>
              <div className="text-xs text-zinc-500">Nv. {player.level}</div>
            </div>
            <div className="mt-2 text-sm">PX: {fmt.format(player.xp)} / {fmt.format(player.xpToLevel)}</div>
            <div className="mt-2 text-sm">Oro: {fmt.format(player.gold)} · Pociones: {player.potions}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm">PV: {fmt.format(player.hp)} / {fmt.format(maxHp)}</div>
            <div className="mt-2"><Progress progress={(player.hp / maxHp) * 100} /></div>
            <div className="mt-2 text-xs text-zinc-500">ATQ {totals.atk} · DEF {totals.def} · VEL {totals.spd}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow">
            {running ? (
              <div>
                <div className="text-sm font-medium">{running.label}</div>
                <div className="mt-2"><Progress progress={progress} /></div>
                <div className="mt-2 text-xs text-zinc-500">Tiempo restante: {Math.max(0, Math.ceil((running.endsAt - Date.now()) / 1000))}s</div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">Sin acción en curso</div>
            )}
          </div>
        </section>

        <nav className="flex gap-2">
          {[
            { k: "acciones", t: "Acciones" },
            { k: "equipo", t: "Equipo" },
            { k: "tienda", t: "Tienda" },
            { k: "registro", t: "Registro" },
          ].map((x) => (
            <button key={x.k} onClick={() => setTab(x.k as typeof tab)} className={`rounded-2xl px-4 py-2 text-sm ${tab === x.k ? "bg-zinc-900 text-white" : "bg-zinc-200 hover:bg-zinc-300"}`}>
              {x.t}
            </button>
          ))}
        </nav>

        {tab === "acciones" && (
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow md:col-span-2">
              <h2 className="mb-3 font-semibold">Acciones</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {actions.map((a) => (
                  <button key={a.key} disabled={!!running || (a.key === "potion" && player.potions <= 0)} onClick={() => startAction(a.key, a.label, a.seconds)} className={`rounded-2xl border p-3 text-left ${running ? "opacity-50" : "hover:border-zinc-900"}`}>
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-zinc-500">{a.desc}</div>
                    <div className="mt-1 text-xs">~{a.seconds}s</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow">
              <h3 className="mb-2 font-semibold">Consejos</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>La Velocidad reduce el tiempo de las acciones.</li>
                <li>Entrenar es seguro; la aventura da más botín.</li>
                <li>Beber una poción cura el 50% de tus PV máximos.</li>
                <li>Desafiar al jefe es arriesgado, pero muy rentable.</li>
              </ul>
            </div>
          </section>
        )}

        {tab === "equipo" && (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow">
              <h2 className="mb-3 font-semibold">Equipo</h2>
              {(["weapon", "armor", "trinket"] as ItemSlot[]).map((slot) => {
                const it = player.equipment[slot];
                return (
                  <div key={slot} className="mb-2 flex items-center justify-between rounded-xl border p-3">
                    <div>
                      <div className="text-sm font-medium capitalize">{slot}</div>
                      <div className="text-xs text-zinc-500">{it ? it.name : "(vacío)"}</div>
                    </div>
                    {it && <button onClick={() => unequip(slot)} className="rounded-lg bg-zinc-200 px-2 py-1 text-xs hover:bg-zinc-300">Quitar</button>}
                  </div>
                );
              })}
              <div className="mt-2 text-xs text-zinc-500">ATQ +{totals.atk - player.baseAtk} · DEF +{totals.def - player.baseDef} · VEL +{totals.spd - player.baseSpd} · PV +{maxHp - player.maxHp}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow">
              <h2 className="mb-3 font-semibold">Estadísticas Base</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>ATQ base: {player.baseAtk}</div>
                <div>DEF base: {player.baseDef}</div>
                <div>VEL base: {player.baseSpd}</div>
                <div>PV base: {player.maxHp}</div>
              </div>
              <div className="mt-2 text-xs text-zinc-500">Suben al subir de nivel.</div>
            </div>
          </section>
        )}

        {tab === "tienda" && (
          <section className="rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-3 font-semibold">Tienda</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {shopFiltered.map((it) => (
                <div key={it.id} className="rounded-2xl border p-3">
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs capitalize text-zinc-500">{it.slot}</div>
                  <div className="mt-1 text-xs">{[it.atk ? `ATQ +${it.atk}` : null, it.def ? `DEF +${it.def}` : null, it.spd ? `VEL +${it.spd}` : null, it.hp ? `PV +${it.hp}` : null].filter(Boolean).join(" · ")}</div>
                  <div className="mt-2 text-sm">{it.price} oro</div>
                  <button onClick={() => buyItem(it)} disabled={player.gold < it.price} className={`mt-2 w-full rounded-xl py-2 ${player.gold < it.price ? "bg-zinc-200" : "bg-zinc-900 text-white hover:opacity-90"}`}>
                    Comprar & Equipar
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-500">Más objetos se desbloquean con tu nivel.</div>
          </section>
        )}

        {tab === "registro" && (
          <section className="rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-3 font-semibold">Registro</h2>
            <div className="max-h-72 space-y-1 overflow-auto text-xs">
              {log.map((item, index) => <div key={`${item}-${index}`} className="border-b pb-1">{item}</div>)}
            </div>
          </section>
        )}

        <footer className="py-4 text-center text-xs text-zinc-500">
          Guardado automático. Consejos: compra velocidad para reducir los tiempos de acción.
        </footer>
      </div>
    </div>
  );
}
