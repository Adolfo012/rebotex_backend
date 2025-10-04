// add-sample-teams.js - Script para agregar equipos de ejemplo
import pool from "./db.js";

const equiposEjemplo = [
  {
    nombre: "Los Rebotadores",
    descripcion: "Equipo especializado en defensa y contraataques rápidos. Conocidos por su excelente trabajo en equipo y estrategias defensivas.",
    logo_url: "https://via.placeholder.com/100x100/FF6B6B/FFFFFF?text=LR"
  },
  {
    nombre: "Thunder Ballers",
    descripcion: "Equipo ofensivo con jugadores altos y potentes. Su especialidad son los ataques directos y el juego físico.",
    logo_url: "https://via.placeholder.com/100x100/4ECDC4/FFFFFF?text=TB"
  },
  {
    nombre: "Águilas Doradas",
    descripcion: "Equipo equilibrado con gran experiencia en torneos. Destacan por su disciplina táctica y liderazgo en cancha.",
    logo_url: "https://via.placeholder.com/100x100/FFD93D/000000?text=AD"
  },
  {
    nombre: "Lobos Grises",
    descripcion: "Equipo joven y dinámico con mucha velocidad. Su estilo de juego se basa en transiciones rápidas y presión constante.",
    logo_url: "https://via.placeholder.com/100x100/6BCF7F/FFFFFF?text=LG"
  },
  {
    nombre: "Titanes del Norte",
    descripcion: "Equipo veterano con gran experiencia. Su fortaleza está en la estrategia y el conocimiento del juego.",
    logo_url: "https://via.placeholder.com/100x100/A8E6CF/000000?text=TN"
  },
  {
    nombre: "Dragones Rojos",
    descripcion: "Equipo agresivo y competitivo. Conocidos por su intensidad en el juego y su espíritu de lucha.",
    logo_url: "https://via.placeholder.com/100x100/FF8B94/FFFFFF?text=DR"
  }
];

async function agregarEquiposEjemplo() {
  try {
    console.log("🏀 Iniciando proceso de agregar equipos de ejemplo...");

    // Primero, obtener un usuario existente para asignar como creador
    const usuarioResult = await pool.query(
      "SELECT id, nombre FROM usuarios LIMIT 1"
    );

    if (usuarioResult.rows.length === 0) {
      console.log("❌ No hay usuarios en la base de datos. Creando usuario de ejemplo...");
      
      // Crear un usuario de ejemplo
      const nuevoUsuario = await pool.query(
        `INSERT INTO usuarios (nombre, apellidop, apellidom, correo, password, telefono)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nombre`,
        [
          "Capitán",
          "Ejemplo",
          "Demo",
          "capitan@ejemplo.com",
          "$2b$10$hashedpassword", // Password hasheado de ejemplo
          "1234567890"
        ]
      );
      
      console.log(`✅ Usuario de ejemplo creado: ${nuevoUsuario.rows[0].nombre} (ID: ${nuevoUsuario.rows[0].id})`);
      var creadorId = nuevoUsuario.rows[0].id;
    } else {
      var creadorId = usuarioResult.rows[0].id;
      console.log(`✅ Usando usuario existente: ${usuarioResult.rows[0].nombre} (ID: ${creadorId})`);
    }

    // Agregar cada equipo
    const equiposCreados = [];
    
    for (const equipo of equiposEjemplo) {
      try {
        // Verificar si el equipo ya existe
        const equipoExistente = await pool.query(
          "SELECT id FROM equipos WHERE nombre = $1",
          [equipo.nombre]
        );

        if (equipoExistente.rows.length > 0) {
          console.log(`⚠️  El equipo "${equipo.nombre}" ya existe, saltando...`);
          equiposCreados.push(equipoExistente.rows[0]);
          continue;
        }

        const result = await pool.query(
          `INSERT INTO equipos (nombre, descripcion, logo_url, creador_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, nombre, descripcion, logo_url, creador_id, loaddt`,
          [equipo.nombre, equipo.descripcion, equipo.logo_url, creadorId]
        );

        equiposCreados.push(result.rows[0]);
        console.log(`✅ Equipo creado: ${equipo.nombre} (ID: ${result.rows[0].id})`);
        
      } catch (error) {
        console.error(`❌ Error al crear equipo "${equipo.nombre}":`, error.message);
      }
    }

    console.log(`\n🎉 Proceso completado! Se crearon/verificaron ${equiposCreados.length} equipos.`);
    
    // Mostrar resumen de equipos
    console.log("\n📋 Resumen de equipos:");
    equiposCreados.forEach((equipo, index) => {
      console.log(`${index + 1}. ${equipo.nombre} (ID: ${equipo.id})`);
    });

    return equiposCreados;

  } catch (error) {
    console.error("❌ Error general al agregar equipos:", error);
    throw error;
  }
}

async function asociarEquiposConTorneo() {
  try {
    console.log("\n🔗 Asociando equipos con torneos...");

    // Obtener un torneo existente
    const torneoResult = await pool.query(
      "SELECT id, nombre FROM torneo LIMIT 1"
    );

    if (torneoResult.rows.length === 0) {
      console.log("❌ No hay torneos en la base de datos. No se pueden asociar equipos.");
      return;
    }

    const torneoId = torneoResult.rows[0].id;
    const torneoNombre = torneoResult.rows[0].nombre;
    
    console.log(`✅ Usando torneo: ${torneoNombre} (ID: ${torneoId})`);

    // Obtener equipos existentes
    const equiposResult = await pool.query(
      "SELECT id, nombre FROM equipos ORDER BY loaddt DESC LIMIT 6"
    );

    if (equiposResult.rows.length === 0) {
      console.log("❌ No hay equipos en la base de datos.");
      return;
    }

    // Asociar cada equipo con el torneo
    const asociacionesCreadas = [];
    
    for (const equipo of equiposResult.rows) {
      try {
        // Verificar si ya está asociado
        const asociacionExistente = await pool.query(
          "SELECT id FROM torneo_equipos WHERE equipo_id = $1 AND torneo_id = $2",
          [equipo.id, torneoId]
        );

        if (asociacionExistente.rows.length > 0) {
          console.log(`⚠️  El equipo "${equipo.nombre}" ya está asociado al torneo, saltando...`);
          continue;
        }

        const result = await pool.query(
          `INSERT INTO torneo_equipos (equipo_id, torneo_id, estado, fecha_inscripcion)
           VALUES ($1, $2, 'aceptado', NOW())
           RETURNING id, equipo_id, torneo_id, estado`,
          [equipo.id, torneoId]
        );

        asociacionesCreadas.push(result.rows[0]);
        console.log(`✅ Equipo "${equipo.nombre}" asociado al torneo "${torneoNombre}"`);
        
      } catch (error) {
        console.error(`❌ Error al asociar equipo "${equipo.nombre}":`, error.message);
      }
    }

    console.log(`\n🎉 Se asociaron ${asociacionesCreadas.length} equipos al torneo "${torneoNombre}".`);
    
    return asociacionesCreadas;

  } catch (error) {
    console.error("❌ Error al asociar equipos con torneo:", error);
    throw error;
  }
}

// Función principal
async function main() {
  try {
    console.log("🚀 Iniciando script de equipos de ejemplo...\n");
    
    // Probar conexión primero
    console.log("🔍 Probando conexión a la base de datos...");
    await pool.query("SELECT 1");
    console.log("✅ Conexión a la base de datos OK\n");
    
    // Agregar equipos
    const equipos = await agregarEquiposEjemplo();
    
    // Asociar con torneo
    await asociarEquiposConTorneo();
    
    console.log("\n✅ Script completado exitosamente!");
    
  } catch (error) {
    console.error("❌ Error en el script principal:", error);
    console.error("Stack trace:", error.stack);
  } finally {
    // Cerrar conexión
    try {
      await pool.end();
      console.log("🔌 Conexión a la base de datos cerrada.");
    } catch (closeError) {
      console.error("❌ Error al cerrar conexión:", closeError);
    }
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { agregarEquiposEjemplo, asociarEquiposConTorneo };