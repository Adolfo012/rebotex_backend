// routes/torneos.js - Rutas de torneos
import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// === Crear torneo ===
router.post("/create", authenticateToken, async (req, res) => {
  try {
    console.log("🏆 Petición de creación de torneo recibida");
    console.log("👤 Usuario autenticado:", req.user);
    console.log("📋 Datos del torneo:", req.body);

    const { nombre, ubicacion, descripcion, fecha_inicio, fecha_fin, modalidad } = req.body;
    
    // Obtener el ID del organizador desde el token JWT
    const organizador_id = req.user.id;

    // Validaciones básicas
    if (!nombre || !fecha_inicio) {
      return res.status(400).json({ 
        error: "El nombre y la fecha de inicio son obligatorios" 
      });
    }

    // Validar que la fecha de inicio no sea en el pasado
    const fechaInicio = new Date(fecha_inicio);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Resetear horas para comparar solo fechas

    if (fechaInicio < hoy) {
      return res.status(400).json({ 
        error: "La fecha de inicio no puede ser en el pasado" 
      });
    }

    // Validar que la fecha de fin sea posterior a la fecha de inicio (si se proporciona)
    if (fecha_fin) {
      const fechaFin = new Date(fecha_fin);
      if (fechaFin <= fechaInicio) {
        return res.status(400).json({ 
          error: "La fecha de fin debe ser posterior a la fecha de inicio" 
        });
      }
    }

    // Insertar torneo en la base de datos
    const result = await pool.query(
      `INSERT INTO torneo 
        (nombre, ubicacion, descripcion, fecha_inicio, fecha_fin, organizador_id, modalidad)
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id, nombre, ubicacion, descripcion, fecha_inicio, fecha_fin, organizador_id, modalidad, loaddt`,
      [
        nombre, 
        ubicacion || null, 
        descripcion || null, 
        fecha_inicio, 
        fecha_fin || null, 
        organizador_id, 
        modalidad || 'equipos'
      ]
    );

    const nuevoTorneo = result.rows[0];

    console.log(`✅ Torneo creado exitosamente: ${nombre} (ID: ${nuevoTorneo.id})`);

    res.status(201).json({
      message: "Torneo creado exitosamente",
      torneo: nuevoTorneo
    });

  } catch (error) {
    console.error("❌ Error al crear torneo:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al crear el torneo",
      detail: error.message 
    });
  }
});

// === Obtener torneos de un usuario ===
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🔍 Obteniendo torneos para el usuario: ${userId}`);
    
    // Obtener torneos donde el usuario es organizador
    const torneosOrganizados = await pool.query(
      `SELECT t.*, u.nombre as organizador_nombre, 'Organizador' as rol
       FROM torneo t 
       JOIN usuarios u ON t.organizador_id = u.id 
       WHERE t.organizador_id = $1 
       ORDER BY t.fecha_inicio DESC`,
      [userId]
    );

    // Obtener torneos donde el usuario participa como capitán de equipo
    const torneosCapitan = await pool.query(
      `SELECT DISTINCT t.*, 
              u_org.nombre as organizador_nombre,
              e.nombre as equipo_nombre,
              'Capitán' as rol
       FROM torneo t 
       JOIN usuarios u_org ON t.organizador_id = u_org.id
       JOIN torneo_equipos te ON t.id = te.torneo_id
       JOIN equipos e ON te.equipo_id = e.id
       WHERE e.creador_id = $1 AND te.estado = 'aceptado'
       ORDER BY t.fecha_inicio DESC`,
      [userId]
    );

    console.log(`✅ Encontrados ${torneosOrganizados.rows.length} torneos organizados`);
    console.log(`✅ Encontrados ${torneosCapitan.rows.length} torneos como capitán`);

    res.json({
      message: "Torneos obtenidos exitosamente",
      torneos: {
        organizados: torneosOrganizados.rows,
        participando: torneosCapitan.rows
      }
    });

  } catch (error) {
    console.error("❌ Error al obtener torneos del usuario:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al obtener torneos",
      detail: error.message 
    });
  }
});

// === Obtener todos los torneos (públicos) ===
router.get("/", async (req, res) => {
  try {
    console.log("🔍 Obteniendo todos los torneos públicos");
    
    const result = await pool.query(
      `SELECT t.*, u.nombre as organizador_nombre, u.apellidop as organizador_apellido
       FROM torneo t 
       JOIN usuarios u ON t.organizador_id = u.id 
       ORDER BY t.fecha_inicio DESC`
    );

    console.log(`✅ Encontrados ${result.rows.length} torneos públicos`);

    res.json({
      message: "Torneos obtenidos exitosamente",
      torneos: result.rows
    });

  } catch (error) {
    console.error("❌ Error al obtener torneos:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al obtener torneos",
      detail: error.message 
    });
  }
});

// === Obtener torneo por ID ===
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍 Obteniendo torneo con ID: ${id}`);
    
    const result = await pool.query(
      `SELECT t.*, u.nombre as organizador_nombre, u.apellidop as organizador_apellido, u.correo as organizador_correo
       FROM torneo t 
       JOIN usuarios u ON t.organizador_id = u.id 
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Torneo no encontrado" });
    }

    console.log(`✅ Torneo encontrado: ${result.rows[0].nombre}`);

    res.json({
      message: "Torneo obtenido exitosamente",
      torneo: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Error al obtener torneo:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al obtener torneo",
      detail: error.message 
    });
  }
});

// === Obtener equipos aceptados de un torneo (endpoint público) ===
router.get("/:id/equipos", async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 Obteniendo equipos aceptados para el torneo: ${id}`);

    const result = await pool.query(
      `SELECT e.*, te.estado, te.fecha_registro,
              u.nombre as capitan_nombre, u.apellidop as capitan_apellido
       FROM equipos e 
       JOIN torneo_equipos te ON e.id = te.equipo_id
       JOIN usuarios u ON e.creador_id = u.id
       WHERE te.torneo_id = $1 AND te.estado = 'aceptado'
       ORDER BY e.nombre`,
      [id]
    );

    console.log(`✅ Encontrados ${result.rows.length} equipos aceptados`);

    res.json({
      message: "Equipos del torneo obtenidos exitosamente",
      equipos: result.rows
    });
  } catch (error) {
    console.error("❌ Error al obtener equipos del torneo:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al obtener equipos del torneo",
      detail: error.message 
    });
  }
});

// Endpoint de prueba
router.get("/test/ping", (req, res) => {
  console.log("🧪 Endpoint de prueba de torneos llamado");
  res.json({ 
    message: "Test endpoint de torneos funcionando", 
    timestamp: new Date().toISOString() 
  });
});

export default router;