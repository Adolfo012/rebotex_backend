// Prueba
// routes/notificaciones.js - Gestión de notificaciones de invitaciones/solicitudes
import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Helper: obtener notificaciones para el usuario
async function obtenerNotificacionesParaUsuario(userId) {
  // Invitaciones donde el usuario es capitán del equipo (origen: invitacion)
  const invitacionesCapitan = await pool.query(
    `SELECT te.id, te.equipo_id, te.torneo_id, te.estado, te.fecha_registro,
            e.nombre AS equipo_nombre,
            t.nombre AS torneo_nombre,
            t.organizador_id,
            u_org.nombre AS organizador_nombre
       FROM torneo_equipos te
       JOIN equipos e ON te.equipo_id = e.id
       JOIN torneo t ON te.torneo_id = t.id
       JOIN usuarios u_org ON t.organizador_id = u_org.id
      WHERE te.estado = 'pendiente' AND te.origen = 'invitacion' AND e.creador_id = $1
      ORDER BY te.fecha_registro DESC NULLS LAST, te.id DESC`,
    [userId]
  );

  // Solicitudes donde el usuario es organizador del torneo (origen: solicitud)
  const solicitudesOrganizador = await pool.query(
    `SELECT te.id, te.equipo_id, te.torneo_id, te.estado, te.fecha_registro,
            e.nombre AS equipo_nombre,
            t.nombre AS torneo_nombre,
            t.organizador_id,
            u_cap.nombre AS capitan_nombre
       FROM torneo_equipos te
       JOIN equipos e ON te.equipo_id = e.id
       JOIN usuarios u_cap ON e.creador_id = u_cap.id
       JOIN torneo t ON te.torneo_id = t.id
      WHERE te.estado = 'pendiente' AND te.origen = 'solicitud' AND t.organizador_id = $1
      ORDER BY te.fecha_registro DESC NULLS LAST, te.id DESC`,
    [userId]
  );

  return {
    invitaciones_capitan: invitacionesCapitan.rows,
    solicitudes_organizador: solicitudesOrganizador.rows,
  };
}

// === Crear invitación de equipo a torneo (pendiente) ===
router.post("/invitar", authenticateToken, async (req, res) => {
  try {
    const { torneo_id, equipo_id, equipo_uid } = req.body;
    const userId = req.user.id;

    if (!torneo_id || (!equipo_id && !equipo_uid)) {
      return res.status(400).json({ error: "torneo_id y (equipo_id o equipo_uid) son obligatorios" });
    }

    // Verificar torneo y permisos de organizador
    const torneoRes = await pool.query(
      `SELECT id, organizador_id FROM torneo WHERE id = $1`,
      [torneo_id]
    );
    if (torneoRes.rows.length === 0) {
      return res.status(404).json({ error: "Torneo no encontrado" });
    }
    if (torneoRes.rows[0].organizador_id !== userId) {
      return res.status(403).json({ error: "No tienes permisos para invitar equipos a este torneo" });
    }

    // Resolver equipo por ID o UID
    let resolvedEquipoId = equipo_id || null;
    if (!resolvedEquipoId && equipo_uid) {
      const byUid = await pool.query(
        `SELECT id, nombre, creador_id FROM equipos WHERE equipo_uid = $1`,
        [String(equipo_uid)]
      );
      if (byUid.rows.length === 0) {
        return res.status(404).json({ error: "Equipo no encontrado por UID" });
      }
      resolvedEquipoId = byUid.rows[0].id;
    }
    // Verificar equipo existe si llegó por ID
    if (resolvedEquipoId && equipo_id) {
      const equipoRes = await pool.query(
        `SELECT id, nombre, creador_id FROM equipos WHERE id = $1`,
        [equipo_id]
      );
      if (equipoRes.rows.length === 0) {
        return res.status(404).json({ error: "Equipo no encontrado" });
      }
    }

    // Verificar si ya existe relación
    const existente = await pool.query(
      `SELECT id, estado FROM torneo_equipos WHERE equipo_id = $1 AND torneo_id = $2`,
      [resolvedEquipoId, torneo_id]
    );
    if (existente.rows.length > 0) {
      const estado = existente.rows[0].estado;
      if (estado === 'pendiente') {
        return res.status(400).json({ error: "Ya existe una invitación pendiente para este equipo" });
      }
      if (estado === 'aceptado') {
        return res.status(400).json({ error: "El equipo ya está inscrito en este torneo" });
      }
    }

    // Crear invitación en estado pendiente
    const insertRes = await pool.query(
      `INSERT INTO torneo_equipos (equipo_id, torneo_id, estado, fecha_registro, origen)
       VALUES ($1, $2, 'pendiente', NOW(), 'invitacion')
       RETURNING *`,
      [resolvedEquipoId, torneo_id]
    );

    res.status(201).json({ message: "Invitación creada y notificada", invitacion: insertRes.rows[0] });
  } catch (error) {
    console.error("❌ Error al crear invitación:", error);
    res.status(500).json({ error: "Error interno al crear invitación", detail: error.message });
  }
});

// === Crear solicitud de equipo para unirse a torneo (pendiente) ===
router.post("/solicitar", authenticateToken, async (req, res) => {
  try {
    const { torneo_id, equipo_id, equipo_uid } = req.body;
    const userId = req.user.id;

    if (!torneo_id || (!equipo_id && !equipo_uid)) {
      return res.status(400).json({ error: "torneo_id y (equipo_id o equipo_uid) son obligatorios" });
    }

    // Resolver equipo por ID o UID y verificar que el usuario sea el creador (capitán)
    let resolvedEquipoId = equipo_id || null;
    let equipoCreadorId = null;
    if (!resolvedEquipoId && equipo_uid) {
      const byUid = await pool.query(
        `SELECT id, nombre, creador_id FROM equipos WHERE equipo_uid = $1`,
        [String(equipo_uid)]
      );
      if (byUid.rows.length === 0) {
        return res.status(404).json({ error: "Equipo no encontrado por UID" });
      }
      resolvedEquipoId = byUid.rows[0].id;
      equipoCreadorId = byUid.rows[0].creador_id;
    }
    if (resolvedEquipoId && !equipoCreadorId) {
      const equipoRes = await pool.query(
        `SELECT id, creador_id FROM equipos WHERE id = $1`,
        [resolvedEquipoId]
      );
      if (equipoRes.rows.length === 0) {
        return res.status(404).json({ error: "Equipo no encontrado" });
      }
      equipoCreadorId = equipoRes.rows[0].creador_id;
    }

    if (String(equipoCreadorId) !== String(userId)) {
      return res.status(403).json({ error: "Solo el capitán del equipo puede solicitar unirse" });
    }

    // Verificar que el torneo exista
    const torneoRes = await pool.query(
      `SELECT id FROM torneo WHERE id = $1`,
      [torneo_id]
    );
    if (torneoRes.rows.length === 0) {
      return res.status(404).json({ error: "Torneo no encontrado" });
    }

    // Verificar si ya existe relación
    const existente = await pool.query(
      `SELECT id, estado FROM torneo_equipos WHERE equipo_id = $1 AND torneo_id = $2`,
      [resolvedEquipoId, torneo_id]
    );
    if (existente.rows.length > 0) {
      const estado = existente.rows[0].estado;
      if (estado === 'pendiente') {
        return res.status(400).json({ error: "Ya existe una relación pendiente entre el equipo y el torneo" });
      }
      if (estado === 'aceptado') {
        return res.status(400).json({ error: "El equipo ya está inscrito en este torneo" });
      }
    }

    // Crear solicitud en estado pendiente
    const insertRes = await pool.query(
      `INSERT INTO torneo_equipos (equipo_id, torneo_id, estado, fecha_registro, origen)
       VALUES ($1, $2, 'pendiente', NOW(), 'solicitud')
       RETURNING *`,
      [resolvedEquipoId, torneo_id]
    );

    res.status(201).json({ message: "Solicitud creada y notificada", solicitud: insertRes.rows[0] });
  } catch (error) {
    console.error("❌ Error al crear solicitud:", error);
    res.status(500).json({ error: "Error interno al crear solicitud", detail: error.message });
  }
});

// === Listar notificaciones del usuario actual ===
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await obtenerNotificacionesParaUsuario(userId);
    res.json({ message: "Notificaciones obtenidas", ...data });
  } catch (error) {
    console.error("❌ Error al obtener notificaciones:", error);
    res.status(500).json({ error: "Error interno al obtener notificaciones", detail: error.message });
  }
});

// === Aceptar una notificación (cambia estado a 'aceptado') ===
router.post("/:id/aceptar", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Obtener la relación y verificar permisos
    const { rows } = await pool.query(
      `SELECT te.id, te.equipo_id, te.torneo_id, te.estado,
              e.creador_id AS capitan_id,
              t.organizador_id
         FROM torneo_equipos te
         JOIN equipos e ON te.equipo_id = e.id
         JOIN torneo t ON te.torneo_id = t.id
        WHERE te.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    const notif = rows[0];

    if (notif.estado !== 'pendiente') {
      return res.status(400).json({ error: "La notificación no está pendiente" });
    }

    // Verificación de permisos: puede aceptar el capitán o el organizador
    if (userId !== notif.capitan_id && userId !== notif.organizador_id) {
      return res.status(403).json({ error: "No tienes permisos para aceptar esta notificación" });
    }

    const result = await pool.query(
      `UPDATE torneo_equipos SET estado = 'aceptado' WHERE id = $1 RETURNING *`,
      [id]
    );

    res.json({ message: "Invitación/solicitud aceptada", item: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al aceptar notificación:", error);
    res.status(500).json({ error: "Error interno al aceptar notificación", detail: error.message });
  }
});

// === Rechazar una notificación (elimina la fila) ===
router.post("/:id/rechazar", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Obtener la relación y verificar permisos
    const { rows } = await pool.query(
      `SELECT te.id, te.equipo_id, te.torneo_id, te.estado,
              e.creador_id AS capitan_id,
              t.organizador_id
         FROM torneo_equipos te
         JOIN equipos e ON te.equipo_id = e.id
         JOIN torneo t ON te.torneo_id = t.id
        WHERE te.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    const notif = rows[0];

    if (notif.estado !== 'pendiente') {
      return res.status(400).json({ error: "La notificación no está pendiente" });
    }

    // Verificación de permisos: puede rechazar el capitán o el organizador
    if (userId !== notif.capitan_id && userId !== notif.organizador_id) {
      return res.status(403).json({ error: "No tienes permisos para rechazar esta notificación" });
    }

    await pool.query(`DELETE FROM torneo_equipos WHERE id = $1`, [id]);

    res.json({ message: "Invitación/solicitud rechazada y eliminada" });
  } catch (error) {
    console.error("❌ Error al rechazar notificación:", error);
    res.status(500).json({ error: "Error interno al rechazar notificación", detail: error.message });
  }
});

export default router;