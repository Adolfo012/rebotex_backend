// Full sequence: reset to solo, generate first leg, toggle ida_vuelta, generate second leg
import pool from "../db.js";
import { generarPartidosParaTorneo } from "../lib/scheduler.js";

const torneoId = Number(process.argv[2] || 1);

async function countAndByJornada() {
  const total = await pool.query('SELECT COUNT(*) AS c FROM partidos WHERE torneo_id = $1', [torneoId]);
  const byJ = await pool.query(
    'SELECT num_jornada, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY num_jornada ORDER BY num_jornada',
    [torneoId]
  );
  return { total: Number(total.rows[0].c || 0), byJ: byJ.rows };
}

async function main() {
  try {
    console.log(`Torneo=${torneoId} :: Reset -> Solo ida -> Activar ida_vuelta`);
    // Reset partidos
    await pool.query('DELETE FROM partidos WHERE torneo_id = $1', [torneoId]);
    // Set modo a 'solo'
    await pool.query('UPDATE torneo SET modo_partidos = $1 WHERE id = $2', ['solo', torneoId]);

    // Generar primera vuelta (reset=true)
    const resIda = await generarPartidosParaTorneo(torneoId, { reset: true });
    console.log('GEN_IDA=', JSON.stringify(resIda));

    let stats = await countAndByJornada();
    console.log('AFTER_IDA_COUNT=', stats.total);
    console.log('AFTER_IDA_BY_JORNADA=', JSON.stringify(stats.byJ));

    // Activar ida_vuelta
    await pool.query('UPDATE torneo SET modo_partidos = $1 WHERE id = $2', ['ida_vuelta', torneoId]);
    const resVuelta = await generarPartidosParaTorneo(torneoId, { reset: false });
    console.log('GEN_VUELTA=', JSON.stringify(resVuelta));

    stats = await countAndByJornada();
    console.log('AFTER_VUELTA_COUNT=', stats.total);
    console.log('AFTER_VUELTA_BY_JORNADA=', JSON.stringify(stats.byJ));
  } catch (e) {
    console.error('Sequence error:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();