import { useState, useEffect } from "react";
import { Wrench, AlertCircle } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface ToolItem {
  tool_name: string;
  calls: number;
  errors: number;
  avg_duration_ms: number;
}

interface RoleItem {
  agent_role: string;
  spans: number;
  errors: number;
  avg_duration_ms: number;
}

interface ToolRankingProps {
  endpoint: string;
  project?: string;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

export function ToolRanking({ endpoint, project = "" }: ToolRankingProps) {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    Promise.all([
      fetch(endpoint + "/tool-rank?" + params.toString()).then((r) => r.json()),
      fetch(endpoint + "/agent-role-dist?" + params.toString()).then((r) => r.json()),
    ])
      .then(([t, r]) => {
        setTools(t.tools || []);
        setRoles(r.roles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={4} />;
  if (tools.length === 0 && roles.length === 0) return null;

  const maxToolCalls = Math.max(...tools.map((t) => t.calls), 1);
  const maxRoleSpans = Math.max(...roles.map((r) => r.spans), 1);

  return (
    <div className="space-y-4">
      {/* Tool Ranking */}
      {tools.length > 0 && (
        <div className="bento">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">工具调用排行</h3>
          </div>
          <div className="space-y-2">
            {tools.slice(0, 10).map((tool, i) => (
              <div key={tool.tool_name}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-gray-400 w-4 shrink-0 text-right">{i + 1}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{tool.tool_name}</span>
                    {tool.errors > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                        <AlertCircle className="w-2.5 h-2.5" />{tool.errors}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-gray-400 font-mono">{tool.calls}</span>
                    <span className="text-[11px] text-gray-400 hidden sm:inline">{fmtMs(tool.avg_duration_ms)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: Math.max((tool.calls / maxToolCalls) * 100, 1) + "%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Role Distribution */}
      {roles.length > 0 && (
        <div className="bento">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agent 角色分布</h3>
          </div>
          <div className="space-y-2">
            {roles.map((role) => (
              <div key={role.agent_role}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{role.agent_role}</span>
                    {role.errors > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                        <AlertCircle className="w-2.5 h-2.5" />{role.errors}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-gray-400 font-mono">{role.spans} spans</span>
                    <span className="text-[11px] text-gray-400 hidden sm:inline">{fmtMs(role.avg_duration_ms)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all"
                    style={{ width: Math.max((role.spans / maxRoleSpans) * 100, 1) + "%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
