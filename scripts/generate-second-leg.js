// Run generator for a torneo without reset to append second leg
import { generarPartidosParaTorneo } from "../lib/scheduler.js";

const torneoId = Number(process.argv[2] || 1);

async function main() {
  try {
    const res = await generarPartidosParaTorneo(torneoId, { reset: false });
    console.log('GEN_RESULT=', JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('Generator error:', e);
    process.exit(1);
  }
}

main();