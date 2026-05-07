import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  DescribeAlarmsCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
} from "@aws-sdk/client-ec2";

function getRegion(): string {
  return process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-east-1";
}

export function registerAwsTools(pi: ExtensionAPI): void {
  // ── aws_list_resources ────────────────────────────────────────────────────
  pi.registerTool({
    name: "aws_list_resources",
    label: "AWS List Resources",
    description: "List AWS resources by type in a region. Supported types: ec2_instances, security_groups, vpcs, subnets.",
    promptSnippet: "List AWS resources (EC2 instances, VPCs, security groups, subnets) in a region",
    parameters: Type.Object({
      resource_type: Type.Union([
        Type.Literal("ec2_instances"),
        Type.Literal("security_groups"),
        Type.Literal("vpcs"),
        Type.Literal("subnets"),
      ], { description: "Type of AWS resource to list" }),
      region: Type.Optional(Type.String({ description: "AWS region (default: AWS_DEFAULT_REGION env var)" })),
      filters: Type.Optional(Type.Array(Type.Object({
        name:   Type.String(),
        values: Type.Array(Type.String()),
      }), { description: "Optional AWS filters" })),
    }),

    async execute(_id, params, signal) {
      const region = params.region ?? getRegion();

      switch (params.resource_type) {
        case "ec2_instances": {
          const client = new EC2Client({ region });
          const res = await client.send(new DescribeInstancesCommand({
            Filters: params.filters?.map((f) => ({ Name: f.name, Values: f.values })),
          }), { abortSignal: signal });
          const instances = res.Reservations?.flatMap((r) => r.Instances ?? []) ?? [];
          const summary = instances.map((i) => ({
            id:    i.InstanceId,
            type:  i.InstanceType,
            state: i.State?.Name,
            az:    i.Placement?.AvailabilityZone,
            name:  i.Tags?.find((t) => t.Key === "Name")?.Value,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }], details: { instances: summary } as unknown };
        }
        case "security_groups": {
          const client = new EC2Client({ region });
          const res = await client.send(new DescribeSecurityGroupsCommand({
            Filters: params.filters?.map((f) => ({ Name: f.name, Values: f.values })),
          }), { abortSignal: signal });
          const groups = (res.SecurityGroups ?? []).map((g) => ({
            id: g.GroupId, name: g.GroupName, description: g.Description, vpcId: g.VpcId,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }], details: { groups } as unknown };
        }
        case "vpcs": {
          const client = new EC2Client({ region });
          const res = await client.send(new DescribeVpcsCommand({}), { abortSignal: signal });
          const vpcs = (res.Vpcs ?? []).map((v) => ({
            id: v.VpcId, cidr: v.CidrBlock, isDefault: v.IsDefault,
            name: v.Tags?.find((t) => t.Key === "Name")?.Value,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(vpcs, null, 2) }], details: { vpcs } as unknown };
        }
        case "subnets": {
          const client = new EC2Client({ region });
          const res = await client.send(new DescribeSubnetsCommand({
            Filters: params.filters?.map((f) => ({ Name: f.name, Values: f.values })),
          }), { abortSignal: signal });
          const subnets = (res.Subnets ?? []).map((s) => ({
            id: s.SubnetId, vpcId: s.VpcId, cidr: s.CidrBlock, az: s.AvailabilityZone,
            name: s.Tags?.find((t) => t.Key === "Name")?.Value,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(subnets, null, 2) }], details: { subnets } as unknown };
        }
        default:
          return { content: [{ type: "text" as const, text: "Unknown resource type." }], details: {}, isError: true };
      }
    },
  });

  // ── aws_get_metrics ───────────────────────────────────────────────────────
  pi.registerTool({
    name: "aws_get_metrics",
    label: "AWS Get Metrics",
    description: "Fetch CloudWatch metric statistics for a resource over a time range.",
    promptSnippet: "Fetch CloudWatch metrics (CPU, latency, error rate, etc.) for a resource",
    parameters: Type.Object({
      namespace:   Type.String({ description: "CloudWatch namespace, e.g. AWS/EC2, AWS/ApplicationELB" }),
      metric_name: Type.String({ description: "Metric name, e.g. CPUUtilization, TargetResponseTime" }),
      dimensions:  Type.Array(Type.Object({ name: Type.String(), value: Type.String() })),
      stat:        Type.Union([
        Type.Literal("Average"), Type.Literal("Sum"), Type.Literal("Maximum"),
        Type.Literal("Minimum"), Type.Literal("SampleCount"), Type.Literal("p50"),
        Type.Literal("p90"), Type.Literal("p95"), Type.Literal("p99"),
      ], { description: "Statistic to retrieve" }),
      period_seconds: Type.Number({ description: "Aggregation period in seconds (e.g. 60, 300)" }),
      start_time:  Type.String({ description: "ISO 8601 start time" }),
      end_time:    Type.String({ description: "ISO 8601 end time" }),
      region:      Type.Optional(Type.String()),
    }),

    async execute(_id, params, signal) {
      const region = params.region ?? getRegion();
      const client = new CloudWatchClient({ region });
      const res = await client.send(new GetMetricStatisticsCommand({
        Namespace:  params.namespace,
        MetricName: params.metric_name,
        Dimensions: params.dimensions.map((d) => ({ Name: d.name, Value: d.value })),
        Statistics: ["Average", "Sum", "Maximum", "Minimum", "SampleCount"].includes(params.stat)
          ? [params.stat as "Average"] : undefined,
        ExtendedStatistics: ["p50","p90","p95","p99"].includes(params.stat)
          ? [params.stat] : undefined,
        Period:     params.period_seconds,
        StartTime:  new Date(params.start_time),
        EndTime:    new Date(params.end_time),
      }), { abortSignal: signal });

      const datapoints = (res.Datapoints ?? [])
        .sort((a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0))
        .map((dp) => ({
          timestamp: dp.Timestamp?.toISOString(),
          value:     dp.Average ?? dp.Sum ?? dp.Maximum ?? dp.Minimum ?? dp.SampleCount
                     ?? (dp.ExtendedStatistics ? Object.values(dp.ExtendedStatistics)[0] : null),
          unit:      dp.Unit,
        }));

      return {
        content: [{ type: "text", text: JSON.stringify(datapoints, null, 2) }],
        details: { datapoints, metric: params.metric_name, namespace: params.namespace },
      };
    },
  });

  // ── aws_get_logs ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "aws_get_logs",
    label: "AWS Get Logs",
    description: "Fetch log events from a CloudWatch Logs log group, with optional filter pattern.",
    promptSnippet: "Fetch CloudWatch log events from a log group",
    parameters: Type.Object({
      log_group:       Type.String({ description: "CloudWatch log group name" }),
      filter_pattern:  Type.Optional(Type.String({ description: "CloudWatch filter pattern, e.g. ERROR" })),
      start_time:      Type.String({ description: "ISO 8601 start time" }),
      end_time:        Type.String({ description: "ISO 8601 end time" }),
      limit:           Type.Optional(Type.Number({ description: "Max events to return (default 100, max 1000)" })),
      region:          Type.Optional(Type.String()),
    }),

    async execute(_id, params, signal) {
      const region = params.region ?? getRegion();
      const client = new CloudWatchLogsClient({ region });
      const res = await client.send(new FilterLogEventsCommand({
        logGroupName:   params.log_group,
        filterPattern:  params.filter_pattern,
        startTime:      new Date(params.start_time).getTime(),
        endTime:        new Date(params.end_time).getTime(),
        limit:          Math.min(params.limit ?? 100, 1000),
      }), { abortSignal: signal });

      const events = (res.events ?? []).map((e) => ({
        timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
        message:   e.message?.trim(),
        stream:    e.logStreamName,
      }));

      const text = events.map((e) => `[${e.timestamp}] ${e.stream}: ${e.message}`).join("\n");
      return {
        content: [{ type: "text", text: text || "(no events found)" }],
        details: { events, count: events.length },
      };
    },
  });
}
