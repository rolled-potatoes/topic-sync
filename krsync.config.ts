import type { KrsyncManifest } from "./src";

const config: KrsyncManifest = {
  kafka: {
    brokers: ["localhost:9092"],
    clientId: "krsync-example"
  },
  schemaRegistry: {
    url: "http://localhost:8081"
  },
  defaults: {
    compatibility: "BACKWARD"
  },
  topics: [
    {
      project: "platform",
      service: "orders",
      subservices: ["events", "v1"],
      partitions: 3,
      replicationFactor: 1,
      config: {
        "cleanup.policy": "delete"
      }
    }
  ],
  schemas: [
    {
      topicRef: "platform.orders.events.v1",
      avroFile: "./schemas/order-event.avsc",
      compatibility: "BACKWARD"
    }
  ],
  consumers: [
    {
      action: "sync"
    }
  ]
};

export default config;
