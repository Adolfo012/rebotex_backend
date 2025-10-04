// create-teams-simple.js - Script simple para crear equipos
import pool from "./db.js";

async function createTeams() {
  console.log("🏀 Creando equipos de ejemplo...");
  
  try {
    // Obtener un usuario existente
    const userResult = await pool.query("SELECT id FROM usuarios LIMIT 1");
    let userId;
    
    if (userResult.rows.length === 0) {
      console.log("Creando usuario de ejemplo...");
      const newUser = await pool.query(
        "INSERT INTO usuarios (nombre, apellidop, correo, password) VALUES ($1, $2, $3, $4) RETURNING id",
        ["Capitán", "Ejemplo", "capitan@ejemplo.com", "password123"]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }
    
    console.log(`Usuario ID: ${userId}`);
    
    // Crear equipos
    const teams = [
      { nombre: "Los Rebotadores", deporte: "Baloncesto" },
      { nombre: "Thunder Ballers", deporte: "Baloncesto" },
      { nombre: "Águilas Doradas", deporte: "Baloncesto" },
      { nombre: "Lobos Grises", deporte: "Baloncesto" },
      { nombre: "Dragones Rojos", deporte: "Baloncesto" },
      { nombre: "Titanes del Norte", deporte: "Baloncesto" }
    ];
    
    for (const team of teams) {
      // Verificar si el equipo ya existe
      const existing = await pool.query(
        "SELECT id FROM equipos WHERE nombre = $1",
        [team.nombre]
      );
      
      if (existing.rows.length > 0) {
        console.log(`⚠️  El equipo "${team.nombre}" ya existe, saltando...`);
        continue;
      }
      
      const result = await pool.query(
        "INSERT INTO equipos (nombre, deporte, creador_id) VALUES ($1, $2, $3) RETURNING id, nombre",
        [team.nombre, team.deporte, userId]
      );
      console.log(`✅ Equipo creado: ${result.rows[0].nombre} (ID: ${result.rows[0].id})`);
    }
    
    // Obtener torneo existente
    const torneoResult = await pool.query("SELECT id, nombre FROM torneo LIMIT 1");
    if (torneoResult.rows.length > 0) {
      const torneoId = torneoResult.rows[0].id;
      console.log(`\nAsociando equipos al torneo: ${torneoResult.rows[0].nombre}`);
      
      // Obtener equipos creados
      const equiposResult = await pool.query(
        "SELECT id, nombre FROM equipos WHERE creador_id = $1",
        [userId]
      );
      
      for (const equipo of equiposResult.rows) {
        // Verificar si ya está asociado
        const existing = await pool.query(
          "SELECT id FROM torneo_equipos WHERE equipo_id = $1 AND torneo_id = $2",
          [equipo.id, torneoId]
        );
        
        if (existing.rows.length > 0) {
          console.log(`⚠️  El equipo "${equipo.nombre}" ya está asociado al torneo`);
          continue;
        }
        
        await pool.query(
          "INSERT INTO torneo_equipos (equipo_id, torneo_id, estado, fecha_registro) VALUES ($1, $2, 'aceptado', NOW())",
          [equipo.id, torneoId]
        );
        console.log(`✅ Equipo ${equipo.nombre} asociado al torneo`);
      }
    }
    
    console.log("\n🎉 ¡Equipos creados exitosamente!");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
  }
}

createTeams();