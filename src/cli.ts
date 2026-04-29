import { Command } from "commander";
import {
  explainDrift,
  loadTopicCatalog,
  planCommand,
  statusCommand,
  syncCommand,
  validateCommand
} from "./service";
import type { PlanResult } from "./types";

const program = new Command();

program.name("krsync").description("Kafka topic and schema registry sync").version("0.1.0");

program
  .command("validate")
  .option("-c, --config <path>", "Path to krsync config")
  .action(async (options: { config?: string }) => {
    await validateCommand(options.config);
    console.log("Manifest validation passed.");
  });

program
  .command("catalog")
  .option("-c, --config <path>", "Path to krsync config")
  .action(async (options: { config?: string }) => {
    const catalog = await loadTopicCatalog(options);
    console.log(`Scope: ${catalog.scope.tenant}.${catalog.scope.env}`);
    for (const item of catalog.list) {
      console.log(`  - ${item.ref} => ${item.name}`);
    }
  });

program
  .command("plan")
  .option("-c, --config <path>", "Path to krsync config")
  .option("--allow-delete", "Include delete actions", false)
  .action(async (options: { config?: string; allowDelete?: boolean }) => {
    const plan = await planCommand(options);
    printPlan(plan);
    printDriftSummary(plan);
  });

program
  .command("sync")
  .option("-c, --config <path>", "Path to krsync config")
  .option("--allow-delete", "Allow delete actions", false)
  .option("--confirm <env>", "Explicit confirmation token for protected envs")
  .action(async (options: { config?: string; allowDelete?: boolean; confirm?: string }) => {
    const plan = await syncCommand(options);
    printPlan(plan);
    printDriftSummary(plan);
    console.log("Sync completed.");
  });

program
  .command("status")
  .option("-c, --config <path>", "Path to krsync config")
  .action(async (options: { config?: string }) => {
    const status = await statusCommand(options.config);
    console.log(`Topics in scope: ${status.topicCount}`);
    console.log(`Schema subjects in scope: ${status.subjectCount}`);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function printPlan(plan: PlanResult): void {
  console.log("Topics:");
  for (const item of plan.topics) {
    console.log(`  - [${item.action}] ${item.name} (${item.reason})`);
  }

  console.log("Schemas:");
  for (const item of plan.schemas) {
    console.log(`  - [${item.action}] ${item.subject} (${item.reason})`);
  }
}

function printDriftSummary(plan: PlanResult): void {
  const drift = explainDrift(plan);
  console.log(
    `Drift summary: topics=${drift.topicDrift.length}, schemas=${drift.schemaDrift.length}`
  );
}
