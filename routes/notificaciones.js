// routes/notificaciones.js - Gestión de notificaciones de invitaciones/solicitudes
import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Helper: obtener notificaciones para el usuario
async function obtenerNotificacionesParaUsuario(userId) {
  // Invitaciones/solicitudes donde el usuario es capitán del equipo
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
      WHERE te.estado = 'pendiente' AND e.creador_id = $1
      ORDER BY te.fecha_registro DESC NULLS LAST, te.id DESC`,
    [userId]
  );

  // Solicitudes donde el usuario es organizador del torneo
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
      WHERE te.estado = 'pendiente' AND t.organizador_id = $1
      ORDER BY te.fecha_registro DESC NULLS LAST, te.id DESC`,
    [userId]
  );

  return {
    invitaciones_capitan: invitacionesCapitan.rows,
    solicitudes_organizador: solicitudesOrganizador.rows,
  };
}

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