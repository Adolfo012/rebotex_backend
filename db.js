// db.js - Configuración de la conexión a PostgreSQL
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

// Usar connectionString si quieres, con SSL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false, // Necesario para Supabase
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el cliente de la base de datos:', err);
  process.exit(-1);
});

export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a la base de datos establecida correctamente');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    return false;
  }
};

export default pool;
