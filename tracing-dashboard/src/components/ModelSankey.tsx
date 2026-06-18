import { useState, useEffect } from "react";
import { BarChart3, ArrowRight } from "lucide-react";
import { SkeletonBlock } from "./Skeleton";

interface SankeyLink {
  source: string;
  target: string;
  value: number;
  source_kind: string;
  target_kind: string;
}

interface ModelSankeyProps {
  endpoint: string;
  project?: string;
}

const KIND_BG: Record<string, string> = {
  flow: "bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300",
  agent: "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
  llm_call: "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
  tool_call: "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
};

export function ModelSankey({ endpoint, project = "" }: ModelSankeyProps) {
  const [links, setLinks] = useState<SankeyLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    fetch(endpoint + "/model-sankey?" + params.toString())
      .then((r) => r.json())
      .then((d) => setLinks(d.links || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint, project]);

  if (loading) return <SkeletonBlock rows={4} />;
  if (links.length === 0) return null;

  // Group by source_kind for section layout
  const bySrcKind: Record<string, SankeyLink[]> = {};
  for (const l of links) {
    if (!bySrcKind[l.source_kind]) bySrcKind[l.source_kind] = [];
    bySrcKind[l.source_kind].push(l);
  }

  const maxValue = Math.max(...links.map((l) => l.value), 1);
  const order = ["flow", "agent", "llm_call", "tool_call"];

  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">模型调用分布</h3>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-3">
        {order.filter((k) => bySrcKind[k]).map((kind) => (
          <div key={kind}>
            <h4 className="text-[11px] font-semibold uppercase text-gray-400 mb-1.5 px-1">{kind}</h4>
            <div className="grid grid-cols-1 gap-1">
              {bySrcKind[kind].slice(0, 20).map((link, i) => (
                <div key={i} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs">
                  <span className={"px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[120px] " + (KIND_BG[link.source_kind] || "bg-gray-100")}>
                    {link.source.replace(/\n/g, " ").slice(0, 18)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                  <span className={"px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[120px] " + (KIND_BG[link.target_kind] || "bg-gray-100")}>
                    {link.target.replace(/\n/g, " ").slice(0, 18)}
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <span className="font-mono text-gray-400 text-[10px]">{link.value}</span>
                    <div className="w-12 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400 transition-all"
                        style={{ width: Math.max((link.value / maxValue) * 100, 2) + "%" }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
