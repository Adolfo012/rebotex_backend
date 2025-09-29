// test-register.js - Script de prueba para el registro de usuarios
import fetch from "node-fetch";

async function testRegister() {
  try {
    const uniqueEmail = `test_${Date.now()}@rebotex.com`;
    
    console.log("🧪 Probando registro de usuario...");
    console.log("📧 Email de prueba:", uniqueEmail);
    
    const res = await fetch("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: "Usuario",
        apellidop: "Prueba",
        apellidom: "Test",
        correo: uniqueEmail,
        pass: "Password123!",
        fecha_nacimiento: "1990-01-01",
        genero: "hombre",
        apodo: "TestUser"
      })
    });

    const data = await res.json();
    console.log("📊 Status:", res.status);
    console.log("📋 Resultado:", data);
    
    if (res.ok) {
      console.log("✅ Registro exitoso!");
      
      // Probar login con el usuario recién creado
      console.log("\n🔐 Probando login...");
      const loginRes = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correo: uniqueEmail,
          pass: "Password123!"
        })
      });
      
      const loginData = await loginRes.json();
      console.log("📊 Login Status:", loginRes.status);
      console.log("📋 Login Resultado:", loginData);
      
      if (loginRes.ok) {
        console.log("✅ Login exitoso!");
        console.log("🎫 Token:", loginData.token.substring(0, 20) + "...");
      } else {
        console.log("❌ Error en login");
      }
    } else {
      console.log("❌ Error en registro");
    }
  } catch (err) {
    console.error("❌ Error en testRegister:", err);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testRegister();
}

export default testRegister;