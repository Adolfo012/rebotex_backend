// Script de migración: crear tabla torneo_jugadores si no existe
import pool from "./db.js";

async function migrate() {
  try {
    console.log("🔧 Creando tabla torneo_jugadores si no existe...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS torneo_jugadores (
        id SERIAL PRIMARY KEY,
        torneo_id INT NOT NULL,
        jugador_id INT NOT NULL,
        equipo_id INT NOT NULL,
        puntos_triple INT DEFAULT 0,
        puntos_doble INT DEFAULT 0,
        tiros_libre INT DEFAULT 0,
        total_puntos INT GENERATED ALWAYS AS (puntos_triple*3 + puntos_doble*2 + tiros_libre) STORED,
        loaddt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tj_torneo FOREIGN KEY (torneo_id) REFERENCES torneo(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_tj_jugador FOREIGN KEY (jugador_id) REFERENCES jugadores(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_tj_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT uq_tj UNIQUE (torneo_id, jugador_id)
      );
    `);
    console.log("✅ Tabla torneo_jugadores verificada/creada");
  } catch (error) {
    console.error("❌ Error en migración de torneo_jugadores:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();