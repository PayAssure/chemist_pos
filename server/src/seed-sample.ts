import "dotenv/config";
import { seedSampleData } from "./seed-sample/flow";

seedSampleData().catch((error: unknown) => {
  console.error("Could not create sample POS data:", error);
  process.exitCode = 1;
});
