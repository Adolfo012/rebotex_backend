// routes/auth.js - Rutas de autenticación
import express from "express";
import bcrypt from 'bcryptjs';
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

// === Registro de usuario ===
router.post("/register", async (req, res) => {
  try {
    const { nombre, apellidop, apellidom, correo, pass, apodo, genero, fecha_nacimiento } = req.body;

    // Validaciones básicas
    if (!nombre || !apellidop || !correo || !pass) {
      return res.status(400).json({ 
        error: "Los campos nombre, apellido paterno, correo y contraseña son obligatorios" 
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await pool.query(
      "SELECT * FROM usuarios WHERE correo = $1",
      [correo]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    // Hashear la contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(pass, saltRounds);

    // Insertar el nuevo usuario
    const result = await pool.query(
      "INSERT INTO usuarios (nombre, apellidop, apellidom, correo, pass, apodo, genero, fecha_nacimiento) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [nombre, apellidop, apellidom || null, correo, hashedPassword, apodo || null, genero || null, fecha_nacimiento || null]
    );

    const userId = result.rows[0].id;

    console.log(`✅ Usuario registrado exitosamente: ${correo} (ID: ${userId})`);

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      userId: userId
    });
  } catch (err) {
    console.error("❌ Error en registro:", err);
    return res.status(500).json({ error: "Error en registro", detail: err.message });
  }
});

// === Login de usuario ===
router.post("/login", async (req, res) => {
  try {
    console.log("🔐 Petición de login recibida para:", req.body.correo);
    const { correo, pass } = req.body;

    // Validaciones básicas
    if (!correo || !pass) {
      return res.status(400).json({ error: "Correo y contraseña son obligatorios" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM usuarios WHERE correo = $1",
      [correo]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(pass, user.pass);

    if (!isMatch) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      { id: user.id, correo: user.correo },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // Enviar información del usuario junto con el token
    const responseData = { 
      message: "Login exitoso", 
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellidop: user.apellidop,
        apellidom: user.apellidom,
        correo: user.correo,
        apodo: user.apodo,
        genero: user.genero,
        fecha_nacimiento: user.fecha_nacimiento
      }
    };
    
    console.log("✅ Login exitoso para:", correo);
    return res.json(responseData);
  } catch (err) {
    console.error("❌ Error en login:", err);
    return res.status(500).json({ error: "Error en login", detail: err.message });
  }
});

// === Verificar token ===
router.get("/verify", async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
      }

      // Obtener información actualizada del usuario
      const { rows } = await pool.query(
        "SELECT id, nombre, apellidop, apellidom, correo, apodo, genero, fecha_nacimiento FROM usuarios WHERE id = $1",
        [decoded.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({
        valid: true,
        user: rows[0]
      });
    });
  } catch (err) {
    console.error("❌ Error en verificación de token:", err);
    return res.status(500).json({ error: "Error en verificación", detail: err.message });
  }
});

// Endpoint de prueba
router.get("/test", (req, res) => {
  console.log("🧪 Endpoint de prueba de autenticación llamado");
  res.json({ 
    message: "Test endpoint de autenticación funcionando", 
    timestamp: new Date().toISOString() 
  });
});

export default router;