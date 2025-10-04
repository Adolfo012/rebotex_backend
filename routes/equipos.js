// routes/equipos.js - Rutas de equipos
import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// === Obtener equipos de un torneo ===
router.get("/", async (req, res) => {
  try {
    const { torneo } = req.query;
    
    if (!torneo) {
      return res.status(400).json({ error: "ID del torneo es requerido" });
    }
    
    console.log(`🔍 Obteniendo equipos para el torneo: ${torneo}`);
    
    const result = await pool.query(
      `SELECT e.*, te.estado, te.fecha_registro,
              u.nombre as capitan_nombre, u.apellidop as capitan_apellido
       FROM equipos e 
       JOIN torneo_equipos te ON e.id = te.equipo_id
       JOIN usuarios u ON e.creador_id = u.id
       WHERE te.torneo_id = $1 AND te.estado = 'aceptado'
       ORDER BY e.nombre`,
      [torneo]
    );

    console.log(`✅ Encontrados ${result.rows.length} equipos en el torneo`);

    res.json({
      message: "Equipos obtenidos exitosamente",
      equipos: result.rows
    });

  } catch (error) {
    console.error("❌ Error al obtener equipos:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al obtener equipos",
      detail: error.message 
    });
  }
});

// === Crear equipo ===
router.post("/create", authenticateToken, async (req, res) => {
  try {
    console.log("👥 Petición de creación de equipo recibida");
    console.log("👤 Usuario autenticado:", req.user);
    console.log("📋 Datos del equipo:", req.body);

    const { nombre, deporte } = req.body;
    
    // Obtener el ID del creador desde el token JWT
    const creador_id = req.user.id;

    // Validaciones básicas
    if (!nombre) {
      return res.status(400).json({ 
        error: "El nombre del equipo es obligatorio" 
      });
    }

    // Verificar que no exista un equipo con el mismo nombre del mismo creador
    const equipoExistente = await pool.query(
      "SELECT id FROM equipos WHERE nombre = $1 AND creador_id = $2",
      [nombre, creador_id]
    );

    if (equipoExistente.rows.length > 0) {
      return res.status(400).json({ 
        error: "Ya tienes un equipo con ese nombre" 
      });
    }

    // Insertar equipo en la base de datos
    const result = await pool.query(
      `INSERT INTO equipos 
        (nombre, deporte, creador_id)
      VALUES ($1, $2, $3) 
      RETURNING id, nombre, deporte, creador_id, loaddt`,
      [
        nombre, 
        deporte || 'Baloncesto', 
        creador_id
      ]
    );

    const nuevoEquipo = result.rows[0];

    console.log(`✅ Equipo creado exitosamente: ${nombre} (ID: ${nuevoEquipo.id})`);

    res.status(201).json({
      message: "Equipo creado exitosamente",
      equipo: nuevoEquipo
    });

  } catch (error) {
    console.error("❌ Error al crear equipo:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al crear el equipo",
      detail: error.message 
    });
  }
});

// === Inscribir equipo a torneo ===
router.post("/inscribir", authenticateToken, async (req, res) => {
  try {
    console.log("📝 Petición de inscripción de equipo recibida");
    
    const { equipo_id, torneo_id } = req.body;
    const usuario_id = req.user.id;

    // Validaciones básicas
    if (!equipo_id || !torneo_id) {
      return res.status(400).json({ 
        error: "ID del equipo y del torneo son obligatorios" 
      });
    }

    // Verificar que el usuario sea el creador del equipo
    const equipoVerificacion = await pool.query(
      "SELECT id FROM equipos WHERE id = $1 AND creador_id = $2",
      [equipo_id, usuario_id]
    );

    if (equipoVerificacion.rows.length === 0) {
      return res.status(403).json({ 
        error: "No tienes permisos para inscribir este equipo" 
      });
    }

    // Verificar que el torneo existe
    const torneoVerificacion = await pool.query(
      "SELECT id FROM torneo WHERE id = $1",
      [torneo_id]
    );

    if (torneoVerificacion.rows.length === 0) {
      return res.status(404).json({ 
        error: "Torneo no encontrado" 
      });
    }

    // Verificar que el equipo no esté ya inscrito
    const inscripcionExistente = await pool.query(
      "SELECT id FROM torneo_equipos WHERE equipo_id = $1 AND torneo_id = $2",
      [equipo_id, torneo_id]
    );

    if (inscripcionExistente.rows.length > 0) {
      return res.status(400).json({ 
        error: "El equipo ya está inscrito en este torneo" 
      });
    }

    // Insertar inscripción
    const result = await pool.query(
      `INSERT INTO torneo_equipos 
        (equipo_id, torneo_id, estado, fecha_registro)
      VALUES ($1, $2, 'aceptado', NOW()) 
      RETURNING *`,
      [equipo_id, torneo_id]
    );

    console.log(`✅ Equipo inscrito exitosamente en el torneo`);

    res.status(201).json({
      message: "Equipo inscrito exitosamente",
      inscripcion: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Error al inscribir equipo:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al inscribir equipo",
      detail: error.message 
    });
  }
});

// Endpoint de prueba
router.get("/test/ping", (req, res) => {
  console.log("🧪 Endpoint de prueba de equipos llamado");
  res.json({ 
    message: "Test endpoint de equipos funcionando", 
    timestamp: new Date().toISOString() 
  });
});

export default router;