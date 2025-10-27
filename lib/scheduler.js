import pool from "../db.js";

export async function generarPartidosParaTorneo(torneoId, options = {}) {
  const { reset = false } = options;
  const client = await pool.connect();
  try {
    // Transacción y bloqueo por torneo para evitar generadores concurrentes
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [Number(torneoId)]);

    // Leer modo del torneo
    const tRes = await client.query(`SELECT modo_partidos FROM torneo WHERE id = $1`, [torneoId]);
    if (tRes.rows.length === 0) throw new Error("Torneo no encontrado");
    const modo = tRes.rows[0].modo_partidos || 'solo';

    // Bloqueo: si se intenta añadir ida_vuelta sin reinicio y existen partidos
    if (!reset && modo === 'ida_vuelta') {
      const chk = await client.query(
        `SELECT COUNT(*) AS cnt
           FROM partidos
          WHERE torneo_id = $1
            AND (
                  fecha_partido IS NOT NULL OR
                  hora_partido IS NOT NULL OR
                  resultado_local IS NOT NULL OR
                  resultado_visitante IS NOT NULL
                )`,
        [torneoId]
      );
      const bloqueantes = Number(chk.rows[0].cnt) || 0;
      if (bloqueantes > 0) {
        await client.query('COMMIT');
        return { creados: 0, equipos: 0, modo, expected: 0, jornadas: [], blocked: true };
      }
    }

  // Equipos aceptados
  const eqRes = await client.query(
    `SELECT equipo_id AS id FROM torneo_equipos WHERE torneo_id = $1 AND estado = 'aceptado' ORDER BY equipo_id ASC`,
    [torneoId]
  );
  let equipos = eqRes.rows.map(r => r.id);
  if (equipos.length < 2) {
    if (reset) await client.query(`DELETE FROM partidos WHERE torneo_id = $1`, [torneoId]);
    await client.query('COMMIT');
    return { creados: 0, equipos: equipos.length, modo, expected: 0, jornadas: [] };
  }

  // Si se requiere reinicio, borrar partidos existentes para reenumerar desde 1
  if (reset) {
    await client.query(`DELETE FROM partidos WHERE torneo_id = $1`, [torneoId]);
  }

  // Orden de equipos
  // - Si reset: se permite aleatoriedad para un calendario nuevo
  // - Si no reset: mantener orden determinista (IDs ascendentes) para jornadas estables
  equipos = reset ? [...equipos].sort(() => Math.random() - 0.5) : [...equipos];
  const isOdd = equipos.length % 2 === 1;
  const BYE = null;
  if (isOdd) equipos.push(BYE);
  const n = equipos.length;
  const rounds = n - 1;
  const half = n / 2;
  // Estado actual del calendario y máxima jornada
  const existRes = await client.query(
    `SELECT COUNT(*) AS cnt, COALESCE(MAX(num_jornada), 0) AS maxj
       FROM partidos WHERE torneo_id = $1`,
    [torneoId]
  );
  const hasExisting = Number(existRes.rows[0].cnt) > 0;
  const currentMaxJornada = Number(existRes.rows[0].maxj) || 0;

  // En todos los casos numeramos jornadas desde 1 de forma determinista.
  // Evitamos continuar desde MAX(num_jornada) para no "inflar" el calendario
  // cuando se añade una segunda vuelta o partidas faltantes.
  let startJornada = 0;
  let creados = 0;
  const jornadaCounts = new Map();

  // Primera vuelta (round-robin clásico) – solo si corresponde
  // Se omite cuando se activa ida_vuelta sin reset y ya existen jornadas.
  const shouldGenerateFirstLeg = reset || (modo === 'solo') || !hasExisting;
  if (shouldGenerateFirstLeg) {
    let list = [...equipos];
    for (let r = 0; r < rounds; r++) {
      const pairs = [];
      for (let i = 0; i < half; i++) {
        const t1 = list[i];
        const t2 = list[n - 1 - i];
        if (t1 === BYE || t2 === BYE) continue; // descanso único por ronda
        // Alternar local/visitante para distribuir
        const home = (r % 2 === 0) ? t1 : t2;
        const away = (r % 2 === 0) ? t2 : t1;
        pairs.push([home, away]);
      }

      // Inserción atómica por jornada
      const numJornada = r + 1;
      for (const [home, away] of pairs.sort(() => Math.random() - 0.5)) {
        if (modo === 'solo') {
          const res = await client.query(
            `INSERT INTO partidos (torneo_id, local_id, visitante_id, num_jornada)
             SELECT $1, $2, $3, $4
             WHERE NOT EXISTS (
               SELECT 1 FROM partidos 
               WHERE torneo_id = $1 
                 AND ((local_id = $2 AND visitante_id = $3) OR (local_id = $3 AND visitante_id = $2))
             )`,
            [torneoId, home, away, numJornada]
          );
          if (res.rowCount > 0) {
            creados += 1;
            jornadaCounts.set(numJornada, (jornadaCounts.get(numJornada) || 0) + 1);
          }
        } else {
          const resIda = await client.query(
            `INSERT INTO partidos (torneo_id, local_id, visitante_id, num_jornada)
             SELECT $1, $2, $3, $4
             WHERE NOT EXISTS (
               SELECT 1 FROM partidos WHERE torneo_id = $1 AND local_id = $2 AND visitante_id = $3
             )`,
            [torneoId, home, away, numJornada]
          );
          if (resIda.rowCount > 0) {
            creados += 1;
            jornadaCounts.set(numJornada, (jornadaCounts.get(numJornada) || 0) + 1);
          }
        }
      }

      // Rotación estilo círculo manteniendo fijo el primer elemento
      const fixed = list[0];
      const rest = list.slice(1);
      list = [fixed, rest.pop(), ...rest];
    }
  }

  // Segunda vuelta (ida_vuelta): invertimos los locales con mismas rondas
  if (modo === 'ida_vuelta') {
    let list2 = [...equipos];
    // Si ya existe la ida, construir un mapa de orientación de la ida por par
    const firstLegMap = new Map();
    if (!reset && hasExisting) {
      const flRes = await client.query(
        `SELECT local_id, visitante_id
           FROM partidos
          WHERE torneo_id = $1 AND num_jornada <= $2`,
        [torneoId, rounds]
      );
      for (const row of flRes.rows) {
        const a = Math.min(row.local_id, row.visitante_id);
        const b = Math.max(row.local_id, row.visitante_id);
        // Guardar quién fue local en la ida
        firstLegMap.set(`${a}-${b}`, row.local_id);
      }
    }

    const baseSecond = (!reset && hasExisting) ? currentMaxJornada : rounds;
    for (let r = 0; r < rounds; r++) {
      const numJornada = baseSecond + r + 1;
      const pairs = [];
      for (let i = 0; i < half; i++) {
        const t1 = list2[i];
        const t2 = list2[n - 1 - i];
        if (t1 === BYE || t2 === BYE) continue;
        let home, away;
        if (!reset && hasExisting) {
          const a = Math.min(t1, t2);
          const b = Math.max(t1, t2);
          const firstHome = firstLegMap.get(`${a}-${b}`);
          if (firstHome) {
            // Invertir respecto a la ida existente
            home = (firstHome === t1) ? t2 : t1;
            away = (home === t1) ? t2 : t1;
          } else {
            // Fallback al patrón por paridad
            home = (r % 2 === 0) ? t2 : t1;
            away = (r % 2 === 0) ? t1 : t2;
          }
        } else {
          // Generación desde cero
          home = (r % 2 === 0) ? t2 : t1; // invertimos
          away = (r % 2 === 0) ? t1 : t2;
        }
        pairs.push([home, away]);
      }
      for (const [home, away] of pairs.sort(() => Math.random() - 0.5)) {
        const res = await client.query(
          `INSERT INTO partidos (torneo_id, local_id, visitante_id, num_jornada)
           SELECT $1, $2, $3, $4
           WHERE NOT EXISTS (
             SELECT 1 FROM partidos WHERE torneo_id = $1 AND local_id = $2 AND visitante_id = $3
           )
           AND (
             SELECT COUNT(*) FROM partidos 
              WHERE torneo_id = $1 
                AND LEAST(local_id, visitante_id) = LEAST($2, $3)
                AND GREATEST(local_id, visitante_id) = GREATEST($2, $3)
           ) < 2`,
          [torneoId, home, away, numJornada]
        );
        if (res.rowCount > 0) {
          creados += 1;
          jornadaCounts.set(numJornada, (jornadaCounts.get(numJornada) || 0) + 1);
        }
      }
      const fixed = list2[0];
      const rest = list2.slice(1);
      list2 = [fixed, rest.pop(), ...rest];
    }

    // Compactación de segunda vuelta: redistribuir en jornadas (rounds) consecutivas
    // Sólo si existen jornadas de segunda vuelta dispersas y no hay partidos bloqueados
    const bloqueados = await client.query(
      `SELECT COUNT(*) AS cnt
         FROM partidos
        WHERE torneo_id = $1 AND num_jornada > $2
          AND (
                fecha_partido IS NOT NULL OR
                hora_partido IS NOT NULL OR
                resultado_local IS NOT NULL OR
                resultado_visitante IS NOT NULL
              )`,
      [torneoId, rounds]
    );
    if (Number(bloqueados.rows[0].cnt) === 0) {
      const secRes = await client.query(
        `SELECT id, local_id, visitante_id, num_jornada
           FROM partidos
          WHERE torneo_id = $1 AND num_jornada > $2
          ORDER BY id`,
        [torneoId, rounds]
      );
      if (secRes.rowCount > 0) {
        // Mapa de partidos de segunda vuelta por par (sin importar orientación)
        const secMap = new Map(); // key: "min-max" -> { id, local_id, visitante_id }
        for (const row of secRes.rows) {
          const a = Math.min(row.local_id, row.visitante_id);
          const b = Math.max(row.local_id, row.visitante_id);
          secMap.set(`${a}-${b}`, row);
        }

        // Construir emparejamientos esperados por jornada usando círculo clásico
        let circle = [...equipos];
        const jornadasPairs = [];
        for (let r = 0; r < rounds; r++) {
          const pairsR = [];
          for (let i = 0; i < half; i++) {
            const t1 = circle[i];
            const t2 = circle[n - 1 - i];
            if (t1 === BYE || t2 === BYE) continue;
            const a = Math.min(t1, t2);
            const b = Math.max(t1, t2);
            pairsR.push([a, b]);
          }
          jornadasPairs.push(pairsR);
          const fixed = circle[0];
          const rest = circle.slice(1);
          circle = [fixed, rest.pop(), ...rest];
        }

        // Reasignar num_jornada para que la segunda vuelta ocupe jornadas rounds+1 .. rounds*2
        const baseSecondCompact = rounds; // ejemplo: 9 -> jornadas 10..18
        for (let r = 0; r < rounds; r++) {
          const targetJornada = baseSecondCompact + r + 1;
          for (const [a, b] of jornadasPairs[r]) {
            const key = `${a}-${b}`;
            const match = secMap.get(key);
            if (!match) continue; // si no existe, ya quedó manejado antes
            if (Number(match.num_jornada) === targetJornada) continue;
            await client.query(
              `UPDATE partidos SET num_jornada = $1 WHERE id = $2`,
              [targetJornada, match.id]
            );
          }
        }
      }
    }
  }

  // Métricas post-generación (considerando simetría para 'solo')
  const countSoloRes = await client.query(
    `SELECT COUNT(*) AS cnt FROM (
       SELECT LEAST(local_id, visitante_id) AS a, GREATEST(local_id, visitante_id) AS b
       FROM partidos WHERE torneo_id = $1
       GROUP BY a, b
     ) x`,
    [torneoId]
  );
  const uniqueSoloPairs = Number(countSoloRes.rows[0].cnt) || 0;
  const dupSoloRes = await client.query(
    `SELECT COUNT(*) AS dup_cnt FROM (
       SELECT LEAST(local_id, visitante_id) AS a, GREATEST(local_id, visitante_id) AS b, COUNT(*) AS c
       FROM partidos WHERE torneo_id = $1
       GROUP BY a, b
       HAVING COUNT(*) > $2
     ) d`,
    [torneoId, (modo === 'ida_vuelta') ? 2 : 1]
  );
  const duplicates = Number(dupSoloRes.rows[0].dup_cnt) || 0;

  const logicalTeams = isOdd ? (n - 1) : n;
  const expected = modo === 'ida_vuelta' ? logicalTeams * (logicalTeams - 1) : Math.floor(logicalTeams * (logicalTeams - 1) / 2);
  const jornadas = Array.from(jornadaCounts.entries())
    .sort((a,b) => a[0]-b[0])
    .map(([j,c]) => ({ num_jornada: j, partidos: c }));

  await client.query('COMMIT');
  return { creados, equipos: logicalTeams, modo, expected, unique_pairs: uniqueSoloPairs, duplicates, jornadas };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}