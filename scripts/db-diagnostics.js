// Simple diagnostic to inspect partidos distribution and pair counts for a torneo
import pool from "../db.js";

const torneoId = Number(process.argv[2] || 1);

async function main() {
  try {
    console.log(`TorneoId=${torneoId}`);
    const total = await pool.query(
      'SELECT COUNT(*) AS c FROM partidos WHERE torneo_id = $1',
      [torneoId]
    );
    console.log('TOTAL=', total.rows[0].c);

    const byJ = await pool.query(
      'SELECT num_jornada, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY num_jornada ORDER BY num_jornada',
      [torneoId]
    );
    console.log('BY_JORNADA=', JSON.stringify(byJ.rows));

    const pairs = await pool.query(
      'SELECT LEAST(local_id, visitante_id) AS a, GREATEST(local_id, visitante_id) AS b, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY a,b ORDER BY c DESC, a, b',
      [torneoId]
    );
    console.log('PAIRS_COUNTS_SAMPLE=', JSON.stringify(pairs.rows.slice(0, 20)));

    const cnt1 = await pool.query(
      'SELECT COUNT(*) AS one_cnt FROM (SELECT LEAST(local_id,visitante_id) AS a, GREATEST(local_id,visitante_id) AS b, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY a,b HAVING COUNT(*)=1) t',
      [torneoId]
    );
    const cnt2 = await pool.query(
      'SELECT COUNT(*) AS two_cnt FROM (SELECT LEAST(local_id,visitante_id) AS a, GREATEST(local_id,visitante_id) AS b, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY a,b HAVING COUNT(*)=2) t',
      [torneoId]
    );
    const cntgt2 = await pool.query(
      'SELECT COUNT(*) AS gt2_cnt FROM (SELECT LEAST(local_id,visitante_id) AS a, GREATEST(local_id,visitante_id) AS b, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY a,b HAVING COUNT(*)>2) t',
      [torneoId]
    );
    console.log('PAIRS_WITH_1=', cnt1.rows[0].one_cnt);
    console.log('PAIRS_WITH_2=', cnt2.rows[0].two_cnt);
    console.log('PAIRS_WITH_GT2=', cntgt2.rows[0].gt2_cnt);

    // Detect if any pairs already have both orientations
    const bothOrientations = await pool.query(
      'SELECT a, b FROM (SELECT LEAST(local_id,visitante_id) AS a, GREATEST(local_id,visitante_id) AS b, COUNT(*) AS c FROM partidos WHERE torneo_id=$1 GROUP BY a,b) x WHERE c = 2',
      [torneoId]
    );
    console.log('PAIRS_WITH_BOTH_ORIENTATIONS_COUNT=', bothOrientations.rowCount);

  } catch (e) {
    console.error('Diagnostic error:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();