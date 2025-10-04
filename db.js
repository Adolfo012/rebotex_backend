// db.js - Conexión a PostgreSQL (Supabase) lista para Render
import pkg from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const { Pool } = pkg;

// Configuración del pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: { rejectUnauthorized: false }, // obligatorio para Supabase
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Manejo de errores global
pool.on('error', (err) => {
  console.error('❌ Error inesperado en el cliente de la base de datos:', err);
  process.exit(-1);
});

// Función para probar la conexión
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a Supabase establecida correctamente');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Error al conectar con Supabase:', err.message);
    throw err;
  }
};

export default pool;
