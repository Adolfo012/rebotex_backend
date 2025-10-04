// db.js - Configuración de la conexión a PostgreSQL
import pkg from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const { Pool } = pkg;

// Configuración del pool de conexiones
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'rebotex_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'your_password_here',
  max: 20, // Máximo número de conexiones en el pool
  idleTimeoutMillis: 30000, // Tiempo de espera antes de cerrar conexiones inactivas
  connectionTimeoutMillis: 2000, // Tiempo de espera para establecer conexión
});

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