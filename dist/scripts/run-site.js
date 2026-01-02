import { loadExcelConfig } from "../config/excel.js";
import { runJob } from "../worker/runner.js";
const run = async () => {
    const config = await loadExcelConfig();
    await runJob(config);
};
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
