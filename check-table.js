import pool from "./db.js";

async function checkTable() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'torneo_equipos'
      ORDER BY ordinal_position
    `);
    
    console.log("Estructura de la tabla 'torneo_equipos':");
    result.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

checkTable();