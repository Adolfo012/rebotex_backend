// Simple migration script to add 'origen' column to torneo_equipos
// Run with: node backend/migrate-origen-torneo-equipos.js
import pool from "./db.js";

async function ensureOrigenColumn() {
  try {
    console.log("🔧 Iniciando migración de columna 'origen' en torneo_equipos…");

    // Verificar si la columna existe
    const colRes = await pool.query(
      `SELECT 1 FROM information_schema.columns 
       WHERE table_name = 'torneo_equipos' AND column_name = 'origen'`
    );

    if (colRes.rows.length === 0) {
      console.log("➕ Agregando columna 'origen'…");
      await pool.query(`ALTER TABLE torneo_equipos ADD COLUMN origen TEXT`);
    } else {
      console.log("✅ La columna 'origen' ya existe");
    }

    // Establecer DEFAULT
    console.log("⚙️  Configurando DEFAULT 'invitacion'…");
    await pool.query(`ALTER TABLE torneo_equipos ALTER COLUMN origen SET DEFAULT 'invitacion'`);

    // Rellenar valores nulos
    console.log("🧹 Rellenando valores nulos con 'invitacion'…");
    await pool.query(`UPDATE torneo_equipos SET origen = 'invitacion' WHERE origen IS NULL`);

    // Agregar CHECK si no existe
    const chkRes = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'torneo_equipos_origen_chk'`
    );
    if (chkRes.rows.length === 0) {
      console.log("🔒 Agregando constraint CHECK de 'origen'…");
      await pool.query(
        `ALTER TABLE torneo_equipos 
         ADD CONSTRAINT torneo_equipos_origen_chk 
         CHECK (origen IN ('invitacion','solicitud'))`
      );
    } else {
      console.log("✅ Constraint CHECK ya existe");
    }

    console.log("🎉 Migración completada");
  } catch (err) {
    console.error("❌ Error en migración de 'origen':", err);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

ensureOrigenColumn();