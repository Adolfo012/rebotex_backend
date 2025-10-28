// routes/partidos.js - Rutas de partidos (programación y consulta)
import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/partidos?torneo=:id -> lista de partidos del torneo
router.get("/", async (req, res) => {
  try {
    const torneoId = req.query.torneo;
    if (!torneoId) {
      return res.status(400).json({ error: "Parámetro 'torneo' es requerido" });
    }
    const result = await pool.query(
      `SELECT 
         p.id,
         p.torneo_id,
         p.local_id,
         p.visitante_id,
         p.fecha_partido AS fecha,
         p.hora_partido AS hora,
         p.num_jornada,
         p.resultado_local AS puntos_local,
         p.resultado_visitante AS puntos_visitante,
         el.nombre AS equipo_local,
         ev.nombre AS equipo_visitante,
        (
          CASE
            WHEN p.fecha_partido IS NULL OR p.hora_partido IS NULL THEN 'partidos'
            WHEN (
              (COALESCE(p.resultado_local, 0) <> 0 OR COALESCE(p.resultado_visitante, 0) <> 0)
              AND NOW() >= (p.fecha_partido::timestamp + p.hora_partido)
            ) THEN 'finalizados'
            WHEN NOW() >= (p.fecha_partido::timestamp + p.hora_partido + INTERVAL '90 minutes') THEN 'finalizados'
            ELSE 'proximos'
          END
        ) AS estado
       FROM partidos p
       JOIN equipos el ON el.id = p.local_id
       JOIN equipos ev ON ev.id = p.visitante_id
       WHERE p.torneo_id = $1
       ORDER BY COALESCE(p.fecha_partido, DATE '9999-12-31') ASC, COALESCE(p.hora_partido, TIME '23:59') ASC, p.id ASC`,
      [torneoId]
    );
    res.json({ partidos: result.rows });
  } catch (error) {
    console.error("❌ Error al obtener partidos:", error);
    res.status(500).json({ error: "Error interno del servidor al obtener partidos", detail: error.message });
  }
});

// PUT /api/partidos/:id/programar -> establece fecha y hora (solo organizador)
router.put("/:id/programar", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_partido, hora_partido } = req.body;
    const userId = req.user.id;

    // Validar partido y permiso de organizador
    const pRes = await pool.query(
      `SELECT p.id, p.torneo_id, t.organizador_id
       FROM partidos p
       JOIN torneo t ON t.id = p.torneo_id
       WHERE p.id = $1`,
      [id]
    );
    if (pRes.rows.length === 0) return res.status(404).json({ error: "Partido no encontrado" });
    const row = pRes.rows[0];
    if (String(row.organizador_id) !== String(userId)) {
      return res.status(403).json({ error: "No tienes permisos para programar este partido" });
    }

    // Actualizar programación
    const upd = await pool.query(
      `UPDATE partidos SET fecha_partido = $1, hora_partido = $2 WHERE id = $3 RETURNING *`,
      [fecha_partido || null, hora_partido || null, id]
    );
    res.json({ message: "Partido programado", partido: upd.rows[0] });
  } catch (error) {
    console.error("❌ Error al programar partido:", error);
    res.status(500).json({ error: "Error interno del servidor al programar partido", detail: error.message });
  }
});

// PUT /api/partidos/:id/editar -> fecha/hora y marcador final
router.put("/:id/editar", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_partido, hora_partido, resultado_local, resultado_visitante } = req.body;
    const userId = req.user.id;

    // Validar partido y permiso de organizador
    const pRes = await pool.query(
      `SELECT p.id, p.torneo_id, t.organizador_id
       FROM partidos p
       JOIN torneo t ON t.id = p.torneo_id
       WHERE p.id = $1`,
      [id]
    );
    if (pRes.rows.length === 0) return res.status(404).json({ error: "Partido no encontrado" });
    const row = pRes.rows[0];
    if (String(row.organizador_id) !== String(userId)) {
      return res.status(403).json({ error: "No tienes permisos para editar este partido" });
    }

    // Actualizar programación y marcador
    const upd = await pool.query(
      `UPDATE partidos 
         SET fecha_partido = $1, hora_partido = $2, 
             resultado_local = $3, resultado_visitante = $4 
       WHERE id = $5 
       RETURNING *`,
      [fecha_partido || null, hora_partido || null, resultado_local ?? null, resultado_visitante ?? null, id]
    );
    res.json({ message: "Partido actualizado", partido: upd.rows[0] });
  } catch (error) {
    console.error("❌ Error al editar partido:", error);
    res.status(500).json({ error: "Error interno del servidor al editar partido", detail: error.message });
  }
});

// GET /api/partidos/:id/stats -> estadísticas por jugador del partido
router.get("/:id/stats", async (req, res) => {
  try {
    const { id } = req.params;
    const pRes = await pool.query(
      `SELECT local_id, visitante_id FROM partidos WHERE id = $1`,
      [id]
    );
    if (pRes.rows.length === 0) return res.status(404).json({ error: "Partido no encontrado" });
    const { local_id, visitante_id } = pRes.rows[0];

    // Primero intentamos traer estadísticas guardadas del partido
    const sRes = await pool.query(
      `SELECT pj.jugador_id, pj.equipo_id, j.nombre AS jugador_nombre, e.nombre AS equipo_nombre,
              pj.puntos_triple, pj.puntos_doble, pj.tiros_libre
         FROM partido_jugadores pj
         JOIN jugadores j ON j.id = pj.jugador_id
         JOIN equipos e ON e.id = pj.equipo_id
        WHERE pj.partido_id = $1
        ORDER BY e.nombre, j.nombre`,
      [id]
    );

    let stats;
    if (sRes.rows.length > 0) {
      stats = sRes.rows.map(r => ({
        jugador_id: r.jugador_id,
        equipo_id: r.equipo_id,
        jugador_nombre: r.jugador_nombre,
        equipo_nombre: r.equipo_nombre,
        puntos_triple: Number(r.puntos_triple) || 0,
        puntos_doble: Number(r.puntos_doble) || 0,
        tiros_libre: Number(r.tiros_libre) || 0,
        total_puntos: (Number(r.puntos_triple)||0)*3 + (Number(r.puntos_doble)||0)*2 + (Number(r.tiros_libre)||0)
      }));
    } else {
      // Si no hay registros aún, devolver jugadores de ambos equipos con 0
      const jRes = await pool.query(
        `SELECT j.id AS jugador_id, j.nombre AS jugador_nombre, j.equipo_id, e.nombre AS equipo_nombre
           FROM jugadores j
           JOIN equipos e ON e.id = j.equipo_id
          WHERE j.equipo_id IN ($1, $2)
          ORDER BY e.nombre, j.nombre`,
        [local_id, visitante_id]
      );
      stats = jRes.rows.map(r => ({
        jugador_id: r.jugador_id,
        equipo_id: r.equipo_id,
        jugador_nombre: r.jugador_nombre,
        equipo_nombre: r.equipo_nombre,
        puntos_triple: 0,
        puntos_doble: 0,
        tiros_libre: 0,
        total_puntos: 0,
      }));
    }
    res.json({ stats });
  } catch (error) {
    console.error("❌ Error al obtener estadísticas del partido:", error);
    res.status(500).json({ error: "Error interno al obtener estadísticas del partido", detail: error.message });
  }
});

// PUT /api/partidos/:id/stats -> guardar estadísticas del partido y actualizar agregados del torneo
router.put("/:id/stats", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { stats } = req.body; // [{jugador_id, equipo_id, puntos_triple, puntos_doble, tiros_libre}, ...]
    const userId = req.user.id;

    if (!Array.isArray(stats)) {
      return res.status(400).json({ error: "Payload inválido: stats debe ser un arreglo" });
    }

    // Validar organizador y obtener partido
    const pRes = await client.query(
      `SELECT p.id, p.torneo_id, p.local_id, p.visitante_id, p.resultado_local, p.resultado_visitante, t.organizador_id
         FROM partidos p
         JOIN torneo t ON t.id = p.torneo_id
        WHERE p.id = $1`,
      [id]
    );
    if (pRes.rows.length === 0) return res.status(404).json({ error: "Partido no encontrado" });
    const partido = pRes.rows[0];
    if (String(partido.organizador_id) !== String(userId)) {
      return res.status(403).json({ error: "No tienes permisos para editar estadísticas de este partido" });
    }

    // Validar sumas por equipo contra marcador
    const sumas = new Map(); // equipo_id -> total
    for (const s of stats) {
      const tp = (Number(s.puntos_triple) || 0) * 3 + (Number(s.puntos_doble) || 0) * 2 + (Number(s.tiros_libre) || 0);
      const prev = sumas.get(Number(s.equipo_id)) || 0;
      sumas.set(Number(s.equipo_id), prev + tp);
    }
    const totalLocal = sumas.get(Number(partido.local_id)) || 0;
    const totalVisitante = sumas.get(Number(partido.visitante_id)) || 0;
    const rl = Number(partido.resultado_local || 0);
    const rv = Number(partido.resultado_visitante || 0);
    if (rl || rv) {
      if (totalLocal !== rl || totalVisitante !== rv) {
        return res.status(400).json({ error: "Las sumas de puntos por equipo no coinciden con el marcador" });
      }
    }

    await client.query('BEGIN');

    const torneoId = partido.torneo_id;

    // Leer valores previos del partido para calcular delta
    const oldRes = await client.query(
      `SELECT jugador_id, puntos_triple, puntos_doble, tiros_libre
         FROM partido_jugadores WHERE partido_id = $1`,
      [id]
    );
    const prevMap = new Map();
    for (const r of oldRes.rows) {
      prevMap.set(Number(r.jugador_id), {
        pt: Number(r.puntos_triple) || 0,
        pd: Number(r.puntos_doble) || 0,
        tl: Number(r.tiros_libre) || 0,
      });
    }

    // Upsert exacto en partido_jugadores (reemplaza valores)
    for (const s of stats) {
      const pt = Number(s.puntos_triple) || 0;
      const pd = Number(s.puntos_doble) || 0;
      const tl = Number(s.tiros_libre) || 0;
      await client.query(
        `INSERT INTO partido_jugadores (partido_id, jugador_id, equipo_id, puntos_triple, puntos_doble, tiros_libre, loaddt)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (partido_id, jugador_id) DO UPDATE
           SET equipo_id = EXCLUDED.equipo_id,
               puntos_triple = EXCLUDED.puntos_triple,
               puntos_doble = EXCLUDED.puntos_doble,
               tiros_libre = EXCLUDED.tiros_libre,
               loaddt = NOW()`,
        [id, s.jugador_id, s.equipo_id, pt, pd, tl]
      );
    }

    // Ajustar agregados del torneo por delta (nuevo - previo)
    for (const s of stats) {
      const prev = prevMap.get(Number(s.jugador_id)) || { pt: 0, pd: 0, tl: 0 };
      const dpt = (Number(s.puntos_triple) || 0) - prev.pt;
      const dpd = (Number(s.puntos_doble) || 0) - prev.pd;
      const dtl = (Number(s.tiros_libre) || 0) - prev.tl;
      await client.query(
        `INSERT INTO torneo_jugadores (torneo_id, jugador_id, equipo_id, puntos_triple, puntos_doble, tiros_libre, loaddt)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (torneo_id, jugador_id) DO UPDATE
           SET equipo_id = EXCLUDED.equipo_id,
               puntos_triple = torneo_jugadores.puntos_triple + $4,
               puntos_doble = torneo_jugadores.puntos_doble + $5,
               tiros_libre = torneo_jugadores.tiros_libre + $6,
               loaddt = NOW()`,
        [torneoId, s.jugador_id, s.equipo_id, dpt, dpd, dtl]
      );
    }

    await client.query('COMMIT');
    res.json({ message: "Estadísticas del partido guardadas" });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error("❌ Error al guardar estadísticas del partido:", error);
    res.status(500).json({ error: "Error interno al guardar estadísticas del partido", detail: error.message });
  } finally {
    client.release();
  }
});

// GET /api/partidos/:id/favorito -> predicción de equipo favorito (ML service / heurística)
router.get("/:id/favorito", async (req, res) => {
  try {
    const { id } = req.params;
    const pRes = await pool.query(
      `SELECT p.id, p.torneo_id, p.local_id, p.visitante_id, 
              el.nombre AS local_nombre, ev.nombre AS visitante_nombre
         FROM partidos p
         JOIN equipos el ON el.id = p.local_id
         JOIN equipos ev ON ev.id = p.visitante_id
        WHERE p.id = $1`,
      [id]
    );
    if (pRes.rows.length === 0) return res.status(404).json({ error: "Partido no encontrado" });
    const row = pRes.rows[0];
    const torneoId = Number(row.torneo_id);
    const localId = Number(row.local_id);
    const visitId = Number(row.visitante_id);
    const localName = row.local_nombre;
    const visitName = row.visitante_nombre;

    const teamAgg = async (equipoId) => {
      const gRes = await pool.query(
        `SELECT 
            COUNT(*) FILTER (WHERE (COALESCE(p.resultado_local,0)<>0 OR COALESCE(p.resultado_visitante,0)<>0)) AS pj,
            SUM(CASE WHEN p.local_id=$2 THEN COALESCE(p.resultado_local,0) ELSE COALESCE(p.resultado_visitante,0) END) AS pf,
            SUM(CASE WHEN p.local_id=$2 THEN COALESCE(p.resultado_visitante,0) ELSE COALESCE(p.resultado_local,0) END) AS pc,
            SUM(CASE WHEN (p.local_id=$2 AND COALESCE(p.resultado_local,0) > COALESCE(p.resultado_visitante,0)) OR (p.visitante_id=$2 AND COALESCE(p.resultado_visitante,0) > COALESCE(p.resultado_local,0)) THEN 1 ELSE 0 END) AS pg,
            SUM(CASE WHEN (p.local_id=$2 AND COALESCE(p.resultado_local,0) < COALESCE(p.resultado_visitante,0)) OR (p.visitante_id=$2 AND COALESCE(p.resultado_visitante,0) < COALESCE(p.resultado_local,0)) THEN 1 ELSE 0 END) AS pp
         FROM partidos p
         WHERE p.torneo_id=$1 AND (p.local_id=$2 OR p.visitante_id=$2)`,
        [torneoId, equipoId]
      );
      const sRes = await pool.query(
        `SELECT 
            COALESCE(SUM(pj.puntos_triple),0) AS pt,
            COALESCE(SUM(pj.puntos_doble),0) AS pd,
            COALESCE(SUM(pj.tiros_libre),0) AS tl
         FROM partido_jugadores pj
         JOIN partidos p ON p.id = pj.partido_id
         WHERE p.torneo_id=$1 AND pj.equipo_id=$2`,
        [torneoId, equipoId]
      );
      const g = gRes.rows[0] || {};
      const s = sRes.rows[0] || {};
      const pj = Number(g.pj || 0);
      const pg = Number(g.pg || 0);
      const pp = Number(g.pp || 0);
      const pf = Number(g.pf || 0);
      const pc = Number(g.pc || 0);
      const pt = Number(s.pt || 0);
      const pd = Number(s.pd || 0);
      const tl = Number(s.tl || 0);
      const pa = pt*3 + pd*2 + tl;
      const win_rate = pj > 0 ? ((pg + 1) / (pj + 2)) : 0.5;
      const pf_pg = pj > 0 ? (pf / pj) : 0;
      const pc_pg = pj > 0 ? (pc / pj) : 0;
      const diff_pg = pj > 0 ? ((pf - pc) / pj) : 0;
      return { equipo_id: equipoId, pj, pg, pp, pf, pc, diff: (pf-pc), pa, pt, pd, tl, win_rate, pf_pg, pc_pg, diff_pg };
    };

    // Racha de victorias consecutivas (últimos partidos jugados)
    const getStreakWins = async (equipoId) => {
      const r = await pool.query(
        `SELECT p.local_id, p.visitante_id, COALESCE(p.resultado_local,0) AS rl, COALESCE(p.resultado_visitante,0) AS rv,
                COALESCE(p.fecha_partido, DATE '0001-01-01') AS f, COALESCE(p.hora_partido, TIME '00:00') AS h
           FROM partidos p
          WHERE p.torneo_id=$1 AND (p.local_id=$2 OR p.visitante_id=$2)
            AND (COALESCE(p.resultado_local,0)<>0 OR COALESCE(p.resultado_visitante,0)<>0)
          ORDER BY COALESCE(p.fecha_partido, DATE '0001-01-01') DESC, COALESCE(p.hora_partido, TIME '00:00') DESC, p.id DESC
          LIMIT 10`,
        [torneoId, equipoId]
      );
      let streak = 0;
      for (const row of r.rows) {
        const isLocal = Number(row.local_id) === Number(equipoId);
        const rl = Number(row.rl) || 0;
        const rv = Number(row.rv) || 0;
        const win = isLocal ? (rl > rv) : (rv > rl);
        if (win) streak += 1; else break;
      }
      return streak;
    };

    const A = await teamAgg(localId);
    const B = await teamAgg(visitId);
    const streakA = await getStreakWins(localId);
    const streakB = await getStreakWins(visitId);

    // Small-sample adjustments shared between ML and heuristic
    const capFor = (minpj) => {
      if (minpj <= 1) return 0.55;
      if (minpj === 2) return 0.60;
      if (minpj === 3) return 0.65;
      if (minpj === 4) return 0.70;
      if (minpj === 5) return 0.75;
      if (minpj <= 7) return 0.80;
      if (minpj <= 9) return 0.85;
      return 0.90;
    };
    const wrSafe = (x) => {
      const pj = Number(x.pj || 0);
      const pg = Number(x.pg || 0);
      if (typeof x.win_rate === 'number' && x.win_rate !== 0) return x.win_rate;
      return pj > 0 ? ((pg + 1) / (pj + 2)) : 0.5;
    };
    const shrinkFactor = (minpj) => {
      if (minpj <= 1) return 0.25;
      if (minpj === 2) return 0.35;
      if (minpj === 3) return 0.50;
      if (minpj === 4) return 0.60;
      if (minpj === 5) return 0.70;
      if (minpj === 6) return 0.80;
      if (minpj <= 8) return 0.90;
      if (minpj <= 10) return 0.95;
      return 1.00;
    };
    const adjustProb = (probRaw, A, B) => {
      const minpj = Math.min(Number(A.pj || 0), Number(B.pj || 0));
      const alpha = shrinkFactor(minpj);
      const capHi = capFor(minpj);
      let p = 0.5 + (probRaw - 0.5) * alpha;
      try {
        const dw = Math.abs(wrSafe(A) - wrSafe(B));
        const dd = Math.abs(Number(A.diff_pg || 0) - Number(B.diff_pg || 0));
        const dpf = Math.abs(Number(A.pf_pg || 0) - Number(B.pf_pg || 0));
        const parity = (dw < 0.08) && (dd < 2.0) && (dpf < 2.0);
        if (parity) {
          p = 0.5 + (p - 0.5) * 0.7;
        }
      } catch(_){}
      const lo = 1 - capHi, hi = capHi;
      if (p < lo) p = lo;
      if (p > hi) p = hi;
      return { p, minpj, alpha, capHi };
    };

    // Helper to use global fetch or node-fetch dynamically
    const doFetch = async (url, opts) => {
      const f = globalThis.fetch || (await import('node-fetch')).default;
      return f(url, opts);
    };

    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';
    try {
      const resp = await doFetch(`${mlUrl}/predict_favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipos: [ { ...A, nombre: localName }, { ...B, nombre: visitName } ], contexto: { torneo_id: torneoId, partido_id: Number(id) } })
      });
      if (!resp.ok) throw new Error(`ML service responded ${resp.status}`);
      const json = await resp.json();
      // Post-process ML probability with the same small-sample adjustments
      const favoriteIsLocal = json?.favorito_id && Number(json.favorito_id) === Number(localId);
      const probRaw = Number(json?.prob || 0.5);
      const adj = adjustProb(probRaw, A, B);
      const explain = {
        method: 'model',
        equipos: [
          { id: localId, nombre: localName, streak_wins: streakA, metrics: A },
          { id: visitId, nombre: visitName, streak_wins: streakB, metrics: B }
        ],
        probability_raw: probRaw,
        probability_shrunk: 0.5 + (probRaw - 0.5) * adj.alpha,
        probability: adj.p,
        small_sample: { min_pj: adj.minpj, shrink_factor: adj.alpha, cap_hi: adj.capHi, cap_lo: (1 - adj.capHi) },
        note: 'Probabilidad ajustada para pocos partidos: shrink hacia 50% y cap dinámico según min(pj).'
      };
      return res.json({ favorito_id: favoriteIsLocal ? localId : visitId, favorito_nombre: favoriteIsLocal ? localName : visitName, prob: adj.p, source: 'model', explain });
    } catch (err) {
      console.warn('⚠️ ML service not available, using heuristic:', err.message || err);
      const score = (x) => {
        const pjX = x.pj || 0;
        const pgX = x.pg || 0;
        const wr = (typeof x.win_rate === 'number' && x.win_rate !== 0) ? x.win_rate : (pjX > 0 ? ((pgX + 1) / (pjX + 2)) : 0.5);
        const diffPg = x.diff_pg || 0;
        const pfPg = x.pf_pg || 0;
        const paPg = pjX > 0 ? (x.pa || 0) / pjX : (x.pa || 0);
        const paScaled = Math.log(1 + paPg) / 8;
        return 0.5 * wr + 0.3 * diffPg + 0.15 * pfPg + 0.05 * paScaled;
      };
      const sA = score(A);
      const sB = score(B);
      const probA = 1 / (1 + Math.exp(-(sA - sB)));
      const favorito_id = probA >= 0.5 ? localId : visitId;
      const favorito_nombre = probA >= 0.5 ? localName : visitName;
      const probRaw = probA >= 0.5 ? probA : (1 - probA);
      const adj = adjustProb(probRaw, A, B);
      const explain = {
        method: 'heuristic',
        weights: { win_rate: 0.5, diff_pg: 0.3, pf_pg: 0.15, pa_scaled: 0.05 },
        equipo_a: {
          id: localId,
          nombre: localName,
          pj: A.pj || 0,
          pg: A.pg || 0,
          pp: A.pp || 0,
          win_rate: (typeof A.win_rate === 'number' && A.win_rate !== 0) ? A.win_rate : ((A.pj || 0) > 0 ? ((A.pg + 1) / (A.pj + 2)) : 0.5),
          diff_pg: A.diff_pg || 0,
          pf_pg: A.pf_pg || 0,
          pa_pg: (A.pj || 0) > 0 ? (A.pa || 0) / A.pj : (A.pa || 0),
          pa_scaled: Math.log(1 + (((A.pj || 0) > 0 ? (A.pa || 0) / A.pj : (A.pa || 0)))) / 8,
          streak_wins: streakA,
          score: sA
        },
        equipo_b: {
          id: visitId,
          nombre: visitName,
          pj: B.pj || 0,
          pg: B.pg || 0,
          pp: B.pp || 0,
          win_rate: (typeof B.win_rate === 'number' && B.win_rate !== 0) ? B.win_rate : ((B.pj || 0) > 0 ? ((B.pg + 1) / (B.pj + 2)) : 0.5),
          diff_pg: B.diff_pg || 0,
          pf_pg: B.pf_pg || 0,
          pa_pg: (B.pj || 0) > 0 ? (B.pa || 0) / B.pj : (B.pa || 0),
          pa_scaled: Math.log(1 + (((B.pj || 0) > 0 ? (B.pa || 0) / B.pj : (B.pa || 0)))) / 8,
          streak_wins: streakB,
          score: sB
        },
        score_diff: sA - sB,
        probability_raw: probRaw,
        probability_shrunk: 0.5 + (probRaw - 0.5) * adj.alpha,
        probability: adj.p,
        small_sample: { min_pj: adj.minpj, shrink_factor: adj.alpha, cap_hi: adj.capHi, cap_lo: (1 - adj.capHi) }
      };
      return res.json({ favorito_id, favorito_nombre, prob: adj.p, source: 'heuristic', explain });
    }
  } catch (error) {
    console.error("❌ Error al calcular favorito:", error);
    res.status(500).json({ error: "Error interno al calcular favorito", detail: error.message });
  }
});

export default router;