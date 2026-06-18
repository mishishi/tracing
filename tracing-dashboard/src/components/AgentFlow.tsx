import { useState, useEffect } from "react";
import { Share2, ArrowRight, Wrench, Bot, Cpu } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface FlowLink {
  source: string;
  target: string;
  value: number;
  source_kind: string;
  target_kind: string;
}

interface AgentFlowProps {
  endpoint: string;
  project?: string;
}

const KIND_ICONS: Record<string, typeof Bot> = {
  flow: Share2, agent: Bot, llm_call: Cpu, tool_call: Wrench,
};

const KIND_COLORS: Record<string, string> = {
  flow: "text-violet-500", agent: "text-blue-500",
  llm_call: "text-amber-500", tool_call: "text-emerald-500",
};

export function AgentFlow({ endpoint, project = "" }: AgentFlowProps) {
  const [links, setLinks] = useState<FlowLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/agent-flow?" + params.toString())
      .then((r) => r.json())
      .then((d) => setLinks(d.links || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={4} />;
  if (links.length === 0) return null;

  const maxValue = Math.max(...links.map((l) => l.value), 1);

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agent 调用链路</h3>
      </div>
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {links.slice(0, 30).map((link, i) => {
          const SrcIcon = KIND_ICONS[link.source_kind] || Bot;
          const TgtIcon = KIND_ICONS[link.target_kind] || Bot;
          return (
            <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <SrcIcon className={"w-3 h-3 shrink-0 " + (KIND_COLORS[link.source_kind] || "text-gray-400")} />
                <span className="truncate text-gray-700 dark:text-gray-300">{link.source.replace(/\n/g, " ").slice(0, 24)}</span>
              </div>
              <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <TgtIcon className={"w-3 h-3 shrink-0 " + (KIND_COLORS[link.target_kind] || "text-gray-400")} />
                <span className="truncate text-gray-700 dark:text-gray-300">{link.target.replace(/\n/g, " ").slice(0, 24)}</span>
              </div>
              <div className="shrink-0 flex items-center gap-2 ml-2">
                <span className="font-mono text-gray-400">{link.value}</span>
                <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-400 transition-all"
                    style={{ width: Math.max((link.value / maxValue) * 100, 2) + "%" }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
