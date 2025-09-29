// check-users.js - Script para verificar usuarios en la base de datos
import pool from './db.js';

async function checkUsers() {
  try {
    console.log("🔍 Verificando usuarios en la base de datos...");
    
    const result = await pool.query('SELECT id, nombre, apellidop, correo, genero, fecha_nacimiento FROM usuarios ORDER BY id');
    
    console.log(`📊 Total de usuarios encontrados: ${result.rows.length}`);
    console.log("\n👥 Lista de usuarios:");
    console.log("=" .repeat(80));
    
    if (result.rows.length === 0) {
      console.log("❌ No se encontraron usuarios en la base de datos");
    } else {
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.id}`);
        console.log(`   Nombre: ${user.nombre} ${user.apellidop}`);
        console.log(`   Email: ${user.correo}`);
        console.log(`   Género: ${user.genero || 'No especificado'}`);
        console.log(`   Fecha nacimiento: ${user.fecha_nacimiento || 'No especificada'}`);
        console.log("-".repeat(40));
      });
    }
    
    // Verificar también torneos
    console.log("\n🏆 Verificando torneos...");
    const torneosResult = await pool.query(`
      SELECT t.id, t.nombre, t.fecha_inicio, u.nombre as organizador_nombre, u.correo as organizador_correo
      FROM torneo t 
      JOIN usuarios u ON t.organizador_id = u.id 
      ORDER BY t.id
    `);
    
    console.log(`📊 Total de torneos encontrados: ${torneosResult.rows.length}`);
    
    if (torneosResult.rows.length > 0) {
      console.log("\n🏆 Lista de torneos:");
      console.log("=" .repeat(80));
      torneosResult.rows.forEach((torneo, index) => {
        console.log(`${index + 1}. ID: ${torneo.id}`);
        console.log(`   Nombre: ${torneo.nombre}`);
        console.log(`   Fecha inicio: ${torneo.fecha_inicio}`);
        console.log(`   Organizador: ${torneo.organizador_nombre} (${torneo.organizador_correo})`);
        console.log("-".repeat(40));
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al verificar usuarios:', error);
    process.exit(1);
  }
}

checkUsers();