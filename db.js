// db.js - Configuración de la conexión a PostgreSQL
import pkg from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const { Pool } = pkg;

// Permitir conexión via cadena (Supabase) o por variables separadas
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

let poolConfig;
if (connectionString) {
  // Supabase/Postgres gestionado: requiere SSL
  poolConfig = {
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  console.log('🔌 DB: Usando DATABASE_URL/SUPABASE_DB_URL con SSL');
} else {
  // Local Postgres
  const useSSL = String(process.env.DB_SSL || '').toLowerCase() === 'true';
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'rebotex_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'your_password_here',
    ssl: useSSL ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
  console.log(`🔌 DB: Conexión local ${poolConfig.host}:${poolConfig.port} SSL=${useSSL}`);
}

// Configuración del pool de conexiones
const pool = new Pool(poolConfig);

// Evento para manejar errores de conexión
pool.on('error', (err, client) => {
  console.error('Error inesperado en el cliente de la base de datos:', err);
  process.exit(-1);
});

// Función para probar la conexión
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

// Exportar el pool como default
export default pool;