import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  CloudWatchClient,
  GetMetricDataCommand,
  DescribeAlarmsCommand,
} from "@aws-sdk/client-cloudwatch";

function getRegion(): string {
  return process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-east-1";
}

export function registerObservabilityTools(pi: ExtensionAPI): void {
  // ── obs_query_metrics ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "obs_query_metrics",
    label: "Query Metrics",
    description: "Query CloudWatch metrics using metric data queries. Supports multiple metrics and math expressions.",
    promptSnippet: "Query CloudWatch metrics with flexible metric data queries (supports expressions, multiple metrics)",
    parameters: Type.Object({
      queries: Type.Array(Type.Object({
        id:          Type.String({ description: "Query ID (used in expressions), e.g. m1" }),
        namespace:   Type.Optional(Type.String()),
        metric_name: Type.Optional(Type.String()),
        dimensions:  Type.Optional(Type.Array(Type.Object({ name: Type.String(), value: Type.String() }))),
        stat:        Type.Optional(Type.String({ description: "e.g. Average, p99" })),
        period:      Type.Optional(Type.Number({ description: "Period in seconds" })),
        expression:  Type.Optional(Type.String({ description: "Math expression using other query IDs" })),
        label:       Type.Optional(Type.String()),
      })),
      start_time: Type.String({ description: "ISO 8601 start time" }),
      end_time:   Type.String({ description: "ISO 8601 end time" }),
      region:     Type.Optional(Type.String()),
    }),

    async execute(_id, params, signal) {
      const region = params.region ?? getRegion();
      const client = new CloudWatchClient({ region });

      const res = await client.send(new GetMetricDataCommand({
        MetricDataQueries: params.queries.map((q) => ({
          Id:    q.id,
          Label: q.label,
          ...(q.expression
            ? { Expression: q.expression }
            : {
                MetricStat: {
                  Metric: {
                    Namespace:  q.namespace,
                    MetricName: q.metric_name,
                    Dimensions: q.dimensions?.map((d) => ({ Name: d.name, Value: d.value })),
                  },
                  Stat:   q.stat ?? "Average",
                  Period: q.period ?? 60,
                },
              }),
        })),
        StartTime: new Date(params.start_time),
        EndTime:   new Date(params.end_time),
      }), { abortSignal: signal });

      const results = (res.MetricDataResults ?? []).map((r) => ({
        id:         r.Id,
        label:      r.Label,
        timestamps: r.Timestamps?.map((t) => t.toISOString()),
        values:     r.Values,
        status:     r.StatusCode,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        details: { results },
      };
    },
  });

  // ── obs_get_alarms ────────────────────────────────────────────────────────
  pi.registerTool({
    name: "obs_get_alarms",
    label: "Get CloudWatch Alarms",
    description: "List CloudWatch alarms and their current states. Optionally filter by state or name prefix.",
    promptSnippet: "List CloudWatch alarms and their current states (OK, ALARM, INSUFFICIENT_DATA)",
    parameters: Type.Object({
      state_value:  Type.Optional(Type.Union([
        Type.Literal("OK"),
        Type.Literal("ALARM"),
        Type.Literal("INSUFFICIENT_DATA"),
      ], { description: "Filter by alarm state" })),
      name_prefix:  Type.Optional(Type.String({ description: "Filter alarms by name prefix" })),
      limit:        Type.Optional(Type.Number({ description: "Max alarms to return (default 50)" })),
      region:       Type.Optional(Type.String()),
    }),

    async execute(_id, params, signal) {
      const region = params.region ?? getRegion();
      const client = new CloudWatchClient({ region });

      const res = await client.send(new DescribeAlarmsCommand({
        StateValue:       params.state_value as "OK" | undefined,
        AlarmNamePrefix:  params.name_prefix,
        MaxRecords:       Math.min(params.limit ?? 50, 100),
      }), { abortSignal: signal });

      const alarms = (res.MetricAlarms ?? []).map((a) => ({
        name:        a.AlarmName,
        state:       a.StateValue,
        reason:      a.StateReason,
        metric:      a.MetricName,
        namespace:   a.Namespace,
        threshold:   a.Threshold,
        comparison:  a.ComparisonOperator,
        updated:     a.StateUpdatedTimestamp?.toISOString(),
        actions_ok:    a.OKActions,
        actions_alarm: a.AlarmActions,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(alarms, null, 2) }],
        details: { alarms, in_alarm: alarms.filter((a) => a.state === "ALARM").length },
      };
    },
  });
}
