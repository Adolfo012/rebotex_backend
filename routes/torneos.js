// routes/torneos.js - Rutas de torneos
import express from "express";
import pool from "../db.js";
import { generarPartidosParaTorneo } from "../lib/scheduler.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Generador de UID de 12 dígitos para torneos (100000000000 - 999999999999)
function generarUID12() {
  const min = 100000000000; // 12 dígitos
  const max = 999999999999; // 12 dígitos
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

    // Generar torneo_uid único (con reintentos por posibles colisiones)
    let torneo_uid;
    const maxIntentos = 10;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      const candidato = generarUID12();
      const existe = await pool.query(
        "SELECT 1 FROM torneo WHERE torneo_uid = $1 LIMIT 1",
        [candidato]
      );
      if (existe.rows.length === 0) {
        torneo_uid = candidato;
        break;
      } else {
        console.warn(`⚠️ UID de torneo repetido (${candidato}), reintentando (${intento}/${maxIntentos})`);
      }
    }

    if (!torneo_uid) {
      return res.status(500).json({
        error: "No se pudo generar un UID único para el torneo"
      });
    }

    // Insertar torneo en la base de datos
    const result = await pool.query(
      `INSERT INTO torneo 
        (nombre, ubicacion, descripcion, fecha_inicio, fecha_fin, organizador_id, modalidad, torneo_uid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING id, nombre, ubicacion, descripcion, fecha_inicio, fecha_fin, organizador_id, modalidad, torneo_uid, loaddt`,
      [
        nombre, 
        ubicacion || null, 
        descripcion || null, 
        fecha_inicio, 
        fecha_fin || null, 
        organizador_id, 
        modalidad || 'equipos',
        torneo_uid
      ]
    );

    const nuevoTorneo = result.rows[0];

    console.log(`✅ Torneo creado exitosamente: ${nombre} (ID: ${nuevoTorneo.id}, UID: ${nuevoTorneo.torneo_uid})`);

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

// === Actualizar torneo ===
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { nombre, descripcion, ubicacion, fecha_inicio, fecha_fin } = req.body;

    // Verificar que el torneo exista y que el usuario sea el organizador
    const torneoRes = await pool.query(
      `SELECT id, organizador_id FROM torneo WHERE id = $1`,
      [id]
    );
    if (torneoRes.rows.length === 0) {
      return res.status(404).json({ error: "Torneo no encontrado" });
    }
    if (torneoRes.rows[0].organizador_id !== userId) {
      return res.status(403).json({ error: "No tienes permisos para editar este torneo" });
    }

    // Validaciones básicas
    if (!nombre) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }
    if (fecha_inicio && fecha_fin) {
      const inicio = new Date(fecha_inicio);
      const fin = new Date(fecha_fin);
      if (fin <= inicio) {
        return res.status(400).json({ error: "La fecha de fin debe ser posterior a la fecha de inicio" });
      }
    }

    const updateRes = await pool.query(
      `UPDATE torneo
         SET nombre = $1,
             descripcion = $2,
             ubicacion = $3,
             fecha_inicio = $4,
             fecha_fin = $5
       WHERE id = $6
       RETURNING *`,
      [nombre, descripcion || null, ubicacion || null, fecha_inicio || null, fecha_fin || null, id]
    );

    res.json({ message: "Torneo actualizado", torneo: updateRes.rows[0] });
  } catch (error) {
    console.error("❌ Error al actualizar torneo:", error);
    res.status(500).json({ error: "Error interno del servidor al actualizar el torneo", detail: error.message });
  }
});

// === Obtener torneos de un usuario ===
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🔍 Obteniendo torneos para el usuario: ${userId}`);
    
    // Obtener torneos donde el usuario es organizador
    const torneosOrganizados = await pool.query(
      `SELECT 
          t.*, 
          u.nombre AS organizador_nombre, 
          'Organizador' AS rol,
          (
            SELECT COUNT(*) 
            FROM torneo_equipos te 
            WHERE te.torneo_id = t.id AND te.estado = 'aceptado'
          ) AS equipos_count
       FROM torneo t 
       JOIN usuarios u ON t.organizador_id = u.id 
       WHERE t.organizador_id = $1 
       ORDER BY t.fecha_inicio DESC`,
      [userId]
    );

    // Obtener torneos donde el usuario participa como capitán de equipo
    const torneosCapitan = await pool.query(
      `SELECT DISTINCT 
              t.*, 
              u_org.nombre AS organizador_nombre,
              e.nombre AS equipo_nombre,
              'Capitán' AS rol,
              (
                SELECT COUNT(*) 
                FROM torneo_equipos te2 
                WHERE te2.torneo_id = t.id AND te2.estado = 'aceptado'
              ) AS equipos_count
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
      `SELECT 
          t.*, 
          u.nombre AS organizador_nombre, 
          u.apellidop AS organizador_apellido,
          (
            SELECT COUNT(*) 
            FROM torneo_equipos te 
            WHERE te.torneo_id = t.id AND te.estado = 'aceptado'
          ) AS equipos_count
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

// === Listar torneos sin UID (diagnóstico) ===
router.get("/missing-uids", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, organizador_id, fecha_inicio, modalidad
         FROM torneo
        WHERE torneo_uid IS NULL
        ORDER BY id DESC`
    );

    res.json({
      message: "Torneos sin UID obtenidos",
      count: result.rows.length,
      torneos: result.rows
    });
  } catch (error) {
    console.error("❌ Error al listar torneos sin UID:", error);
    res.status(500).json({ error: "Error interno al listar torneos sin UID", detail: error.message });
  }
});

// === Backfill de UIDs faltantes ===
router.post("/fix-uids", authenticateToken, async (req, res) => {
  try {
    // Opcional: limitar a administradores si tu modelo de usuarios lo soporta
    // if (!req.user.is_admin) { return res.status(403).json({ error: "No autorizado" }); }

    const { rows: faltantes } = await pool.query(
      `SELECT id FROM torneo WHERE torneo_uid IS NULL ORDER BY id`
    );

    let actualizados = 0;
    const procesados = [];

    for (const t of faltantes) {
      let nuevoUid = null;
      const maxIntentos = 20;
      for (let intento = 1; intento <= maxIntentos; intento++) {
        const candidato = generarUID12();
        const { rows: existe } = await pool.query(
          `SELECT 1 FROM torneo WHERE torneo_uid = $1 LIMIT 1`,
          [candidato]
        );
        if (existe.length === 0) {
          nuevoUid = candidato;
          break;
        }
      }

      if (nuevoUid) {
        await pool.query(
          `UPDATE torneo SET torneo_uid = $1 WHERE id = $2`,
          [nuevoUid, t.id]
        );
        actualizados++;
        procesados.push({ id: t.id, torneo_uid: String(nuevoUid) });
      } else {
        console.warn(`⚠️ No se pudo generar UID para torneo id=${t.id}`);
      }
    }

    res.json({
      message: "Backfill de UIDs completado",
      updated: actualizados,
      details: procesados
    });
  } catch (error) {
    console.error("❌ Error en backfill de UIDs:", error);
    res.status(500).json({ error: "Error interno en backfill de UIDs", detail: error.message });
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

// === Listar jugadores del torneo (público) y asegurar persistencia en torneo_jugadores ===
router.get("/:id/jugadores", async (req, res) => {
  try {
    const { id } = req.params;

    // Upsert: insertar jugadores de equipos aceptados del torneo con estadísticas en 0
    await pool.query(
      `INSERT INTO torneo_jugadores (torneo_id, jugador_id, equipo_id, puntos_triple, puntos_doble, tiros_libre)
       SELECT $1 AS torneo_id, j.id AS jugador_id, j.equipo_id, 0, 0, 0
         FROM jugadores j
         JOIN torneo_equipos te ON te.equipo_id = j.equipo_id
        WHERE te.torneo_id = $1 AND te.estado = 'aceptado'
       ON CONFLICT (torneo_id, jugador_id) DO NOTHING`
      , [id]
    );

    // Seleccionar jugadores con nombres de equipo y estadísticas
    const result = await pool.query(
      `SELECT tj.torneo_id,
              j.id AS jugador_id,
              j.nombre AS jugador_nombre,
              e.nombre AS equipo_nombre,
              COALESCE(tj.puntos_triple, 0) AS pt,
              COALESCE(tj.puntos_doble, 0) AS pd,
              COALESCE(tj.tiros_libre, 0) AS tl,
              COALESCE(tj.total_puntos, 0) AS tp
         FROM torneo_jugadores tj
         JOIN jugadores j ON j.id = tj.jugador_id
         JOIN equipos e ON e.id = tj.equipo_id
        WHERE tj.torneo_id = $1
        ORDER BY e.nombre, j.nombre`
      , [id]
    );

    res.json({ message: "Jugadores del torneo", jugadores: result.rows });
  } catch (error) {
    console.error("❌ Error al listar jugadores del torneo:", error);
    res.status(500).json({ error: "Error interno al listar jugadores del torneo", detail: error.message });
  }
});

// === Helper: Generar partidos Round-Robin por jornadas (aleatorio, sin dobles por jornada) ===
// generarPartidosParaTorneo ahora se importa desde ../lib/scheduler.js

// === GET partidos de un torneo (público) ===
router.get("/:id/partidos", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
         p.id,
         p.torneo_id,
         p.local_id,
         p.visitante_id,
         p.fecha_partido AS fecha,
         p.hora_partido AS hora,
         p.num_jornada,
         p.resultado_local AS puntos_local,
         p.resultado_visitante AS puntos_visitante,
         el.nombre AS equipo_local,
         ev.nombre AS equipo_visitante,
       (
         CASE
           WHEN p.fecha_partido IS NULL OR p.hora_partido IS NULL THEN 'partidos'
            WHEN (
              (COALESCE(p.resultado_local, 0) <> 0 OR COALESCE(p.resultado_visitante, 0) <> 0)
              AND NOW() >= (p.fecha_partido::timestamp + p.hora_partido)
            ) THEN 'finalizados'
            WHEN NOW() >= (p.fecha_partido::timestamp + p.hora_partido + INTERVAL '90 minutes') THEN 'finalizados'
            ELSE 'proximos'
          END
        ) AS estado
       FROM partidos p
       JOIN equipos el ON el.id = p.local_id
       JOIN equipos ev ON ev.id = p.visitante_id
       WHERE p.torneo_id = $1
       ORDER BY COALESCE(p.fecha_partido, DATE '9999-12-31') ASC, COALESCE(p.hora_partido, TIME '23:59') ASC, p.id ASC`,
      [id]
    );
    res.json({ partidos: result.rows });
  } catch (error) {
    console.error("❌ Error al obtener partidos del torneo:", error);
    res.status(500).json({ error: "Error interno al obtener partidos del torneo", detail: error.message });
  }
});

// === PUT modo_partidos (solo organizador) ===
router.put("/:id/modo-partidos", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { modo_partidos } = req.body;
    const userId = req.user.id;
    if (!['solo','ida_vuelta'].includes(modo_partidos)) {
      return res.status(400).json({ error: "modo_partidos inválido" });
    }
    const tRes = await pool.query(`SELECT id, organizador_id FROM torneo WHERE id = $1`, [id]);
    if (tRes.rows.length === 0) return res.status(404).json({ error: "Torneo no encontrado" });
    if (String(tRes.rows[0].organizador_id) !== String(userId)) {
      return res.status(403).json({ error: "No tienes permisos para editar este torneo" });
    }
    // Número de equipos aceptados para calcular rondas
    const eqRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM torneo_equipos WHERE torneo_id = $1 AND estado = 'aceptado'`,
      [id]
    );
    const equipos = Number(eqRes.rows[0]?.cnt || 0);
    const rounds = equipos === 0 ? 0 : (equipos % 2 === 0 ? equipos - 1 : equipos);

    if (modo_partidos === 'ida_vuelta') {
      // Bloquear si hay partidos programados o con resultados
      const blok = await pool.query(
        `SELECT COUNT(*) AS cnt
           FROM partidos
          WHERE torneo_id = $1
            AND (
                  fecha_partido IS NOT NULL OR
                  hora_partido IS NOT NULL OR
                  resultado_local IS NOT NULL OR
                  resultado_visitante IS NOT NULL
                )`,
        [id]
      );
      if (Number(blok.rows[0].cnt) > 0) {
        return res.status(409).json({
          error: "No se puede activar ida y vuelta porque existen partidos programados o con resultados",
          blocked: true
        });
      }
      // Activar ida_vuelta sin reset: apendear segunda vuelta desde última jornada
      await pool.query(`UPDATE torneo SET modo_partidos = $1 WHERE id = $2`, [modo_partidos, id]);
      const gen = await generarPartidosParaTorneo(id, { reset: false });
      return res.json({ message: "Modo de partidos actualizado (apéndice de vuelta)", modo_partidos, generar: gen });
    } else {
      // Desactivar ida_vuelta: eliminar segunda vuelta (jornadas > rounds) si no están programadas ni con resultados
      const chk = await pool.query(
        `SELECT COUNT(*) AS cnt
           FROM partidos
          WHERE torneo_id = $1
            AND num_jornada > $2
            AND (
                  fecha_partido IS NOT NULL OR
                  hora_partido IS NOT NULL OR
                  resultado_local IS NOT NULL OR
                  resultado_visitante IS NOT NULL
                )`,
        [id, rounds]
      );
      if (Number(chk.rows[0].cnt) > 0) {
        return res.status(409).json({
          error: "No se puede desactivar ida y vuelta: hay partidos de segunda vuelta programados o con resultados",
          blocked: true
        });
      }
      await pool.query(`DELETE FROM partidos WHERE torneo_id = $1 AND num_jornada > $2`, [id, rounds]);
      await pool.query(`UPDATE torneo SET modo_partidos = 'solo' WHERE id = $1`, [id]);
      return res.json({ message: "Modo de partidos actualizado, segunda vuelta eliminada", modo_partidos: 'solo' });
    }
  } catch (error) {
    console.error("❌ Error al actualizar modo_partidos:", error);
    res.status(500).json({ error: "Error interno al actualizar modo_partidos", detail: error.message });
  }
});

// === POST generar partidos (solo organizador) ===
router.post("/:id/partidos/generar", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tRes = await pool.query(`SELECT id, organizador_id FROM torneo WHERE id = $1`, [id]);
    if (tRes.rows.length === 0) return res.status(404).json({ error: "Torneo no encontrado" });
    if (String(tRes.rows[0].organizador_id) !== String(userId)) {
      return res.status(403).json({ error: "No tienes permisos para generar partidos" });
    }
    // Generación manual: reconstruir calendario desde jornada 1
    const gen = await generarPartidosParaTorneo(id, { reset: true });
    res.json({ message: "Partidos generados", detalles: gen });
  } catch (error) {
    console.error("❌ Error al generar partidos:", error);
    res.status(500).json({ error: "Error interno al generar partidos", detail: error.message });
  }
});

// === Eliminar torneo (solo organizador) ===
router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verificar torneo y permisos
    const tRes = await client.query('SELECT id, organizador_id FROM torneo WHERE id = $1', [id]);
    if (tRes.rows.length === 0) return res.status(404).json({ error: 'Torneo no encontrado' });
    const torneo = tRes.rows[0];
    if (String(torneo.organizador_id) !== String(userId)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este torneo' });
    }

    await client.query('BEGIN');
    // Borrar dependencias en cascada
    await client.query('DELETE FROM partido_jugadores WHERE partido_id IN (SELECT id FROM partidos WHERE torneo_id = $1)', [id]);
    await client.query('DELETE FROM partidos WHERE torneo_id = $1', [id]);
    await client.query('DELETE FROM torneo_jugadores WHERE torneo_id = $1', [id]);
    await client.query('DELETE FROM torneo_equipos WHERE torneo_id = $1', [id]);

    // Finalmente, borrar el torneo
    await client.query('DELETE FROM torneo WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ message: 'Torneo eliminado exitosamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al eliminar torneo:', error);
    res.status(500).json({ error: 'Error interno al eliminar torneo', detail: error.message });
  } finally {
    client.release();
  }
});

// === Eliminar equipo del torneo (solo organizador) ===
router.delete("/:torneoId/equipos/:equipoId", authenticateToken, async (req, res) => {
  try {
    const { torneoId, equipoId } = req.params;
    const userId = req.user.id;

    // Verificar que el torneo exista y que el usuario sea el organizador
    const torneoRes = await pool.query(
      `SELECT id, organizador_id FROM torneo WHERE id = $1`,
      [torneoId]
    );
    if (torneoRes.rows.length === 0) {
      return res.status(404).json({ error: "Torneo no encontrado" });
    }
    if (torneoRes.rows[0].organizador_id !== userId) {
      return res.status(403).json({ error: "No tienes permisos para eliminar equipos de este torneo" });
    }

    // Intentar eliminar la relación en torneo_equipos
    const deleteRes = await pool.query(
      `DELETE FROM torneo_equipos WHERE torneo_id = $1 AND equipo_id = $2 RETURNING id`,
      [torneoId, equipoId]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: "El equipo no está inscrito en este torneo" });
    }

    // Eliminar todos los partidos del torneo que involucren al equipo (local o visitante)
    const delPartidos = await pool.query(
      `DELETE FROM partidos 
       WHERE torneo_id = $1 AND (local_id = $2 OR visitante_id = $2)
       RETURNING id`,
      [torneoId, equipoId]
    );

    // Reprogramar calendario con los equipos restantes desde jornada 1
    const regen = await generarPartidosParaTorneo(torneoId, { reset: true });

    res.json({ 
      message: "Equipo eliminado del torneo y partidos asociados borrados", 
      partidos_eliminados: delPartidos.rows.length,
      reprogramado: regen
    });
  } catch (error) {
    console.error("❌ Error al eliminar equipo del torneo:", error);
    res.status(500).json({ error: "Error interno al eliminar equipo del torneo", detail: error.message });
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
