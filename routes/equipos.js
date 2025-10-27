// routes/equipos.js - Rutas de equipos
import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import { generarPartidosParaTorneo } from "../lib/scheduler.js";

const router = express.Router();

// Generador de UID de 12 dígitos para equipos (100000000000 - 999999999999)
function generarUID12() {
  const min = 100000000000; // 12 dígitos
  const max = 999999999999; // 12 dígitos
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// === Obtener equipos de un torneo ===
router.get("/", async (req, res) => {
  try {
    const { torneo } = req.query;
    
    if (!torneo) {
      return res.status(400).json({ error: "ID del torneo es requerido" });
    }
    
    console.log(`🔍 Obteniendo equipos para el torneo: ${torneo}`);
    
    const result = await pool.query(
      `SELECT 
          e.*, 
          te.estado, 
          te.fecha_registro,
          u.nombre as capitan_nombre, 
          u.apellidop as capitan_apellido,
          (
            SELECT COUNT(*) 
            FROM jugadores j 
            WHERE j.equipo_id = e.id
          ) AS jugadores
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

// === Obtener todos los equipos creados por un usuario (público) ===
router.get("/usuario/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "ID de usuario es requerido" });
    }

    console.log(`🔍 Obteniendo equipos creados por el usuario: ${userId}`);

    const result = await pool.query(
      `SELECT 
          e.id, e.nombre, e.deporte, e.creador_id, e.equipo_uid,
          u.nombre AS capitan_nombre, u.apellidop AS capitan_apellido,
          (
            SELECT COUNT(*) FROM jugadores j WHERE j.equipo_id = e.id
          ) AS jugadores_count,
          (
            SELECT COUNT(*) FROM torneo_equipos te 
            WHERE te.equipo_id = e.id AND te.estado = 'aceptado'
          ) AS torneos_count
       FROM equipos e
       JOIN usuarios u ON e.creador_id = u.id
       WHERE e.creador_id = $1
       ORDER BY e.nombre`,
      [userId]
    );

    console.log(`✅ Encontrados ${result.rows.length} equipos del usuario`);

    res.json({
      message: "Equipos del usuario obtenidos exitosamente",
      equipos: result.rows
    });
  } catch (error) {
    console.error("❌ Error al obtener equipos del usuario:", error);
    res.status(500).json({ 
      error: "Error interno del servidor al obtener equipos del usuario",
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

    // Generar equipo_uid único (con reintentos por posibles colisiones)
    let equipo_uid;
    const maxIntentos = 10;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      const candidato = generarUID12();
      const existe = await pool.query(
        "SELECT 1 FROM equipos WHERE equipo_uid = $1 LIMIT 1",
        [candidato]
      );
      if (existe.rows.length === 0) {
        equipo_uid = candidato;
        break;
      } else {
        console.warn(`⚠️ UID de equipo repetido (${candidato}), reintentando (${intento}/${maxIntentos})`);
      }
    }

    if (!equipo_uid) {
      return res.status(500).json({
        error: "No se pudo generar un UID único para el equipo"
      });
    }

    // Insertar equipo en la base de datos
    // Nota: algunos esquemas no tienen la columna "loaddt"; para evitar errores 500,
    // retornamos solo columnas garantizadas.
    const result = await pool.query(
      `INSERT INTO equipos 
        (nombre, deporte, creador_id, equipo_uid)
      VALUES ($1, $2, $3, $4) 
      RETURNING id, nombre, deporte, creador_id, equipo_uid`,
      [
        nombre, 
        deporte || 'Baloncesto', 
        creador_id,
        equipo_uid
      ]
    );

    const nuevoEquipo = result.rows[0];

    console.log(`✅ Equipo creado exitosamente: ${nombre} (ID: ${nuevoEquipo.id}, UID: ${nuevoEquipo.equipo_uid})`);

    res.status(201).json({
      message: "Equipo creado exitosamente",
      equipo: nuevoEquipo
    });

  } catch (error) {
    console.error("❌ Error al crear equipo:", error);
    const message = error?.message || 'Error interno del servidor al crear el equipo';
    // Si el esquema no tiene la columna esperada u otra violación común
    if (message.includes('column') || message.includes('violates')) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ 
      error: "Error interno del servidor al crear el equipo",
      detail: message 
    });
  }
});

// === Actualizar equipo (solo creador/capitán) ===
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const userId = req.user.id;

    if (!nombre || String(nombre).trim().length === 0) {
      return res.status(400).json({ error: 'El nombre del equipo es obligatorio' });
    }

    // Verificar que el equipo existe y que el usuario es el creador
    const equipoRes = await pool.query(
      'SELECT id, creador_id FROM equipos WHERE id = $1',
      [id]
    );
    if (equipoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    if (String(equipoRes.rows[0].creador_id) !== String(userId)) {
      return res.status(403).json({ error: 'No autorizado para editar este equipo' });
    }

    // Evitar duplicados de nombre por el mismo creador
    const dupRes = await pool.query(
      'SELECT id FROM equipos WHERE nombre = $1 AND creador_id = $2 AND id <> $3',
      [nombre.trim(), userId, id]
    );
    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'Ya tienes otro equipo con ese nombre' });
    }

    const upd = await pool.query(
      'UPDATE equipos SET nombre = $1 WHERE id = $2 RETURNING id, nombre, deporte, creador_id, equipo_uid',
      [nombre.trim(), id]
    );

    res.json({ message: 'Equipo actualizado', equipo: upd.rows[0] });
  } catch (error) {
    console.error('❌ Error al actualizar equipo:', error);
    const message = error?.message || 'Error interno al actualizar equipo';
    res.status(500).json({ error: 'Error interno al actualizar equipo', detail: message });
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

    // Reprogramar automáticamente el calendario completo para reflejar la nueva composición del torneo
    try {
      const torneoId = torneo_id;
      await generarPartidosParaTorneo(torneoId, { reset: true });
    } catch (genErr) {
      console.warn('⚠️ Fallo al reprogramar partidos tras inscripción:', genErr?.message || genErr);
    }

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

// === Obtener información de un equipo por ID (público) ===
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT e.id, e.nombre, e.deporte, e.creador_id, e.equipo_uid,
              u.nombre AS capitan_nombre, u.apellidop AS capitan_apellido
         FROM equipos e
         JOIN usuarios u ON e.creador_id = u.id
        WHERE e.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    res.json({ message: "Equipo obtenido", equipo: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al obtener equipo:", error);
    res.status(500).json({ error: "Error interno al obtener equipo", detail: error.message });
  }
});

// === Listar torneos en los que participa un equipo (público) ===
router.get("/:id/torneos", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT t.id, t.nombre, t.modalidad, t.fecha_inicio, t.fecha_fin, t.torneo_uid,
              te.estado, te.fecha_registro,
              u.nombre AS organizador_nombre
         FROM torneo_equipos te
         JOIN torneo t ON te.torneo_id = t.id
         JOIN usuarios u ON t.organizador_id = u.id
        WHERE te.equipo_id = $1 AND te.estado = 'aceptado'
        ORDER BY t.fecha_inicio DESC NULLS LAST, t.id DESC`,
      [id]
    );
    res.json({ message: "Torneos del equipo obtenidos", torneos: result.rows });
  } catch (error) {
    console.error("❌ Error al listar torneos del equipo:", error);
    res.status(500).json({ error: "Error interno al listar torneos del equipo", detail: error.message });
  }
});

// === Listar jugadores de un equipo (público) ===
router.get("/:id/jugadores", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT j.id, j.nombre, j.equipo_id, j.loaddt
         FROM jugadores j
        WHERE j.equipo_id = $1
        ORDER BY j.id DESC`,
      [id]
    );
    res.json({ message: "Jugadores obtenidos", jugadores: result.rows });
  } catch (error) {
    console.error("❌ Error al listar jugadores:", error);
    res.status(500).json({ error: "Error interno al listar jugadores", detail: error.message });
  }
});

// === Agregar jugador al equipo (solo creador/capitán) ===
router.post("/:id/jugadores", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params; // equipo_id
    const { nombre } = req.body;
    const userId = req.user.id;

    if (!nombre || String(nombre).trim().length === 0) {
      return res.status(400).json({ error: "El nombre del jugador es obligatorio" });
    }

    // Verificar permisos: solo el creador del equipo puede agregar jugadores
    const equipoRes = await pool.query("SELECT id, creador_id FROM equipos WHERE id = $1", [id]);
    if (equipoRes.rows.length === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    if (String(equipoRes.rows[0].creador_id) !== String(userId)) {
      return res.status(403).json({ error: "No autorizado para agregar jugadores a este equipo" });
    }

    const insert = await pool.query(
      `INSERT INTO jugadores (equipo_id, nombre) VALUES ($1, $2) RETURNING id, equipo_id, nombre, loaddt`,
      [id, nombre.trim()]
    );

    res.status(201).json({ message: "Jugador agregado", jugador: insert.rows[0] });
  } catch (error) {
    console.error("❌ Error al agregar jugador:", error);
    const message = error?.message || "Error interno al agregar jugador";
    if (message.includes("relation") || message.includes("column")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: "Error interno al agregar jugador", detail: message });
  }
});

// === Eliminar jugador del equipo (solo creador/capitán) ===
router.delete("/:id/jugadores/:jugadorId", authenticateToken, async (req, res) => {
  try {
    const { id, jugadorId } = req.params; // equipo_id y jugador id
    const userId = req.user.id;

    // Verificar permisos: solo el creador del equipo puede eliminar jugadores
    const equipoRes = await pool.query("SELECT id, creador_id FROM equipos WHERE id = $1", [id]);
    if (equipoRes.rows.length === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    if (String(equipoRes.rows[0].creador_id) !== String(userId)) {
      return res.status(403).json({ error: "No autorizado para eliminar jugadores de este equipo" });
    }

    // Verificar que el jugador pertenece al equipo
    const jugadorRes = await pool.query("SELECT id FROM jugadores WHERE id = $1 AND equipo_id = $2", [jugadorId, id]);
    if (jugadorRes.rows.length === 0) {
      return res.status(404).json({ error: "Jugador no encontrado en este equipo" });
    }

    await pool.query("DELETE FROM jugadores WHERE id = $1", [jugadorId]);
    res.json({ message: "Jugador eliminado" });
  } catch (error) {
    console.error("❌ Error al eliminar jugador:", error);
    const message = error?.message || "Error interno al eliminar jugador";
    res.status(500).json({ error: "Error interno al eliminar jugador", detail: message });
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

// === Eliminar equipo (solo creador/capitán) ===
router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verificar equipo y permisos
    const eRes = await client.query('SELECT id, creador_id FROM equipos WHERE id = $1', [id]);
    if (eRes.rows.length === 0) return res.status(404).json({ error: 'Equipo no encontrado' });
    const equipo = eRes.rows[0];
    if (String(equipo.creador_id) !== String(userId)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este equipo' });
    }

    // Bloquear si tiene partidos programados (fecha y hora asignadas)
    const pRes = await client.query(
      `SELECT COUNT(*) AS cnt
         FROM partidos p
        WHERE (p.local_id = $1 OR p.visitante_id = $1)
          AND p.fecha_partido IS NOT NULL
          AND p.hora_partido IS NOT NULL`,
      [id]
    );
    const cnt = Number(pRes.rows[0].cnt || 0);
    if (cnt > 0) {
      return res.status(409).json({
        error: 'El equipo se encuentra actualmente con partidos pendientes, no puede ser eliminado',
        matches: cnt
      });
    }

    await client.query('BEGIN');

    // Eliminar partidos (no programados) del equipo para mantener integridad
    await client.query('DELETE FROM partido_jugadores WHERE partido_id IN (SELECT id FROM partidos WHERE local_id = $1 OR visitante_id = $1)', [id]);
    await client.query('DELETE FROM partidos WHERE local_id = $1 OR visitante_id = $1', [id]);

    // Eliminar inscripciones a torneos y jugadores del equipo
    await client.query('DELETE FROM torneo_equipos WHERE equipo_id = $1', [id]);
    await client.query('DELETE FROM jugadores WHERE equipo_id = $1', [id]);

    // Eliminar equipo
    await client.query('DELETE FROM equipos WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ message: 'Equipo eliminado exitosamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al eliminar equipo:', error);
    res.status(500).json({ error: 'Error interno al eliminar equipo', detail: error.message });
  } finally {
    client.release();
  }
});

export default router;