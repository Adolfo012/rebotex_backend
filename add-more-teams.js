import pool, { testConnection } from './db.js';

async function addMoreTeams() {
    try {
        console.log('🔍 Conectando a la base de datos...');
        await testConnection();
        
        // Equipos adicionales para probar el scroll
        const nuevosEquipos = [
            'Cóndores Azules',
            'Serpientes Verdes',
            'Jaguares Dorados',
            'Escorpiones Rojos',
            'Búhos Plateados',
            'Rinocerontes Negros',
            'Delfines Azules',
            'Zorros Naranjas',
            'Osos Pardos',
            'Linces Grises',
            'Pumas Blancos',
            'Cobras Venenosas',
            'Halcones Peregrinos',
            'Tigres Siberianos',
            'Leones Africanos'
        ];
        
        console.log(`📝 Agregando ${nuevosEquipos.length} equipos adicionales...`);
        
        for (const nombreEquipo of nuevosEquipos) {
            // Verificar si el equipo ya existe
            const equipoExistente = await pool.query(
                'SELECT id FROM equipos WHERE nombre = $1',
                [nombreEquipo]
            );
            
            if (equipoExistente.rows.length === 0) {
                // Crear el equipo
                const resultado = await pool.query(
                    'INSERT INTO equipos (creador_id, nombre, deporte) VALUES ($1, $2, $3) RETURNING id',
                    [1, nombreEquipo, 'Baloncesto']
                );
                
                const equipoId = resultado.rows[0].id;
                console.log(`✅ Equipo "${nombreEquipo}" creado con ID: ${equipoId}`);
                
                // Asociar al torneo Cucei (ID 1)
                const asociacionExistente = await pool.query(
                    'SELECT id FROM torneo_equipos WHERE torneo_id = $1 AND equipo_id = $2',
                    [1, equipoId]
                );
                
                if (asociacionExistente.rows.length === 0) {
                    await pool.query(
                        'INSERT INTO torneo_equipos (torneo_id, equipo_id, estado, fecha_registro) VALUES ($1, $2, $3, NOW())',
                        [1, equipoId, 'aceptado']
                    );
                    console.log(`🔗 Equipo "${nombreEquipo}" asociado al torneo Cucei`);
                }
            } else {
                console.log(`⚠️ Equipo "${nombreEquipo}" ya existe`);
            }
        }
        
        console.log('🎉 ¡Equipos adicionales agregados exitosamente!');
        
    } catch (error) {
        console.error('❌ Error al agregar equipos:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        try {
            await pool.end();
            console.log('🔒 Conexión a la base de datos cerrada');
        } catch (closeError) {
            console.error('❌ Error al cerrar la conexión:', closeError);
        }
    }
}

addMoreTeams();