// db.js
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // obligatorio para Supabase
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
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
