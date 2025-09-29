// middleware/auth.js - Middleware de autenticación JWT
import jwt from "jsonwebtoken";

// Middleware para verificar token JWT
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.log("❌ Token de acceso no proporcionado");
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("❌ Token inválido o expirado:", err.message);
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    
    // Agregar información del usuario al request
    req.user = user;
    console.log("✅ Token válido para usuario:", user.correo);
    next();
  });
};

// Middleware opcional para verificar token (no falla si no hay token)
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // No hay token, continuar sin autenticación
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // Token inválido, continuar sin autenticación
      req.user = null;
    } else {
      // Token válido, agregar usuario al request
      req.user = user;
    }
    next();
  });
};

// Middleware para verificar si el usuario es administrador
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }

  // Aquí puedes agregar lógica para verificar si el usuario es admin
  // Por ejemplo, verificar un campo 'role' en la base de datos
  // Por ahora, asumimos que todos los usuarios autenticados pueden ser admins
  
  next();
};

export default {
  authenticateToken,
  optionalAuth,
  requireAdmin
};