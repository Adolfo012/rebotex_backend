# ReboteX Backend

Backend para la aplicación ReboteX - Sistema de gestión de torneos deportivos.

## 🚀 Despliegue en Railway

Este proyecto está configurado para desplegarse automáticamente en Railway.

### Variables de Entorno Requeridas

Configura las siguientes variables de entorno en Railway:

```
PORT=3000
DB_HOST=tu_host_de_base_de_datos
DB_PORT=5432
DB_NAME=tu_nombre_de_base_de_datos
DB_USER=tu_usuario_de_base_de_datos
DB_PASSWORD=tu_contraseña_de_base_de_datos
JWT_SECRET=tu_clave_secreta_jwt
NODE_ENV=production
```

### Estructura del Proyecto

```
backend/
├── index.js              # Servidor principal
├── package.json          # Dependencias y scripts
├── railway.json          # Configuración de Railway
├── Procfile              # Comando de inicio
├── .env.example          # Ejemplo de variables de entorno
├── db.js                 # Configuración de base de datos
├── routes/               # Rutas de la API
│   ├── auth.js          # Autenticación
│   └── torneos.js       # Gestión de torneos
└── middleware/           # Middleware personalizado
    └── auth.js          # Autenticación JWT
```

### Endpoints Disponibles

- `GET /` - Información del API
- `GET /health` - Estado del servidor
- `POST /api/auth/register` - Registro de usuarios
- `POST /api/auth/login` - Inicio de sesión
- `POST /api/auth/verify` - Verificación de token
- `POST /api/torneos/create` - Crear torneo
- `GET /api/torneos/user/:id` - Torneos de usuario
- `GET /api/torneos/public` - Torneos públicos

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Ejecutar en modo desarrollo
npm run dev

# Ejecutar en modo producción
npm start
```

## 📦 Tecnologías

- Node.js
- Express.js
- PostgreSQL
- JWT
- bcrypt
- CORS