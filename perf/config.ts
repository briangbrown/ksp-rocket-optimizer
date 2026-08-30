import { missionConfig } from "./cases.js";

/* Print a configuration string for the benchmark mission, to paste into the
   app's "Load configuration" so a device run matches the container exactly.

     npm run perf:config            tier 9, Mun
     node perf/.out/config.js 5 Duna
*/
console.log(missionConfig(+(process.argv[2] || 9), process.argv[3] || "Mun"));
